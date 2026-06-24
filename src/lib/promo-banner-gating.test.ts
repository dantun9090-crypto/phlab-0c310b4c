/**
 * Regression tests for `fetchPromoBanner` (settings/promoBanner gating).
 *
 * Guards against silent breakage of:
 *   - "active" gating: banner must be hidden when `active === false` OR
 *     `isActive === false` (admin panel writes either name)
 *   - field normalization: both `ctaUrl`/`linkUrl` and
 *     `overlayText`/`textOverlayHeading` must survive Firestore REST decoding
 *   - safe fallback to null on missing imageUrl or transport errors
 *
 * Run with: `bun test src/lib/promo-banner-gating.test.ts`
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchPromoBanner } from './firestore-rest';

const originalFetch = globalThis.fetch;

function fsDoc(fields: Record<string, unknown>) {
  const encode = (v: unknown): unknown => {
    if (v === null) return { nullValue: null };
    if (typeof v === 'string') return { stringValue: v };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') {
      return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    }
    return { nullValue: null };
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = encode(v);
  return { fields: out };
}

function mockFetch(response: unknown, status = 200) {
  globalThis.fetch = vi.fn(async () =>
    new Response(typeof response === 'string' ? response : JSON.stringify(response), { status }),
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  globalThis.fetch = originalFetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('fetchPromoBanner — active gating', () => {
  it('returns null when active === false', async () => {
    mockFetch(fsDoc({ active: false, imageUrl: 'https://x/y.jpg' }));
    expect(await fetchPromoBanner()).toBeNull();
  });

  it('returns null when isActive === false (admin alternative field)', async () => {
    mockFetch(fsDoc({ isActive: false, imageUrl: 'https://x/y.jpg' }));
    expect(await fetchPromoBanner()).toBeNull();
  });

  it('returns the banner when active === true', async () => {
    mockFetch(fsDoc({ active: true, imageUrl: 'https://x/y.jpg' }));
    const b = await fetchPromoBanner();
    expect(b).not.toBeNull();
    expect(b?.imageUrl).toBe('https://x/y.jpg');
  });

  it('returns the banner when isActive === true (no active field)', async () => {
    mockFetch(fsDoc({ isActive: true, imageUrl: 'https://x/y.jpg' }));
    const b = await fetchPromoBanner();
    expect(b?.imageUrl).toBe('https://x/y.jpg');
  });

  it('returns the banner when neither flag is set (defaults to visible if imageUrl present)', async () => {
    mockFetch(fsDoc({ imageUrl: 'https://x/y.jpg' }));
    expect(await fetchPromoBanner()).not.toBeNull();
  });

  it('returns null when imageUrl is missing', async () => {
    mockFetch(fsDoc({ active: true }));
    expect(await fetchPromoBanner()).toBeNull();
  });

  it('returns null on non-2xx response', async () => {
    mockFetch('Not Found', 404);
    expect(await fetchPromoBanner()).toBeNull();
  });

  it('returns null on fetch throw, never rejects', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    await expect(fetchPromoBanner()).resolves.toBeNull();
  });
});

describe('fetchPromoBanner — field name compatibility', () => {
  it('exposes both ctaUrl and linkUrl when both are stored', async () => {
    mockFetch(fsDoc({
      active: true, imageUrl: 'https://x/y.jpg',
      ctaUrl: '/a', linkUrl: '/b',
    }));
    const b = await fetchPromoBanner();
    expect(b?.ctaUrl).toBe('/a');
    expect(b?.linkUrl).toBe('/b');
  });

  it('exposes both overlayText and textOverlayHeading variants', async () => {
    mockFetch(fsDoc({
      active: true, imageUrl: 'https://x/y.jpg',
      overlayText: 'Hello', textOverlayHeading: 'World',
    }));
    const b = await fetchPromoBanner();
    expect(b?.overlayText).toBe('Hello');
    expect(b?.textOverlayHeading).toBe('World');
  });

  it('passes through layout fields used by Home (align/position/heightPx)', async () => {
    mockFetch(fsDoc({
      active: true, imageUrl: 'https://x/y.jpg',
      textOverlayAlign: 'left', textOverlayPosition: 'bottom', heightPx: 420,
    }));
    const b = await fetchPromoBanner();
    expect(b?.textOverlayAlign).toBe('left');
    expect(b?.textOverlayPosition).toBe('bottom');
    expect(b?.heightPx).toBe(420);
  });
});
