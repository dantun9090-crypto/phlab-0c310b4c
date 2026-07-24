/**
 * Unpaid bank-transfer order reminders + auto-cancel.
 *
 * Invoked hourly by the phlabs-ai-gateway Worker cron (x-cron-secret auth):
 *   - order age ≥ 3h  → payment reminder #1 (once)
 *   - order age ≥ 6h  → payment reminder #2 (once, final)
 *   - order age ≥ 24h → order auto-cancelled (atomic status transition) +
 *     cancellation email
 *
 * Only orders with status `pending` and paymentMethod `bank_transfer` are
 * touched. Card orders and already-paid/cancelled orders are never affected.
 * Idempotent: reminder flags (paymentReminder1At / paymentReminder2At) are
 * stamped on the order document after each send.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  addDocAdmin,
  getDocAdmin,
  listDocsAdmin,
  transitionDocStatusAdmin,
  updateDocAdmin,
} from "@/lib/server/firestore-admin";
import { buildPaymentReminderEmail } from "@/templates/paymentReminderEmail";
import { buildCancellationEmail } from "@/templates/cancellationEmail";

const HOUR_MS = 3600 * 1000;
const REMINDER_1_AFTER_H = 3;
const REMINDER_2_AFTER_H = 6;
const CANCEL_AFTER_H = 24;

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function orderEmail(o: any): string | null {
  if (typeof o?.email === "string" && o.email.includes("@")) return o.email;
  const c = o?.customer;
  if (c && typeof c.email === "string" && c.email.includes("@")) return c.email;
  return null;
}

async function sendMail(to: string, subject: string, html: string, source: string): Promise<void> {
  await addDocAdmin("mail", {
    to,
    message: { subject, html },
    createdAt: new Date(),
    source,
  });
}

export const Route = createFileRoute("/api/admin/order-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = (process.env.CRON_SECRET || "").trim();
        const provided = (request.headers.get("x-cron-secret") || "").trim();
        if (!expected || provided !== expected) {
          return json({ ok: false, error: "unauthorized" }, 401);
        }

        // Bank details from the trusted server-side settings doc (same source
        // as the order-confirmation route — never from client input).
        const site = await getDocAdmin("settings", "siteSettings").catch(() => null);
        const legacy = await getDocAdmin("settings", "bankTransfer").catch(() => null);
        const pick = (a: unknown, b: unknown) =>
          typeof a === "string" && a.trim() ? a
          : typeof b === "string" && b.trim() ? b
          : undefined;
        const bankName = pick(site?.bankTransferName, legacy?.bankName);
        const sortCode = pick(site?.bankTransferSortCode, legacy?.sortCode);
        const accountNumber = pick(site?.bankTransferAccountNumber, legacy?.accountNumber);
        const iban = pick(site?.bankTransferIBAN, legacy?.iban);

        const pending = await listDocsAdmin("orders", {
          where: { field: "status", value: "pending" },
          limit: 200,
        }).catch(() => []);

        const now = Date.now();
        const summary = {
          checked: 0,
          reminder1Sent: 0,
          reminder2Sent: 0,
          cancelled: 0,
          skippedNoEmail: 0,
          errors: [] as string[],
        };

        for (const order of pending as any[]) {
          if (String(order.paymentMethod ?? "") !== "bank_transfer") continue;
          const created = parseDate(order.createdAt);
          if (!created) continue;
          summary.checked++;

          const ageH = (now - created.getTime()) / HOUR_MS;
          const to = orderEmail(order);
          const firstName = String((order.customer as any)?.firstName ?? "there");
          const shortId = String(order.id).slice(-8).toUpperCase();
          const reference =
            typeof order.bankTransferReference === "string" && order.bankTransferReference.trim()
              ? order.bankTransferReference
              : `#${shortId}`;
          const totalAmount = Number(order.totalAmount ?? order.totalPrice ?? order.total ?? 0) || 0;

          try {
            // ── 24h+: auto-cancel (atomic) ────────────────────────────────
            if (ageH >= CANCEL_AFTER_H) {
              const tx = await transitionDocStatusAdmin("orders", order.id, {
                allowFrom: ["pending"],
                updates: {
                  status: "cancelled",
                  cancelReason: "auto_unpaid_24h",
                  cancelledAt: new Date(),
                },
              });
              if (!tx.transitioned) continue; // someone else handled it
              summary.cancelled++;
              if (to) {
                const items = Array.isArray(order.items)
                  ? (order.items as any[]).map((it) => ({
                      name: String(it.productName ?? it.name ?? ""),
                      variantName: typeof it.variantName === "string" ? it.variantName : undefined,
                      quantity: Number(it.quantity ?? 0),
                      priceNum: Number(it.price ?? 0),
                    }))
                  : [];
                await sendMail(
                  to,
                  `Order Cancelled — ${shortId} | PH Labs`,
                  buildCancellationEmail({
                    firstName,
                    orderId: order.id,
                    totalAmount,
                    items,
                    hoursElapsed: Math.round(ageH),
                  }),
                  "order-reminder:auto-cancel",
                );
              } else {
                summary.skippedNoEmail++;
              }
              continue;
            }

            if (!to) { summary.skippedNoEmail++; continue; }

            // ── 6h+: reminder #2 (final) ──────────────────────────────────
            if (ageH >= REMINDER_2_AFTER_H && order.paymentReminder1At && !order.paymentReminder2At) {
              await sendMail(
                to,
                `Final Payment Reminder — ${shortId} | PH Labs`,
                buildPaymentReminderEmail({
                  firstName,
                  orderId: order.id,
                  totalAmount,
                  bankName,
                  sortCode,
                  accountNumber,
                  iban,
                  reference,
                  hoursElapsed: Math.round(ageH),
                }),
                "order-reminder:second",
              );
              await updateDocAdmin("orders", order.id, { paymentReminder2At: new Date() });
              summary.reminder2Sent++;
              continue;
            }

            // ── 3h+: reminder #1 ──────────────────────────────────────────
            if (ageH >= REMINDER_1_AFTER_H && !order.paymentReminder1At) {
              await sendMail(
                to,
                `Payment Reminder — ${shortId} | PH Labs`,
                buildPaymentReminderEmail({
                  firstName,
                  orderId: order.id,
                  totalAmount,
                  bankName,
                  sortCode,
                  accountNumber,
                  iban,
                  reference,
                  hoursElapsed: Math.round(ageH),
                }),
                "order-reminder:first",
              );
              await updateDocAdmin("orders", order.id, { paymentReminder1At: new Date() });
              summary.reminder1Sent++;
              continue;
            }
          } catch (e) {
            summary.errors.push(`${order.id}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200));
          }
        }

        return json({ ok: true, ...summary });
      },
    },
  },
});
