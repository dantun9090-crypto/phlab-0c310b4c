/**
 * Central PII redaction + safe logging for server code.
 *
 * All server logs go through `safeLog(stage, code, data)`. Callers cannot
 * bypass redaction because raw payloads never reach console.* directly.
 */

const REDACTED = '[REDACTED]';
const MAX_STRING_LEN = 500;
const MAX_DEPTH = 5;

// Keys whose values are ALWAYS redacted (case-insensitive substring match).
const PII_KEY_PATTERNS = [
  'email',
  'phone',
  'tel',
  'mobile',
  'postcode',
  'postal',
  'zip',
  'surname',
  'lastname',
  'last_name',
  'firstname',
  'first_name',
  'address',
  'street',
  'city',
  'name',
];

// Non-PII keys that happen to contain PII substrings — never redact these.
const KEY_ALLOWLIST = new Set([
  'filename',
  'file_name',
  'hostname',
  'host_name',
  'pathname',
  'path_name',
  'nickname',
  'nick_name',
  'username',
  'user_name',
  'classname',
  'class_name',
  'displayname',
  'display_name',
  'codename',
  'code_name',
  'basename',
  'base_name',
  'dirname',
  'dir_name',
]);

// Value-based PII patterns (applied to ALL strings, incl. stack traces).
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// UK postcode (broad match) — e.g. "SW1A 1AA", "M11AA".
const UK_POSTCODE_RE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi;
// Phone-like digit run: 9+ consecutive digits, or "+" plus 8+ digits, allowing
// spaces / dashes between groups. Kept conservative to avoid nuking IDs.
const PHONE_RE = /(?:\+\d[\d\s\-]{7,}\d)|(?:\b\d[\d\s\-]{8,}\d\b)/g;

export function isPiiKey(key: string): boolean {
  const k = key.toLowerCase();
  if (KEY_ALLOWLIST.has(k)) return false;
  return PII_KEY_PATTERNS.some((p) => k.includes(p));
}

export function redactStringValue(s: string): string {
  let out = s
    .replace(EMAIL_RE, REDACTED)
    .replace(UK_POSTCODE_RE, REDACTED)
    .replace(PHONE_RE, REDACTED);
  if (out.length > MAX_STRING_LEN) out = out.slice(0, MAX_STRING_LEN) + '…[truncated]';
  return out;
}

function serializeError(err: Error, depth: number, seen: WeakSet<object>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: err.name,
    message: err.message,
    stack: err.stack,
  };
  const anyErr = err as unknown as Record<string, unknown>;
  for (const k of ['code', 'status', 'details'] as const) {
    if (anyErr[k] !== undefined) out[k] = anyErr[k];
  }
  const cause = (err as { cause?: unknown }).cause;
  if (cause !== undefined) out.cause = cause;
  const aggregateErrors = (err as unknown as { errors?: unknown }).errors;
  if (Array.isArray(aggregateErrors)) out.errors = aggregateErrors;
  return redactDeep(out, depth + 1, seen) as Record<string, unknown>;
}

function redactDeep(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > MAX_DEPTH) return '[depth-limit]';
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') return redactStringValue(value);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value;
  }
  if (value instanceof Error) return serializeError(value, depth, seen);

  if (Array.isArray(value)) {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    return value.map((v) => redactDeep(v, depth + 1, seen));
  }

  if (typeof value === 'object') {
    if (seen.has(value as object)) return '[circular]';
    seen.add(value as object);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isPiiKey(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = redactDeep(v, depth + 1, seen);
      }
    }
    return out;
  }

  // functions, symbols, etc.
  return `[${typeof value}]`;
}

export function redact<T = unknown>(value: T): unknown {
  return redactDeep(value, 0, new WeakSet());
}

export interface SafeLogBase {
  stage: string;
  code?: string;
  requestId?: string;
  route?: string;
  durationMs?: number;
  level?: 'debug' | 'info' | 'warn' | 'error';
  error?: unknown;
  [k: string]: unknown;
}

/**
 * The single entry point for server logs. Always redacts. Callers must never
 * console.log payloads directly — use this.
 */
export function safeLog(data: SafeLogBase): void {
  const level = data.level ?? (data.error ? 'error' : 'info');
  const line = redact({
    ts: new Date().toISOString(),
    level,
    ...data,
  }) as Record<string, unknown>;
  let serialized: string;
  try {
    serialized = JSON.stringify(line);
  } catch {
    serialized = JSON.stringify({ ts: new Date().toISOString(), level, stage: data.stage, code: data.code, unserializable: true });
  }
  const sink =
    level === 'error' ? console.error :
    level === 'warn' ? console.warn :
    level === 'debug' ? console.debug :
    console.log;
  sink(serialized);
}

// Standardized error codes for /api/public/live-orders (and reusable).
export const LogCode = {
  FIRESTORE_QUERY_FAILED: 'FIRESTORE_QUERY_FAILED',
  FIRESTORE_QUERY_FALLBACK_FAILED: 'FIRESTORE_QUERY_FALLBACK_FAILED',
  FIRESTORE_TIMEOUT: 'FIRESTORE_TIMEOUT',
  MAPPING_FAILED: 'MAPPING_FAILED',
  EMPTY_RESULT: 'EMPTY_RESULT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  OK: 'OK',
  CACHE_HIT: 'CACHE_HIT',
} as const;
export type LogCodeValue = typeof LogCode[keyof typeof LogCode];

export class CodedError extends Error {
  code: LogCodeValue;
  constructor(code: LogCodeValue, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CodedError';
    this.code = code;
  }
}

const REQUEST_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

export function sanitizeRequestId(raw: string | null | undefined): string {
  if (raw && REQUEST_ID_RE.test(raw)) return raw;
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => Error,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(onTimeout()), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
