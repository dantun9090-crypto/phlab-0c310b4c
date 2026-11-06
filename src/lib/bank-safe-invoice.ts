/**
 * Neutral invoice generation for bank / fintech verification.
 *
 * The document must read like an ordinary online-shop invoice: no chemical or
 * laboratory vocabulary, no disclaimers, no footer notes. Product names that
 * contain research/chemical keywords are mapped to a neutral retail
 * description; everything else keeps its original name. SKUs are printed as-is.
 */

/** Neutral retail descriptions used when a product name must be masked. */
export const NEUTRAL_ITEM_DESCRIPTIONS = ['Health Supplement', 'Nutraceutical'] as const;

/** Keywords that force a product name to be replaced with a neutral description. */
export const MASKED_NAME_KEYWORDS = [
  'peptide',
  'sarm',
  'mk-',
  'bpc-',
  'tb-',
  'rad-',
  'lgd-',
  'gw-',
  'yk-',
  's4',
  's23',
  'chemical',
  'research',
  'compound',
  'lab',
  'reagent',
] as const;

export interface BankSafeInvoiceItem {
  /** Original product name from the order. Masked when it hits a keyword. */
  name?: string;
  /** Internal SKU / product reference, printed unchanged. */
  sku?: string;
  quantity: number;
  unitPrice: number;
  lineTotal?: number;
}

export interface BankSafeInvoiceInput {
  invoiceNumber: string;
  issuedDate: Date | null;
  orderReference: string;
  buyerName?: string;
  buyerAddressLines?: string[];
  buyerEmail?: string;
  items: BankSafeInvoiceItem[];
  subtotal?: number;
  discount?: number;
  shipping?: number;
  vat?: number;
  total: number;
  currency?: string;
  paymentMethod?: string;
}

export const SELLER = {
  name: 'Ph Labs',
  legal: 'Daniel Tunski t/a Ph Labs',
  country: 'United Kingdom',
  email: 'info@phlabs.co.uk',
  site: 'phlabs.co.uk',
};

/** True when a product name contains a keyword that must never be printed. */
export function needsNeutralDescription(name?: string): boolean {
  const lower = String(name || '').toLowerCase();
  if (!lower.trim()) return true;
  return MASKED_NAME_KEYWORDS.some((k) => lower.includes(k));
}

/**
 * Invoice description for the nth line: the original product name when it is
 * already neutral, otherwise a neutral retail description.
 */
export function invoiceItemDescription(index: number, name?: string, sku?: string): string {
  const base = needsNeutralDescription(name)
    ? NEUTRAL_ITEM_DESCRIPTIONS[index % NEUTRAL_ITEM_DESCRIPTIONS.length]
    : String(name).trim();
  const ref = (sku || '').trim();
  return ref ? `${base} (SKU ${ref})` : base;
}

/**
 * Deterministic invoice number for an order: INV-<year>-<4 digits>.
 * `sequence` is 1-based and stable for a given order (index within its year).
 */
export function buildInvoiceNumber(year: number, sequence: number): string {
  return `INV-${year}-${String(sequence).padStart(4, '0')}`;
}

/**
 * Stable invoice number for an order. It never depends on how many other
 * orders exist, so deleting an order cannot renumber the rest.
 *
 * 1. If the order already carries an `INV-...` bank transfer reference, that
 *    exact value is used — the paperwork then matches the customer's bank
 *    narrative.
 * 2. Otherwise it is derived deterministically from the order reference.
 */
export function invoiceNumberForOrder(order: {
  id?: string;
  orderId?: string;
  bankTransferReference?: string;
  year?: number;
}): string {
  const existing = String(order.bankTransferReference || '').trim().toUpperCase();
  if (/^INV-\d{4}-[A-Z0-9-]+$/.test(existing)) return existing;
  const year = order.year ?? new Date().getFullYear();
  const ref = String(order.orderId || order.id || '')
    .trim()
    .toUpperCase()
    .replace(/^PHP-/, '')
    .replace(/[^A-Z0-9]/g, '');
  return `INV-${year}-${ref || '0000'}`;
}

function money(value: number, symbol = '£'): string {
  return `${symbol}${(Number.isFinite(value) ? value : 0).toFixed(2)}`;
}

function formatDate(d: Date | null): string {
  if (!d || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Builds the plain data rows that get printed. Exported for tests. */
export function buildInvoiceRows(input: BankSafeInvoiceInput) {
  return (input.items || []).map((it, i) => {
    const qty = it.quantity > 0 ? it.quantity : 1;
    const line = it.lineTotal ?? it.unitPrice * qty;
    return {
      description: invoiceItemDescription(i, it.name, it.sku),
      quantity: qty,
      unitPrice: it.unitPrice,
      lineTotal: line,
    };
  });
}

/**
 * Generates the invoice PDF and triggers a browser download.
 * jsPDF is imported dynamically so it never enters the main bundle.
 */
export async function renderBankSafeInvoiceDoc(input: BankSafeInvoiceInput) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const symbol = (input.currency || 'GBP').toUpperCase() === 'GBP' ? '£' : '';

  const left = 18;
  const right = 192;
  let y = 22;

  // ── Header ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(SELLER.name, left, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(SELLER.legal, left, y + 6);
  doc.text(SELLER.country, left, y + 11);
  doc.text(SELLER.email, left, y + 16);

  doc.setTextColor(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('INVOICE', right, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(input.invoiceNumber, right, y + 7, { align: 'right' });
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(`Issued: ${formatDate(input.issuedDate)}`, right, y + 13, { align: 'right' });
  doc.text(`Order ref: ${input.orderReference}`, right, y + 18, { align: 'right' });

  y += 28;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.6);
  doc.line(left, y, right, y);

  // ── Buyer ──
  y += 8;
  doc.setTextColor(120);
  doc.setFontSize(8);
  doc.text('BILLED TO', left, y);
  doc.text('PAYMENT', 120, y);
  doc.setTextColor(20);
  doc.setFontSize(10);
  let by = y + 6;
  const buyerLines = [
    input.buyerName || 'Customer',
    ...(input.buyerAddressLines || []).filter(Boolean),
    input.buyerEmail || '',
  ].filter(Boolean);
  buyerLines.forEach((line) => {
    doc.text(String(line), left, by);
    by += 5;
  });
  doc.text(input.paymentMethod || 'Bank transfer', 120, y + 6);
  doc.text(`Currency: ${(input.currency || 'GBP').toUpperCase()}`, 120, y + 11);

  y = Math.max(by, y + 20) + 6;

  // ── Items table ──
  doc.setFillColor(15, 23, 42);
  doc.rect(left, y, right - left, 8, 'F');
  doc.setTextColor(255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('DESCRIPTION', left + 2, y + 5.5);
  doc.text('QTY', 128, y + 5.5, { align: 'right' });
  doc.text('UNIT', 152, y + 5.5, { align: 'right' });
  doc.text('AMOUNT', right - 2, y + 5.5, { align: 'right' });
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(20);
  doc.setFontSize(9);
  const rows = buildInvoiceRows(input);
  rows.forEach((row, i) => {
    if (i % 2 === 1) {
      doc.setFillColor(245, 247, 250);
      doc.rect(left, y, right - left, 8, 'F');
    }
    doc.text(row.description, left + 2, y + 5.5);
    doc.text(String(row.quantity), 128, y + 5.5, { align: 'right' });
    doc.text(money(row.unitPrice, symbol), 152, y + 5.5, { align: 'right' });
    doc.text(money(row.lineTotal, symbol), right - 2, y + 5.5, { align: 'right' });
    y += 8;
    if (y > 250) {
      doc.addPage();
      y = 22;
    }
  });

  // ── Totals ──
  const subtotal =
    typeof input.subtotal === 'number'
      ? input.subtotal
      : rows.reduce((s, r) => s + r.lineTotal, 0);
  y += 6;
  const totalsX = 140;
  const put = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 11 : 9);
    doc.text(label, totalsX, y);
    doc.text(value, right - 2, y, { align: 'right' });
    y += bold ? 8 : 6;
  };
  put('Subtotal', money(subtotal, symbol));
  if (input.discount && input.discount > 0) put('Discount', `-${money(input.discount, symbol)}`);
  put('Shipping', money(input.shipping ?? 0, symbol));
  put('VAT', input.vat && input.vat > 0 ? money(input.vat, symbol) : 'Not applicable');
  doc.setDrawColor(15, 23, 42);
  doc.line(totalsX, y - 3, right, y - 3);
  y += 2;
  put('Total', money(input.total, symbol), true);

  // No footer, no disclaimers — the document ends with the totals.
  return doc;
}

/** Generates the invoice PDF and triggers a browser download. */
export async function downloadBankSafeInvoicePdf(input: BankSafeInvoiceInput): Promise<void> {
  const doc = await renderBankSafeInvoiceDoc(input);
  doc.save(`${input.invoiceNumber}.pdf`);
}
