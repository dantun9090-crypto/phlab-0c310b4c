/**
 * Bank-safe invoice generation.
 *
 * Banks / fintechs (Revolut, Payoneer, Zempler) routinely ask for sample
 * invoices during merchant verification. Those documents must read like a
 * laboratory-supply invoice, so this module deliberately NEVER prints trade
 * names of research compounds and never uses physiology/fitness vocabulary.
 *
 * Every line item is rendered as a neutral description plus the internal SKU,
 * which resolves back to the order in our own system only.
 */

/** Neutral line descriptions, rotated so a multi-line invoice still reads naturally. */
const GENERIC_DESCRIPTIONS = [
  'Research Compound',
  'Laboratory Reagent',
  'Analytical Standard',
] as const;

/** Words that must never appear anywhere on a generated invoice. */
export const BANNED_INVOICE_TOKENS = [
  'steroid',
  'steroids',
  'hormone',
  'hormones',
  'growth',
  'muscle',
  'bodybuilding',
  'peptide',
  'peptides',
  'sarm',
  'sarms',
  'dosage',
  'injection',
  'injectable',
] as const;

export const INVOICE_FOOTER_NOTE =
  'All products sold strictly for research purposes only. Not for human consumption.';

export interface BankSafeInvoiceItem {
  /** Internal SKU / product reference. Never a trade name. */
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

/** Generic, bank-safe description for the nth line of an invoice. */
export function genericItemDescription(index: number, sku?: string): string {
  const base = GENERIC_DESCRIPTIONS[index % GENERIC_DESCRIPTIONS.length];
  const ref = (sku || '').trim();
  const safeRef = ref && !containsBannedToken(ref) ? ref : `ITEM-${index + 1}`;
  return `${base} — Item #${index + 1} (SKU ${safeRef})`;
}

/** True when the supplied text contains any forbidden token. */
export function containsBannedToken(text: string): boolean {
  const lower = String(text || '').toLowerCase();
  return BANNED_INVOICE_TOKENS.some((t) => new RegExp(`\\b${t}\\b`, 'i').test(lower));
}

/**
 * Deterministic invoice number for an order: INV-<year>-<4 digits>.
 * `sequence` is 1-based and stable for a given order (index within its year).
 */
export function buildInvoiceNumber(year: number, sequence: number): string {
  return `INV-${year}-${String(sequence).padStart(4, '0')}`;
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
      description: genericItemDescription(i, it.sku),
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
export async function downloadBankSafeInvoicePdf(input: BankSafeInvoiceInput): Promise<void> {
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

  // ── Footer ──
  const footerY = 278;
  doc.setDrawColor(210);
  doc.setLineWidth(0.3);
  doc.line(left, footerY - 8, right, footerY - 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text(INVOICE_FOOTER_NOTE, left, footerY - 3);
  doc.text(`${SELLER.name} · ${SELLER.site} · ${SELLER.email}`, left, footerY + 2);

  doc.save(`${input.invoiceNumber}.pdf`);
}
