/**
 * VIP products live in `product_stock_vip`. Checkout must reject them for
 * non-VIP buyers and accept them for VIP buyers (fail-closed).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const VIP_ID = 'vipProd1';
vi.mock('./server/firebase-auth-admin', () => ({
  verifyFirebaseIdToken: vi.fn(async (t: string) => ({ uid: t === 'vip-token' ? 'vipUser' : 'plainUser' })),
}));
vi.mock('./server/firestore-admin', () => ({
  findDocByFieldAdmin: vi.fn(async () => null),
  getDocAdmin: vi.fn(async (col: string, id: string) => {
    if (col === 'customers') return id === 'vipUser' ? { isVip: true } : { isVip: false };
    if (col === 'product_stock_vip' && id === VIP_ID) return { name: 'VIP Peptide', price: 99.99, stock: 5, isVip: true };
    return null;
  }),
}));

import { runValidateCart } from './cart-validation.server';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
function publicStock404() {
  globalThis.fetch = vi.fn(async () => new Response('Not Found', { status: 404 })) as unknown as typeof fetch;
}

describe('VIP collection enforcement', () => {
  it('rejects a VIP product for a non-VIP buyer', async () => {
    publicStock404();
    const r = await runValidateCart({ items: [{ productId: VIP_ID, quantity: 1 }], idToken: 'plain-token' });
    expect(r.ok).toBe(false);
    expect(r.items).toHaveLength(0);
  });
  it('rejects a VIP product for an anonymous buyer', async () => {
    publicStock404();
    const r = await runValidateCart({ items: [{ productId: VIP_ID, quantity: 1 }] });
    expect(r.ok).toBe(false);
  });
  it('accepts a VIP product for a VIP buyer at the server price', async () => {
    publicStock404();
    const r = await runValidateCart({ items: [{ productId: VIP_ID, quantity: 2 }], idToken: 'vip-token' });
    expect(r.ok).toBe(true);
    expect(r.items[0].unitPrice).toBe(99.99);
    expect(r.subtotal).toBe(199.98);
  });
});
