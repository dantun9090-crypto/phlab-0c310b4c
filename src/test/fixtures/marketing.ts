/**
 * Shared test fixtures for marketing-related regression suites:
 *   - admin coupon documents (cart-validation.server / lookupCoupon)
 *   - settings/promoBanner Firestore REST documents (fetchPromoBanner)
 *   - marketing advert objects (<MarketingAdvertSlot />)
 *
 * Keep these small and composable. Each factory accepts a partial override and
 * deep-merges over a sensible default so individual tests only spell out the
 * field that matters to that test.
 */
import { vi } from 'vitest';
import type { MarketingAdvert } from '@/components/MarketingAdvertSlot';

// ─────────────────────────────────────────────────────────────────────────────
// Coupons (admin Firestore documents returned by findDocByFieldAdmin)
// ─────────────────────────────────────────────────────────────────────────────

export type AdminCouponDoc = {
  __id: string;
  code: string;
  isActive?: boolean;
  type?: 'percentage' | 'fixed' | 'free_shipping' | string;
  value?: number;
  expiryDate?: string;
  maxUses?: number;
  usedCount?: number;
  maxUsage?: number;
  usageCount?: number;
  minOrderValue?: number;
};

export function makeCoupon(overrides: Partial<AdminCouponDoc> = {}): AdminCouponDoc {
  return {
    __id: 'c1',
    code: 'SAVE10',
    isActive: true,
    type: 'percentage',
    value: 10,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Promo banner (Firestore REST encoded document)
// ─────────────────────────────────────────────────────────────────────────────

type FirestoreValue =
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { nullValue: null };

function encodeValue(v: unknown): FirestoreValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  return { nullValue: null };
}

/** Wrap a flat field map in Firestore REST `{ fields: {...} }` shape. */
export function fsDoc(fields: Record<string, unknown>) {
  const out: Record<string, FirestoreValue> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = encodeValue(v);
  return { fields: out };
}

export type PromoBannerFields = {
  active?: boolean;
  isActive?: boolean;
  imageUrl?: string;
  ctaUrl?: string;
  linkUrl?: string;
  overlayText?: string;
  textOverlayHeading?: string;
  textOverlayAlign?: string;
  textOverlayPosition?: string;
  heightPx?: number;
};

/** A visible banner fixture with overrides merged in. */
export function makeBannerDoc(overrides: PromoBannerFields = {}) {
  return fsDoc({
    active: true,
    imageUrl: 'https://x/y.jpg',
    ...overrides,
  });
}

/** Install a `globalThis.fetch` mock that returns the given JSON/string. */
export function mockFetchOnce(response: unknown, status = 200) {
  globalThis.fetch = vi.fn(async () =>
    new Response(typeof response === 'string' ? response : JSON.stringify(response), { status }),
  ) as unknown as typeof fetch;
}

/** Install a `globalThis.fetch` mock that throws (network error). */
export function mockFetchThrow(error: Error = new Error('network')) {
  globalThis.fetch = vi.fn(async () => {
    throw error;
  }) as unknown as typeof fetch;
}

// ─────────────────────────────────────────────────────────────────────────────
// Marketing adverts
// ─────────────────────────────────────────────────────────────────────────────

export function makeAdvert(overrides: Partial<MarketingAdvert> = {}): MarketingAdvert {
  return {
    id: '1',
    placement: 'home-hero',
    isActive: true,
    title: 'Visible Ad',
    ...overrides,
  };
}
