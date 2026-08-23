import { describe, expect, it } from 'vitest';
import {
  buildInvoiceNumber,
  buildInvoiceRows,
  invoiceItemDescription,
  MASKED_NAME_KEYWORDS,
  invoiceNumberForOrder,
  needsNeutralDescription,
} from '../src/lib/bank-safe-invoice';

describe('invoice line descriptions', () => {
  it('masks names containing research/chemical keywords', () => {
    const rows = buildInvoiceRows({
      invoiceNumber: 'INV-2026-0001',
      issuedDate: new Date('2026-01-05'),
      orderReference: 'PHP-TEST',
      items: [
        { name: 'BPC-157 Research Peptide', sku: 'PHL-001', quantity: 2, unitPrice: 10 },
        { name: 'MK-677 Compound', sku: 'PHL-002', quantity: 1, unitPrice: 25, lineTotal: 25 },
        { name: 'Vitamin D3 Drops', sku: 'PHL-003', quantity: 1, unitPrice: 5 },
      ],
      total: 50,
    });
    expect(rows[0].description).toBe('Health Supplement (SKU PHL-001)');
    expect(rows[1].description).toBe('Nutraceutical (SKU PHL-002)');
    expect(rows[2].description).toBe('Vitamin D3 Drops (SKU PHL-003)');
    expect(rows[0].lineTotal).toBe(20);
  });

  it('flags every masked keyword', () => {
    for (const keyword of MASKED_NAME_KEYWORDS) {
      expect(needsNeutralDescription(`Some ${keyword} product`)).toBe(true);
    }
    expect(needsNeutralDescription('')).toBe(true);
    expect(needsNeutralDescription('Zinc Tablets')).toBe(false);
  });

  it('omits the SKU suffix when no SKU is present', () => {
    expect(invoiceItemDescription(0, 'Zinc Tablets')).toBe('Zinc Tablets');
  });

  it('formats deterministic invoice numbers', () => {
    expect(buildInvoiceNumber(2026, 1)).toBe('INV-2026-0001');
    expect(buildInvoiceNumber(2026, 137)).toBe('INV-2026-0137');
  });
});

describe('stable invoice numbers', () => {
  it('reuses the bank transfer reference when present', () => {
    expect(
      invoiceNumberForOrder({ id: 'x', orderId: 'PHP-MT32LX6S', bankTransferReference: 'INV-2026-MT32LX6S', year: 2026 }),
    ).toBe('INV-2026-MT32LX6S');
  });

  it('derives a per-order number that does not depend on other orders', () => {
    const a = invoiceNumberForOrder({ orderId: 'PHP-MT32LX6S', year: 2026 });
    expect(a).toBe('INV-2026-MT32LX6S');
    expect(invoiceNumberForOrder({ orderId: 'PHP-MT32LX6S', year: 2026 })).toBe(a);
    expect(invoiceNumberForOrder({ orderId: 'PHP-MSM59LP8', year: 2026 })).not.toBe(a);
  });
});
