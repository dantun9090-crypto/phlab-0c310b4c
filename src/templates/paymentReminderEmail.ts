import { emailWrapper, ctaButton, infoCard, divider, escapeHtml as esc, EMAIL_COLORS as C, EMAIL_FONT } from './emailBase';

interface PaymentReminderEmailParams {
  firstName: string;
  orderId: string;
  totalAmount: number;
  bankName?: string;
  sortCode?: string;
  accountNumber?: string;
  iban?: string;
  reference: string;
  hoursElapsed?: number;
}

export function buildPaymentReminderEmail({
  firstName,
  orderId,
  totalAmount,
  bankName,
  sortCode,
  accountNumber,
  iban,
  reference,
  hoursElapsed = 24,
}: PaymentReminderEmailParams): string {
  const shortId = orderId.slice(-8).toUpperCase();
  const hasBankDetails = sortCode || accountNumber || iban;

  const bankRows = [
    { label: 'Order Reference', value: `#${shortId}`, mono: true, highlight: true },
    { label: 'Amount Due', value: `£${totalAmount.toFixed(2)}`, highlight: true },
    ...(bankName ? [{ label: 'Account Name', value: bankName }] : []),
    ...(sortCode ? [{ label: 'Sort Code', value: sortCode, mono: true }] : []),
    ...(accountNumber ? [{ label: 'Account Number', value: accountNumber, mono: true }] : []),
    ...(iban ? [{ label: 'IBAN', value: iban, mono: true }] : []),
    { label: 'Payment Reference', value: reference, mono: true },
  ];

  const content = `
    <!-- Urgency badge -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>
        <td>
          <div style="display:inline-block;padding:6px 16px;background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.35);border-radius:999px;">
            <span style="color:#fbbf24;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-family:${EMAIL_FONT};">Payment Reminder — Action Required</span>
          </div>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 20px;color:${C.text};font-size:15px;line-height:1.6;font-family:${EMAIL_FONT};">Hi <strong style="color:${C.textBright};">${esc(firstName)}</strong>,</p>

    <p style="color:${C.text};font-size:14px;line-height:1.7;margin:0 0 24px;font-family:${EMAIL_FONT};">
      We noticed your order <strong style="color:${C.textBright};">#${shortId}</strong> is still awaiting payment — 
      it was placed ${hoursElapsed} hours ago but we haven't received your bank transfer yet.
    </p>

    <p style="color:${C.text};font-size:14px;line-height:1.7;margin:0 0 28px;font-family:${EMAIL_FONT};">
      Your order is reserved and ready to dispatch as soon as your payment arrives. 
      To avoid cancellation, please complete the transfer at your earliest convenience using the details below.
    </p>

    ${hasBankDetails ? `
    <!-- Bank details card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.bgCard};border:1px solid rgba(251,191,36,0.25);border-radius:14px;overflow:hidden;margin-bottom:28px;" bgcolor="${C.bgCard}">
      <tr>
        <td style="padding:14px 20px;border-bottom:1px solid rgba(251,191,36,0.15);">
          <span style="color:#fbbf24;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-family:${EMAIL_FONT};">Bank Transfer Details</span>
        </td>
      </tr>
      <tr>
        <td style="padding:0;">
          ${infoCard(bankRows).replace('<table', '<table style="border:none;margin:0;"').replace('border-radius:10px;', '')}
        </td>
      </tr>
    </table>
    ` : `
    ${infoCard(bankRows)}
    `}

    <!-- Important note -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(251,191,36,0.06);border-left:3px solid #fbbf24;border-radius:0 8px 8px 0;margin-bottom:28px;" bgcolor="${C.bgCardDark}">
      <tr>
        <td style="padding:14px 18px;">
          <p style="color:#fbbf24;font-size:13px;font-weight:600;margin:0 0 4px;font-family:${EMAIL_FONT};">Important</p>
          <p style="color:${C.text};font-size:13px;margin:0;line-height:1.6;font-family:${EMAIL_FONT};">
            Please use your order reference <strong style="color:${C.textBright};font-family:monospace;">#${shortId}</strong> as the payment reference so we can match your transfer instantly.
          </p>
        </td>
      </tr>
    </table>

    ${ctaButton('View My Order', 'https://phlabs.co.uk/account')}

    ${divider()}

    <p style="color:${C.textDimmed};font-size:12px;line-height:1.6;margin:0;text-align:center;font-family:${EMAIL_FONT};">
      Already paid? Please ignore this reminder — your order will be processed once the transfer clears.<br>
      Questions? <a href="mailto:info@phlabs.co.uk" style="color:${C.accent};text-decoration:none;">info@phlabs.co.uk</a>
    </p>
  `;

  return emailWrapper(content, 'linear-gradient(90deg,#78350f,#d97706,#fbbf24,#d97706)');
}
