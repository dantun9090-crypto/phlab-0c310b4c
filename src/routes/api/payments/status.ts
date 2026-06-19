/**
 * POST /api/payments/status — return the current Wallid payment status for an order.
 *
 * Security model:
 *   - Caller MUST authenticate as either:
 *       a) the logged-in owner (Firebase ID token, verified server-side and
 *          matched against `orders/{orderId}.userId`), or
 *       b) the guest who placed the order (one-time high-entropy
 *          `paymentToken` whose SHA-256 hash matches `orders/{orderId}.paymentTokenHash`).
 *   - Per-IP rate limit (20 req/min) to defeat order-id enumeration scans
 *     (the `PHP-{base36 timestamp}` format is guessable).
 *   - The response NEVER exposes the internal Wallid `api_payment_id`.
 *
 * GET is intentionally rejected (405) — credentials must come in the body,
 * not in URL query strings that can leak via logs / referrers.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getWallidStatus, WallidError } from "@/lib/wallid.server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { verifyFirebaseIdToken } from "@/lib/server/firebase-auth-admin";
import { getDocAdmin } from "@/lib/server/firestore-admin";

const BodySchema = z.object({
  orderId: z.string().min(3).max(128).regex(/^[A-Za-z0-9_-]+$/),
  idToken: z.string().min(10).max(4096).optional().nullable(),
  paymentToken: z.string().min(32).max(256).optional().nullable(),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function verifyPaymentTokenHash(rawToken: string, storedHash: unknown): Promise<boolean> {
  if (typeof storedHash !== "string" || !storedHash) return false;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawToken));
  const candidate = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  if (candidate.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i += 1) {
    diff |= candidate.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
}

export const Route = createFileRoute("/api/payments/status")({
  server: {
    handlers: {
      GET: async () => json({ error: "Method Not Allowed — use POST" }, 405),
      POST: async ({ request }) => {
        const limited = await enforceRateLimit(request, "wallid:status", {
          limit: 20,
          windowMs: 60_000,
          retryAfterSec: 30,
        });
        if (limited) return limited;

        let raw: unknown;
        try { raw = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
        const parsed = BodySchema.safeParse(raw);
        if (!parsed.success) return json({ error: "Invalid request" }, 400);
        const { orderId, idToken, paymentToken } = parsed.data;
        // 1) Authenticate caller (idToken preferred; fall back to paymentToken).
        let userUid: string | null = null;
        if (idToken) {
          try {
            const user = await verifyFirebaseIdToken(idToken);
            userUid = user.uid;
          } catch {
            // fall through to paymentToken
          }
        }

        // 2) Verify order ownership via Firestore.
        const order = await getDocAdmin("orders", orderId).catch(() => null);
        if (!order) return json({ error: "Order not found" }, 404);

        const ownerUid = typeof order.userId === "string" ? order.userId : null;
        const ownsByUid = userUid !== null && ownerUid !== null && ownerUid === userUid;
        const ownsByToken = paymentToken
          ? await verifyPaymentTokenHash(paymentToken, (order as { paymentTokenHash?: unknown }).paymentTokenHash)
          : false;

        // Fallback: if the Firestore order is already in a terminal state
        // (paid/failed/expired) — confirmed by webhook or reconcile cron —
        // allow an unauthenticated read of *just the status*. The success
        // page often loses its Firebase session after the bank webview
        // redirect, and the one-shot paymentToken in localStorage may have
        // been wiped on a prior successful poll. Without this short-circuit
        // a logged-out user sees an infinite spinner even though the order
        // is fully paid. The response intentionally omits amount/currency
        // so it does not leak order details on a guessed orderId.
        const firestoreStatusLower = String((order as { status?: unknown }).status ?? "").toLowerCase();
        const terminalMap: Record<string, string> = {
          paid: "SUCCESS",
          processing: "SUCCESS",
          shipped: "SUCCESS",
          delivered: "SUCCESS",
          failed: "FAILED",
          cancelled: "CANCELLED",
          expired: "EXPIRED",
        };
        if (!ownsByUid && !ownsByToken) {
          if (terminalMap[firestoreStatusLower]) {
            return json({
              status: terminalMap[firestoreStatusLower],
              order_id: orderId,
              found: true,
            });
          }
          if (!idToken && !paymentToken) {
            return json({ error: "Authentication required" }, 401);
          }
          return json({ error: "Forbidden" }, 403);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rows, error } = await supabaseAdmin
          .from("wallid_payments")
          .select("api_payment_id, status, amount, currency")
          .eq("order_id", orderId)
          .order("created_at", { ascending: false })
          .limit(1);

        if (error) {
          console.error("[Wallid] status DB lookup failed:", error.message);
          return json({ error: "Lookup failed" }, 500);
        }
        const row = rows?.[0];
        if (!row || !row.api_payment_id) {
          return json({ status: "unknown", found: false }, 404);
        }

        try {
          const remote = await getWallidStatus(row.api_payment_id);
          const status = String(remote.status || "unknown").toUpperCase();
          // Persist latest status.
          await supabaseAdmin
            .from("wallid_payments")
            .update({ status })
            .eq("api_payment_id", row.api_payment_id);

          // Fan out terminal status to the Firestore order so the UI / admin
          // panel don't keep showing "pending_payment" when Wallid never
          // delivered a webhook (or delivered to a stale URL).
          const firestoreStatus =
            status === "SUCCESS" || status === "PAID" || status === "COMPLETED" ? "paid"
            : status === "FAILED" || status === "DECLINED" || status === "CANCELLED" || status === "CANCELED" ? "failed"
            : status === "EXPIRED" ? "expired"
            : null;
          if (firestoreStatus) {
            try {
              const { transitionDocStatusAdmin } = await import("@/lib/server/firestore-admin");
              // ATOMIC: poller is racing the webhook + reconcile cron. Only
              // one of them gets transitioned:true; the others see the order
              // already in a terminal state and skip the duplicate write +
              // email.
              const { transitioned, prior } = await transitionDocStatusAdmin(
                "orders",
                orderId,
                {
                  allowFrom: ["pending", "pending_payment", "awaiting_payment", "processing_payment", ""],
                  updates: {
                    status: firestoreStatus,
                    paymentProvider: "wallid",
                    paymentRef: row.api_payment_id,
                    paymentUpdatedAt: new Date(),
                    ...(firestoreStatus === "paid" ? { paidAt: new Date() } : {}),
                    // Burn the guest paymentToken once the order is terminal so it
                    // can't be reused. Kept alive during polling so the success
                    // page can authenticate the status check.
                    paymentTokenHash: null,
                  },
                },
              );

              // Send branded payment-received email ONLY when this poll is
              // the writer that flipped the order to paid.
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
                    const amount = Number(
                      (prior.totalAmount as number) ??
                        (prior.total as number) ??
                        0,
                    );
                    const reference = String(prior.orderNumber ?? orderId);
                    const { subject, html, text } = paymentConfirmedEmail({
                      firstName,
                      orderNumber: reference,
                      amount,
                      paymentMethod: "Open Banking (Wallid)",
                      paidAt: new Date(),
                    });
                    const { enqueueMailOnce } = await import("@/lib/server/enqueue-mail");
                    await enqueueMailOnce(`payment-confirmed:${orderId}`, {
                      to,
                      message: { subject, html, text },
                      source: "wallid:status-poll",
                    });
                  } catch (mailErr) {
                    console.warn(
                      "[Wallid status] paymentConfirmedEmail enqueue failed:",
                      mailErr instanceof Error ? mailErr.message : mailErr,
                    );
                  }
                }
              }
            } catch (e) {
              console.warn(
                "[Wallid status] Firestore order update skipped:",
                e instanceof Error ? e.message : e,
              );
            }
          }

          // NOTE: api_payment_id is an internal Wallid reference — never
          // expose it to the client. Amount/currency are echoed because the
          // caller is already proven to own the order.
          return json({
            status,
            order_id: orderId,
            amount: row.amount,
            currency: row.currency,
          });
        } catch (err) {
          if (err instanceof WallidError) {
            return json({ error: err.userMessage }, err.status === 401 ? 502 : 502);
          }
          console.error("[Wallid] status unexpected error:", err);
          return json({ error: "Could not fetch payment status" }, 502);
        }
      },
    },
  },
});
