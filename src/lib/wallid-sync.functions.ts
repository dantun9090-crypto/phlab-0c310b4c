/**
 * Admin-only manual Wallid payment sync.
 *
 * Polls Wallid /status for a single order (looked up by `order_id` in
 * `wallid_payments`) and atomically transitions the Firestore order doc the
 * same way the webhook + 5-min reconcile cron do.
 *
 * Use when an order appears stuck in `pending_payment` and the admin wants
 * to force reconciliation without waiting for the cron.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";
import { getWallidStatus, WallidError } from "@/lib/wallid.server";

const Input = z.object({
  idToken: z.string().min(10).max(4096),
  orderId: z.string().min(3).max(128).regex(/^[A-Za-z0-9_-]+$/),
});

function mapStatus(s: string): "SUCCESS" | "FAILED" | "EXPIRED" | "PENDING" | "OTHER" {
  const u = String(s || "").toUpperCase();
  if (u === "SUCCESS" || u === "PAID" || u === "COMPLETED") return "SUCCESS";
  if (u === "FAILED" || u === "DECLINED" || u === "CANCELLED" || u === "CANCELED") return "FAILED";
  if (u === "EXPIRED") return "EXPIRED";
  if (u === "NEW" || u === "PENDING" || u === "PROCESSING") return "PENDING";
  return "OTHER";
}

export interface WallidSyncResult {
  ok: boolean;
  orderId: string;
  apiPaymentId: string | null;
  remoteStatus: string | null;
  firestoreStatus: string | null;
  transitioned: boolean;
  priorStatus: string | null;
  message: string;
}

export const syncWallidPaymentAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }): Promise<WallidSyncResult> => {
    await requireFirebaseAdmin(data.idToken);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error } = await supabaseAdmin
      .from("wallid_payments")
      .select("order_id, api_payment_id, status")
      .eq("order_id", data.orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        orderId: data.orderId,
        apiPaymentId: null,
        remoteStatus: null,
        firestoreStatus: null,
        transitioned: false,
        priorStatus: null,
        message: `Lookup failed: ${error.message}`,
      };
    }
    if (!row || !row.api_payment_id) {
      return {
        ok: false,
        orderId: data.orderId,
        apiPaymentId: null,
        remoteStatus: null,
        firestoreStatus: null,
        transitioned: false,
        priorStatus: null,
        message: "No Wallid payment record found for this order.",
      };
    }

    let remoteStatus: string;
    try {
      const remote = await getWallidStatus(row.api_payment_id);
      remoteStatus = String(remote.status || "").toUpperCase();
    } catch (e) {
      const msg = e instanceof WallidError ? `Wallid ${e.status}` : (e instanceof Error ? e.message : String(e));
      return {
        ok: false,
        orderId: data.orderId,
        apiPaymentId: row.api_payment_id,
        remoteStatus: null,
        firestoreStatus: null,
        transitioned: false,
        priorStatus: null,
        message: `Wallid status fetch failed: ${msg}`,
      };
    }

    const mapped = mapStatus(remoteStatus);

    // Always persist remote status on the supabase row so admins see it.
    await supabaseAdmin
      .from("wallid_payments")
      .update({ status: remoteStatus })
      .eq("api_payment_id", row.api_payment_id);

    if (mapped === "PENDING" || mapped === "OTHER") {
      return {
        ok: true,
        orderId: data.orderId,
        apiPaymentId: row.api_payment_id,
        remoteStatus,
        firestoreStatus: null,
        transitioned: false,
        priorStatus: null,
        message: `Wallid still reports ${remoteStatus} — nothing to transition.`,
      };
    }

    const firestoreStatus =
      mapped === "SUCCESS" ? "paid" : mapped === "FAILED" ? "failed" : "expired";

    const { transitionDocStatusAdmin } = await import("@/lib/server/firestore-admin");
    const { transitioned, prior } = await transitionDocStatusAdmin("orders", data.orderId, {
      allowFrom: ["pending", "pending_payment", "awaiting_payment", "processing_payment", ""],
      updates: {
        status: firestoreStatus,
        paymentProvider: "wallid",
        paymentRef: row.api_payment_id,
        paymentUpdatedAt: new Date(),
        reconciledViaCron: false,
        reconciledManually: true,
        ...(firestoreStatus === "paid" ? { paidAt: new Date() } : {}),
        ...(firestoreStatus !== "paid" ? { paymentFailureReason: remoteStatus } : {}),
      },
    });

    if (transitioned && firestoreStatus === "paid" && prior) {
      const customerObj = (prior.customer as Record<string, unknown> | undefined) || {};
      const to = String(prior.customerEmail ?? prior.email ?? customerObj.email ?? "");
      if (to && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
        try {
          const { paymentConfirmedEmail } = await import("@/templates/paymentConfirmedEmail");
          const firstName =
            String(
              (prior.firstName as string) ||
                (customerObj.firstName as string) ||
                (prior.customerName as string) ||
                "",
            ).split(" ")[0] || "there";
          const amount = Number((prior.totalAmount as number) ?? (prior.total as number) ?? 0);
          const reference = String(prior.orderNumber ?? data.orderId);
          const { subject, html, text } = paymentConfirmedEmail({
            firstName,
            orderNumber: reference,
            amount,
            paymentMethod: "Open Banking (Wallid)",
            paidAt: new Date(),
          });
          const { enqueueMailOnce } = await import("@/lib/server/enqueue-mail");
          await enqueueMailOnce(`payment-confirmed:${data.orderId}`, {
            to,
            message: { subject, html, text },
            source: "wallid:admin-sync",
          });
        } catch (mailErr) {
          console.warn(
            "[Wallid sync] Mail enqueue failed:",
            mailErr instanceof Error ? mailErr.message : mailErr,
          );
        }
      }
    }

    const priorStatus = prior ? String(prior.status ?? "").toLowerCase() : null;
    return {
      ok: true,
      orderId: data.orderId,
      apiPaymentId: row.api_payment_id,
      remoteStatus,
      firestoreStatus,
      transitioned,
      priorStatus,
      message: transitioned
        ? `Order transitioned ${priorStatus || "(unknown)"} → ${firestoreStatus}.`
        : `Order already in a terminal state (current: ${priorStatus || "unknown"}); no change.`,
    };
  });

const StuckInput = z.object({ idToken: z.string().min(10).max(4096) });

export interface StuckWallidRow {
  orderId: string;
  apiPaymentId: string | null;
  status: string;
  createdAt: string;
}

export const listStuckWallidPaymentsAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => StuckInput.parse(d))
  .handler(async ({ data }): Promise<{ rows: StuckWallidRow[] }> => {
    await requireFirebaseAdmin(data.idToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows, error } = await supabaseAdmin
      .from("wallid_payments")
      .select("order_id, api_payment_id, status, created_at")
      .in("status", ["NEW", "PENDING", "PROCESSING"])
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return {
      rows: (rows || []).map((r) => ({
        orderId: String(r.order_id),
        apiPaymentId: r.api_payment_id ? String(r.api_payment_id) : null,
        status: String(r.status),
        createdAt: String(r.created_at),
      })),
    };
  });
