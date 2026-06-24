/**
 * JSON-schema-style validator for `event=cache-invalidate` log lines emitted
 * by `cache-invalidation.ts`.
 *
 * Every log line MUST carry the diagnostic fields a human/CI needs to trace
 * a refresh loop end-to-end: `requestId` (or upstream label for retry rows),
 * `idempotencyKey` (the cache key), `attempt`, and `stage`. This module is
 * the single source of truth for those required fields so the unit tests
 * (and `logInvalidate` itself when `CACHE_LOG_VALIDATE=1`) can fail loudly
 * on drift.
 */

export type CacheInvalidateStage =
  | 'start'
  | 'dedupe'
  | 'complete'
  | 'retry'
  | 'retry-final';

/** Fields required on EVERY emitted log line, regardless of stage. */
const BASE_REQUIRED = ['event', 'ts', 'stage', 'attempt'] as const;

/** Per-stage required fields, in addition to BASE_REQUIRED. */
const STAGE_REQUIRED: Record<CacheInvalidateStage, readonly string[]> = {
  start: ['requestId', 'idempotencyKey', 'reason', 'urlCount'],
  dedupe: ['requestId', 'idempotencyKey', 'reason', 'ageMs'],
  complete: [
    'requestId',
    'idempotencyKey',
    'reason',
    'durationMs',
    'cloudflare',
    'prerenderDesktop',
    'prerenderMobile',
  ],
  retry: ['upstream', 'status', 'nextDelayMs'],
  'retry-final': ['upstream', 'ok', 'status'],
};

export type CacheInvalidateLogEntry = {
  event?: unknown;
  ts?: unknown;
  stage?: unknown;
  attempt?: unknown;
  [k: string]: unknown;
};

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const REQUEST_ID = /^[0-9a-f]{16}$/;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

export function validateInvalidationLog(
  entry: CacheInvalidateLogEntry,
): ValidationResult {
  const errors: string[] = [];

  if (entry.event !== 'cache-invalidate') errors.push('event must be "cache-invalidate"');
  if (!isNonEmptyString(entry.ts) || !ISO_TS.test(entry.ts)) errors.push('ts must be ISO-8601 timestamp');
  if (!isNonEmptyString(entry.stage)) errors.push('stage must be a non-empty string');
  if (!isFiniteNumber(entry.attempt) || entry.attempt < 1) errors.push('attempt must be a positive number');

  const stage = entry.stage as CacheInvalidateStage;
  const stageRequired = STAGE_REQUIRED[stage];
  if (!stageRequired) {
    errors.push(`unknown stage "${String(entry.stage)}"`);
    return errors.length ? { ok: false, errors } : { ok: true };
  }

  for (const field of stageRequired) {
    if (!(field in entry) || entry[field] === undefined || entry[field] === null) {
      errors.push(`missing required field "${field}" for stage="${stage}"`);
    }
  }

  // Field-level shape checks for high-signal fields.
  if ('requestId' in entry && entry.requestId !== undefined) {
    if (!isNonEmptyString(entry.requestId) || !REQUEST_ID.test(entry.requestId)) {
      errors.push('requestId must be 16-char lowercase hex');
    }
  }
  if ('idempotencyKey' in entry && entry.idempotencyKey !== undefined) {
    if (!isNonEmptyString(entry.idempotencyKey)) errors.push('idempotencyKey must be a non-empty string');
  }
  if ('upstream' in entry && entry.upstream !== undefined) {
    if (!isNonEmptyString(entry.upstream)) errors.push('upstream must be a non-empty string');
  }
  if ('status' in entry && entry.status !== undefined) {
    if (!isFiniteNumber(entry.status)) errors.push('status must be numeric');
  }
  if ('nextDelayMs' in entry && entry.nextDelayMs !== undefined) {
    if (!isFiniteNumber(entry.nextDelayMs) || entry.nextDelayMs < 0) {
      errors.push('nextDelayMs must be a non-negative number');
    }
  }
  if ('durationMs' in entry && entry.durationMs !== undefined) {
    if (!isFiniteNumber(entry.durationMs) || entry.durationMs < 0) {
      errors.push('durationMs must be a non-negative number');
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

/** Convenience helper for tests / CI: throws an aggregated error on failure. */
export function assertValidInvalidationLog(entry: CacheInvalidateLogEntry): void {
  const r = validateInvalidationLog(entry);
  if (!r.ok) {
    throw new Error(
      `Invalid cache-invalidate log entry: ${r.errors.join('; ')}\n` +
        `entry=${JSON.stringify(entry)}`,
    );
  }
}

export const __schemaInternals = { BASE_REQUIRED, STAGE_REQUIRED };
