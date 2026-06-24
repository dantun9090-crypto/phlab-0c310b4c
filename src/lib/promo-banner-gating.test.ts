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
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fetchPromoBanner } from './firestore-rest';
import { fsDoc, makeBannerDoc, mockFetchOnce, mockFetchThrow } from '@/test/fixtures/marketing';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = originalFetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('fetchPromoBanner — active gating', () => {
  it('returns null when active === false', async () => {
    mockFetchOnce(makeBannerDoc({ active: false }));
    expect(await fetchPromoBanner()).toBeNull();
  });

  it('returns null when isActive === false (admin alternative field)', async () => {
    mockFetchOnce(fsDoc({ isActive: false, imageUrl: 'https://x/y.jpg' }));
    expect(await fetchPromoBanner()).toBeNull();
  });

  it('returns the banner when active === true', async () => {
    mockFetchOnce(makeBannerDoc());
    const b = await fetchPromoBanner();
    expect(b).not.toBeNull();
    expect(b?.imageUrl).toBe('https://x/y.jpg');
  });

  it('returns the banner when isActive === true (no active field)', async () => {
    mockFetchOnce(fsDoc({ isActive: true, imageUrl: 'https://x/y.jpg' }));
    const b = await fetchPromoBanner();
    expect(b?.imageUrl).toBe('https://x/y.jpg');
  });

  it('returns the banner when neither flag is set (defaults to visible if imageUrl present)', async () => {
    mockFetchOnce(fsDoc({ imageUrl: 'https://x/y.jpg' }));
    expect(await fetchPromoBanner()).not.toBeNull();
  });

  it('returns null when imageUrl is missing', async () => {
    mockFetchOnce(fsDoc({ active: true }));
    expect(await fetchPromoBanner()).toBeNull();
  });

  it('returns null on non-2xx response', async () => {
    mockFetchOnce('Not Found', 404);
    expect(await fetchPromoBanner()).toBeNull();
  });

  it('returns null on fetch throw, never rejects', async () => {
    mockFetchThrow();
    await expect(fetchPromoBanner()).resolves.toBeNull();
  });
});

describe('fetchPromoBanner — field name compatibility', () => {
  it('exposes both ctaUrl and linkUrl when both are stored', async () => {
    mockFetchOnce(makeBannerDoc({ ctaUrl: '/a', linkUrl: '/b' }));
    const b = await fetchPromoBanner();
    expect(b?.ctaUrl).toBe('/a');
    expect(b?.linkUrl).toBe('/b');
  });

  it('exposes both overlayText and textOverlayHeading variants', async () => {
    mockFetchOnce(makeBannerDoc({ overlayText: 'Hello', textOverlayHeading: 'World' }));
    const b = await fetchPromoBanner();
    expect(b?.overlayText).toBe('Hello');
    expect(b?.textOverlayHeading).toBe('World');
  });

  it('passes through layout fields used by Home (align/position/heightPx)', async () => {
    mockFetchOnce(makeBannerDoc({
      textOverlayAlign: 'left', textOverlayPosition: 'bottom', heightPx: 420,
    }));
    const b = await fetchPromoBanner();
    expect(b?.textOverlayAlign).toBe('left');
    expect(b?.textOverlayPosition).toBe('bottom');
    expect(b?.heightPx).toBe(420);
  });
});
