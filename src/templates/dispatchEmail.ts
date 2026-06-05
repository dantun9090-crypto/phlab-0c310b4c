import { emailWrapper, greeting, ctaButton, divider, sectionHeading, escapeHtml as esc, EMAIL_COLORS as C } from './emailBase';

export interface DispatchEmailOptions {
  firstName: string;
  orderId: string;
  trackingNumber?: string;
  trackingUrl?: string;
  courier?: string;
  estimatedDelivery?: string;
  items: Array<{ name: string; variantName?: string; quantity: number; priceNum: number }>;
  totalAmount: number;
  shippingAddress?: string;
}

export function buildDispatchEmail(opts: DispatchEmailOptions): string {
  const shortId = opts.orderId.slice(-8).toUpperCase();

  // Items table
  const itemRows = opts.items.map((item, i) => {
    const rowBg = i % 2 === 0 ? C.bgCardDark : C.bgCard;
    return `
    <tr>
      <td bgcolor="${rowBg}" style="padding:11px 16px;color:${C.text};font-size:13px;border-bottom:1px solid ${C.border};background-color:${rowBg};">
        ${esc(item.name)}${item.variantName ? ` <span style="color:${C.accent};font-size:11px;">(${esc(item.variantName)})</span>` : ''}
      </td>
      <td bgcolor="${rowBg}" style="padding:11px 16px;color:${C.textMuted};font-size:13px;text-align:center;border-bottom:1px solid ${C.border};background-color:${rowBg};">×${item.quantity}</td>
      <td bgcolor="${rowBg}" style="padding:11px 16px;color:${C.textBright};font-size:13px;text-align:right;border-bottom:1px solid ${C.border};font-family:monospace;font-weight:700;background-color:${rowBg};">£${(item.priceNum * item.quantity).toFixed(2)}</td>
    </tr>
  `;
  }).join('');

  const trackingBlock = (opts.trackingNumber || opts.trackingUrl) ? `
    <div style="margin:24px 0;padding:20px 24px;background:linear-gradient(135deg,rgba(59,130,246,0.08),rgba(29,78,216,0.12));border:1px solid rgba(59,130,246,0.3);border-radius:14px;text-align:center;">
      <div style="font-size:28px;margin-bottom:8px;">📦</div>
      <p style="color:${C.textBright};font-size:16px;font-weight:700;margin:0 0 6px;">Your package is on its way!</p>
      ${opts.courier ? `<p style="color:${C.textMuted};font-size:12px;margin:0 0 14px;">Courier: <strong style="color:${C.text};">${esc(opts.courier)}</strong></p>` : ''}
      ${opts.trackingNumber ? `<p style="color:${C.textMuted};font-size:12px;margin:0 0 6px;">Tracking Reference:</p>
        <p style="color:${C.accentLight};font-size:18px;font-family:monospace;font-weight:800;letter-spacing:2px;margin:0 0 14px;">${esc(opts.trackingNumber)}</p>` : ''}
      ${opts.trackingUrl ? `<a href="${esc(opts.trackingUrl)}" style="display:inline-block;padding:10px 24px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.4);border-radius:8px;color:${C.accentLight};font-size:13px;font-weight:700;text-decoration:none;">Track My Order →</a>` : ''}
      ${opts.estimatedDelivery ? `<p style="color:${C.textMuted};font-size:12px;margin:14px 0 0;">Estimated delivery: <strong style="color:${C.success};">${esc(opts.estimatedDelivery)}</strong></p>` : ''}
    </div>
  ` : '';

  const addressBlock = opts.shippingAddress ? `
    ${sectionHeading('Delivering To')}
    <div style="padding:14px 18px;background:${C.bgCardDark};border:1px solid ${C.border};border-radius:10px;">
      <p style="color:${C.text};font-size:13px;margin:0;white-space:pre-line;">${esc(opts.shippingAddress)}</p>
    </div>
  ` : '';


  const content = `
    <div>
      ${greeting(opts.firstName)}
      <p style="color:${C.textMuted};font-size:14px;line-height:1.7;margin:0 0 24px;">
        Great news — your order <strong style="color:${C.textBright};">#${shortId}</strong> has been dispatched and is heading your way.
      </p>

      ${trackingBlock}
      ${addressBlock}

      ${sectionHeading('Order Summary')}
      <div style="border-radius:12px;overflow:hidden;border:1px solid ${C.border};">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead>
            <tr>
              <th bgcolor="${C.bgCardDark}" style="padding:10px 16px;color:${C.textMuted};font-size:11px;font-weight:700;text-align:left;text-transform:uppercase;letter-spacing:0.5px;background-color:${C.bgCardDark};">Product</th>
              <th bgcolor="${C.bgCardDark}" style="padding:10px 16px;color:${C.textMuted};font-size:11px;font-weight:700;text-align:center;text-transform:uppercase;letter-spacing:0.5px;background-color:${C.bgCardDark};">Qty</th>
              <th bgcolor="${C.bgCardDark}" style="padding:10px 16px;color:${C.textMuted};font-size:11px;font-weight:700;text-align:right;text-transform:uppercase;letter-spacing:0.5px;background-color:${C.bgCardDark};">Total</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
          <tfoot>
            <tr>
              <td colspan="2" bgcolor="${C.bgCard}" style="padding:12px 16px;color:${C.textMuted};font-size:13px;font-weight:700;background-color:${C.bgCard};">Order Total</td>
              <td bgcolor="${C.bgCard}" style="padding:12px 16px;color:${C.textBright};font-size:16px;font-weight:800;text-align:right;font-family:monospace;background-color:${C.bgCard};">£${opts.totalAmount.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      ${ctaButton('Track Your Order', opts.trackingUrl || 'https://phlabs.co.uk/account')}

      ${divider()}

      <p style="color:${C.textDimmed};font-size:11px;line-height:1.6;margin:0;text-align:center;">
        Questions about your delivery? <a href="mailto:info@phlabs.co.uk" style="color:${C.accent};text-decoration:none;">info@phlabs.co.uk</a><br>
        All products for research/laboratory use only. Not for human consumption.
      </p>
    </div>
  `;

  return emailWrapper(content, 'linear-gradient(90deg,#059669,#34d399,#059669)');
}
