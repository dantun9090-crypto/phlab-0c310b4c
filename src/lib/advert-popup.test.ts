import { describe, it, expect, beforeEach } from 'vitest';
import {
  ADVERT_DISMISS_PREFIX,
  ADVERT_DISMISS_WINDOW_MS,
  isDismissed,
  isWithinSchedule,
  markDismissed,
  pickPopupAdvert,
  toMillis,
} from '@/lib/advert-popup';

const NOW = Date.UTC(2026, 6, 25, 12, 0, 0);

describe('advert-popup helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('normalises timestamp shapes', () => {
    expect(toMillis(null)).toBeNull();
    expect(toMillis('')).toBeNull();
    expect(toMillis(NOW)).toBe(NOW);
    expect(toMillis(new Date(NOW))).toBe(NOW);
    expect(toMillis({ toMillis: () => NOW })).toBe(NOW);
    expect(toMillis({ seconds: NOW / 1000 })).toBe(NOW);
    expect(toMillis('not-a-date')).toBeNull();
  });

  it('respects the optional schedule window', () => {
    expect(isWithinSchedule({}, NOW)).toBe(true);
    expect(isWithinSchedule({ startDate: NOW + 1000 }, NOW)).toBe(false);
    expect(isWithinSchedule({ endDate: NOW - 1000 }, NOW)).toBe(false);
    expect(isWithinSchedule({ startDate: NOW - 1000, endDate: NOW + 1000 }, NOW)).toBe(true);
  });

  it('hides a dismissed advert for 7 days, then shows it again', () => {
    markDismissed('ad1', NOW);
    expect(localStorage.getItem(ADVERT_DISMISS_PREFIX + 'ad1')).toBe(String(NOW));
    expect(isDismissed('ad1', NOW + 1000)).toBe(true);
    expect(isDismissed('ad1', NOW + ADVERT_DISMISS_WINDOW_MS + 1)).toBe(false);
    expect(isDismissed('other', NOW)).toBe(false);
  });

  it('picks only an active, scheduled, undismissed popup advert', () => {
    const base = { id: 'p1', placement: 'popup', isActive: true, imageUrl: 'https://x/y.jpg' };
    expect(pickPopupAdvert([base], NOW)?.id).toBe('p1');
    expect(pickPopupAdvert([{ ...base, placement: 'homepage_hero' }], NOW)).toBeNull();
    expect(pickPopupAdvert([{ ...base, isActive: false }], NOW)).toBeNull();
    expect(pickPopupAdvert([{ ...base, imageUrl: '', title: '' }], NOW)).toBeNull();
    expect(pickPopupAdvert([{ ...base, endDate: NOW - 1 }], NOW)).toBeNull();
    expect(pickPopupAdvert(null, NOW)).toBeNull();

    markDismissed('p1', NOW);
    expect(pickPopupAdvert([base], NOW)).toBeNull();
  });
});
