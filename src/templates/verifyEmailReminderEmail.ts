import {
  emailWrapper,
  ctaButton,
  divider,
  escapeHtml as esc,
  EMAIL_COLORS as C,
  EMAIL_FONT,
} from './emailBase';

export interface VerifyEmailReminderParams {
  firstName: string;
  /** Firebase email-verification link generated server-side. */
  verifyLink: string;
  /** Number of orders already linked to this address (0 hides the line). */
  orderCount?: number;
}

/**
 * "Confirm your email address" reminder.
 *
 * Sent to customers whose account email was never confirmed. Confirming the
 * address is what lets the account show orders that were placed at checkout
 * without signing in — without it we cannot prove the address belongs to the
 * person reading the page, so those orders stay hidden.
 */
export function buildVerifyEmailReminderEmail({
  firstName,
  verifyLink,
  orderCount = 0,
}: VerifyEmailReminderParams): string {
  const content = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>
        <td>
          <div style="display:inline-block;padding:6px 16px;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.35);border-radius:999px;">
            <span style="color:${C.accentLight};font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-family:${EMAIL_FONT};">Confirm Your Email</span>
          </div>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 20px;color:${C.text};font-size:15px;line-height:1.6;font-family:${EMAIL_FONT};">Hi <strong style="color:${C.textBright};">${esc(firstName)}</strong>,</p>

    <p style="color:${C.text};font-size:14px;line-height:1.7;margin:0 0 24px;font-family:${EMAIL_FONT};">
      Your PH Labs account email address has not been confirmed yet. Confirming it takes one click and
      secures your account against anyone else registering your address.
    </p>

    ${orderCount > 0 ? `
    <p style="color:${C.text};font-size:14px;line-height:1.7;margin:0 0 24px;font-family:${EMAIL_FONT};">
      It also links ${orderCount === 1 ? 'an order' : `${orderCount} orders`} placed at checkout without signing in,
      so the full history appears in your account.
    </p>` : ''}

    ${ctaButton('Confirm Email Address', verifyLink)}

    <p style="color:${C.textDimmed};font-size:12px;line-height:1.6;margin:16px 0 0;text-align:center;font-family:${EMAIL_FONT};">
      Or copy this link into your browser:<br>
      <a href="${esc(verifyLink)}" style="color:${C.accent};text-decoration:none;word-break:break-all;">${esc(verifyLink)}</a>
    </p>

    ${divider()}

    <p style="color:${C.textDimmed};font-size:12px;line-height:1.6;margin:0;text-align:center;font-family:${EMAIL_FONT};">
      Orders already placed and paid for are unaffected and will be dispatched as normal.<br>
      Questions? <a href="mailto:info@phlabs.co.uk" style="color:${C.accent};text-decoration:none;">info@phlabs.co.uk</a>
    </p>
  `;

  return emailWrapper(content);
}
