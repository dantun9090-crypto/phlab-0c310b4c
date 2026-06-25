import { describe, it, expect } from 'vitest';
import { isQuietNow, shouldSuppressToast, minutesInTz } from './quiet-hours';

// Helper: build a Date whose UTC hour/minute we control.
function utc(h: number, m = 0): Date {
  const d = new Date(Date.UTC(2026, 0, 15, h, m, 0));
  return d;
}

describe('isQuietNow — same-day window', () => {
  const start = '09:00';
  const end = '17:00';

  it('returns true at the start of the window', () => {
    expect(isQuietNow(start, end, utc(9, 0), 'UTC')).toBe(true);
  });
  it('returns true mid-window', () => {
    expect(isQuietNow(start, end, utc(12, 30), 'UTC')).toBe(true);
  });
  it('returns false exactly at end (exclusive)', () => {
    expect(isQuietNow(start, end, utc(17, 0), 'UTC')).toBe(false);
  });
  it('returns false before window', () => {
    expect(isQuietNow(start, end, utc(8, 59), 'UTC')).toBe(false);
  });
  it('returns false after window', () => {
    expect(isQuietNow(start, end, utc(17, 1), 'UTC')).toBe(false);
  });
});

describe('isQuietNow — overnight window (22:00 → 08:00)', () => {
  const start = '22:00';
  const end = '08:00';

  it('true late evening', () => {
    expect(isQuietNow(start, end, utc(23, 30), 'UTC')).toBe(true);
  });
  it('true around midnight', () => {
    expect(isQuietNow(start, end, utc(0, 0), 'UTC')).toBe(true);
  });
  it('true early morning before end', () => {
    expect(isQuietNow(start, end, utc(7, 59), 'UTC')).toBe(true);
  });
  it('false at end boundary', () => {
    expect(isQuietNow(start, end, utc(8, 0), 'UTC')).toBe(false);
  });
  it('false during day', () => {
    expect(isQuietNow(start, end, utc(15, 0), 'UTC')).toBe(false);
  });
});

describe('isQuietNow — edge cases', () => {
  it('start == end means never quiet', () => {
    expect(isQuietNow('10:00', '10:00', utc(10, 0), 'UTC')).toBe(false);
    expect(isQuietNow('10:00', '10:00', utc(22, 0), 'UTC')).toBe(false);
  });
});

describe('minutesInTz — timezone awareness', () => {
  it('UTC 06:00 is 06:00 in UTC', () => {
    expect(minutesInTz(utc(6, 0), 'UTC')).toBe(6 * 60);
  });
  it('UTC 06:00 is 07:00 in Europe/Warsaw (winter, UTC+1)', () => {
    // 2026-01-15 is winter → CET = UTC+1
    expect(minutesInTz(utc(6, 0), 'Europe/Warsaw')).toBe(7 * 60);
  });
  it('UTC 23:00 in New York is 18:00 same day (winter, UTC-5)', () => {
    expect(minutesInTz(utc(23, 0), 'America/New_York')).toBe(18 * 60);
  });
});

describe('shouldSuppressToast', () => {
  const basePrefs = (overrides: any = {}) => ({
    notifySignups: true,
    notifyFirstSeen: true,
    quiet: { enabled: false, start: '22:00', end: '08:00', timezone: 'UTC' },
    ...overrides,
  });

  it('suppresses signup when notifySignups is off', () => {
    const r = shouldSuppressToast('signup', basePrefs({ notifySignups: false }), utc(12, 0));
    expect(r.suppressed).toBe(true);
    expect(r.reason).toBe('pref-off');
  });

  it('suppresses visitor when notifyFirstSeen is off', () => {
    const r = shouldSuppressToast('visitor', basePrefs({ notifyFirstSeen: false }), utc(12, 0));
    expect(r.suppressed).toBe(true);
    expect(r.reason).toBe('pref-off');
  });

  it('suppresses both kinds during overnight quiet hours (UTC)', () => {
    const prefs = basePrefs({ quiet: { enabled: true, start: '22:00', end: '08:00', timezone: 'UTC' } });
    expect(shouldSuppressToast('signup', prefs, utc(2, 0)).reason).toBe('quiet-hours');
    expect(shouldSuppressToast('visitor', prefs, utc(2, 0)).reason).toBe('quiet-hours');
  });

  it('does not suppress during the day under overnight quiet hours', () => {
    const prefs = basePrefs({ quiet: { enabled: true, start: '22:00', end: '08:00', timezone: 'UTC' } });
    expect(shouldSuppressToast('signup', prefs, utc(12, 0)).suppressed).toBe(false);
    expect(shouldSuppressToast('visitor', prefs, utc(12, 0)).suppressed).toBe(false);
  });

  it('suppresses inside a same-day quiet window', () => {
    const prefs = basePrefs({ quiet: { enabled: true, start: '09:00', end: '17:00', timezone: 'UTC' } });
    expect(shouldSuppressToast('signup', prefs, utc(10, 0)).reason).toBe('quiet-hours');
    expect(shouldSuppressToast('signup', prefs, utc(18, 0)).suppressed).toBe(false);
  });

  it('respects timezone offset (UTC 06:00 inside 07:00-09:00 Warsaw window)', () => {
    const prefs = basePrefs({ quiet: { enabled: true, start: '07:00', end: '09:00', timezone: 'Europe/Warsaw' } });
    // UTC 06:00 == 07:00 Warsaw → inside window
    expect(shouldSuppressToast('signup', prefs, utc(6, 0)).reason).toBe('quiet-hours');
    // UTC 09:00 == 10:00 Warsaw → outside
    expect(shouldSuppressToast('signup', prefs, utc(9, 0)).suppressed).toBe(false);
  });
});
