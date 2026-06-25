// Quiet-hours helpers shared between LiveActivity UI and tests.
// Supports same-day windows (e.g. 09:00→17:00) and overnight windows
// (e.g. 22:00→08:00), evaluated against an optional IANA timezone.

export interface QuietHours {
  enabled: boolean;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  timezone?: string; // IANA, e.g. "Europe/London". Defaults to local.
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Returns minutes-since-midnight for `date` in the given IANA timezone. */
export function minutesInTz(date: Date, timezone?: string): number {
  if (!timezone) return date.getHours() * 60 + date.getMinutes();
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(date);
    const h = Number(parts.find(p => p.type === 'hour')?.value ?? '0');
    const m = Number(parts.find(p => p.type === 'minute')?.value ?? '0');
    // Some locales render 24 for midnight; normalize.
    return ((h % 24) * 60 + m) | 0;
  } catch {
    return date.getHours() * 60 + date.getMinutes();
  }
}

/** Returns true if `now` falls inside the [start, end) quiet window. */
export function isQuietNow(
  start: string,
  end: string,
  now: Date = new Date(),
  timezone?: string,
): boolean {
  const cur = minutesInTz(now, timezone);
  const s = toMin(start);
  const e = toMin(end);
  if (s === e) return false;
  if (s < e) return cur >= s && cur < e;            // same-day window
  return cur >= s || cur < e;                       // overnight window
}

/** True when the toast `kind` should be suppressed under the given quiet hours. */
export function shouldSuppressToast(
  kind: 'signup' | 'visitor',
  prefs: {
    notifySignups: boolean;
    notifyFirstSeen: boolean;
    quiet: QuietHours;
  },
  now: Date = new Date(),
): { suppressed: boolean; reason: 'pref-off' | 'quiet-hours' | null } {
  if (kind === 'signup' && !prefs.notifySignups) return { suppressed: true, reason: 'pref-off' };
  if (kind === 'visitor' && !prefs.notifyFirstSeen) return { suppressed: true, reason: 'pref-off' };
  if (prefs.quiet.enabled && isQuietNow(prefs.quiet.start, prefs.quiet.end, now, prefs.quiet.timezone)) {
    return { suppressed: true, reason: 'quiet-hours' };
  }
  return { suppressed: false, reason: null };
}

/** Curated list of common IANA timezones for the selector. */
export const COMMON_TIMEZONES: string[] = [
  'UTC',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Warsaw',
  'Europe/Athens',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
  'Pacific/Auckland',
];

export function detectLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
