/**
 * Cart / Checkout telemetry.
 *
 * Captures state drift and localStorage write failures across the cart flow:
 *  - Header in-memory cart vs persisted `php_cart` mismatches
 *  - localStorage write errors (quota exceeded, private mode, Safari ITP)
 *  - JSON parse failures on hydration
 *  - dispatchAddToCart write failures
 *  - Checkout load drift (header badge says N items, checkout sees 0)
 *
 * Console: always — every event prints with `[cart-event] <type>` shape.
 * Firestore: critical events written to `cart_events` (fire-and-forget,
 * throttled to 1 per (type+key) per 60s to avoid quota abuse from loops).
 *
 * Mirrors `src/lib/auth-events.ts` patterns — locked schema in firestore.rules.
 */

import { db } from '@/lib/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

export type CartEventType =
  | 'storage_write_failure'      // localStorage.setItem threw (quota / disabled)
  | 'storage_read_failure'       // JSON.parse threw on hydration
  | 'storage_quota_exceeded'     // specific quota error
  | 'add_to_cart_failure'        // dispatchAddToCart write threw
  | 'state_mismatch'             // in-memory cart vs localStorage divergence
  | 'hydration_drift'            // header count > 0 but checkout read empty
  | 'cart_cleared_unexpectedly'  // post-hydration save wrote [] over non-empty
  | 'unknown_error';

export interface CartEventInput {
  type: CartEventType;
  /** Short tag for grouping in throttle map (e.g. error name or route). */
  key?: string | null;
  /** Item count in in-memory cart (header). */
  memoryCount?: number | null;
  /** Item count in localStorage `php_cart`. */
  storedCount?: number | null;
  /** Where the event was triggered (route). */
  source?: string | null;
  /** Error code / name when applicable. */
  code?: string | null;
  /** Short non-sensitive human message. */
  message?: string | null;
  /** Optional structured extras (kept small). */
  extra?: Record<string, unknown> | null;
  /** Skip Firestore write — for high-frequency diagnostic events. */
  consoleOnly?: boolean;
}

const ALLOWED_TYPES: ReadonlySet<CartEventType> = new Set<CartEventType>([
  'storage_write_failure',
  'storage_read_failure',
  'storage_quota_exceeded',
  'add_to_cart_failure',
  'state_mismatch',
  'hydration_drift',
  'cart_cleared_unexpectedly',
  'unknown_error',
]);

function safe(str: string | null | undefined, max: number): string | null {
  if (str === null || str === undefined) return null;
  const trimmed = String(str).slice(0, max);
  return trimmed.replace(/[\r\n\t\u0000-\u001F]+/g, ' ').trim() || null;
}

function pickPath(): string | null {
  if (typeof window === 'undefined') return null;
  return safe(window.location.pathname + window.location.search, 200);
}

function pickUA(): string | null {
  if (typeof navigator === 'undefined') return null;
  return safe(navigator.userAgent, 300);
}

// Throttle map — prevents a loop from spamming Firestore writes.
const lastSent = new Map<string, number>();
const THROTTLE_MS = 60_000;

function shouldSend(type: CartEventType, key?: string | null): boolean {
  const bucket = `${type}::${key || ''}`;
  const now = Date.now();
  const prev = lastSent.get(bucket) || 0;
  if (now - prev < THROTTLE_MS) return false;
  lastSent.set(bucket, now);
  return true;
}

/** Fire-and-forget. Never throws, never blocks the caller. */
export function logCartEvent(input: CartEventInput): void {
  try {
    if (!ALLOWED_TYPES.has(input.type)) return;

    const payload = {
      type: input.type,
      memoryCount: typeof input.memoryCount === 'number' ? input.memoryCount : null,
      storedCount: typeof input.storedCount === 'number' ? input.storedCount : null,
      source: safe(input.source ?? pickPath(), 200),
      code: safe(input.code ?? null, 100),
      message: safe(input.message ?? null, 300),
      key: safe(input.key ?? null, 100),
      userAgent: pickUA(),
      // Stringify and trim extras to keep doc small
      extra: input.extra
        ? safe(JSON.stringify(input.extra).slice(0, 500), 500)
        : null,
      createdAt: serverTimestamp(),
    };

    const isFailure =
      input.type.endsWith('_failure') ||
      input.type === 'state_mismatch' ||
      input.type === 'hydration_drift' ||
      input.type === 'cart_cleared_unexpectedly' ||
      input.type === 'storage_quota_exceeded';

    // eslint-disable-next-line no-console
    console[isFailure ? 'warn' : 'log'](
      `[cart-event] ${payload.type}`,
      {
        memoryCount: payload.memoryCount,
        storedCount: payload.storedCount,
        code: payload.code,
        message: payload.message,
        source: payload.source,
        key: payload.key,
        extra: payload.extra,
        ts: new Date().toISOString(),
      },
    );

    if (input.consoleOnly) return;
    if (!shouldSend(input.type, input.key)) return;

    addDoc(collection(db, 'cart_events'), payload).catch((e) => {
      // eslint-disable-next-line no-console
      console.warn('[cart-event] Firestore write failed', (e as { code?: string; message?: string })?.code || (e as { message?: string })?.message || e);
    });
  } catch (e) {
    // Telemetry must NEVER break the cart flow
    // eslint-disable-next-line no-console
    console.warn('[cart-event] logger crashed', e);
  }
}

/**
 * Safe localStorage setItem that auto-logs quota / write errors.
 * Returns true on success.
 */
export function safeCartWrite(key: string, value: string, source?: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    const err = e as { name?: string; message?: string };
    const isQuota =
      err?.name === 'QuotaExceededError' ||
      /quota/i.test(err?.message || '');
    logCartEvent({
      type: isQuota ? 'storage_quota_exceeded' : 'storage_write_failure',
      key,
      code: err?.name || 'unknown',
      message: err?.message || 'localStorage.setItem failed',
      source,
      extra: { byteLength: value?.length ?? 0 },
    });
    return false;
  }
}

/**
 * Safe localStorage JSON read with parse-error telemetry.
 * Returns `fallback` on any failure.
 */
export function safeCartRead<T>(key: string, fallback: T, source?: string): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (e) {
    const err = e as { name?: string; message?: string };
    logCartEvent({
      type: 'storage_read_failure',
      key,
      code: err?.name || 'parse_error',
      message: err?.message || 'localStorage read/parse failed',
      source,
    });
    return fallback;
  }
}
