/**
 * Admin-only manual payment rescue.
 *
 * Use case: the money is visible on the merchant bank statement but the
 * order never settled in the shop (webhook never landed, manual bank
 * transfer, or the customer paid on a session Wallid never reported as
 * SUCCESS). `syncWallidPaymentAdmin` only helps when Wallid itself reports
 * SUCCESS; this is the last-resort override an admin drives by hand.
 *
 * Guarantees:
 *   - atomic transition (PAID_ALLOW_FROM) → never overwrites a settled order
 *   - same confirmation email as the webhook path, idempotent per order
 *   - Telegram alert flagged MANUAL_OVERRIDE
 *   - audit trail: Firestore `auditLogs` + a MANUAL row in
 *     `wallid_webhook_events` so the triage view shows the intervention
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";
import { PAID_ALLOW_FROM, PENDING_PAYMENT_STATUSES } from "@/lib/payment-transitions";

const ListInput = z.object({
  idToken: z.string().min(10).max(4096),
  days: z.number().int().min(1).max(30).default(7),
});

export interface PendingOrderRow {
  orderId: string;
  orderNumber: string | null;
  status: string;
  amount: number | null;
  currency: string;
  customerEmail: string | null;
  customerName: string | null;
  paymentProvider: string | null;
  createdAt: string | null;
}

function toIso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const n = typeof v === "number" ? v : Date.parse(String(v));
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
}

/** Orders still waiting for money in the last N days (default 7). */
export const listPendingOrdersForReviewAdmin = createServerFn({ method: "POST" })
  .validator((d) => ListInput.parse(d))
  .handler(async ({ data }): Promise<{ rows: PendingOrderRow[] }> => {
    await requireFirebaseAdmin(data.idToken);
    const { listDocsAdmin } = await import("@/lib/server/firestore-admin");

    const cutoff = Date.now() - data.days * 86_400_000;
    const pending = new Set<string>([
      ...PENDING_PAYMENT_STATUSES.map((s) => String(s)),
      "failed",
      "payment_failed",
      "expired",
      "payment_expired",
    ]);

    const docs = await listDocsAdmin("orders", {
      orderBy: "createdAt",
      direction: "DESCENDING",
      limit: 400,
    });

    const rows: PendingOrderRow[] = [];
    for (const d of docs) {
      const status = String(d.status ?? "").toLowerCase();
      if (!pending.has(status)) continue;
      const createdAt = toIso(d.createdAt);
      if (createdAt && Date.parse(createdAt) < cutoff) continue;
      const customer = (d.customer as Record<string, unknown> | undefined) ?? {};
      const amountRaw = Number(d.totalAmount ?? d.total ?? d.totalPrice ?? 0);
      const name =
        String(d.customerName ?? "") ||
        `${String(d.firstName ?? customer.firstName ?? "")} ${String(d.lastName ?? customer.lastName ?? "")}`.trim();
      rows.push({
        orderId: d.id,
        orderNumber: d.orderNumber ? String(d.orderNumber) : null,
        status,
        amount: Number.isFinite(amountRaw) && amountRaw > 0 ? amountRaw : null,
        currency: String(d.currency ?? "GBP"),
        customerEmail:
          String(d.customerEmail ?? d.email ?? customer.email ?? "") || null,
        customerName: name || null,
        paymentProvider: d.paymentProvider ? String(d.paymentProvider) : null,
        createdAt,
      });
      if (rows.length >= 100) break;
    }
    return { rows };
  });

const MarkInput = z.object({
  idToken: z.string().min(10).max(4096),
  orderId: z.string().min(3).max(128).regex(/^[A-Za-z0-9_-]+$/),
  note: z.string().min(3).max(300),
});

export interface ManualPaidResult {
  ok: boolean;
  orderId: string;
  transitioned: boolean;
  priorStatus: string | null;
  emailQueued: boolean;
  message: string;
}

export const markOrderPaidManuallyAdmin = createServerFn({ method: "POST" })
  .validator((d) => MarkInput.parse(d))
  .handler(async ({ data }): Promise<ManualPaidResult> => {
    const admin = await requireFirebaseAdmin(data.idToken);
    const { transitionDocStatusAdmin, addDocAdmin } = await import(
      "@/lib/server/firestore-admin"
    );

    const { transitioned, prior } = await transitionDocStatusAdmin("orders", data.orderId, {
      allowFrom: PAID_ALLOW_FROM,
      updates: {
        status: "paid",
        paidAt: new Date(),
        paymentProvider: "wallid_manual",
        paymentRef: data.orderId,
        paymentFailureReason: null,
        paymentUpdatedAt: new Date(),
        reconciledManually: true,
        manualPaidNote: data.note,
        manualPaidBy: admin.email ?? admin.uid,
        manualPaidAt: new Date(),
      },
    });

    const priorStatus = prior ? String(prior.status ?? "").toLowerCase() : null;
    if (!transitioned) {
      return {
        ok: false,
        orderId: data.orderId,
        transitioned: false,
        priorStatus,
        emailQueued: false,
        message: prior
          ? `Order is already ${priorStatus || "in a terminal state"} — nothing changed.`
          : "Order not found.",
      };
    }

    // Confirmation email — same template + idempotency key as the webhook.
    let emailQueued = false;
    const customerObj = (prior?.customer as Record<string, unknown> | undefined) || {};
    const to = String(prior?.customerEmail ?? prior?.email ?? customerObj.email ?? "");
    if (to && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      try {
        const { paymentConfirmedEmail } = await import("@/templates/paymentConfirmedEmail");
        const firstName =
          String(
            (prior?.firstName as string) ||
              (customerObj.firstName as string) ||
              (prior?.customerName as string) ||
              "",
          ).split(" ")[0] || "there";
        const amount = Number((prior?.totalAmount as number) ?? (prior?.total as number) ?? 0);
        const reference = String(prior?.orderNumber ?? data.orderId);
        const { subject, html, text } = paymentConfirmedEmail({
          firstName,
          orderNumber: reference,
          amount,
          paymentMethod: "Bank transfer (confirmed by PH Labs)",
          paidAt: new Date(),
        });
        const { enqueueMailOnce } = await import("@/lib/server/enqueue-mail");
        await enqueueMailOnce(`payment-confirmed:${data.orderId}`, {
          to,
          message: { subject, html, text },
          source: "wallid:manual-override",
        });
        emailQueued = true;
      } catch (mailErr) {
        console.warn(
          "[Manual paid] Mail enqueue failed:",
          mailErr instanceof Error ? mailErr.message : mailErr,
        );
      }
    }

    // Telegram alert, explicitly flagged as a human override.
    try {
      const { sendTelegramAlert } = await import("@/lib/server/telegram-alert");
      const amountPence = Number((prior?.totalAmount as number) ?? (prior?.total as number) ?? 0);
      const amountText = amountPence
        ? `£${(amountPence > 1000 ? amountPence / 100 : amountPence).toFixed(2)}`
        : "";
      await sendTelegramAlert(
        `🖐 <b>MANUAL_OVERRIDE — zamówienie oznaczone jako opłacone</b>\n` +
          `Zamówienie: <code>${data.orderId}</code>${amountText ? `\nKwota: ${amountText}` : ""}\n` +
          `Było: ${priorStatus || "—"} → paid\nAdmin: ${admin.email ?? admin.uid}\nNotatka: ${data.note}`,
      );
    } catch { /* non-blocking */ }

    // Append-only audit trail.
    try {
      await addDocAdmin("auditLogs", {
        action: "order.payment_manual_override",
        target: `orders/${data.orderId}`,
        adminUid: admin.uid,
        adminEmail: admin.email ?? null,
        before: { status: priorStatus },
        after: { status: "paid", paymentProvider: "wallid_manual" },
        note: data.note,
        createdAt: new Date(),
      });
    } catch { /* non-blocking */ }

    // Visible in the payment triage view alongside real webhook events.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("wallid_webhook_events").insert({
        event_id: `manual:${data.orderId}:${Date.now()}`,
        order_id: data.orderId,
        status: "MANUAL",
        occurred_at: new Date().toISOString(),
        raw: {
          source: "admin-manual-override",
          note: data.note,
          adminUid: admin.uid,
          priorStatus,
        },
      });
    } catch { /* non-blocking */ }

    return {
      ok: true,
      orderId: data.orderId,
      transitioned: true,
      priorStatus,
      emailQueued,
      message: `Order marked paid (${priorStatus || "unknown"} → paid).${
        emailQueued ? " Confirmation email queued." : " No valid customer email on the order."
      }`,
    };
  });
