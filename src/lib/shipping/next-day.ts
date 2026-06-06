/**
 * Next Day by 12 PM shipping logic — shared by client UI (Checkout,
 * ProductDetail countdown) and server (order creation, email templates).
 *
 * - UK timezone aware (GMT/BST auto-switch via Intl.DateTimeFormat).
 * - Bank-holiday aware (hardcoded UK England & Wales list, 2026 + 2027).
 * - Pure functions, no Firestore reads — safe to import anywhere.
 */

export const SHIPPING_CONFIG = {
  cutoffHour: 11,
  cutoffMinute: 30,
  nextDayPrice: 7.99,
  standardPrice: 3.99,
  freeThreshold: 50,
} as const;

// England & Wales bank holidays. Keep extending yearly.
const UK_BANK_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2026
  '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04',
  '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28',
  // 2027
  '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03',
  '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28',
]);

export function isBankHoliday(d: Date): boolean {
  return UK_BANK_HOLIDAYS.has(toLondonDateKey(d));
}

/** Returns YYYY-MM-DD in Europe/London for the given instant. */
export function toLondonDateKey(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** {weekday 0-6 (Sun=0), hour 0-23, minute 0-59} in Europe/London. */
export function getLondonParts(d: Date): { weekday: number; hour: number; minute: number; dateKey: string } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const wd = parts.find(p => p.type === 'weekday')?.value ?? 'Mon';
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10) % 24;
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  return { weekday: map[wd] ?? 1, hour, minute, dateKey: toLondonDateKey(d) };
}

function isWorkingDay(d: Date): boolean {
  const { weekday } = getLondonParts(d);
  if (weekday === 0 || weekday === 6) return false;
  return !isBankHoliday(d);
}

/** Next working day strictly after `from`. */
function nextWorkingDay(from: Date): Date {
  const d = new Date(from.getTime());
  for (let i = 0; i < 14; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isWorkingDay(d)) return d;
  }
  return d;
}

export interface NextDayEligibility {
  qualifies: boolean;
  /** Minutes until 11:30 today in London; negative if cut-off passed. */
  minutesUntilCutoff: number;
  /** Reason when !qualifies. */
  reason?: 'past_cutoff' | 'weekend' | 'bank_holiday' | 'next_day_bank_holiday';
  /** Expected delivery date (YYYY-MM-DD, Europe/London) if qualifies. */
  expectedDeliveryDate?: string;
}

export function checkNextDayEligibility(now: Date = new Date()): NextDayEligibility {
  const { weekday, hour, minute } = getLondonParts(now);
  const minutesNow = hour * 60 + minute;
  const cutoffMinutes = SHIPPING_CONFIG.cutoffHour * 60 + SHIPPING_CONFIG.cutoffMinute;
  const minutesUntilCutoff = cutoffMinutes - minutesNow;

  if (weekday === 0 || weekday === 6) {
    return { qualifies: false, minutesUntilCutoff, reason: 'weekend' };
  }
  if (isBankHoliday(now)) {
    return { qualifies: false, minutesUntilCutoff, reason: 'bank_holiday' };
  }
  if (minutesUntilCutoff <= 0) {
    return { qualifies: false, minutesUntilCutoff, reason: 'past_cutoff' };
  }
  // Next-day delivery target = tomorrow. If tomorrow is non-working, can't promise next-day-by-12.
  const tomorrow = nextWorkingDay(now);
  // Verify "tomorrow" is calendar-next-day (not skipped over a weekend/holiday).
  const expectedKey = toLondonDateKey(tomorrow);
  const todayKey = toLondonDateKey(now);
  const dayMs = 24 * 60 * 60 * 1000;
  if (toLondonDateKey(new Date(now.getTime() + dayMs)) !== expectedKey) {
    return { qualifies: false, minutesUntilCutoff, reason: 'next_day_bank_holiday' };
  }
  if (expectedKey === todayKey) {
    return { qualifies: false, minutesUntilCutoff, reason: 'past_cutoff' };
  }
  return { qualifies: true, minutesUntilCutoff, expectedDeliveryDate: expectedKey };
}

/** Standard 1–3 working-day dispatch window, anchored on next working day. */
export function getStandardDeliveryWindow(now: Date = new Date()): { from: string; to: string } {
  const dispatchDay = isWorkingDay(now) ? now : nextWorkingDay(now);
  // Dispatched within 1-3 working days; arrival shortly after.
  let from = nextWorkingDay(dispatchDay);
  let to = from;
  for (let i = 0; i < 2; i++) to = nextWorkingDay(to);
  return { from: toLondonDateKey(from), to: toLondonDateKey(to) };
}

/** Cut-off Date instant (today 11:30 Europe/London) — used to stamp orders. */
export function getCutoffInstant(now: Date = new Date()): Date {
  const { hour, minute } = getLondonParts(now);
  const diffMin = (SHIPPING_CONFIG.cutoffHour * 60 + SHIPPING_CONFIG.cutoffMinute) - (hour * 60 + minute);
  return new Date(now.getTime() + diffMin * 60 * 1000);
}

export function formatMinutesAsHHMM(mins: number): string {
  const m = Math.max(0, Math.floor(mins));
  const hh = Math.floor(m / 60).toString().padStart(2, '0');
  const mm = (m % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

export function formatLondonDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(dt);
}
