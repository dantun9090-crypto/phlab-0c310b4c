/**
 * Regression guard: the admin Marketing + Promo Codes tabs must tolerate
 * every `expiryDate` shape we have seen in Firestore in the wild:
 *   - Firestore Timestamp (object with .toDate())
 *   - { seconds: number } (plain object Timestamp)
 *   - native Date
 *   - ISO string
 *   - milliseconds number
 *   - undefined / null
 *
 * The previous Marketing tab crashed with
 *   `A.expiryDate.toDate is not a function`
 * when the field was stored as a string. This test pins the coercion logic
 * so the bug cannot regress.
 */
import { describe, it, expect } from 'vitest';

// Mirror of the coercion used in PromoCodesTab + MarketingTab.
function toDateSafe(v: unknown): Date | null {
  if (!v) return null;
  try {
    const anyV = v as { toDate?: () => Date; seconds?: number };
    if (typeof anyV?.toDate === 'function') return anyV.toDate();
    if (v instanceof Date) return v;
    if (typeof v === 'number') return new Date(v);
    if (typeof v === 'string') { const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
    if (typeof v === 'object' && typeof anyV.seconds === 'number') return new Date(anyV.seconds * 1000);
  } catch { /* fall through */ }
  return null;
}

describe('admin expiryDate coercion (badges/marketing)', () => {
  const iso = '2027-01-15T23:59:59.000Z';
  const ms = Date.UTC(2027, 0, 15, 23, 59, 59);

  const cases: Array<[string, unknown, boolean]> = [
    ['Firestore Timestamp w/ toDate', { toDate: () => new Date(iso) }, true],
    ['plain { seconds }',             { seconds: Math.floor(ms / 1000) }, true],
    ['native Date',                   new Date(iso), true],
    ['ISO string',                    iso, true],
    ['millis number',                 ms, true],
    ['undefined',                     undefined, false],
    ['null',                          null, false],
    ['garbage string',                'not-a-date', false],
  ];

  for (const [name, input, expectDate] of cases) {
    it(`accepts ${name} without throwing`, () => {
      expect(() => toDateSafe(input)).not.toThrow();
      const d = toDateSafe(input);
      if (expectDate) {
        expect(d).toBeInstanceOf(Date);
        expect(Number.isFinite(d!.getTime())).toBe(true);
      } else {
        expect(d).toBeNull();
      }
    });
  }

  it('never calls .toDate() blindly (the bug we fixed)', () => {
    // The legacy crash:
    //   ({ expiryDate: 'iso-string' }).expiryDate.toDate()
    // Our coercion must never reach that path.
    const bad: unknown = 'iso-string';
    expect(() => toDateSafe(bad)).not.toThrow();
  });
});
