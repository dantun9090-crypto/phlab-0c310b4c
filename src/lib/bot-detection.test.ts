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

describe('validation: allowlist entries', () => {
  it('validateUaPattern rejects empty / too short / commas', () => {
    expect(validateUaPattern('').ok).toBe(false);
    expect(validateUaPattern('a').ok).toBe(false);
    expect(validateUaPattern('foo,bar').ok).toBe(false);
    expect(validateUaPattern('phlabs-internal').ok).toBe(true);
  });
  it('validateReferrerHost requires a hostname (no scheme/path)', () => {
    expect(validateReferrerHost('https://ops.phlabs.co.uk/').ok).toBe(false);
    expect(validateReferrerHost('ops.phlabs.co.uk/dashboard').ok).toBe(false);
    expect(validateReferrerHost('not_a_host').ok).toBe(false);
    expect(validateReferrerHost('ops.phlabs.co.uk').ok).toBe(true);
    expect(validateReferrerHost('OPS.PHLABS.CO.UK').value).toBe('ops.phlabs.co.uk');
  });
  it('parseAndValidateList splits, dedups and reports errors', () => {
    const { valid, errors } = parseAndValidateList(
      'phlabs-internal, , a, my-qa-bot, my-qa-bot',
      'ua',
    );
    expect(valid).toEqual(['phlabs-internal', 'my-qa-bot']);
    expect(errors.map(e => e.entry)).toContain('a');
  });
});

describe('e2e: forceHideBadge — toast pipeline + counters', () => {
  // Minimal simulation of the LiveActivityTab pipeline: detection → toast
  // suppression → "Online now" counter. Mirrors the real component logic.
  type Sess = SessionLike & { id: string };
  type Prefs = { hideBots: boolean; treatForceHideBadgeAsBot: boolean };

  function runPipeline(sessions: Sess[], prefs: Prefs) {
    const toasts: string[] = [];
    const suppressed: { id: string; reasons: string[] }[] = [];
    for (const s of sessions) {
      const reasons = detectBotReasons(s, {
        treatForceHideBadgeAsBot: prefs.treatForceHideBadgeAsBot,
      });
      const hitsForceHide = reasons.includes('force-hide-badge');
      const isBot = reasons.length > 0;
      if ((prefs.treatForceHideBadgeAsBot && hitsForceHide) || (prefs.hideBots && isBot)) {
        suppressed.push({ id: s.id, reasons });
        continue;
      }
      toasts.push(s.id);
    }
    const visible = sessions.filter(
      s => detectBotReasons(s, {
        treatForceHideBadgeAsBot: prefs.treatForceHideBadgeAsBot,
      }).length === 0 || !prefs.hideBots,
    );
    return { toasts, suppressed, onlineNow: visible.length };
  }

  const human: Sess = { id: 'h1', userAgent: CHROME_UA, path: '/' };
  const fhb: Sess = { id: 'fhb', userAgent: CHROME_UA, path: '/?forceHideBadge=true' };

  it('humans-only ON + forceHideBadge=bot ON → fhb suppressed + counter excludes it', () => {
    const r = runPipeline([human, fhb], { hideBots: true, treatForceHideBadgeAsBot: true });
    expect(r.toasts).toEqual(['h1']);
    expect(r.suppressed.map(s => s.id)).toEqual(['fhb']);
    expect(r.suppressed[0].reasons).toContain('force-hide-badge');
    expect(r.onlineNow).toBe(1);
  });

  it('humans-only OFF + forceHideBadge=bot ON → fhb still suppressed from toast, counter shows it', () => {
    const r = runPipeline([human, fhb], { hideBots: false, treatForceHideBadgeAsBot: true });
    expect(r.toasts).toEqual(['h1']);
    expect(r.suppressed.map(s => s.id)).toEqual(['fhb']);
    // Counter is bound to hideBots only.
    expect(r.onlineNow).toBe(2);
  });

  it('humans-only OFF + forceHideBadge=bot OFF → fhb fully visible (toast + counter)', () => {
    const r = runPipeline([human, fhb], { hideBots: false, treatForceHideBadgeAsBot: false });
    expect(r.toasts).toEqual(['h1', 'fhb']);
    expect(r.suppressed).toEqual([]);
    expect(r.onlineNow).toBe(2);
  });

  it('humans-only ON + forceHideBadge=bot OFF → fhb still passes (no other bot signals)', () => {
    const r = runPipeline([human, fhb], { hideBots: true, treatForceHideBadgeAsBot: false });
    // With the toggle off, forceHideBadge is no longer a bot reason, and the
    // remaining UA is plain Chrome — so the session is human and toasts fire.
    expect(r.toasts).toEqual(['h1', 'fhb']);
    expect(r.onlineNow).toBe(2);
  });
});
