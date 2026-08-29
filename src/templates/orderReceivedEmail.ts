/**
 * Order-received confirmation email.
 *
 * Sent immediately when an order is placed — BEFORE payment is confirmed.
 * Without this, customers who abandon or fail the Wallid Open Banking step
 * never receive any email at all and contact support asking whether their
 * order exists (real complaints logged Aug 2026).
 */
import {
  EMAIL_COLORS as C,
  EMAIL_FONT,
  ctaButton,
  divider,
  emailWrapper,
  escapeHtml as esc,
  greeting,
  infoCard,
  sectionHeading,
  statusBadge,
} from './emailBase';

export interface OrderReceivedEmailParams {
  firstName?: string;
  orderNumber: string;
  totalAmount: number;
  items?: Array<{ name: string; variantName?: string; quantity: number; total: number }>;
  bankTransferReference?: string;
  paymentPending?: boolean;
  /** When 'tide', the email carries the Tide payment link + reference so the
   *  customer can still pay after leaving the confirmation screen. */
  paymentMethod?: string;
}

export function orderReceivedEmail(p: OrderReceivedEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Order received — ${p.orderNumber}`;
  const totalStr = `£${Number(p.totalAmount || 0).toFixed(2)}`;

  const itemRows = (p.items ?? [])
    .map(
      (it) => `
      <tr>
        <td style="padding:8px 0;color:${C.text};font-size:14px;font-family:${EMAIL_FONT};">
          ${esc(it.name)}${it.variantName ? ` <span style="color:${C.textMuted};">(${esc(it.variantName)})</span>` : ''}
          <span style="color:${C.textMuted};"> × ${Number(it.quantity) || 1}</span>
        </td>
        <td align="right" style="padding:8px 0;color:${C.textBright};font-size:14px;font-family:${EMAIL_FONT};">
          £${Number(it.total || 0).toFixed(2)}
        </td>
      </tr>`,
    )
    .join('');

  const itemsTable = itemRows
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">${itemRows}</table>`
    : '';

  const content = `
    ${sectionHeading('Order received')}
    ${greeting(p.firstName || 'there')}
    <p style="margin:0 0 18px;color:${C.text};font-size:15px;line-height:1.6;font-family:${EMAIL_FONT};">
      Thanks for your order — we have it safely on our system as
      <strong style="color:${C.textBright};font-family:monospace;">${esc(p.orderNumber)}</strong>.
    </p>
    <p style="margin:0 0 22px;">${statusBadge(
      p.paymentPending ? 'Awaiting payment' : 'Received',
      '#fbbf24',
      'rgba(251,191,36,0.12)',
    )}</p>
    ${itemsTable}
    ${infoCard([
      { label: 'Order', value: p.orderNumber, mono: true, highlight: true },
      { label: 'Total', value: totalStr, highlight: true },
      ...(p.bankTransferReference
        ? [{ label: 'Bank reference', value: p.bankTransferReference, mono: true }]
        : []),
    ])}
    ${
      p.paymentPending
        ? `<p style="margin:0 0 18px;color:${C.text};font-size:14px;line-height:1.6;font-family:${EMAIL_FONT};">
             We have not received your payment yet. If your bank app closed early
             or the transfer did not complete, you can pay securely from your
             account page — your order stays reserved in the meantime.
           </p>`
        : ''
    }
    ${
      isTide
        ? `<p style="margin:0 0 14px;color:${C.text};font-size:14px;line-height:1.6;font-family:${EMAIL_FONT};">
             Pay securely via Tide (QR code or Open Banking). When you pay, enter
             the amount <strong style="color:${C.textBright};">${totalStr}</strong>
             and this payment reference exactly as shown${
               p.bankTransferReference
                 ? `: <strong style="color:${C.textBright};font-family:monospace;">${esc(p.bankTransferReference)}</strong>`
                 : ''
             }, so we can match your payment.
           </p>
           ${ctaButton('Pay with Tide', TIDE_PAYMENT_URL)}`
        : ''
    }
    ${ctaButton('View your order', 'https://phlabs.co.uk/account')}
    ${divider()}
    <p style="margin:0;color:${C.textMuted};font-size:13px;line-height:1.6;font-family:${EMAIL_FONT};">
      We'll email you again as soon as your payment is confirmed, and once more
      with tracking when your order is dispatched. Questions? Contact
      <a href="mailto:info@phlabs.co.uk" style="color:${C.accent};text-decoration:none;">info@phlabs.co.uk</a>.
      <br /><br />
      For Research Use Only. Not for Human Consumption.
    </p>
  `;

  const text = [
    `Order received — ${p.orderNumber}`,
    ``,
    ...(p.items ?? []).map(
      (it) =>
        `- ${it.name}${it.variantName ? ` (${it.variantName})` : ''} x${it.quantity} — £${Number(it.total || 0).toFixed(2)}`,
    ),
    ``,
    `Total: ${totalStr}`,
    ...(p.bankTransferReference ? [`Bank reference: ${p.bankTransferReference}`] : []),
    ``,
    ...(p.paymentPending
      ? [`We have not received your payment yet — you can pay from https://phlabs.co.uk/account`]
      : []),
    `View your order: https://phlabs.co.uk/account`,
    `Questions? info@phlabs.co.uk`,
    ``,
    `For Research Use Only. Not for Human Consumption.`,
  ].join('\n');

  return { subject, html: emailWrapper(content), text };
}
