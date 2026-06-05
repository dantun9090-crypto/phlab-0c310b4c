import { emailWrapper, ctaButton, infoCard, divider, escapeHtml as esc, EMAIL_COLORS as C, EMAIL_FONT } from './emailBase';

export interface CancellationEmailParams {
  firstName: string;
  orderId: string;
  totalAmount: number;
  items?: Array<{ name: string; variantName?: string; quantity: number; priceNum: number }>;
  hoursElapsed?: number;
}

export function buildCancellationEmail({
  firstName,
  orderId,
  totalAmount,
  items = [],
  hoursElapsed = 72,
}: CancellationEmailParams): string {
  const shortId = orderId.slice(-8).toUpperCase();

  const itemsSection = items.length > 0 ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background-color:${C.bgCard};border:1px solid rgba(239,68,68,0.15);border-radius:12px;margin-bottom:24px;" bgcolor="${C.bgCard}">
      <tr>
        <td style="padding:14px 20px;border-bottom:1px solid rgba(239,68,68,0.10);">
          <span style="color:#f87171;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-family:${EMAIL_FONT};">Cancelled Items</span>
        </td>
      </tr>
      ${items.map(item => `
      <tr>
        <td style="padding:12px 20px;border-bottom:1px solid rgba(255,255,255,0.04);">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td>
                <span style="color:${C.textBright};font-size:13px;font-weight:600;font-family:${EMAIL_FONT};">${esc(item.name)}</span>
                ${item.variantName ? `<span style="color:${C.textMuted};font-size:12px;margin-left:6px;font-family:${EMAIL_FONT};">${esc(item.variantName)}</span>` : ''}
                <span style="color:${C.textDimmed};font-size:12px;margin-left:6px;font-family:${EMAIL_FONT};">× ${item.quantity}</span>

              </td>
              <td style="text-align:right;">
                <span style="color:${C.textBright};font-size:13px;font-weight:600;font-family:${EMAIL_FONT};">£${(item.priceNum * item.quantity).toFixed(2)}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>`).join('')}
      <tr>
        <td style="padding:12px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td><span style="color:${C.textMuted};font-size:12px;font-family:${EMAIL_FONT};">Order Total</span></td>
              <td style="text-align:right;"><span style="color:#f87171;font-size:14px;font-weight:700;font-family:${EMAIL_FONT};">£${totalAmount.toFixed(2)} — Cancelled</span></td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  ` : infoCard([
    { label: 'Order Reference', value: `#${shortId}`, mono: true },
    { label: 'Order Total', value: `£${totalAmount.toFixed(2)}` },
  ]);

  const content = `
    <!-- Status badge -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>
        <td>
          <div style="display:inline-block;padding:6px 16px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.35);border-radius:999px;">
            <span style="color:#f87171;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-family:${EMAIL_FONT};">Order Cancelled</span>
          </div>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 20px;color:${C.text};font-size:15px;line-height:1.6;font-family:${EMAIL_FONT};">Hi <strong style="color:${C.textBright};">${firstName}</strong>,</p>

    <p style="color:${C.textBright};font-size:18px;font-weight:700;margin:0 0 12px;line-height:1.3;font-family:${EMAIL_FONT};">
      Your order #${shortId} has been cancelled
    </p>

    <p style="color:${C.text};font-size:14px;line-height:1.7;margin:0 0 24px;font-family:${EMAIL_FONT};">
      We held your order for ${hoursElapsed} hours awaiting your bank transfer, but unfortunately we 
      did not receive payment within our cancellation window. Your order has now been cancelled and 
      the items have been released back into stock.
    </p>

    ${itemsSection}

    <!-- No charge notice -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background:rgba(34,197,94,0.06);border-left:3px solid #22c55e;border-radius:0 8px 8px 0;margin-bottom:28px;">
      <tr>
        <td style="padding:14px 18px;">
          <p style="color:#4ade80;font-size:13px;font-weight:600;margin:0 0 4px;font-family:${EMAIL_FONT};">No charge has been made</p>
          <p style="color:${C.text};font-size:13px;margin:0;line-height:1.6;font-family:${EMAIL_FONT};">
            You have not been charged. If you sent a bank transfer after this notification, 
            please contact us immediately at <a href="mailto:info@phlabs.co.uk" style="color:${C.accent};text-decoration:none;">info@phlabs.co.uk</a> 
            and we will reinstate your order.
          </p>
        </td>
      </tr>
    </table>

    <!-- Reorder CTA -->
    <p style="color:${C.text};font-size:14px;line-height:1.7;margin:0 0 20px;font-family:${EMAIL_FONT};">
      Still interested? You're welcome to place a new order at any time — all items remain in stock 
      and your details are saved in your account.
    </p>

    ${ctaButton('Browse Products', 'https://phlabs.co.uk/products')}

    ${divider()}

    <p style="color:${C.textDimmed};font-size:12px;line-height:1.6;margin:0;text-align:center;font-family:${EMAIL_FONT};">
      Questions? Contact us at <a href="mailto:info@phlabs.co.uk" style="color:${C.accent};text-decoration:none;">info@phlabs.co.uk</a><br>
      All products are for laboratory research use only. Not for human or veterinary consumption.
    </p>
  `;

  return emailWrapper(content, 'linear-gradient(90deg,#7f1d1d,#dc2626,#f87171,#dc2626)');
}
