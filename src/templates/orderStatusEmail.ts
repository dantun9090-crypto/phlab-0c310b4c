import { emailWrapper, greeting, ctaButton, divider, infoCard, statusBadge, sectionHeading, escapeHtml as esc, EMAIL_COLORS as C } from './emailBase';

export interface OrderStatusEmailOptions {
  firstName: string;
  email: string;
  orderId: string;
  status: 'processing' | 'shipped' | 'delivered' | 'canceled' | 'paid' | 'refunded';
  trackingNumber?: string;
  trackingUrl?: string;
  courierName?: string;
  estimatedDelivery?: string;
  items?: Array<{ name: string; variantName?: string; quantity: number; priceNum: number }>;
  totalAmount?: number;
}

const STATUS_CONFIG: Record<string, {
  badge: string; badgeColor: string; badgeBg: string;
  title: string; desc: string; accentBar: string; icon: string;
}> = {
  processing: {
    badge: 'Processing', badgeColor: '#60a5fa', badgeBg: 'rgba(59,130,246,0.12)',
    title: 'Your order is being processed',
    desc: "We've received your payment and our team is preparing your order with care. You'll receive a dispatch notification once it ships.",
    accentBar: 'linear-gradient(90deg,#1d4ed8,#3b82f6,#60a5fa)',
    icon: '⚙️',
  },
  paid: {
    badge: 'Payment Confirmed', badgeColor: '#34d399', badgeBg: 'rgba(52,211,153,0.12)',
    title: 'Payment confirmed — thank you!',
    desc: "Your payment has been received and verified. We're now preparing your order for dispatch.",
    accentBar: 'linear-gradient(90deg,#059669,#34d399,#6ee7b7)',
    icon: '✅',
  },
  shipped: {
    badge: 'Dispatched', badgeColor: '#a78bfa', badgeBg: 'rgba(167,139,250,0.12)',
    title: "Your order is on its way!",
    desc: "Great news — your order has been dispatched and is heading your way. Use the tracking info below to follow its journey.",
    accentBar: 'linear-gradient(90deg,#7c3aed,#a78bfa,#c4b5fd)',
    icon: '🚀',
  },
  delivered: {
    badge: 'Delivered', badgeColor: '#34d399', badgeBg: 'rgba(52,211,153,0.12)',
    title: 'Your order has been delivered',
    desc: "Your order has arrived at its destination. We hope everything is perfect — if you have any questions or concerns, we're here to help.",
    accentBar: 'linear-gradient(90deg,#059669,#34d399)',
    icon: '📦',
  },
  canceled: {
    badge: 'Cancelled', badgeColor: '#f87171', badgeBg: 'rgba(248,113,113,0.12)',
    title: 'Your order has been cancelled',
    desc: "Your order has been cancelled. If you paid by card, your refund will be processed within 5–10 business days. For any questions, please contact us.",
    accentBar: 'linear-gradient(90deg,#dc2626,#f87171)',
    icon: '✕',
  },
  refunded: {
    badge: 'Refunded', badgeColor: '#fbbf24', badgeBg: 'rgba(251,191,36,0.12)',
    title: 'Your refund has been processed',
    desc: "A refund has been issued for your order. It should appear in your account within 5–10 business days depending on your bank.",
    accentBar: 'linear-gradient(90deg,#d97706,#fbbf24)',
    icon: '↩',
  },
};

export function buildOrderStatusEmail(opts: OrderStatusEmailOptions): string {
  const cfg = STATUS_CONFIG[opts.status] || STATUS_CONFIG.processing;
  const shortId = opts.orderId.slice(-8).toUpperCase();

  // Items mini-table
  const itemsSection = opts.items && opts.items.length > 0 ? `
    ${sectionHeading('Order Summary')}
    <table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border:1px solid ${C.border};border-radius:10px;overflow:hidden;margin-bottom:20px;">
      <thead>
        <tr>
          <th bgcolor="${C.bgCardDark}" style="text-align:left;padding:10px 14px;color:${C.textMuted};font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;background-color:${C.bgCardDark};">Product</th>
          <th bgcolor="${C.bgCardDark}" style="text-align:center;padding:10px 14px;color:${C.textMuted};font-size:11px;font-weight:600;text-transform:uppercase;background-color:${C.bgCardDark};">Qty</th>
          <th bgcolor="${C.bgCardDark}" style="text-align:right;padding:10px 14px;color:${C.textMuted};font-size:11px;font-weight:600;text-transform:uppercase;background-color:${C.bgCardDark};">Price</th>
        </tr>
      </thead>
      <tbody>
        ${opts.items.map((item, i) => {
          const rowBg = i % 2 === 0 ? C.bgCardDark : C.bgCard;
          return `
          <tr>
            <td bgcolor="${rowBg}" style="padding:11px 14px;color:${C.text};font-size:13px;border-bottom:1px solid ${C.border};background-color:${rowBg};">
              ${esc(item.name)}
              ${item.variantName ? `<span style="margin-left:6px;padding:1px 7px;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.2);border-radius:4px;color:${C.accent};font-size:11px;">${esc(item.variantName)}</span>` : ''}
            </td>
            <td bgcolor="${rowBg}" style="padding:11px 14px;color:${C.textMuted};font-size:13px;text-align:center;border-bottom:1px solid ${C.border};background-color:${rowBg};">${item.quantity}</td>
            <td bgcolor="${rowBg}" style="padding:11px 14px;color:${C.textBright};font-size:13px;text-align:right;font-family:monospace;font-weight:600;border-bottom:1px solid ${C.border};background-color:${rowBg};">£${(item.priceNum * item.quantity).toFixed(2)}</td>
          </tr>`;
        }).join('')}
        ${opts.totalAmount !== undefined ? `
          <tr>
            <td colspan="2" bgcolor="${C.bgCardDark}" style="padding:12px 14px;color:${C.textMuted};font-size:13px;font-weight:600;background-color:${C.bgCardDark};">Total</td>
            <td bgcolor="${C.bgCardDark}" style="padding:12px 14px;color:${C.accentLight};font-size:16px;text-align:right;font-family:monospace;font-weight:800;background-color:${C.bgCardDark};">£${opts.totalAmount.toFixed(2)}</td>
          </tr>` : ''}
      </tbody>
    </table>` : '';

  // Tracking block (shipped only)
  const trackingSection = opts.status === 'shipped' && opts.trackingNumber ? `
    ${sectionHeading('Tracking Information')}
    <table cellpadding="0" cellspacing="0" width="100%" style="background:rgba(167,139,250,0.06);border:1px solid rgba(167,139,250,0.2);border-radius:12px;margin-bottom:20px;">
      <tr>
        <td style="padding:20px 22px;">
          ${infoCard([
            ...(opts.courierName ? [{ label: 'Courier', value: opts.courierName }] : []),
            { label: 'Tracking Number', value: opts.trackingNumber, mono: true, highlight: true },
            ...(opts.estimatedDelivery ? [{ label: 'Estimated Delivery', value: opts.estimatedDelivery }] : []),
          ])}
          ${opts.trackingUrl ? `
            <div style="margin-top:14px;">
              <a href="${esc(opts.trackingUrl)}" style="display:inline-block;padding:9px 20px;background:rgba(167,139,250,0.15);border:1px solid rgba(167,139,250,0.3);border-radius:8px;color:#a78bfa;font-size:13px;font-weight:600;text-decoration:none;">
                Track Your Package →
              </a>
            </div>` : ''}
        </td>
      </tr>
    </table>` : '';


  const content = `
    <div style="padding:32px 36px 28px;">
      <!-- Status badge -->
      <div style="margin-bottom:20px;">
        ${statusBadge(cfg.badge, cfg.badgeColor, cfg.badgeBg)}
      </div>

      ${greeting(opts.firstName)}

      <p style="color:${C.textBright};font-size:18px;font-weight:700;margin:0 0 12px;line-height:1.3;">${cfg.icon} ${cfg.title}</p>
      <p style="color:${C.text};font-size:14px;line-height:1.7;margin:0 0 24px;">${cfg.desc}</p>

      ${infoCard([{ label: 'Order Reference', value: `#${shortId}`, mono: true, highlight: true }])}

      ${trackingSection}
      ${itemsSection}

      ${ctaButton('View Your Order', `https://phlabs.co.uk/account`)}

      ${divider()}

      <p style="color:${C.textDimmed};font-size:11px;line-height:1.6;margin:0;text-align:center;">
        Questions about your order? <a href="mailto:info@phlabs.co.uk" style="color:${C.accent};text-decoration:none;">info@phlabs.co.uk</a><br>
        All products for research/laboratory use only. Not for human consumption.
      </p>
    </div>
  `;

  return emailWrapper(content, cfg.accentBar);
}
