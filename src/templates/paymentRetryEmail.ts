import {
  emailWrapper,
  ctaButton,
  infoCard,
  divider,
  escapeHtml as esc,
  EMAIL_COLORS as C,
  EMAIL_FONT,
} from './emailBase';

export interface PaymentRetryEmailParams {
  firstName: string;
  orderId: string;
  totalAmount: number;
  /** Absolute link that re-opens the hosted payment page for this order. */
  payLink: string;
  /** Optional bank-transfer fallback details (from server settings only). */
  bankName?: string;
  sortCode?: string;
  accountNumber?: string;
  iban?: string;
  reference?: string;
}

/**
 * "Payment not completed — pay again" email.
 *
 * Sent when a Pay-by-Bank / Open Banking payment was cancelled at the bank,
 * expired, or otherwise never confirmed. Gives the customer two ways to
 * finish: a one-click retry link back to the hosted payment page, and a
 * manual bank-transfer fallback using the same order reference.
 */
export function buildPaymentRetryEmail({
  firstName,
  orderId,
  totalAmount,
  payLink,
  bankName,
  sortCode,
  accountNumber,
  iban,
  reference,
}: PaymentRetryEmailParams): string {
  const shortId = orderId.slice(-8).toUpperCase();
  const ref = reference && reference.trim() ? reference : `#${shortId}`;
  const hasBankDetails = Boolean(sortCode || accountNumber || iban);

  const bankRows = [
    { label: 'Order Reference', value: `#${shortId}`, mono: true, highlight: true },
    { label: 'Amount Due', value: `£${totalAmount.toFixed(2)}`, highlight: true },
    ...(bankName ? [{ label: 'Account Name', value: bankName }] : []),
    ...(sortCode ? [{ label: 'Sort Code', value: sortCode, mono: true }] : []),
    ...(accountNumber ? [{ label: 'Account Number', value: accountNumber, mono: true }] : []),
    ...(iban ? [{ label: 'IBAN', value: iban, mono: true }] : []),
    { label: 'Payment Reference', value: ref, mono: true },
  ];

  const content = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>
        <td>
          <div style="display:inline-block;padding:6px 16px;background:rgba(249,115,22,0.12);border:1px solid rgba(249,115,22,0.35);border-radius:999px;">
            <span style="color:#fb923c;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-family:${EMAIL_FONT};">Payment Not Completed</span>
          </div>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 20px;color:${C.text};font-size:15px;line-height:1.6;font-family:${EMAIL_FONT};">Hi <strong style="color:${C.textBright};">${esc(firstName)}</strong>,</p>

    <p style="color:${C.text};font-size:14px;line-height:1.7;margin:0 0 24px;font-family:${EMAIL_FONT};">
      Your bank payment for order <strong style="color:${C.textBright};">#${shortId}</strong> wasn't completed —
      it looks like it was cancelled or never confirmed at your bank. Nothing has been charged.
    </p>

    <p style="color:${C.text};font-size:14px;line-height:1.7;margin:0 0 28px;font-family:${EMAIL_FONT};">
      Your items are still reserved. You can finish the payment in one click below:
    </p>

    ${ctaButton('Pay Again — Secure Bank Payment', payLink)}

    <p style="color:${C.textDimmed};font-size:12px;line-height:1.6;margin:16px 0 0;text-align:center;font-family:${EMAIL_FONT};">
      Or copy this link into your browser:<br>
      <a href="${esc(payLink)}" style="color:${C.accent};text-decoration:none;word-break:break-all;">${esc(payLink)}</a>
    </p>

    ${divider()}

    <p style="color:${C.textBright};font-size:14px;font-weight:600;margin:0 0 8px;font-family:${EMAIL_FONT};">Prefer a manual bank transfer?</p>
    <p style="color:${C.text};font-size:13px;line-height:1.7;margin:0 0 20px;font-family:${EMAIL_FONT};">
      ${hasBankDetails
        ? `You can also pay by standard bank transfer using the details below. Please use the payment reference so we can match your transfer instantly.`
        : `Reply to this email and we'll send you our bank transfer details.`}
    </p>

    ${hasBankDetails ? infoCard(bankRows) : ''}

    ${divider()}

    <p style="color:${C.textDimmed};font-size:12px;line-height:1.6;margin:0;text-align:center;font-family:${EMAIL_FONT};">
      Already paid? Please ignore this email — your order will be processed automatically.<br>
      Questions? <a href="mailto:info@phlabs.co.uk" style="color:${C.accent};text-decoration:none;">info@phlabs.co.uk</a>
    </p>
  `;

  return emailWrapper(content, 'linear-gradient(90deg,#7c2d12,#ea580c,#fb923c,#ea580c)');
}
