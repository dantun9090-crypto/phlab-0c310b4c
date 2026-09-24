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
import { NO_STORE_HEADERS } from "@/lib/no-store-headers";
import { allowFromFor } from "@/lib/payment-transitions";

const BodySchema = z.object({
  orderId: z.string().min(3).max(128).regex(/^[A-Za-z0-9_-]+$/),
  idToken: z.string().min(10).max(4096).optional().nullable(),
  paymentToken: z.string().min(32).max(256).optional().nullable(),
  purchaseFired: z.boolean().optional(),
  adsFired: z.boolean().optional(),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...NO_STORE_HEADERS },
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

/**
 * Owner-only tracking payload the success page needs to fire the GA4/Ads
 * purchase event (guests cannot read the order doc client-side).
 */
function buildTracking(order: Record<string, unknown>, fallbackAmount?: unknown) {
  const shipAddr = ((order.shippingAddress ?? order.shipping ?? {}) as Record<string, unknown>);
  const customerObj = ((order.customer ?? {}) as Record<string, unknown>);
  return {
    total: order.total ?? order.totalAmount ?? order.totalPrice ?? order.amount ?? fallbackAmount,
    vatAmount: order.vatAmount ?? order.tax ?? 0,
    shippingCost: order.shippingCost ?? order.shippingTotal ?? 0,
    items: Array.isArray(order.items) ? order.items : [],
    email: order.email ?? order.customerEmail ?? customerObj.email ?? shipAddr.email ?? null,
    phone: order.phone ?? shipAddr.phone ?? customerObj.phone ?? null,
    shippingAddress: shipAddr,
  };
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
        const { orderId, idToken, paymentToken, purchaseFired, adsFired } = parsed.data;
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

        // Ownership is mandatory: either a verified Firebase session that owns
        // the order, or the one-shot guest paymentToken hash stored on it.
        // No unauthenticated status reads — otherwise anyone supplying an
        // orderId could learn whether that order was paid.
        const firestoreStatusLower = String((order as { status?: unknown }).status ?? "").toLowerCase();
        // `processing` is deliberately NOT a SUCCESS alias: it is an
        // administrative fulfilment state (admin advances a paid order), not
        // payment evidence. Reporting SUCCESS for it would show "Payment
        // successful" + fire the GA4 purchase event on an unpaid order.
        // answerFromFirestore() gates `processing` on paid evidence below.
        const terminalMap: Record<string, string> = {
          paid: "SUCCESS",
          shipped: "SUCCESS",
          delivered: "SUCCESS",
          completed: "SUCCESS",
          failed: "FAILED",
          cancelled: "CANCELLED",
          expired: "EXPIRED",
        };
        if (!ownsByUid && !ownsByToken) {
          // Guest reopening the success page after settlement: the one-shot
          // paymentToken was burned, so ownership can't be proven. Return ONLY
          // the terminal status label (no amount, email or other order data,
          // no side effects) so a paid order doesn't show "still waiting".
          const terminalOnly = terminalMap[firestoreStatusLower];
          if (terminalOnly && purchaseFired !== true) {
            return json({ status: terminalOnly });
          }
          if (!idToken && !paymentToken) {
            return json({ error: "Authentication required" }, 401);
          }
          return json({ error: "Forbidden" }, 403);
        }


        // Analytics ack: the success page fired the GA4/Ads purchase event
        // in the browser — mark the order so the server-side Measurement
        // Protocol backfill (reconcile cron) doesn't duplicate it. Ownership
        // was verified above; unauthenticated acks are refused (guessable
        // orderIds could otherwise suppress the backfill).
        if (purchaseFired === true) {
          try {
            const { updateDocAdmin } = await import("@/lib/server/firestore-admin");
            await updateDocAdmin("orders", orderId, {
              gaClientPurchaseAt: new Date(),
              // Only latch the Ads marker when the browser had marketing
              // consent (adsFired === true). Without consent the gtag
              // conversion is merely queued locally and never reaches
              // Google, so the order must remain eligible for the offline
              // gclid CSV import (which skips orders carrying this marker).
              ...(adsFired === true ? { adsClientConversionAt: new Date() } : {}),
            });
          } catch { /* analytics must never break payments */ }
          return json({ ok: true });
        }


        // Non-Wallid providers (e.g. PeptidePay card / Apple Pay / Google Pay /
        // crypto) have no `wallid_payments` row. Their webhook writes the
        // terminal state straight to the Firestore order, so answer the owner
        // from Firestore instead of falling through to the Wallid lookup
        // (which would 404 forever and leave the success page spinning).
        const provider = String((order as { paymentProvider?: unknown }).paymentProvider ?? "").toLowerCase();
        const answerFromFirestore = () => {
          const mapped = terminalMap[firestoreStatusLower];
          if (!mapped) {
            // "processing" is set by the admin panel (bank-transfer "mark
            // paid" flow) — only report SUCCESS when payment evidence
            // (paidAt / paymentStatus) is on the doc. An admin slip that
            // moves an unpaid order to "processing" must never surface as
            // "Payment successful" or fire the purchase conversion.
            if (firestoreStatusLower === "processing") {
              const o = order as Record<string, unknown>;
              const hasPaidEvidence =
                o.paidAt instanceof Date ||
                typeof o.paidAt === "string" ||
                String(o.paymentStatus ?? "").toLowerCase() === "paid";
              if (hasPaidEvidence) {
                return json({
                  status: "SUCCESS",
                  order_id: orderId,
                  found: true,
                  tracking: buildTracking(o),
                });
              }
            }
            return json({ status: "PENDING", order_id: orderId, found: true });
          }
          if (mapped === "SUCCESS") {
            try {
              void import("@/lib/server/firestore-admin").then(({ updateDocAdmin }) =>
                updateDocAdmin("orders", orderId, { gaClientPurchaseAt: new Date() }),
              );
            } catch { /* analytics must never break payments */ }
          }
          return json({
            status: mapped,
            order_id: orderId,
            found: true,
            tracking: buildTracking(order as Record<string, unknown>),
          });
        };
        if (provider && provider !== "wallid" && provider !== "pay_by_bank") {
          // Webhook-miss safety net: if PeptidePay has not told us anything yet
          // and the order is still non-terminal, ask the provider directly.
          if (provider === "peptidepay" && !terminalMap[firestoreStatusLower]) {
            const sessionId = String(
              (order as { peptidepaySessionId?: unknown }).peptidepaySessionId ?? "",
            );
            if (/^[A-Za-z0-9_-]{6,128}$/.test(sessionId)) {
              try {
                const { pollAndSettlePeptidePay } = await import(
                  "@/lib/payments/peptidepay-settle.server"
                );
                const outcome = await pollAndSettlePeptidePay(orderId, sessionId);
                if (outcome === "paid") {
                  return json({
                    status: "SUCCESS",
                    order_id: orderId,
                    found: true,
                    tracking: buildTracking(order as Record<string, unknown>),
                  });
                }
                if (outcome === "failed" || outcome === "expired") {
                  return json({ status: "FAILED", order_id: orderId, found: true });
                }
              } catch (err) {
                console.warn(
                  "[PeptidePay] status fallback failed:",
                  err instanceof Error ? err.message : err,
                );
              }
            }
          }
          // BrokkrPay (hosted card checkout): the signed webhook is the
          // primary settle path, but a missed/delayed delivery must not
          // leave the success page claiming "Payment received" on an order
          // the customer cancelled or never completed. Ask the provider
          // directly — same webhook-miss safety net as PeptidePay above.
          // BrokkrPay docs: only state SUCCESS means paid; PROCESSING is a
          // charge still in progress and must never be fulfilled early.
          if (provider === "brokkrpay" && !terminalMap[firestoreStatusLower]) {
            const brokkrOrderId = String(
              (order as { brokkrpayOrderId?: unknown }).brokkrpayOrderId ?? "",
            );
            if (/^[0-9a-fA-F-]{36}$/.test(brokkrOrderId)) {
              try {
                const { getBrokkrPayOrder } = await import("@/lib/brokkrpay.server");
                const remote = await getBrokkrPayOrder(brokkrOrderId);
                const state = String(remote?.state ?? "").toUpperCase();

                // Keep the stored provider state fresh even while
                // non-terminal (PENDING/PROCESSING) — admin visibility.
                if (remote && state) {
                  const stored = String(
                    (order as { brokkrpayState?: unknown }).brokkrpayState ?? "",
                  ).toUpperCase();
                  if (state !== stored) {
                    void import("@/lib/server/firestore-admin").then(({ updateDocAdmin }) =>
                      updateDocAdmin("orders", orderId, {
                        brokkrpayState: state,
                        paymentUpdatedAt: new Date(),
                      }),
                    );
                  }
                }

                if (state === "SUCCESS") {
                  // Mirror the webhook's amount defence: a SUCCESS whose
                  // amount/currency disagrees with the link we created is
                  // flagged for review, never fulfilled.
                  const expectedUsd = Number(
                    (order as { brokkrpayAmountUsd?: unknown }).brokkrpayAmountUsd ?? 0,
                  );
                  const paidUsd = typeof remote?.amount === "number" ? remote.amount : NaN;
                  const paidCurrency = String(remote?.currency ?? "USD").toUpperCase();
                  const expectedCurrency = String(
                    (order as { brokkrpayCurrency?: unknown }).brokkrpayCurrency ?? "USD",
                  ).toUpperCase();
                  const amountOk =
                    !Number.isFinite(paidUsd) || expectedUsd <= 0
                      ? true
                      : Math.abs(paidUsd - expectedUsd) < 0.5 && paidCurrency === expectedCurrency;
                  if (!amountOk) {
                    const { updateDocAdmin } = await import("@/lib/server/firestore-admin");
                    await updateDocAdmin("orders", orderId, {
                      brokkrpayState: state,
                      paymentNeedsReview: true,
                      paymentFailureReason: "BrokkrPay amount/currency mismatch",
                      paymentUpdatedAt: new Date(),
                    }).catch(() => undefined);
                    return json({ status: "PENDING", order_id: orderId, found: true });
                  }

                  // ATOMIC: poller races the webhook + reconcile cron. Only
                  // one writer flips the order and sends the mail.
                  const { transitionDocStatusAdmin } = await import(
                    "@/lib/server/firestore-admin"
                  );
                  const { transitioned, prior } = await transitionDocStatusAdmin(
                    "orders",
                    orderId,
                    {
                      allowFrom: allowFromFor("paid"),
                      updates: {
                        status: "paid",
                        paymentProvider: "brokkrpay",
                        brokkrpayOrderId: brokkrOrderId,
                        brokkrpayState: state,
                        paymentUpdatedAt: new Date(),
                        paidAt: new Date(),
                        paymentTokenHash: null,
                      },
                    },
                  );
                  if (transitioned) {
                    if (prior) {
                      const customerObj =
                        (prior.customer as Record<string, unknown> | undefined) || {};
                      const to = String(
                        prior.customerEmail ?? prior.email ?? customerObj.email ?? "",
                      );
                      if (to && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
                        try {
                          const { paymentConfirmedEmail } = await import(
                            "@/templates/paymentConfirmedEmail"
                          );
                          const firstName =
                            String(
                              (prior.firstName as string) ||
                                (customerObj.firstName as string) ||
                                (prior.customerName as string) ||
                                "",
                            ).split(" ")[0] || "there";
                          const amount = Number(
                            (prior.totalAmount as number) ?? (prior.total as number) ?? 0,
                          );
                          const orderNumber = String(prior.orderNumber ?? orderId);
                          const { subject, html, text } = paymentConfirmedEmail({
                            firstName,
                            orderNumber,
                            amount,
                            paymentMethod: "Card (BrokkrPay)",
                            paidAt: new Date(),
                          });
                          const { enqueueMailOnce } = await import(
                            "@/lib/server/enqueue-mail"
                          );
                          // Same enqueue key as the webhook — whoever wins
                          // the transition race sends; the loser's enqueue
                          // dedupes to a no-op.
                          await enqueueMailOnce(`payment-confirmed:${orderId}`, {
                            to,
                            message: { subject, html, text },
                            source: "brokkrpay:status-poll",
                          });
                        } catch (mailErr) {
                          console.warn(
                            "[BrokkrPay status] paymentConfirmedEmail enqueue failed:",
                            mailErr instanceof Error ? mailErr.message : mailErr,
                          );
                        }
                      }
                    }
                    return json({
                      status: "SUCCESS",
                      order_id: orderId,
                      found: true,
                      tracking: buildTracking(prior ?? (order as Record<string, unknown>)),
                    });
                  }
                  // Lost the race (webhook settled first) — report from the
                  // fresh prior state the transaction handed back.
                  const nowStatus = String(prior?.status ?? "").toLowerCase();
                  if (["paid", "completed", "shipped", "delivered"].includes(nowStatus)) {
                    return json({
                      status: "SUCCESS",
                      order_id: orderId,
                      found: true,
                      tracking: buildTracking(
                        prior ?? (order as Record<string, unknown>),
                      ),
                    });
                  }
                  return json({ status: "PENDING", order_id: orderId, found: true });
                }

                if (state === "CANCELLED") {
                  // Customer cancelled at the hosted page or the 24h payment
                  // link expired unpaid. Atomic + unpaid-only allow-list, so
                  // a late CANCELLED can never pull a settled order back.
                  const { transitionDocStatusAdmin } = await import(
                    "@/lib/server/firestore-admin"
                  );
                  await transitionDocStatusAdmin("orders", orderId, {
                    allowFrom: allowFromFor("cancelled"),
                    updates: {
                      status: "cancelled",
                      brokkrpayState: state,
                      paymentUpdatedAt: new Date(),
                      paymentTokenHash: null,
                    },
                  });
                  return json({ status: "CANCELLED", order_id: orderId, found: true });
                }

                if (state === "FAILED" || state === "EXPIRED") {
                  const { transitionDocStatusAdmin } = await import(
                    "@/lib/server/firestore-admin"
                  );
                  await transitionDocStatusAdmin("orders", orderId, {
                    allowFrom: allowFromFor("failed"),
                    updates: {
                      status: "failed",
                      brokkrpayState: state,
                      paymentUpdatedAt: new Date(),
                      paymentTokenHash: null,
                    },
                  });
                  return json({ status: "FAILED", order_id: orderId, found: true });
                }

                // PENDING / PROCESSING (charge in progress — never fulfil
                // yet) → fall through to the Firestore answer below.
              } catch (err) {
                console.warn(
                  "[BrokkrPay] status fallback failed:",
                  err instanceof Error ? err.message : err,
                );
              }
            }
          }
          return answerFromFirestore();
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
          // No Wallid session for this order — fall back to whatever the
          // Firestore order says rather than a permanent 404.
          return answerFromFirestore();
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
                  allowFrom: allowFromFor(firestoreStatus),
                  updates: {
                    status: firestoreStatus,
                    paymentProvider: "wallid",
                    paymentRef: orderId,
                    apiPaymentId: row.api_payment_id,
                    wallidApiPaymentId: row.api_payment_id,
                    wallidPaymentRef: orderId,
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

              // Failed / expired detected by the poller → retry-link email.
              if (
                transitioned &&
                (firestoreStatus === "failed" || firestoreStatus === "expired") &&
                prior
              ) {
                try {
                  const { sendPaymentRetryEmailNow } = await import(
                    "@/lib/server/send-payment-retry.server"
                  );
                  await sendPaymentRetryEmailNow(
                    orderId,
                    prior as Record<string, unknown>,
                    `wallid:status-poll:${firestoreStatus}`,
                  );
                } catch (mailErr) {
                  console.warn(
                    "[Wallid status] retry email failed:",
                    mailErr instanceof Error ? mailErr.message : mailErr,
                  );
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
          //
          // tracking: the Firestore order doc fields the success page needs
          // to fire the GA4/Ads purchase event. Guests CANNOT read the
          // order doc client-side (RLS: userId == auth.uid), so without this
          // payload the purchase conversion silently never fired for guest
          // checkouts (2026-08-08: 30 days of zero recorded conversions
          // while Wallid orders were completing). Caller is already verified
          // as the order owner above (idToken or paymentToken), so echoing
          // their own order data leaks nothing.
          const shipAddr = (
            (order as { shippingAddress?: unknown }).shippingAddress ??
            (order as { shipping?: unknown }).shipping ??
            {}
          ) as Record<string, unknown>;
          const customerObj = (
            ((order as { customer?: unknown }).customer ?? {}) as Record<string, unknown>
          );
          const tracking = {
            total:
              (order as { total?: unknown }).total ??
              (order as { totalAmount?: unknown }).totalAmount ??
              (order as { totalPrice?: unknown }).totalPrice ??
              (order as { amount?: unknown }).amount ??
              row.amount,
            vatAmount:
              (order as { vatAmount?: unknown }).vatAmount ??
              (order as { tax?: unknown }).tax ??
              0,
            shippingCost:
              (order as { shippingCost?: unknown }).shippingCost ??
              (order as { shippingTotal?: unknown }).shippingTotal ??
              0,
            items: Array.isArray((order as { items?: unknown }).items)
              ? (order as { items?: unknown }).items
              : [],
            email:
              (order as { email?: unknown }).email ??
              (order as { customerEmail?: unknown }).customerEmail ??
              customerObj.email ??
              shipAddr.email ??
              null,
            phone:
              (order as { phone?: unknown }).phone ??
              shipAddr.phone ??
              customerObj.phone ??
              null,
            shippingAddress: shipAddr,
          };
          // We just handed the verified owner everything needed to fire the
          // GA4 purchase event client-side — mark the order so the MP
          // backfill skips it. Fire-and-forget: never delay the response.
          if (status === "SUCCESS" || status === "PAID" || status === "COMPLETED") {
            try {
              const { updateDocAdmin } = await import("@/lib/server/firestore-admin");
              void updateDocAdmin("orders", orderId, { gaClientPurchaseAt: new Date() });
            } catch { /* ignore */ }
          }
          return json({
            status,
            order_id: orderId,
            amount: row.amount,
            currency: row.currency,
            tracking,
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
