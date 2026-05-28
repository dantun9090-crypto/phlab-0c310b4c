import { describe, it, expect, beforeEach } from 'vitest';
import {
  splitLegacyCartId,
  migrateCartItems,
  migrateStoredCart,
} from './cart-migration';

describe('splitLegacyCartId', () => {
  it('splits a peptide variant suffix off the id', () => {
    expect(splitLegacyCartId('retatrutide-5mg')).toEqual({
      productId: 'retatrutide',
      variantId: '5mg',
    });
  });

  it('handles decimal dosages', () => {
    expect(splitLegacyCartId('semaglutide-2.5mg')).toEqual({
      productId: 'semaglutide',
      variantId: '2.5mg',
    });
  });

  it('handles mcg / iu / ml units', () => {
    expect(splitLegacyCartId('melanotan-100mcg')?.variantId).toBe('100mcg');
    expect(splitLegacyCartId('hcg-5000iu')?.variantId).toBe('5000iu');
    expect(splitLegacyCartId('bac-water-10ml')?.variantId).toBe('10ml');
  });

  it('leaves product slugs with hyphens but no variant suffix alone', () => {
    expect(splitLegacyCartId('bpc-157')).toBeNull();
    expect(splitLegacyCartId('mt-2')).toBeNull();
    expect(splitLegacyCartId('retatrutide')).toBeNull();
  });

  it('normalizes the variant suffix to lowercase', () => {
    expect(splitLegacyCartId('retatrutide-5MG')?.variantId).toBe('5mg');
  });
});

describe('migrateCartItems', () => {
  it('returns [] for non-array input', () => {
    expect(migrateCartItems(null)).toEqual([]);
    expect(migrateCartItems('nope')).toEqual([]);
    expect(migrateCartItems({})).toEqual([]);
  });

  it('splits legacy id into productId + variantId', () => {
    const result = migrateCartItems([{ id: 'retatrutide-5mg', quantity: 2 }]);
    expect(result).toEqual([
      { id: 'retatrutide', variantId: '5mg', quantity: 2 },
    ]);
  });

  it('strips a duplicated variant suffix when variantId is already set', () => {
    const result = migrateCartItems([
      { id: 'retatrutide-5mg', variantId: '5mg', quantity: 1 },
    ]);
    expect(result[0].id).toBe('retatrutide');
    expect(result[0].variantId).toBe('5mg');
  });

  it('leaves already-migrated items untouched (idempotent)', () => {
    const items = [{ id: 'retatrutide', variantId: '5mg', quantity: 1 }];
    const once = migrateCartItems(items);
    const twice = migrateCartItems(once);
    expect(twice).toEqual(once);
  });

  it('leaves product slugs with hyphens but no variant suffix alone', () => {
    const result = migrateCartItems([{ id: 'bpc-157', quantity: 1 }]);
    expect(result).toEqual([{ id: 'bpc-157', quantity: 1 }]);
  });

  it('collapses duplicates that arise after splitting', () => {
    const result = migrateCartItems([
      { id: 'retatrutide-5mg', quantity: 1 },
      { id: 'retatrutide', variantId: '5mg', quantity: 2 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'retatrutide', variantId: '5mg', quantity: 3 });
  });

  it('skips malformed entries instead of throwing', () => {
    const result = migrateCartItems([
      null,
      { id: '' },
      { id: 'retatrutide-5mg', quantity: 1 },
      'string',
    ] as unknown[]);
    expect(result).toEqual([
      { id: 'retatrutide', variantId: '5mg', quantity: 1 },
    ]);
  });
});

describe('migrateStoredCart', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    const localStorageMock = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => store.clear(),
    };
    // @ts-expect-error — assign global for node test env
    globalThis.window = { localStorage: localStorageMock };
    // @ts-expect-error — convenience direct access in assertions
    globalThis.localStorage = localStorageMock;
  });

  it('returns null when there is no stored cart', () => {
    expect(migrateStoredCart()).toBeNull();
  });

  it('returns null when the stored cart is not valid JSON', () => {
    localStorage.setItem('php_cart', '{not json');
    expect(migrateStoredCart()).toBeNull();
  });

  it('rewrites legacy carts in place and returns the migrated array', () => {
    localStorage.setItem(
      'php_cart',
      JSON.stringify([{ id: 'retatrutide-5mg', quantity: 1 }]),
    );
    const migrated = migrateStoredCart();
    expect(migrated).toEqual([
      { id: 'retatrutide', variantId: '5mg', quantity: 1 },
    ]);
    expect(JSON.parse(localStorage.getItem('php_cart')!)).toEqual(migrated);
  });

  it('does not rewrite storage when nothing changed', () => {
    const canonical = JSON.stringify([
      { id: 'retatrutide', variantId: '5mg', quantity: 1 },
    ]);
    localStorage.setItem('php_cart', canonical);
    migrateStoredCart();
    expect(localStorage.getItem('php_cart')).toBe(canonical);
  });
});
