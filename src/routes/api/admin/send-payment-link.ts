/**
 * Admin: email a "pay again" link (+ bank transfer fallback) for an unpaid
 * order whose Pay-by-Bank payment was cancelled, expired, or never confirmed.
 *
 * Auth: Firebase ID token of an admin user (verified server-side). Bank
 * details are read from the trusted server-side settings doc — never from
 * client input.
 */
import { createFileRoute } from "@tanstack/react-router";
import { addDocAdmin, getDocAdmin, updateDocAdmin } from "@/lib/server/firestore-admin";
import { buildPaymentRetryEmail } from "@/templates/paymentRetryEmail";

const SITE_ORIGIN = "https://phlabs.co.uk";
const PAYABLE_STATUSES = new Set([
  "pending",
  "pending_payment",
  "awaiting_payment",
  "processing_payment",
  "failed",
  "cancelled",
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function loadBankDetails() {
  const site = await getDocAdmin("settings", "siteSettings").catch(() => null);
  const legacy = await getDocAdmin("settings", "bankTransfer").catch(() => null);
  const pick = (a: unknown, b: unknown) =>
    typeof a === "string" && a.trim() ? a
    : typeof b === "string" && b.trim() ? b
    : undefined;
  return {
    bankName: pick(site?.bankTransferName, legacy?.bankName),
    sortCode: pick(site?.bankTransferSortCode, legacy?.sortCode),
    accountNumber: pick(site?.bankTransferAccountNumber, legacy?.accountNumber),
    iban: pick(site?.bankTransferIBAN, legacy?.iban),
  };
}

export const Route = createFileRoute("/api/admin/send-payment-link")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { idToken?: string; orderId?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return json({ ok: false, error: "invalid_body" }, 400);
        }

        const idToken = String(body.idToken || "");
        const orderId = String(body.orderId || "").trim();
        if (!idToken || !orderId) return json({ ok: false, error: "missing_params" }, 400);

        try {
          const { requireFirebaseAdmin } = await import("@/lib/server/firebase-auth-admin");
          await requireFirebaseAdmin(idToken);
        } catch {
          return json({ ok: false, error: "unauthorized" }, 401);
        }

        const order = await getDocAdmin("orders", orderId).catch(() => null);
        if (!order) return json({ ok: false, error: "order_not_found" }, 404);

        const status = String(order.status ?? "").toLowerCase();
        if (!PAYABLE_STATUSES.has(status)) {
          return json({ ok: false, error: `order_not_payable (${status})` }, 409);
        }

        const customer = (order.customer as Record<string, unknown> | undefined) || {};
        const to = String(order.email ?? order.customerEmail ?? customer.email ?? "");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
          return json({ ok: false, error: "no_customer_email" }, 422);
        }

        const firstName =
          String(customer.firstName ?? order.firstName ?? order.customerName ?? "there").split(" ")[0] ||
          "there";
        const totalAmount =
          Number(order.totalAmount ?? order.totalPrice ?? order.total ?? 0) || 0;
        const shortId = orderId.slice(-8).toUpperCase();
        const reference =
          typeof order.bankTransferReference === "string" && order.bankTransferReference.trim()
            ? order.bankTransferReference
            : `#${shortId}`;

        const bank = await loadBankDetails();
        const html = buildPaymentRetryEmail({
          firstName,
          orderId,
          totalAmount,
          payLink: `${SITE_ORIGIN}/payment?orderId=${encodeURIComponent(orderId)}`,
          reference,
          ...bank,
        });

        await addDocAdmin("mail", {
          to,
          message: { subject: `Complete your payment — ${shortId} | PH Labs`, html },
          createdAt: new Date(),
          source: "admin:payment-retry-link",
        });

        await updateDocAdmin("orders", orderId, {
          paymentRetryLinkSentAt: new Date(),
        }).catch(() => {});

        return json({ ok: true, to });
      },
    },
  },
});
