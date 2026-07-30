/**
 * Customer-facing invoice document (print / PDF quality).
 *
 * Replaces the old plain-text receipt download with a proper A4, print-ready
 * HTML invoice the customer can save as PDF from the browser print dialog.
 *
 * Layout is intentionally light/white — a dark invoice wastes ink and looks
 * poor when printed or attached to an expense claim.
 */

export interface InvoiceDocumentItem {
  name: string;
  variantName?: string;
  quantity: number;
  unitPrice: number;
  lineTotal?: number;
}

export interface InvoiceDocumentOptions {
  /** Human-facing invoice / order reference, e.g. PHP-MS6AOY9P. */
  reference: string;
  /** Secondary bank/payment reference shown under the main reference. */
  paymentReference?: string;
  issuedDate: string;
  status?: string;
  paymentMethod?: string;
  customerName?: string;
  customerEmail?: string;
  addressLines?: string[];
  items: InvoiceDocumentItem[];
  subtotal?: number;
  discount?: number;
  discountLabel?: string;
  shipping?: number;
  shippingLabel?: string;
  total: number;
}

const COMPANY = {
  name: 'PH Labs',
  site: 'phlabs.co.uk',
  email: 'info@phlabs.co.uk',
  strapline: 'Research Peptides & Laboratory Compounds',
  country: 'United Kingdom',
};

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function gbp(value: number): string {
  return `£${(Number.isFinite(value) ? value : 0).toFixed(2)}`;
}

function safeFileSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'invoice';
}

/** Builds the full standalone HTML document for one invoice. */
export function buildCustomerInvoiceHtml(
  opts: InvoiceDocumentOptions,
  { autoPrint = false }: { autoPrint?: boolean } = {},
): string {
  const items = opts.items ?? [];
  const computedSubtotal = items.reduce(
    (sum, it) => sum + (it.lineTotal ?? it.unitPrice * (it.quantity || 1)),
    0,
  );
  const subtotal = typeof opts.subtotal === 'number' ? opts.subtotal : computedSubtotal;
  const discount = opts.discount && opts.discount > 0 ? opts.discount : 0;
  const shipping = typeof opts.shipping === 'number' ? opts.shipping : 0;

  const rows = items
    .map(
      (it, i) => `
        <tr class="${i % 2 ? 'alt' : ''}">
          <td class="desc">
            <span class="pname">${esc(it.name)}</span>
            ${it.variantName ? `<span class="variant">${esc(it.variantName)}</span>` : ''}
          </td>
          <td class="num">${esc(it.quantity)}</td>
          <td class="num">${gbp(it.unitPrice)}</td>
          <td class="num strong">${gbp(it.lineTotal ?? it.unitPrice * (it.quantity || 1))}</td>
        </tr>`,
    )
    .join('');

  const addressBlock = (opts.addressLines ?? []).filter(Boolean).map(esc).join('<br>');

  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Invoice ${esc(opts.reference)} — ${COMPANY.name}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #eef2f7; color: #0f172a; }
  body {
    font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    font-size: 12.5px;
    line-height: 1.55;
  }
  .sheet {
    max-width: 210mm;
    margin: 24px auto;
    background: #ffffff;
    padding: 26mm 18mm 18mm;
    box-shadow: 0 18px 50px rgba(15, 23, 42, 0.14);
  }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .brand-name { font-size: 22px; font-weight: 800; letter-spacing: 3px; text-transform: uppercase; margin: 0; }
  .brand-sub { margin: 4px 0 0; font-size: 11px; color: #64748b; letter-spacing: .6px; }
  .brand-meta { margin: 10px 0 0; font-size: 11px; color: #64748b; }
  .doc-title { text-align: right; }
  .doc-title h2 { margin: 0; font-size: 26px; letter-spacing: 5px; text-transform: uppercase; color: #0f172a; }
  .ref { margin: 8px 0 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 15px; font-weight: 700; }
  .subref { margin: 3px 0 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: #64748b; }
  .date { margin: 6px 0 0; font-size: 11px; color: #64748b; }
  .badge {
    display: inline-block; margin-top: 10px; padding: 4px 12px; border-radius: 999px;
    background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;
    font-size: 10px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase;
  }
  .rule { height: 3px; margin: 22px 0; background: linear-gradient(90deg, #10b981, #0f172a 70%); }
  .cols { display: flex; gap: 32px; }
  .cols > div { flex: 1; }
  .label { margin: 0 0 6px; font-size: 9.5px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase; color: #94a3b8; }
  .value { margin: 0; font-size: 12.5px; color: #1e293b; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 26px; }
  table.items th {
    text-align: left; font-size: 9.5px; letter-spacing: 1.4px; text-transform: uppercase;
    color: #ffffff; background: #0f172a; padding: 10px 12px; font-weight: 700;
  }
  table.items th.num, table.items td.num { text-align: right; }
  table.items td { padding: 11px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  table.items tr.alt td { background: #f8fafc; }
  td.num { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; }
  td.strong { font-weight: 700; }
  .pname { font-weight: 600; }
  .variant {
    display: inline-block; margin-left: 8px; padding: 1px 7px; border-radius: 4px;
    background: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; font-size: 10px; font-weight: 600;
  }
  .totals { width: 46%; margin-left: auto; margin-top: 18px; border-collapse: collapse; }
  .totals td { padding: 6px 0; font-size: 12.5px; }
  .totals td.v { text-align: right; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .totals tr.grand td { border-top: 2px solid #0f172a; padding-top: 12px; font-size: 16px; font-weight: 800; }
  .totals .free { color: #047857; font-weight: 700; }
  .totals .disc { color: #047857; }
  .notice {
    margin-top: 30px; padding: 14px 16px; border-left: 3px solid #10b981;
    background: #f8fafc; font-size: 11px; color: #475569;
  }
  footer { margin-top: 26px; border-top: 1px solid #e2e8f0; padding-top: 14px; font-size: 10.5px; color: #94a3b8; text-align: center; }
  .actions { max-width: 210mm; margin: 0 auto 0; text-align: right; }
  .actions button {
    font: inherit; font-weight: 700; cursor: pointer; margin: 16px 0 0;
    background: #0f172a; color: #fff; border: 0; border-radius: 10px; padding: 10px 20px;
  }
  @media print {
    html, body { background: #fff; }
    .sheet { margin: 0; padding: 0; box-shadow: none; max-width: none; }
    .actions { display: none !important; }
  }
</style>
</head>
<body>
<div class="actions"><button type="button" onclick="window.print()">Print / Save as PDF</button></div>
<div class="sheet">
  <div class="top">
    <div>
      <h1 class="brand-name">${COMPANY.name}</h1>
      <p class="brand-sub">${COMPANY.strapline}</p>
      <p class="brand-meta">${COMPANY.site}<br>${COMPANY.email}<br>${COMPANY.country}</p>
    </div>
    <div class="doc-title">
      <h2>Invoice</h2>
      <p class="ref">${esc(opts.reference)}</p>
      ${opts.paymentReference ? `<p class="subref">Bank ref: ${esc(opts.paymentReference)}</p>` : ''}
      <p class="date">Issued ${esc(opts.issuedDate)}</p>
      ${opts.status ? `<span class="badge">${esc(opts.status)}</span>` : ''}
    </div>
  </div>

  <div class="rule"></div>

  <div class="cols">
    <div>
      <p class="label">Billed to</p>
      <p class="value">
        ${opts.customerName ? `<strong>${esc(opts.customerName)}</strong><br>` : ''}
        ${addressBlock || ''}
        ${opts.customerEmail ? `${addressBlock ? '<br>' : ''}${esc(opts.customerEmail)}` : ''}
      </p>
    </div>
    <div>
      <p class="label">Payment</p>
      <p class="value">${esc(opts.paymentMethod || 'Open banking transfer')}</p>
      <p class="label" style="margin-top:14px">Currency</p>
      <p class="value">GBP (£)</p>
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th>Description</th>
        <th class="num">Qty</th>
        <th class="num">Unit</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="4">No items recorded.</td></tr>'}</tbody>
  </table>

  <table class="totals">
    <tr><td>Subtotal</td><td class="v">${gbp(subtotal)}</td></tr>
    ${discount ? `<tr><td class="disc">Discount${opts.discountLabel ? ` (${esc(opts.discountLabel)})` : ''}</td><td class="v disc">-${gbp(discount)}</td></tr>` : ''}
    <tr><td>Shipping${opts.shippingLabel ? ` (${esc(opts.shippingLabel)})` : ''}</td><td class="v">${shipping === 0 ? '<span class="free">FREE</span>' : gbp(shipping)}</td></tr>
    <tr class="grand"><td>Total</td><td class="v">${gbp(opts.total)}</td></tr>
  </table>

  <div class="notice">
    All products supplied by ${COMPANY.name} are sold strictly for <strong>research and laboratory use only</strong>.
    Not for human or animal consumption. Buyers must be 18 or over.
  </div>

  <footer>
    ${COMPANY.name} · ${COMPANY.site} · ${COMPANY.email} — thank you for your order.
  </footer>
</div>
${autoPrint ? '<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},350);});</script>' : ''}
</body>
</html>`;
}

/** Opens the invoice in a new tab and triggers the print/save-as-PDF dialog. */
export function openCustomerInvoice(opts: InvoiceDocumentOptions): void {
  const html = buildCustomerInvoiceHtml(opts, { autoPrint: true });
  const win = window.open('', '_blank');
  if (!win) {
    // Popup blocked (common on iOS Safari) — fall back to a file download.
    downloadCustomerInvoice(opts);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

/** Downloads the invoice as a self-contained HTML file (opens/prints anywhere). */
export function downloadCustomerInvoice(opts: InvoiceDocumentOptions): void {
  const html = buildCustomerInvoiceHtml(opts, { autoPrint: false });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `PHLabs-invoice-${safeFileSegment(opts.reference)}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
