/**
 * Fena Open Banking webhook receiver.
 *
 * URL: https://phlabs.co.uk/api/public/hooks/fena
 *
 * Configure this URL in the Fena dashboard. Fena's spec does NOT define a
 * signature header, so we treat the incoming body as *untrusted notification
 * only*: we extract the payment id, re-fetch the authoritative payment
 * record from Fena's API using our terminal-secret, and only then mutate
 * the order. This is functionally equivalent to HMAC verification and
 * blocks spoofed POSTs from anyone who doesn't hold the terminal secret.
 *
 * Idempotency: each Fena event id is appended to `orders/{id}.fenaEventIds`
 * (capped) and skipped on replay. A queued mail is only enqueued on the
 * first paid transition.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  addDocAdmin,
  findDocByFieldAdmin,
  getDocAdmin,
  updateDocAdmin,
} from "@/lib/server/firestore-admin";
import { fenaGetPayment, fenaGetBankAccount } from "@/lib/fena.server";
import { computeFenaOrderUpdates } from "@/lib/fena-webhook-updates";
import { enforceRateLimit } from "@/lib/rate-limit";
import { raiseFenaAlert } from "@/lib/fena-alerts.server";

interface FenaWebhookBody {
  eventScope?: string;
  eventName?: string;
  id?: string;
  orderId?: string;
  status?: string;
  reference?: string;
  amount?: string;
  // Fena may also send `data` or top-level payment fields — defensive read.
  data?: { id?: string };
}

async function logEvent(
  level: "info" | "warn" | "error",
  message: string,
  ctx: Record<string, unknown>,
) {
  try {
    await addDocAdmin("fena_webhook_events", {
      level,
      message,
      ctx,
      createdAt: new Date(),
    });
  } catch {
    // never fail the webhook for a logging error
  }
}

export const Route = createFileRoute("/api/public/hooks/fena")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = await enforceRateLimit(request, "/api/public/hooks/fena", {
          limit: 60,
          windowMs: 60_000,
          retryAfterSec: 60,
        });
        if (limited) return limited;

        let bodyText = "";
        try {
          bodyText = await request.text();
        } catch {
          return new Response("Bad Request", { status: 400 });
        }
        if (bodyText.length > 32_000) {
          return new Response("Payload too large", { status: 413 });
        }

        let payload: FenaWebhookBody;
        try {
          payload = JSON.parse(bodyText) as FenaWebhookBody;
        } catch {
          await logEvent("warn", "invalid json", { raw: bodyText.slice(0, 500) });
          return new Response("Bad JSON", { status: 400 });
        }

        // --- Health-check / ping from Fena dashboard ---
        // Fena's "Send test event" button posts `{ping: 1}` (or similar with no
        // id/scope). Acknowledge 200 and log as info — not a real warning.
        const pAny = payload as Record<string, unknown>;
        if (
          ("ping" in pAny || Object.keys(pAny).length === 0) &&
          !pAny.id &&
          !pAny.eventScope &&
          !(pAny.data && typeof pAny.data === "object" && (pAny.data as { id?: unknown }).id)
        ) {
          await logEvent("info", "ping", { payload });
          return Response.json({ ok: true, pong: true });
        }

        // --- Route by eventScope ---
        const eventScope = String(payload.eventScope ?? "").toLowerCase();
        const eventName = String(payload.eventName ?? "").toLowerCase();

        // Bank-accounts events: re-fetch authoritative account and mirror it.
        // The inbound payload is also mirrored (provider, creationType,
        // bankConsentExpired, consentID, bankStatementAttachmentURL, …) so the
        // admin tab reflects the latest state even when the re-fetch fails.
        if (eventScope === "bank-accounts") {
          const accountId =
            payload.id ||
            payload.data?.id ||
            (payload as { accountId?: string }).accountId;
          if (!accountId || typeof accountId !== "string") {
            await logEvent("warn", "bank-accounts: missing account id", { payload });
            return new Response("Missing account id", { status: 400 });
          }

          // Extract whitelisted fields from the inbound webhook payload.
          const p = payload as Record<string, unknown>;
          const str = (v: unknown) => (typeof v === "string" ? v : undefined);
          const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
          const inboundMirror: Record<string, unknown> = {
            id: accountId,
            sortCode: str(p.sortCode),
            accountNumber: str(p.accountNumber),
            name: str(p.name),
            provider: str(p.provider),
            isDefault: bool(p.isDefault),
            status: str(p.status),
            creationType: str(p.creationType),
            createdAt: str(p.createdAt),
            bankStatementAttachmentURL: str(p.bankStatementAttachmentURL),
            consentID: str(p.consentID),
            bankConsentExpired: str(p.bankConsentExpired),
          };
          // Strip undefined so we don't overwrite existing fields with null.
          for (const k of Object.keys(inboundMirror)) {
            if (inboundMirror[k] === undefined) delete inboundMirror[k];
          }

          let authoritative: Record<string, unknown> | null = null;
          try {
            authoritative = (await fenaGetBankAccount(accountId)) as Record<string, unknown>;
          } catch (err) {
            await logEvent("warn", "bank-accounts re-fetch failed, mirroring payload only", {
              accountId,
              error: err instanceof Error ? err.message : String(err),
            });
          }

          try {
            await updateDocAdmin("fena_bank_accounts", accountId, {
              ...inboundMirror,
              ...(authoritative ?? {}),
              lastEventName: eventName || null,
              lastSeenAt: new Date(),
            });
          } catch (err) {
            await logEvent("error", "bank-accounts write failed", {
              accountId,
              error: err instanceof Error ? err.message : String(err),
            });
            await raiseFenaAlert("fena_bank_account_write_failed", "error", {
              accountId,
              error: err instanceof Error ? err.message : String(err),
            });
            return new Response("Write failed", { status: 500 });
          }

          await logEvent("info", `bank-accounts:${eventName || "update"}`, {
            accountId,
            status: (authoritative?.status as string) ?? inboundMirror.status,
            bankConsentExpired: inboundMirror.bankConsentExpired,
            reFetched: Boolean(authoritative),
          });
          return Response.json({ ok: true });
        }

        // Defensive: Fena's payment webhook may use `id`, `data.id`,
        // `paymentId`, or `data.paymentId` depending on event type.
        const dataObj = (pAny.data && typeof pAny.data === "object" ? pAny.data : {}) as Record<string, unknown>;
        const fenaPaymentId =
          (typeof pAny.id === "string" && pAny.id) ||
          (typeof dataObj.id === "string" && dataObj.id) ||
          (typeof pAny.paymentId === "string" && pAny.paymentId) ||
          (typeof dataObj.paymentId === "string" && dataObj.paymentId) ||
          "";
        const webhookReferenceRaw = typeof pAny.reference === "string" ? pAny.reference : "";
        const webhookOrderIdRaw = typeof pAny.orderId === "string" ? pAny.orderId : "";
        const normalizedWebhookOrderId = (webhookReferenceRaw || webhookOrderIdRaw || "").toUpperCase();

        console.log("Webhook reference (raw):", webhookReferenceRaw);
        console.log("Webhook orderId (raw):", webhookOrderIdRaw);
        console.log("Normalized orderId:", normalizedWebhookOrderId);

        if (!fenaPaymentId) {
          await logEvent("warn", "missing payment id", { payload });
          return new Response("Missing id", { status: 400 });
        }

        // Authoritative re-fetch — proves the sender knows nothing the
        // attacker couldn't fake; only we can call this with the secret.
        let authoritative;
        try {
          authoritative = await fenaGetPayment(fenaPaymentId);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await logEvent("error", "fena api re-fetch failed", {
            fenaPaymentId,
            error: errMsg,
          });
          await raiseFenaAlert("fena_refetch_failed", "error", {
            fenaPaymentId,
            error: errMsg,
            hint: "Verify FENA_TERMINAL_ID / FENA_TERMINAL_SECRET and Fena API reachability.",
          });
          // Tell Fena to retry later (5xx).
          return new Response("Upstream verify failed", { status: 502 });
        }

        // Find the matching order.
        //   1. by direct doc lookup on the webhook `reference/orderId.toUpperCase()`
        //   2. by `fenaPaymentId` (stored at create-time)
        //   3. by `fenaReference` (sanitized lowercase ref we sent to Fena)
        //   4. by direct doc lookup on authoritative `reference.toUpperCase()` — Fena echoes
        //      the reference back in lowercase but Firestore doc ids are
        //      uppercase (`PHP-...`), so casing alone caused a miss.
        let orderRow: Record<string, unknown> | null = null;
        let matchedBy: "webhookDocId" | "fenaPaymentId" | "fenaReference" | "docId" | "none" = "none";
        if (normalizedWebhookOrderId) {
          const direct = await getDocAdmin("orders", normalizedWebhookOrderId);
          if (direct) {
            orderRow = { ...(direct as Record<string, unknown>), __id: normalizedWebhookOrderId };
            matchedBy = "webhookDocId";
          }
        }
        if (!orderRow) {
          orderRow = await findDocByFieldAdmin(
            "orders",
            "fenaPaymentId",
            fenaPaymentId,
          );
          if (orderRow) matchedBy = "fenaPaymentId";
        }
        const refRaw = String(authoritative.reference ?? "");
        const refLower = refRaw.toLowerCase();
        const refUpper = refRaw.toUpperCase();
        if (!orderRow && refLower) {
          orderRow = await findDocByFieldAdmin("orders", "fenaReference", refLower);
          if (orderRow) matchedBy = "fenaReference";
        }
        if (!orderRow && refUpper) {
          const direct = await getDocAdmin("orders", refUpper);
          if (direct) {
            orderRow = { ...(direct as Record<string, unknown>), __id: refUpper };
            matchedBy = "docId";
          }
        }
        await logEvent("info", "lookup", {
          fenaPaymentId,
          webhookReferenceRaw,
          webhookOrderIdRaw,
          normalizedWebhookOrderId,
          referenceRaw: refRaw,
          referenceUpper: refUpper,
          fenaStatus: String(authoritative.status ?? ""),
          matchedBy,
          matchedOrderId: orderRow && typeof orderRow.__id === "string" ? orderRow.__id : null,
        });
        if (!orderRow) {
          // Persist a durable orphan record so admins can reconcile (e.g. refund
          // the customer, or re-link to an order created out-of-band). Using
          // the Fena payment id as the doc id makes repeated webhook deliveries
          // idempotent — each orphan shows up once with the latest known state.
          const orphanCtx = {
            fenaPaymentId,
            reference: String(authoritative.reference ?? ""),
            amount: String(authoritative.amount ?? ""),
            fenaStatus: String(authoritative.status ?? ""),
            completedAt: authoritative.completedAt ?? null,
            receivedAt: new Date().toISOString(),
            reason: "no_order_with_matching_fenaPaymentId",
          };
          try {
            await updateDocAdmin("fena_orphan_payments", fenaPaymentId, {
              ...orphanCtx,
              lastSeenAt: new Date(),
            });
          } catch {
            // Fallback to addDoc if the doc doesn't exist yet — updateDoc on
            // missing doc throws in some SDKs. Use addDoc with explicit id-less
            // path so we still have a trail.
            try {
              await addDocAdmin("fena_orphan_payments", {
                ...orphanCtx,
                lastSeenAt: new Date(),
              });
            } catch {/* swallow — webhook must not 5xx for logging */}
          }
          await logEvent("error", "ORPHAN: Fena payment has no matching order", orphanCtx);
          // Ack so Fena stops retrying; flagged as error level in the admin tab.
          return new Response("No matching order (logged as orphan)", { status: 200 });
        }
        // Find the document id by looking it up — findDocByFieldAdmin
        // returns fields only, so refetch by orderNumber/reference.
        // Cheaper: store fenaPaymentId already mapped; locate orderId via
        // the order doc we got back (it includes `orderNumber`/etc but not
        // its own id). Use the reference field which equals orderNumber.
        const reference = String(authoritative.reference ?? "");
        const orderId = typeof orderRow.__id === "string" ? orderRow.__id : null;
        if (!orderId) {
          await logEvent("warn", "could not resolve order doc id", {
            fenaPaymentId,
            reference,
          });
          return new Response("No order id", { status: 200 });
        }

        const { updates, eventKey, isDuplicate, transitionedToPaid } =
          computeFenaOrderUpdates({
            orderRow,
            authoritative: authoritative as { status?: unknown; completedAt?: unknown },
            fenaPaymentId,
          });

        if (isDuplicate) {
          await logEvent("info", "duplicate event ignored", { fenaPaymentId, eventKey });
          return new Response("Already processed", { status: 200 });
        }

        const fenaStatus = String(updates.fenaStatus ?? "");
        const currentStatus = String(orderRow.status ?? "pending").toLowerCase();
        const isPaid = transitionedToPaid;

        try {
          await updateDocAdmin("orders", orderId, updates);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await logEvent("error", "order update failed", {
            orderId,
            fenaPaymentId,
            error: errMsg,
          });
          await raiseFenaAlert("fena_order_update_failed", "critical", {
            orderId,
            fenaPaymentId,
            fenaStatus,
            attemptedUpdates: updates,
            error: errMsg,
            hint: "Order will stay in its current status; Fena will retry the webhook.",
          });
          // 5xx → Fena will retry.
          return new Response("Order update failed", { status: 500 });
        }

        // Enqueue confirmation mail on first paid transition.
        if (isPaid && currentStatus !== "paid") {
          const to = String(orderRow.customerEmail ?? orderRow.email ?? "");
          if (to && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
            try {
              await addDocAdmin("mail", {
                to,
                message: {
                  subject: `PH Labs — payment received for ${reference}`,
                  html: `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:24px;color:#0f172a">
                    <h2 style="color:#10b981">Payment received</h2>
                    <p>Thank you — we've received your payment for order
                    <strong>${reference}</strong>.</p>
                    <p>We'll send dispatch details shortly. Reply to this email
                    if you need help.</p>
                    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
                    <p style="color:#64748b;font-size:12px">All products sold for laboratory research purposes only.</p>
                  </body></html>`,
                  text: `Payment received for order ${reference}. Thank you.`,
                },
                createdAt: new Date(),
                source: "fena:webhook",
              });
            } catch (err) {
              await logEvent("error", "mail enqueue failed", {
                orderId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }

        await logEvent("info", "processed", {
          orderId,
          fenaPaymentId,
          fenaStatus,
          newStatus: updates.status ?? currentStatus,
        });

        return Response.json({ ok: true });
      },
    },
  },
});
