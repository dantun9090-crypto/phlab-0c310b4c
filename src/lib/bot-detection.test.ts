import { describe, it, expect } from 'vitest';
import {
  detectBotReasons,
  isBotSession,
  BOT_REASON_LABELS,
  validateUaPattern,
  validateReferrerHost,
  parseAndValidateList,
  type SessionLike,
} from './bot-detection';

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

describe('bot-detection: forceHideBadge classification', () => {
  it('classifies /?forceHideBadge=true as a bot by default', () => {
    const s: SessionLike = { userAgent: CHROME_UA, path: '/?forceHideBadge=true' };
    const reasons = detectBotReasons(s);
    expect(reasons).toContain('force-hide-badge');
    expect(isBotSession(s)).toBe(true);
  });

  it('still classifies forceHideBadge when path has additional params', () => {
    const cases = [
      '/?forceHideBadge=true',
      '/?foo=1&forceHideBadge=true',
      '/?forceHideBadge=true&utm_source=x',
      '/products?forceHideBadge=true',
    ];
    for (const path of cases) {
      expect(isBotSession({ userAgent: CHROME_UA, path })).toBe(true);
    }
  });

  it('is independent of humans-only — detection runs the same way regardless of UI filter', () => {
    // The "humans only" toggle lives in the UI and just gates which sessions
    // are shown. The detection result itself is stable.
    const s: SessionLike = { userAgent: CHROME_UA, path: '/?forceHideBadge=true' };
    const r1 = detectBotReasons(s);
    const r2 = detectBotReasons(s);
    expect(r1).toEqual(r2);
    expect(r1).toContain('force-hide-badge');
  });

  it('does NOT toast or count when humans-only is ON (simulated)', () => {
    // Simulates: const visible = sessions.filter(s => !isBotSession(s))
    const sessions: SessionLike[] = [
      { userAgent: CHROME_UA, path: '/' },
      { userAgent: CHROME_UA, path: '/?forceHideBadge=true' },
      { userAgent: CHROME_UA, path: '/products' },
    ];
    const humansOnly = sessions.filter(s => !isBotSession(s));
    expect(humansOnly).toHaveLength(2);
    expect(humansOnly.map(s => s.path)).toEqual(['/', '/products']);

    // Toast suppression: forceHideBadge session must be skipped
    const toasted = sessions.filter(s => !isBotSession(s));
    expect(toasted.find(s => s.path?.includes('forceHideBadge'))).toBeUndefined();
  });

  it('toggle: treatForceHideBadgeAsBot=false lets the session through (no force-hide-badge reason)', () => {
    const s: SessionLike = { userAgent: CHROME_UA, path: '/?forceHideBadge=true' };
    const reasons = detectBotReasons(s, { treatForceHideBadgeAsBot: false });
    expect(reasons).not.toContain('force-hide-badge');
    expect(isBotSession(s, { treatForceHideBadgeAsBot: false })).toBe(false);
  });

  it('toggle off still flags forceHideBadge if UA is also a bot', () => {
    const s: SessionLike = {
      userAgent: 'Googlebot/2.1',
      path: '/?forceHideBadge=true',
    };
    const reasons = detectBotReasons(s, { treatForceHideBadgeAsBot: false });
    expect(reasons).toContain('ua-pattern');
    expect(isBotSession(s, { treatForceHideBadgeAsBot: false })).toBe(true);
  });
});

describe('bot-detection: allowlists for operator tools', () => {
  it('allowlistUAs lets internal tools through despite Playwright/headless UA', () => {
    const ua = 'Mozilla/5.0 HeadlessChrome/126.0 phlabs-internal-monitor/1.0';
    expect(isBotSession({ userAgent: ua, path: '/' })).toBe(true);
    expect(
      isBotSession({ userAgent: ua, path: '/' }, { allowlistUAs: ['phlabs-internal-monitor'] }),
    ).toBe(false);
  });

  it('allowlistUAs is case-insensitive', () => {
    const ua = 'curl/8.0 PHLabs-Ops';
    expect(
      isBotSession({ userAgent: ua, path: '/' }, { allowlistUAs: ['phlabs-ops'] }),
    ).toBe(false);
  });

  it('allowlistReferrers lets matching referrer through even on forceHideBadge', () => {
    const s: SessionLike = {
      userAgent: CHROME_UA,
      path: '/?forceHideBadge=true',
      referrer: 'https://ops.phlabs.co.uk/dashboard',
    };
    expect(isBotSession(s)).toBe(true);
    expect(
      isBotSession(s, { allowlistReferrers: ['ops.phlabs.co.uk'] }),
    ).toBe(false);
  });

  it('non-matching referrer does not allowlist', () => {
    const s: SessionLike = {
      userAgent: CHROME_UA,
      path: '/?forceHideBadge=true',
      referrer: 'https://evil.example/',
    };
    expect(
      isBotSession(s, { allowlistReferrers: ['ops.phlabs.co.uk'] }),
    ).toBe(true);
  });

  it('empty / malformed allowlist entries are ignored safely', () => {
    expect(
      isBotSession(
        { userAgent: 'Googlebot', path: '/' },
        { allowlistUAs: ['', undefined as any] },
      ),
    ).toBe(true);
  });
});

describe('bot-detection: other heuristics still work', () => {
  it('missing UA is treated as bot', () => {
    expect(detectBotReasons({ path: '/' })).toContain('no-ua');
  });
  it('Googlebot UA flagged', () => {
    expect(
      detectBotReasons({ userAgent: 'Googlebot/2.1', path: '/' }),
    ).toContain('ua-pattern');
  });
  it('regular Chrome on / is human', () => {
    expect(isBotSession({ userAgent: CHROME_UA, path: '/' })).toBe(false);
  });
  it('all reasons have human-readable labels', () => {
    for (const k of ['no-ua', 'ua-pattern', 'force-hide-badge', 'path-probe'] as const) {
      expect(BOT_REASON_LABELS[k]).toBeTruthy();
    }
  });
});
