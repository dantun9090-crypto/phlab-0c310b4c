/**
 * Tide payment reference helpers.
 *
 * Tide payments are made on a hosted page before we know the order id, so the
 * reference the customer must type into the bank reference field is reserved on
 * the client *before* the order is placed, shown in the Tide panel, and then
 * sent to `createOrder` so the stored order carries the exact same reference.
 *
 * Format: `INV-<year>-<8 chars A-Z0-9>` — same shape as the manual bank
 * transfer reference so admin/invoice tooling needs no changes.
 */

export const TIDE_REFERENCE_PATTERN = /^INV-\d{4}-[A-Z0-9]{6,12}$/;

const STORAGE_KEY = 'phl_tide_ref';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no easily confused chars

/** Create a fresh reserved Tide reference. */
export function makeTideReference(date: Date = new Date()): string {
  const bytes = new Uint8Array(8);
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let token = '';
  for (const b of bytes) token += ALPHABET[b % ALPHABET.length];
  return `INV-${date.getFullYear()}-${token}`;
}

/**
 * Stable-per-session reference so the number shown in the QR panel does not
 * change while the customer switches tabs or scans with their phone.
 */
export function getOrCreateTideReference(): string {
  if (typeof window === 'undefined') return makeTideReference();
  try {
    const existing = window.sessionStorage.getItem(STORAGE_KEY);
    if (existing && TIDE_REFERENCE_PATTERN.test(existing)) return existing;
    const next = makeTideReference();
    window.sessionStorage.setItem(STORAGE_KEY, next);
    return next;
  } catch {
    return makeTideReference();
  }
}

/** Drop the reserved reference once the order has been placed. */
export function clearTideReference(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
