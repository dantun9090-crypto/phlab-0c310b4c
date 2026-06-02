export interface InvoiceEmailOptions {
  firstName: string;
  orderId: string;
  items: Array<{
    name: string;
    variantName?: string;
    quantity: number;
    priceNum: number;
  }>;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  shippingLabel?: string;
  address?: string;
  city?: string;
  postcode?: string;
  couponCode?: string;
  paymentMethod?: 'card' | 'bank_transfer';
  bankTransferRef?: string;
  bankName?: string;
  bankSortCode?: string;
  bankAccountNumber?: string;
  bankIBAN?: string;
  bankInstructions?: string;
}

// Escape user-controlled values before embedding in HTML. Items, addresses,
// names, bank details, etc. all flow through this template from the public
// /api/public/send-mail endpoint, so unescaped values would allow HTML/script
// injection into the branded invoice email.
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildProfessionalInvoiceEmail(rawOpts: InvoiceEmailOptions): string {
  // Sanitize all caller-supplied string fields up front so downstream
  // template literals embed safe HTML.
  const opts: InvoiceEmailOptions = {
    ...rawOpts,
    firstName: esc(rawOpts.firstName),
    orderId: esc(rawOpts.orderId),
    items: rawOpts.items.map((it) => ({
      ...it,
      name: esc(it.name),
      variantName: it.variantName ? esc(it.variantName) : it.variantName,
    })),
    shippingLabel: rawOpts.shippingLabel ? esc(rawOpts.shippingLabel) : rawOpts.shippingLabel,
    address: rawOpts.address ? esc(rawOpts.address) : rawOpts.address,
    city: rawOpts.city ? esc(rawOpts.city) : rawOpts.city,
    postcode: rawOpts.postcode ? esc(rawOpts.postcode) : rawOpts.postcode,
    couponCode: rawOpts.couponCode ? esc(rawOpts.couponCode) : rawOpts.couponCode,
    bankTransferRef: rawOpts.bankTransferRef ? esc(rawOpts.bankTransferRef) : rawOpts.bankTransferRef,
    bankName: rawOpts.bankName ? esc(rawOpts.bankName) : rawOpts.bankName,
    bankSortCode: rawOpts.bankSortCode ? esc(rawOpts.bankSortCode) : rawOpts.bankSortCode,
    bankAccountNumber: rawOpts.bankAccountNumber ? esc(rawOpts.bankAccountNumber) : rawOpts.bankAccountNumber,
    bankIBAN: rawOpts.bankIBAN ? esc(rawOpts.bankIBAN) : rawOpts.bankIBAN,
    bankInstructions: rawOpts.bankInstructions ? esc(rawOpts.bankInstructions) : rawOpts.bankInstructions,
  };

  const BG = '#060f1e';
  const CARD = '#0b1a30';
  const BLUE = '#3b82f6';
  const BLUE_D = '#1d4ed8';
  const TEXT = '#c8daf0';
  const MUTED = '#9cb8d9';
  const DIMMED = '#3a5a82';
  const BORDER = 'rgba(59,130,246,0.15)';
  const ROW_EVEN = '#071525';


  const shortId = opts.orderId.slice(-8).toUpperCase();
  const isBankTransfer = opts.paymentMethod === 'bank_transfer';

  // Items rows
  const itemRows = opts.items.map((item, i) => {
    const rowBg = i % 2 === 0 ? ROW_EVEN : CARD;
    return `
    <tr>
      <td bgcolor="${ROW_EVEN}" style="padding:12px 16px;color:${TEXT};font-size:14px;border-bottom:1px solid rgba(59,130,246,0.08);background-color:${rowBg};">
        ${item.name}
        ${item.variantName ? `<span style="display:inline-block;margin-left:6px;padding:1px 7px;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.25);border-radius:4px;color:${BLUE};font-size:11px;">${item.variantName}</span>` : ''}
      </td>
      <td bgcolor="${rowBg}" style="padding:12px 16px;color:${MUTED};font-size:13px;text-align:center;border-bottom:1px solid rgba(59,130,246,0.08);background-color:${rowBg};">
        ${item.quantity}
      </td>
      <td bgcolor="${rowBg}" style="padding:12px 16px;color:${TEXT};font-size:13px;text-align:right;border-bottom:1px solid rgba(59,130,246,0.08);background-color:${rowBg};font-family:monospace;">
        £${item.priceNum.toFixed(2)}
      </td>
      <td bgcolor="${rowBg}" style="padding:12px 16px;color:#e8f0fe;font-size:13px;text-align:right;font-weight:700;border-bottom:1px solid rgba(59,130,246,0.08);background-color:${rowBg};font-family:monospace;">
        £${(item.priceNum * item.quantity).toFixed(2)}
      </td>
    </tr>
  `;
  }).join('');

  // Bank transfer block
  const bankBlock = isBankTransfer ? `
    <div style="background:#04101f;border:1px solid rgba(29,78,216,0.4);border-radius:12px;padding:24px;margin:0 0 24px 0;">
      <p style="color:${BLUE};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin:0 0 12px 0;">Bank Transfer Instructions</p>
      <p style="color:${MUTED};font-size:13px;margin:0 0 16px 0;line-height:1.6;">
        Please transfer the exact amount and use your reference as the payment description. Your order will be confirmed once payment clears (1–2 business days).
      </p>
      <div style="background:#020a15;border:2px solid rgba(29,78,216,0.35);border-radius:10px;padding:20px;margin-bottom:20px;text-align:center;">
        <p style="color:${DIMMED};font-size:10px;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:2px;font-weight:700;">Payment Reference</p>
        <p style="color:${BLUE};font-size:28px;font-weight:800;font-family:monospace;letter-spacing:3px;margin:0;">${opts.bankTransferRef || shortId}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        ${opts.bankName ? `<tr><td style="color:${DIMMED};padding:8px 0;border-bottom:1px solid rgba(59,130,246,0.08);font-weight:600;">Account Name</td><td style="color:${TEXT};text-align:right;font-weight:600;padding:8px 0;border-bottom:1px solid rgba(59,130,246,0.08);">${opts.bankName}</td></tr>` : ''}
        ${opts.bankSortCode ? `<tr><td style="color:${DIMMED};padding:8px 0;border-bottom:1px solid rgba(59,130,246,0.08);font-weight:600;">Sort Code</td><td style="color:${TEXT};text-align:right;font-family:monospace;padding:8px 0;border-bottom:1px solid rgba(59,130,246,0.08);">${opts.bankSortCode}</td></tr>` : ''}
        ${opts.bankAccountNumber ? `<tr><td style="color:${DIMMED};padding:8px 0;border-bottom:1px solid rgba(59,130,246,0.08);font-weight:600;">Account Number</td><td style="color:${TEXT};text-align:right;font-family:monospace;padding:8px 0;border-bottom:1px solid rgba(59,130,246,0.08);">${opts.bankAccountNumber}</td></tr>` : ''}
        ${opts.bankIBAN ? `<tr><td style="color:${DIMMED};padding:8px 0;font-weight:600;">IBAN</td><td style="color:${TEXT};text-align:right;font-family:monospace;font-size:11px;padding:8px 0;">${opts.bankIBAN}</td></tr>` : ''}
      </table>
      ${opts.bankInstructions ? `<p style="color:${MUTED};font-size:12px;margin:14px 0 0 0;padding:10px 14px;background:#020a15;border-radius:6px;border-left:3px solid ${BLUE_D};line-height:1.5;">${opts.bankInstructions}</p>` : ''}
    </div>
  ` : '';

  // Address block
  const addressBlock = (opts.address || opts.city || opts.postcode) ? `
    <div style="margin-bottom:24px;">
      <p style="color:${DIMMED};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px 0;">Shipping Address</p>
      <p style="color:${MUTED};font-size:13px;margin:0;line-height:1.7;">
        ${opts.firstName}<br>
        ${opts.address ? opts.address + '<br>' : ''}
        ${opts.city ? opts.city + (opts.postcode ? ', ' : '') : ''}${opts.postcode || ''}
      </p>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>Invoice — PH Labs</title>
  <style>
    body, .email-bg { background-color: #060f1e !important; }
    .email-card { background-color: #0b1a30 !important; }
    .email-row-even { background-color: #071525 !important; }
    u + .body { background-color: #060f1e !important; }
    u + .body .email-bg { background-color: #060f1e !important; }
    u + .body .email-card { background-color: #0b1a30 !important; }
    #MessageViewBody, #MessageWebViewDiv { background-color: #060f1e !important; }
    [data-ogsc] .email-bg,
    [data-ogsb] .email-bg { background-color: #060f1e !important; }
    [data-ogsc] .email-card,
    [data-ogsb] .email-card { background-color: #0b1a30 !important; }
    [data-ogsc] .email-row-even { background-color: #071525 !important; }
    @media (prefers-color-scheme: dark) {
      body, .email-bg { background-color: #060f1e !important; }
      .email-card { background-color: #0b1a30 !important; }
    }
  </style><style>
    body, .email-bg { background-color: #060f1e !important; }
    .email-card { background-color: #0b1a30 !important; }
    .email-row-even { background-color: #071525 !important; }
    @media (prefers-color-scheme: dark) {
      body, .email-bg { background-color: #060f1e !important; }
      .email-card { background-color: #0b1a30 !important; }
    }
  </style>
</head>
<body class="email-bg" style="margin:0;padding:0;background-color:#060f1e;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;" bgcolor="#060f1e">

<table width="100%" cellpadding="0" cellspacing="0" class="email-bg" bgcolor="#060f1e" style="background-color:#060f1e;min-height:100vh;">
  <tr>
    <td align="center" style="padding:40px 16px;">

      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;">

        <!-- Top accent bar -->
        <tr>
          <td style="height:4px;background:linear-gradient(90deg,${BLUE_D},${BLUE},#60a5fa);border-radius:12px 12px 0 0;"></td>
        </tr>

        <!-- Header -->
        <tr>
          <td bgcolor="#0b1a30" style="background-color:#0b1a30;padding:32px 40px 24px;border-left:1px solid ${BORDER};border-right:1px solid ${BORDER};">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <img src="https://cdn.wegic.ai/assets/onepage/uploads/2031481443271393281/image/2026/03/14/01KKPB20SGJ3T4RK47TQPSAV0N.png"
                    alt="PH Labs" width="48" height="48"
                    style="border-radius:12px;display:block;margin-bottom:12px;" />
                  <p style="color:${BLUE};font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin:0 0 4px 0;">PH Labs</p>
                  <p style="color:${DIMMED};font-size:11px;margin:0;">phlabs.co.uk</p>
                </td>
                <td align="right" valign="top">
                  <p style="color:${MUTED};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 6px 0;">Invoice</p>
                  <p style="color:#e8f0fe;font-size:22px;font-weight:800;font-family:monospace;letter-spacing:1px;margin:0 0 6px 0;">#${shortId}</p>
                  <p style="color:${DIMMED};font-size:11px;margin:0;">${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  <div style="margin-top:10px;display:inline-block;padding:4px 12px;background:${isBankTransfer ? 'rgba(251,191,36,0.12)' : 'rgba(59,130,246,0.12)'};border:1px solid ${isBankTransfer ? 'rgba(251,191,36,0.3)' : 'rgba(59,130,246,0.3)'};border-radius:20px;">
                    <span style="color:${isBankTransfer ? '#fbbf24' : BLUE};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                      ${isBankTransfer ? 'Bank Transfer' : 'Card Payment'}
                    </span>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td bgcolor="#060f1e" style="background-color:#060f1e;padding:24px 40px;border-left:1px solid ${BORDER};border-right:1px solid ${BORDER};">
            <p style="color:${TEXT};font-size:15px;margin:0 0 8px 0;">Hello <strong style="color:#e8f0fe;">${opts.firstName}</strong>,</p>
            <p style="color:${MUTED};font-size:14px;margin:0;line-height:1.6;">
              ${isBankTransfer
                ? 'Thank you for your order. Please complete your bank transfer using the details below to confirm your order.'
                : 'Thank you for your order. Payment has been received and your order is now being processed.'}
            </p>
          </td>
        </tr>

        <!-- Bank transfer block -->
        ${isBankTransfer ? `
        <tr>
          <td bgcolor="#060f1e" style="background-color:#060f1e;padding:0 40px 8px;border-left:1px solid ${BORDER};border-right:1px solid ${BORDER};">
            ${bankBlock}
          </td>
        </tr>
        ` : ''}

        <!-- Items table -->
        <tr>
          <td bgcolor="${BG}" style="padding:0 40px;background-color:${BG};border-left:1px solid ${BORDER};border-right:1px solid ${BORDER};">
            <p style="color:${DIMMED};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin:0 0 12px 0;">Order Summary</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(59,130,246,0.12);border-radius:10px;overflow:hidden;">
              <thead>
                <tr>
                  <th bgcolor="#04101f" style="padding:10px 16px;color:${DIMMED};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;text-align:left;background-color:#04101f;">Product</th>
                  <th bgcolor="#04101f" style="padding:10px 16px;color:${DIMMED};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;text-align:center;background-color:#04101f;">Qty</th>
                  <th bgcolor="#04101f" style="padding:10px 16px;color:${DIMMED};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;text-align:right;background-color:#04101f;">Unit</th>
                  <th bgcolor="#04101f" style="padding:10px 16px;color:${DIMMED};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;text-align:right;background-color:#04101f;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemRows}
              </tbody>
            </table>
          </td>
        </tr>

        <!-- Totals -->
        <tr>
          <td style="padding:16px 40px 0;background:${BG};border-left:1px solid ${BORDER};border-right:1px solid ${BORDER};">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width:280px;margin-left:auto;">
              <tr>
                <td style="padding:6px 0;color:${MUTED};font-size:13px;">Subtotal</td>
                <td style="padding:6px 0;color:${TEXT};font-size:13px;text-align:right;font-family:monospace;">£${opts.subtotal.toFixed(2)}</td>
              </tr>
              ${opts.discount > 0 ? `
              <tr>
                <td style="padding:6px 0;color:#34d399;font-size:13px;">Discount${opts.couponCode ? ` (${opts.couponCode})` : ''}</td>
                <td style="padding:6px 0;color:#34d399;font-size:13px;text-align:right;font-family:monospace;">-£${opts.discount.toFixed(2)}</td>
              </tr>` : ''}
              <tr>
                <td style="padding:6px 0;color:${MUTED};font-size:13px;">Shipping${opts.shippingLabel ? ` (${opts.shippingLabel})` : ''}</td>
                <td style="padding:6px 0;color:${TEXT};font-size:13px;text-align:right;font-family:monospace;">${opts.shipping === 0 ? '<span style="color:#34d399;">FREE</span>' : `£${opts.shipping.toFixed(2)}`}</td>
              </tr>
              <tr>
                <td colspan="2" style="padding:4px 0;"><div style="height:1px;background:rgba(59,130,246,0.15);"></div></td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#e8f0fe;font-size:16px;font-weight:700;">Total</td>
                <td style="padding:10px 0;color:${BLUE};font-size:20px;font-weight:800;text-align:right;font-family:monospace;">£${opts.total.toFixed(2)}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Address + shipping -->
        ${addressBlock ? `
        <tr>
          <td style="padding:24px 40px 0;background:${BG};border-left:1px solid ${BORDER};border-right:1px solid ${BORDER};">
            <div bgcolor="#0b1a30" style="background-color:#0b1a30;border:1px solid rgba(59,130,246,0.1);border-radius:10px;padding:20px;">
              ${addressBlock}
            </div>
          </td>
        </tr>
        ` : ''}

        <!-- CTA Button -->
        <tr>
          <td style="padding:28px 40px;background:${BG};border-left:1px solid ${BORDER};border-right:1px solid ${BORDER};text-align:center;">
            <a href="https://phlabs.co.uk/account"
              style="display:inline-block;background:linear-gradient(135deg,${BLUE_D},${BLUE});color:#fff;font-weight:700;font-size:14px;padding:14px 36px;border-radius:12px;text-decoration:none;letter-spacing:0.5px;">
              View Your Order
            </a>
          </td>
        </tr>

        <!-- Disclaimer -->
        <tr>
          <td style="padding:20px 40px;background:#04101f;border:1px solid ${BORDER};border-top:1px solid rgba(59,130,246,0.1);">
            <p style="color:${DIMMED};font-size:11px;margin:0 0 6px 0;line-height:1.6;text-align:center;">
              All products are sold strictly for <strong>research and laboratory use only</strong>. Not for human consumption.
            </p>
            <p style="color:#1a3a5c;font-size:10px;margin:0;text-align:center;">
              PH Labs UK &bull; info@phlabs.co.uk &bull;
              <a href="https://phlabs.co.uk" style="color:${BLUE};text-decoration:none;">phlabs.co.uk</a>
            </p>
          </td>
        </tr>

        <!-- Bottom accent bar -->
        <tr>
          <td style="height:4px;background:linear-gradient(90deg,${BLUE_D},${BLUE},#60a5fa);border-radius:0 0 12px 12px;"></td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`;
}
