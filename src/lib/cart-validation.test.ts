/**
 * Tests for `validateCartPrices` legacy-id fallback.
 *
 * Verifies that when a cart line arrives with a concatenated
 * `<productId>-<variantId>` id (old localStorage format), the validator:
 *   1. retries the Firestore fetch against the split product id,
 *   2. recovers the variantId from the suffix,
 *   3. resolves the matching variant's price (not the top-level price).
 *
 * Run with: `bun test src/lib/cart-validation.test.ts`
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runValidateCart } from "./cart-validation.functions";

type FetchInit = { method?: string; headers?: Record<string, string>; body?: string };
type FetchCall = { url: string; init?: FetchInit };

const PRODUCT_ID = 'maibTaw5CXVkw1aDgvHd';
const VARIANT_ID = 'v1';
const LEGACY_ID = `${PRODUCT_ID}-${VARIANT_ID}`;

function fsDoc(fields: Record<string, unknown>) {
  const encode = (v: unknown): unknown => {
    if (v === null) return { nullValue: null };
    if (typeof v === 'string') return { stringValue: v };
    if (typeof v === 'number')
      return Number.isInteger(v)
        ? { integerValue: String(v) }
        : { doubleValue: v };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (Array.isArray(v))
      return { arrayValue: { values: v.map((x) => encode(x)) } };
    if (typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as object)) out[k] = encode(val);
      return { mapValue: { fields: out } };
    }
    return { nullValue: null };
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = encode(v);
  return { fields: out };
}

const PRODUCT_FIXTURE = fsDoc({
  name: 'Retatrutide Research Peptide',
  price: 49.99,
  stock: 100,
  variants: [
    { id: 'v1', name: '5mg vial', price: 79.99 },
    { id: 'v2', name: '10mg vial', price: 139.99 },
  ],
});

let calls: FetchCall[] = [];
const originalFetch = globalThis.fetch;

function installFetchMock(handler: (url: string) => Response | Promise<Response>) {
  calls = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: FetchInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    return handler(url);
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('validateCartPrices — legacy id fallback', () => {
  it('recovers productId + variantId from concatenated `<id>-<variantId>` and uses variant price', async () => {
    installFetchMock((url) => {
      if (url.endsWith(`/product_stock/${LEGACY_ID}`)) {
        return new Response('Not Found', { status: 404 });
      }
      if (url.endsWith(`/product_stock/${PRODUCT_ID}`)) {
        return new Response(JSON.stringify(PRODUCT_FIXTURE), { status: 200 });
      }
      return new Response('unexpected', { status: 500 });
    });

    const result = await validateCartPrices({
      data: { items: [{ productId: LEGACY_ID, quantity: 1 }] },
    });

    // Both fetches happened in the right order
    expect(calls.length).toBe(2);
    expect(calls[0].url).toContain(`/product_stock/${LEGACY_ID}`);
    expect(calls[1].url).toContain(`/product_stock/${PRODUCT_ID}`);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.items.length).toBe(1);

    const line = result.items[0];
    expect(line.productId).toBe(PRODUCT_ID);          // split, not legacy
    expect(line.variantId).toBe(VARIANT_ID);          // recovered from suffix
    expect(line.variantName).toBe('5mg vial');
    expect(line.unitPrice).toBe(79.99);               // variant price, NOT 49.99
    expect(line.lineTotal).toBe(79.99);
    expect(result.subtotal).toBe(79.99);
  });

  it('does not strip the suffix when the canonical id resolves on the first try', async () => {
    installFetchMock((url) => {
      if (url.endsWith(`/product_stock/${PRODUCT_ID}`)) {
        return new Response(JSON.stringify(PRODUCT_FIXTURE), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });

    const result = await validateCartPrices({
      data: { items: [{ productId: PRODUCT_ID, variantId: 'v2', quantity: 2 }] },
    });

    expect(calls.length).toBe(1);                     // no fallback retry
    expect(result.ok).toBe(true);
    const line = result.items[0];
    expect(line.productId).toBe(PRODUCT_ID);
    expect(line.variantId).toBe('v2');
    expect(line.unitPrice).toBe(139.99);              // matched variant v2
    expect(line.lineTotal).toBe(279.98);
  });

  it('preserves an explicit variantId on the cart line over the suffix when both are present', async () => {
    // Legacy id ends in `-v1`, but client also explicitly passed variantId `v2`.
    // The explicit field must win (`variantId || fallbackVariantId`).
    installFetchMock((url) => {
      if (url.endsWith(`/product_stock/${LEGACY_ID}`)) {
        return new Response('Not Found', { status: 404 });
      }
      if (url.endsWith(`/product_stock/${PRODUCT_ID}`)) {
        return new Response(JSON.stringify(PRODUCT_FIXTURE), { status: 200 });
      }
      return new Response('unexpected', { status: 500 });
    });

    const result = await validateCartPrices({
      data: { items: [{ productId: LEGACY_ID, variantId: 'v2', quantity: 1 }] },
    });

    expect(result.ok).toBe(true);
    const line = result.items[0];
    expect(line.productId).toBe(PRODUCT_ID);
    expect(line.variantId).toBe('v2');
    expect(line.unitPrice).toBe(139.99);              // v2, not v1
  });

  it('returns a clear error when neither the legacy nor the split id resolves', async () => {
    installFetchMock(() => new Response('Not Found', { status: 404 }));

    const result = await validateCartPrices({
      data: { items: [{ productId: 'unknown-xyz', quantity: 1 }] },
    });

    expect(result.ok).toBe(false);
    expect(result.items.length).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toMatch(/no longer exists|Could not verify/i);
  });

  it('does not attempt fallback when the id has no hyphen', async () => {
    installFetchMock(() => new Response('Not Found', { status: 404 }));

    await validateCartPrices({
      data: { items: [{ productId: 'noHyphenHere', quantity: 1 }] },
    });

    expect(calls.length).toBe(1);                     // single fetch, no retry
  });
});
