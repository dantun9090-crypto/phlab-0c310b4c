/**
 * Wallid reconciliation cron.
 *
 * Runs every 5 minutes (pg_cron). For each `wallid_payments` row stuck on
 * NEW/PENDING from the last 48h, polls Wallid /status and fans the result
 * out to Firestore + supabase exactly like the webhook does. Covers cases
 * where the webhook is missed or never delivered.
 *
 * Security: /api/public/* prefix bypasses Lovable edge auth; we require a
 * server-only shared secret (`CLEANUP_SECRET`) passed via
 * `Authorization: Bearer <secret>` or `x-cron-secret`. The Supabase
 * publishable/anon key is intentionally public and MUST NOT gate this
 * endpoint — anyone could otherwise trigger reconciliation runs.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getWallidStatus, WallidError } from "@/lib/wallid.server";
import { timingSafeEqualStr } from "@/lib/timing-safe-equal";
import { checkRateLimit, getClientIp, rateLimitedResponse } from "@/lib/rate-limit";
import { NO_STORE_HEADERS } from "@/lib/no-store-headers";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...NO_STORE_HEADERS },
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

const REMINDER_AFTER_MS = 12 * 60 * 1000;

/**
 * One-shot "payment still pending" reminder. Bank apps regularly fail to
 * redirect the customer back after approval; the order then sits in
 * pending_payment even though the sale is recoverable. We email the
 * customer a working status link — for guests it carries the raw
 * paymentToken stored server-side at payment creation (return_token), so
 * the link works from ANY device/browser.
 */
async function maybeSendPendingReminder(row: {
  order_id: string;
  api_payment_id: string | null;
  created_at: string;
  metadata?: unknown;
}): Promise<void> {
  if (!row.order_id || !row.created_at) return;
  if (Date.now() - new Date(row.created_at).getTime() < REMINDER_AFTER_MS) return;
  const { getDocAdmin, updateDocAdmin, addDocAdmin } = await import("@/lib/server/firestore-admin");
  const order = await getDocAdmin("orders", row.order_id);
  if (!order || order.paymentReminderSentAt) return;
  const email = String(order.customerEmail ?? order.email ?? "").trim();
  if (!email) return;
  const st = String(order.status ?? "").toLowerCase();
  if (st && !["pending", "pending_payment", "awaiting_payment", "processing_payment"].includes(st)) return;

  const ref = String(order.orderNumber ?? row.order_id);
  const firstName = String(order.firstName ?? "there");
  const m = row.metadata as { return_token?: unknown } | null;
  const token = m && typeof m.return_token === "string" && m.return_token.length >= 32
    ? m.return_token
    : null;
  const link = token
    ? `https://phlabs.co.uk/checkout/success?order_id=${encodeURIComponent(row.order_id)}&pt=${encodeURIComponent(token)}`
    : "https://phlabs.co.uk/account/orders";

  const subject = `Your PH Labs order ${ref} — payment still pending`;
  const text = [
    `Hi ${firstName},`,
    ``,
    `Your order ${ref} is reserved, but your bank hasn't confirmed the payment yet.`,
    ``,
    `If your bank app didn't redirect you back to the shop, that's fine — check the live status here:`,
    link,
    ``,
    `Already paid in the app? The page above confirms automatically within a few minutes.`,
    `Changed your mind? Just ignore this email — unpaid reservations expire automatically.`,
    ``,
    `— PH Labs`,
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#0b1220;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#e5e7eb">
  <div style="max-width:520px;margin:0 auto;background:#0f1d33;border:1px solid rgba(16,185,129,.25);border-radius:12px;padding:28px">
    <h1 style="margin:0 0 12px;font-size:18px;color:#fff">Payment still pending</h1>
    <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#cbd5e1">Hi ${firstName},</p>
    <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#cbd5e1">Your order <strong style="color:#fff">${ref}</strong> is reserved, but your bank hasn't confirmed the payment yet.</p>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#cbd5e1">If your bank app didn't redirect you back to the shop, that's fine — check the live status here:</p>
    <p style="margin:0 0 18px"><a href="${link}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 22px;border-radius:8px">Check order status</a></p>
    <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#94a3b8">Already paid in the app? The page confirms automatically within a few minutes.<br/>Changed your mind? Just ignore this email — unpaid reservations expire automatically.</p>
    <p style="margin:16px 0 0;font-size:12px;color:#64748b">— PH Labs</p>
  </div>
</body></html>`;

  await addDocAdmin("mail", { to: email, message: { subject, html, text }, createdAt: new Date() });
  await updateDocAdmin("orders", row.order_id, { paymentReminderSentAt: new Date() });
  console.log(`[Wallid reconcile] pending reminder sent for ${row.order_id}`);
}

export const Route = createFileRoute("/api/public/hooks/wallid-reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Per-IP rate limit BEFORE auth — defeats secret-guessing scans.
        const ip = getClientIp(request);
        const rl = checkRateLimit(ip, "wallid:reconcile", 6, 60_000);
        if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSec);

        // Auth: server-only shared secret. Accept either
        // `Authorization: Bearer <secret>` or `x-cron-secret`. Compared in
        // constant time so response time doesn't leak prefix length.
        // NOTE: the Supabase publishable/anon key is intentionally public
        // and is NOT accepted here.
        const authHeader = request.headers.get("authorization") || "";
        const bearer = authHeader.toLowerCase().startsWith("bearer ")
          ? authHeader.slice(7).trim()
          : "";
        const provided = bearer || request.headers.get("x-cron-secret") || "";
        const expected = process.env.CLEANUP_SECRET || "";
        if (!expected || !provided || !timingSafeEqualStr(provided, expected)) {
          return json({ error: "Unauthorized" }, 401);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

        const { data: rows, error } = await supabaseAdmin
          .from("wallid_payments")
          .select("order_id, api_payment_id, status, created_at, metadata")
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

        // Atomic transition helper is loaded per-iteration above; nothing
        // more needed at this scope.

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
            // Still pending at Wallid. If the customer has been gone for a
            // while (bank app never redirected them back), send ONE reminder
            // email with a working status/return link — the sale is often
            // recoverable even when the redirect was not.
            await maybeSendPendingReminder(row).catch((e) =>
              console.warn(`[Wallid reconcile] reminder failed for ${row.order_id}:`, e),
            );
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
            const { transitionDocStatusAdmin } = await import("@/lib/server/firestore-admin");
            // ATOMIC: cron is racing the webhook + status poll. If either
            // already moved this order to a terminal state we get
            // transitioned:false and skip the duplicate write + email.
            const { transitioned, prior } = await transitionDocStatusAdmin(
              "orders",
              row.order_id,
              {
                allowFrom: ["pending", "pending_payment", "awaiting_payment", "processing_payment", ""],
                updates: {
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
                },
              },
            );
            if (!transitioned) continue;
            if (!prior) continue;
            const priorStatus = String(prior.status ?? "").toLowerCase();
            updated += 1;
            results.push({ orderId: row.order_id, from: priorStatus, to: firestoreStatus });

            // Visibility for webhook-delivery failures. If we transitioned
            // an order but no REAL (non-LOG) Wallid webhook event ever
            // landed for this payment within 60s of creation, the webhook
            // path is silently broken — log loudly so the alert cron and
            // log queries can catch it. LOG rows are heartbeat/scanner
            // pings, not real deliveries; exclude them.
            try {
              const { data: webhookRows } = await supabaseAdmin
                .from("wallid_webhook_events")
                .select("event_id, created_at, status")
                .eq("api_payment_id", row.api_payment_id)
                .neq("status", "LOG")
                .limit(1);
              if (!webhookRows || webhookRows.length === 0) {
                const ageSec = Math.round(
                  (Date.now() - Date.parse(String(row.created_at))) / 1000,
                );
                console.warn("[Wallid reconcile] RESCUED_WITHOUT_WEBHOOK", {
                  orderId: row.order_id,
                  apiPaymentId: row.api_payment_id,
                  from: priorStatus,
                  to: firestoreStatus,
                  ageSec,
                });
              }
            } catch { /* non-blocking diagnostic */ }


            // First paid transition → enqueue confirmation email.
            if (firestoreStatus === "paid") {
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
                  const amount = Number(
                    (prior.totalAmount as number) ??
                      (prior.total as number) ??
                      0,
                  );
                  const reference = String(prior.orderNumber ?? row.order_id);
                  const { subject, html, text } = paymentConfirmedEmail({
                    firstName,
                    orderNumber: reference,
                    amount,
                    paymentMethod: "Open Banking (Wallid)",
                    paidAt: new Date(),
                  });
                  const { enqueueMailOnce } = await import("@/lib/server/enqueue-mail");
                  await enqueueMailOnce(`payment-confirmed:${row.order_id}`, {
                    to,
                    message: { subject, html, text },
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
