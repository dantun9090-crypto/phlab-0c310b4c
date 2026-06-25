/**
 * Bot detection for the Admin → Live Activity tab.
 *
 * Returns *why* a session was classified as a bot so the UI can render a
 * "hidden bot" badge with a tooltip explaining the reason. Supports
 * user-supplied allowlists (UA substrings + referrer domains) so the operator
 * can let their own tooling through the humans-only filter.
 */

export type BotReason =
  | 'no-ua'
  | 'ua-pattern'
  | 'force-hide-badge'
  | 'path-probe';

export interface BotDetectionOptions {
  /** Lowercased UA substrings that always pass as human (e.g. "phlabs-internal"). */
  allowlistUAs?: string[];
  /** Lowercased referrer hostnames whose sessions always pass as human. */
  allowlistReferrers?: string[];
  /**
   * Treat `?forceHideBadge=true` (Google Merchant trust-badge iframe probe) as
   * a bot even when "humans only" is OFF. Defaults to `false` so the toggle in
   * the UI controls the override explicitly.
   */
  treatForceHideBadgeAsBot?: boolean;
}

export interface SessionLike {
  userAgent?: string;
  path?: string;
  referrer?: string;
}

export const BOT_UA_RE =
  /bot|crawler|spider|crawling|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|outbrain|pinterest|developers\.google\.com\/\+\/web\/snippet|prerender|headlesschrome|phantomjs|puppeteer|playwright|lighthouse|chrome-lighthouse|gtmetrix|pingdom|uptimerobot|monitor|curl\/|wget\/|python-requests|httpclient|axios\/|node-fetch|go-http-client|java\/|okhttp|scrapy|ahrefsbot|semrushbot|mj12bot|dotbot|petalbot|yandex|baiduspider|duckduckbot|applebot|amazonbot|gptbot|chatgpt|claudebot|anthropic|perplexity|ccbot|google-extended|googleother|adsbot/i;

const FORCE_HIDE_BADGE_RE = /(^|[?&])forceHideBadge(=|&|$)/i;
const OTHER_PROBE_RE =
  /(^|[?&])(__prerender|_escaped_fragment_|lighthouse|audit|ping|healthcheck)(=|&|$)/i;

function hostFromReferrer(ref?: string): string | null {
  if (!ref) return null;
  try {
    return new URL(ref).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Returns the list of reasons this session looks like a bot. Empty list means
 * "human". The order is stable so the UI can show the primary reason first.
 */
export function detectBotReasons(
  s: SessionLike,
  opts: BotDetectionOptions = {},
): BotReason[] {
  // Allowlist short-circuits everything (operator override).
  const uaLower = (s.userAgent || '').toLowerCase();
  if (opts.allowlistUAs?.some(token => token && uaLower.includes(token.toLowerCase()))) {
    return [];
  }
  const host = hostFromReferrer(s.referrer);
  if (host && opts.allowlistReferrers?.some(d => d && host === d.toLowerCase())) {
    return [];
  }

  const reasons: BotReason[] = [];
  const path = s.path || '';

  if (FORCE_HIDE_BADGE_RE.test(path)) {
    // Honour the toggle: when forceHideBadge sessions should NOT be treated as
    // bots, skip this signal. Other heuristics still apply.
    if (opts.treatForceHideBadgeAsBot !== false) {
      reasons.push('force-hide-badge');
    }
  }
  if (OTHER_PROBE_RE.test(path)) reasons.push('path-probe');

  if (!s.userAgent) reasons.push('no-ua');
  else if (BOT_UA_RE.test(s.userAgent)) reasons.push('ua-pattern');

  return reasons;
}

export function isBotSession(
  s: SessionLike,
  opts: BotDetectionOptions = {},
): boolean {
  return detectBotReasons(s, opts).length > 0;
}

export const BOT_REASON_LABELS: Record<BotReason, string> = {
  'no-ua': 'Missing User-Agent (likely automated probe)',
  'ua-pattern': 'User-Agent matches a bot / crawler / headless pattern',
  'force-hide-badge': 'forceHideBadge=true (Google Merchant trust-badge iframe)',
  'path-probe': 'Path/query indicates a synthetic probe (prerender, audit, healthcheck)',
};
