/**
 * Tolerant date coercion for Firestore values.
 *
 * Order/customer docs in the wild carry `orderDate` in several shapes:
 * Firestore `Timestamp`, plain `{ seconds }` / `{ _seconds }` objects (from
 * JSON round-trips), native `Date`, ISO strings, or epoch millis. Calling
 * `.toDate()` blindly crashes the admin panel, so always go through this.
 */
export function toDateSafe(value: unknown): Date | null {
  if (!value) return null;
  try {
    const v = value as {
      toDate?: () => Date;
      seconds?: number;
      _seconds?: number;
      nanoseconds?: number;
      _nanoseconds?: number;
    };
    if (typeof v.toDate === 'function') {
      const d = v.toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    }
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value === 'number') {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === 'string') {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }
    const secs = typeof v.seconds === 'number' ? v.seconds : v._seconds;
    if (typeof secs === 'number') {
      const nanos = (typeof v.nanoseconds === 'number' ? v.nanoseconds : v._nanoseconds) || 0;
      const d = new Date(secs * 1000 + Math.round(nanos / 1e6));
      return isNaN(d.getTime()) ? null : d;
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Epoch millis, or 0 when the value can't be interpreted as a date. */
export function toMillisSafe(value: unknown): number {
  return toDateSafe(value)?.getTime() ?? 0;
}
