import { describe, expect, it } from 'vitest';
import {
  BANNED_INVOICE_TOKENS,
  buildInvoiceNumber,
  buildInvoiceRows,
  containsBannedToken,
  genericItemDescription,
  INVOICE_FOOTER_NOTE,
} from '@/lib/bank-safe-invoice';

describe('bank-safe invoice', () => {
  it('never prints a trade name, only generic description + SKU', () => {
    const rows = buildInvoiceRows({
      invoiceNumber: 'INV-2026-0001',
      issuedDate: new Date('2026-01-05'),
      orderReference: 'PHP-TEST',
      items: [
        { sku: 'PHL-001', quantity: 2, unitPrice: 10 },
        { sku: 'PHL-002', quantity: 1, unitPrice: 25, lineTotal: 25 },
        { sku: 'PHL-003', quantity: 1, unitPrice: 5 },
      ],
      total: 50,
    });
    expect(rows).toHaveLength(3);
    expect(rows[0].description).toBe('Research Compound — Item #1 (SKU PHL-001)');
    expect(rows[1].description).toBe('Laboratory Reagent — Item #2 (SKU PHL-002)');
    expect(rows[2].description).toBe('Analytical Standard — Item #3 (SKU PHL-003)');
    expect(rows[0].lineTotal).toBe(20);
    for (const row of rows) {
      expect(containsBannedToken(row.description)).toBe(false);
      expect(row.description).not.toMatch(/BPC|MK-677|RAD-140|retatrutide|tirzepatide/i);
    }
  });

  it('drops a SKU that would leak a banned token', () => {
    expect(genericItemDescription(0, 'BPC-PEPTIDE')).toBe(
      'Research Compound — Item #1 (SKU ITEM-1)',
    );
  });

  it('flags every banned token', () => {
    for (const token of BANNED_INVOICE_TOKENS) {
      expect(containsBannedToken(`some ${token} text`)).toBe(true);
    }
  });

  it('formats deterministic invoice numbers', () => {
    expect(buildInvoiceNumber(2026, 1)).toBe('INV-2026-0001');
    expect(buildInvoiceNumber(2026, 137)).toBe('INV-2026-0137');
  });

  it('keeps the research-only footer free of banned wording', () => {
    expect(INVOICE_FOOTER_NOTE).toBe(
      'All products sold strictly for research purposes only. Not for human consumption.',
    );
    expect(containsBannedToken(INVOICE_FOOTER_NOTE)).toBe(false);
  });
});
