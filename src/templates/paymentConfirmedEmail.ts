/**
 * Payment-received confirmation email.
 *
 * Sent on the first `paid` transition of an order (Fena/TrueLayer Open Banking
 * webhook). Mirrors the branded look of dispatch/order-status emails.
 */
import {
  EMAIL_COLORS,
  EMAIL_FONT,
  ctaButton,
  divider,
  emailWrapper,
  escapeHtml,
  greeting,
  infoCard,
  sectionHeading,
  statusBadge,
} from "./emailBase";

export interface PaymentConfirmedEmailParams {
  firstName?: string;
  orderNumber: string;
  amount: number; // in GBP, e.g. 24.99
  paymentMethod?: string; // e.g. "Open Banking (Fena)"
  paidAt?: Date | string;
}

export function paymentConfirmedEmail(p: PaymentConfirmedEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const C = EMAIL_COLORS;
  const subject = `Payment received — order ${p.orderNumber}`;
  const paidAt =
    p.paidAt instanceof Date
      ? p.paidAt
      : p.paidAt
        ? new Date(p.paidAt)
        : new Date();
  const paidAtStr = paidAt.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  });
  const amountStr = `£${Number(p.amount || 0).toFixed(2)}`;

  const content = `
    ${sectionHeading("Payment received")}
    ${greeting(p.firstName || "there")}
    <p style="margin:0 0 18px;color:${C.text};font-size:15px;line-height:1.6;font-family:${EMAIL_FONT};">
      Thank you — we've received your payment for order
      <strong style="color:${C.textBright};font-family:monospace;">${escapeHtml(p.orderNumber)}</strong>.
      Your order is now confirmed and is being prepared for dispatch.
    </p>
    <p style="margin:0 0 22px;">${statusBadge("Paid", C.success, "rgba(52,211,153,0.12)")}</p>
    ${infoCard([
      { label: "Order", value: p.orderNumber, mono: true, highlight: true },
      { label: "Amount paid", value: amountStr, highlight: true },
      { label: "Payment method", value: p.paymentMethod || "Open Banking (bank transfer)" },
      { label: "Paid at", value: paidAtStr },
    ])}
    ${ctaButton("View your orders", "https://phlabs.co.uk/account")}
    ${divider()}
    <p style="margin:0;color:${C.textMuted};font-size:13px;line-height:1.6;font-family:${EMAIL_FONT};">
      We'll send a dispatch confirmation with tracking details as soon as your
      order leaves our facility. If you have any questions, just reply to this
      email or contact
      <a href="mailto:info@phlabs.co.uk" style="color:${C.accent};text-decoration:none;">info@phlabs.co.uk</a>.
    </p>
  `;

  const html = emailWrapper(content);
  const text = [
    `Payment received for order ${p.orderNumber}.`,
    `Amount: ${amountStr}`,
    `Method: ${p.paymentMethod || "Open Banking (bank transfer)"}`,
    `Paid at: ${paidAtStr}`,
    ``,
    `Your order is confirmed and being prepared for dispatch. We'll email`,
    `tracking details as soon as it ships.`,
    ``,
    `View your orders: https://phlabs.co.uk/account`,
    `Questions? info@phlabs.co.uk`,
  ].join("\n");

  return { subject, html, text };
}
