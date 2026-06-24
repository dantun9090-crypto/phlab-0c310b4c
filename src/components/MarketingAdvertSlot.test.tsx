/**
 * Regression tests for `<MarketingAdvertSlot />` active+placement filtering.
 *
 * Guards against silent breakage of:
 *   - placement scoping (only adverts whose `placement` matches render)
 *   - active gating across BOTH `isActive` and `active` field names
 *     (admin panel may write either)
 *   - "empty advert" guard (an advert with no image, title, or subtitle
 *     must not render an empty card)
 *   - external vs internal href handling
 *   - hiding the entire slot when nothing is visible (returns null)
 *
 * Run with: `bun test src/components/MarketingAdvertSlot.test.tsx`
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import MarketingAdvertSlot, { type MarketingAdvert } from './MarketingAdvertSlot';

// Avoid pulling Cloudflare image transformation into the test path.
vi.mock('@/lib/cf-image', () => ({
  cfImgProps: (src: string) => ({ src, srcSet: undefined, sizes: undefined }),
}));

function renderSlot(adverts: MarketingAdvert[], placement = 'home-hero') {
  return render(<MarketingAdvertSlot adverts={adverts} placement={placement} />);
}

describe('MarketingAdvertSlot — placement + active filtering', () => {
  it('returns null when no adverts match the placement', () => {
    const { container } = renderSlot([
      { id: '1', placement: 'sidebar', isActive: true, title: 'Hi' },
    ], 'home-hero');
    expect(container.firstChild).toBeNull();
  });

  it('renders an active advert with the matching placement', () => {
    const { container, getByText } = renderSlot([
      { id: '1', placement: 'home-hero', isActive: true, title: 'Visible Ad' },
    ], 'home-hero');
    expect(container.firstChild).not.toBeNull();
    expect(getByText('Visible Ad')).toBeTruthy();
  });

  it('treats `active: true` as equivalent to `isActive: true`', () => {
    const { getByText } = renderSlot([
      { id: '1', placement: 'home-hero', active: true, title: 'Legacy Field Ad' },
    ], 'home-hero');
    expect(getByText('Legacy Field Ad')).toBeTruthy();
  });

  it('hides an advert when isActive=false even if active=true is missing', () => {
    const { container } = renderSlot([
      { id: '1', placement: 'home-hero', isActive: false, title: 'Hidden' },
    ], 'home-hero');
    expect(container.firstChild).toBeNull();
  });

  it('hides an advert when neither isActive nor active is true', () => {
    const { container } = renderSlot([
      { id: '1', placement: 'home-hero', title: 'Inactive by default' },
    ], 'home-hero');
    expect(container.firstChild).toBeNull();
  });

  it('hides an advert that has no image, title, or subtitle (empty guard)', () => {
    const { container } = renderSlot([
      { id: '1', placement: 'home-hero', isActive: true },
    ], 'home-hero');
    expect(container.firstChild).toBeNull();
  });

  it('mixes correctly: renders only matching+active+non-empty adverts', () => {
    const adverts: MarketingAdvert[] = [
      { id: 'a', placement: 'home-hero', isActive: true, title: 'YES-1' },
      { id: 'b', placement: 'home-hero', isActive: false, title: 'NO-inactive' },
      { id: 'c', placement: 'sidebar',   isActive: true, title: 'NO-placement' },
      { id: 'd', placement: 'home-hero', active: true,  subtitle: 'YES-2' },
      { id: 'e', placement: 'home-hero', isActive: true }, // empty
    ];
    const { queryByText } = renderSlot(adverts, 'home-hero');
    expect(queryByText('YES-1')).toBeTruthy();
    expect(queryByText('YES-2')).toBeTruthy();
    expect(queryByText('NO-inactive')).toBeNull();
    expect(queryByText('NO-placement')).toBeNull();
  });

  it('renders external ctaUrl with target=_blank and rel=noopener noreferrer', () => {
    const { container } = renderSlot([
      { id: '1', placement: 'home-hero', isActive: true, title: 'X', ctaUrl: 'https://example.com' },
    ], 'home-hero');
    const a = container.querySelector('a');
    expect(a).not.toBeNull();
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toContain('noopener');
  });

  it('renders internal ctaUrl WITHOUT target=_blank', () => {
    const { container } = renderSlot([
      { id: '1', placement: 'home-hero', isActive: true, title: 'X', ctaUrl: '/promo' },
    ], 'home-hero');
    const a = container.querySelector('a');
    expect(a).not.toBeNull();
    expect(a?.getAttribute('target')).toBeNull();
  });

  it('emits a data-advert-placement attribute matching the placement', () => {
    const { container } = renderSlot([
      { id: '1', placement: 'product-top', isActive: true, title: 'X' },
    ], 'product-top');
    expect(container.querySelector('[data-advert-placement="product-top"]')).not.toBeNull();
  });
});
