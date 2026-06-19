/**
 * Wallid reconciliation cron.
 *
 * Runs every 5 minutes (pg_cron). For each `wallid_payments` row stuck on
 * NEW/PENDING from the last 48h, polls Wallid /status and fans the result
 * out to Firestore + supabase exactly like the webhook does. Covers cases
 * where the webhook is missed or never delivered.
 *
 * Security: /api/public/* prefix bypasses Lovable edge auth; we require an
 * `apikey` header matching the Supabase anon key so only the configured
 * pg_cron job (and admins testing) can trigger it.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getWallidStatus, WallidError } from "@/lib/wallid.server";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function mapStatus(s: string): "SUCCESS" | "FAILED" | "EXPIRED" | "PENDING" | "OTHER" {
  const u = String(s || "").toUpperCase();
  if (u === "SUCCESS" || u === "PAID" || u === "COMPLETED") return "SUCCESS";
  if (u === "FAILED" || u === "DECLINED" || u === "CANCELLED" || u === "CANCELED") return "FAILED";
  if (u === "EXPIRED") return "EXPIRED";
  if (u === "NEW" || u === "PENDING" || u === "PROCESSING") return "PENDING";
  return "OTHER";
}

export const Route = createFileRoute("/api/public/hooks/wallid-reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Lightweight auth — anon key in header.
        const apiKey = request.headers.get("apikey") || request.headers.get("x-api-key");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
        if (!expected || apiKey !== expected) {
          return json({ error: "Unauthorized" }, 401);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

        const { data: rows, error } = await supabaseAdmin
          .from("wallid_payments")
          .select("order_id, api_payment_id, status, created_at")
          .in("status", ["NEW", "PENDING", "PROCESSING"])
          .gte("created_at", cutoff)
          .order("created_at", { ascending: false })
          .limit(100);

        if (error) {
          console.error("[Wallid reconcile] DB lookup failed:", error.message);
          return json({ error: "Lookup failed" }, 500);
        }
        if (!rows || rows.length === 0) {
          return json({ checked: 0, updated: 0 });
        }

        let updated = 0;
        const results: Array<{ orderId: string; from: string; to: string }> = [];

        const { updateDocAdmin, getDocAdmin, addDocAdmin } = await import("@/lib/server/firestore-admin");

        for (const row of rows) {
          if (!row.api_payment_id || !row.order_id) continue;
          let remoteStatus: string;
          try {
            const remote = await getWallidStatus(row.api_payment_id);
            remoteStatus = String(remote.status || "").toUpperCase();
          } catch (e) {
            if (e instanceof WallidError) {
              console.warn(`[Wallid reconcile] ${row.order_id} status fetch failed: ${e.status}`);
            } else {
              console.warn(`[Wallid reconcile] ${row.order_id} unexpected:`, e);
            }
            continue;
          }

          const mapped = mapStatus(remoteStatus);
          if (mapped === "PENDING" || mapped === "OTHER") {
            // Still pending at Wallid — leave alone.
            continue;
          }

          // Persist remote status on the supabase row.
          await supabaseAdmin
            .from("wallid_payments")
            .update({ status: remoteStatus })
            .eq("api_payment_id", row.api_payment_id);

          const firestoreStatus =
            mapped === "SUCCESS" ? "paid"
            : mapped === "FAILED" ? "failed"
            : "expired";

          try {
            const priorDoc = (await getDocAdmin("orders", row.order_id)) as Record<string, unknown> | null;
            if (!priorDoc) continue;
            const priorStatus = String(priorDoc.status ?? "").toLowerCase();

            // Skip orders already in a terminal state — webhook beat us.
            if (["paid", "processing", "shipped", "delivered", "failed", "expired", "cancelled"].includes(priorStatus)) {
              continue;
            }

            await updateDocAdmin("orders", row.order_id, {
              status: firestoreStatus,
              paymentProvider: "wallid",
              paymentRef: row.api_payment_id,
              paymentUpdatedAt: new Date(),
              paymentTokenHash: null,
              reconciledViaCron: true,
              ...(firestoreStatus === "paid" ? { paidAt: new Date() } : {}),
              ...(firestoreStatus !== "paid"
                ? { paymentFailureReason: remoteStatus }
                : {}),
            });
            updated += 1;
            results.push({ orderId: row.order_id, from: priorStatus, to: firestoreStatus });

            // First paid transition → enqueue confirmation email.
            if (firestoreStatus === "paid" && priorStatus !== "paid") {
              const customerObj = (priorDoc.customer as Record<string, unknown> | undefined) || {};
              const to = String(priorDoc.customerEmail ?? priorDoc.email ?? customerObj.email ?? "");
              if (to && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
                try {
                  const { paymentConfirmedEmail } = await import("@/templates/paymentConfirmedEmail");
                  const firstName =
                    String(
                      (priorDoc.firstName as string) ||
                        (customerObj.firstName as string) ||
                        (priorDoc.customerName as string) ||
                        "",
                    ).split(" ")[0] || "there";
                  const amount = Number(
                    (priorDoc.totalAmount as number) ??
                      (priorDoc.total as number) ??
                      0,
                  );
                  const reference = String(priorDoc.orderNumber ?? row.order_id);
                  const { subject, html, text } = paymentConfirmedEmail({
                    firstName,
                    orderNumber: reference,
                    amount,
                    paymentMethod: "Open Banking (Wallid)",
                    paidAt: new Date(),
                  });
                  await addDocAdmin("mail", {
                    to,
                    message: { subject, html, text },
                    createdAt: new Date(),
                    source: "wallid:reconcile-cron",
                  });
                } catch (mailErr) {
                  console.warn(
                    "[Wallid reconcile] Mail enqueue failed:",
                    mailErr instanceof Error ? mailErr.message : mailErr,
                  );
                }
              }
            }
          } catch (e) {
            console.warn(
              `[Wallid reconcile] ${row.order_id} Firestore update failed:`,
              e instanceof Error ? e.message : e,
            );
          }
        }

        return json({ checked: rows.length, updated, results });
      },
    },
  },
});
