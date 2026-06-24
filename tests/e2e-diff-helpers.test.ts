/**
 * Unit tests for scripts/lib/e2e-diff-helpers.mjs.
 *
 * Locks in deterministic diff behaviour for the stale-asset E2E reporter:
 *   - header normalization (case-insensitive, order-independent)
 *   - header ignore list (volatile headers never trigger mismatches)
 *   - sha256 body hashing (redaction preserves equality)
 *
 * These guarantees underpin --normalize-headers, --normalize-ignore-headers,
 * --redact-bodies, and --hash-bodies in scripts/e2e-stale-assets.mjs.
 */
import { describe, it, expect } from 'vitest';
import {
  sha256,
  normalizeHeadersForDiff,
  headersEqualNormalized,
  redactBody,
  DEFAULT_IGNORE_HEADERS,
} from '../scripts/lib/e2e-diff-helpers.mjs';

describe('normalizeHeadersForDiff', () => {
  it('lowercases keys and sorts them stably', () => {
    const a = { 'Content-Type': 'text/html', 'X-Build-Id': 'b1' };
    const out = normalizeHeadersForDiff(a, new Set());
    expect(Object.keys(out)).toEqual(['content-type', 'x-build-id']);
  });

  it('is order-independent when stringified', () => {
    const a = { 'Content-Type': 'text/html', 'X-Build-Id': 'b1' };
    const b = { 'x-build-id': 'b1', 'content-type': 'text/html' };
    expect(JSON.stringify(normalizeHeadersForDiff(a, new Set())))
      .toBe(JSON.stringify(normalizeHeadersForDiff(b, new Set())));
  });

  it('drops headers in the ignore set', () => {
    const a = { 'date': 'now', 'cf-ray': 'abc', 'content-type': 'text/html' };
    const out = normalizeHeadersForDiff(a);
    expect(out).toEqual({ 'content-type': 'text/html' });
  });

  it('returns the input unchanged for null/non-object', () => {
    expect(normalizeHeadersForDiff(null)).toBe(null);
    expect(normalizeHeadersForDiff(undefined)).toBe(undefined);
  });
});

describe('headersEqualNormalized', () => {
  it('treats case- and order-differing headers as equal', () => {
    const a = { 'Content-Type': 'text/html', 'X-Build-Id': 'b1' };
    const b = { 'x-build-id': 'b1', 'content-type': 'text/html' };
    expect(headersEqualNormalized(a, b, new Set())).toBe(true);
  });

  it('flags real value differences as not equal', () => {
    const a = { 'content-type': 'text/html' };
    const b = { 'content-type': 'application/json' };
    expect(headersEqualNormalized(a, b, new Set())).toBe(false);
  });

  it('ignores volatile headers from the default ignore list', () => {
    const a = { 'content-type': 'text/html', 'date': 'Mon, 01 Jan 2024' };
    const b = { 'content-type': 'text/html', 'date': 'Tue, 02 Jan 2024', 'cf-ray': 'xyz' };
    expect(headersEqualNormalized(a, b)).toBe(true);
  });

  it('respects a custom ignore set', () => {
    const custom = new Set(['x-trace-id']);
    const a = { 'content-type': 'text/html', 'x-trace-id': '1' };
    const b = { 'content-type': 'text/html', 'x-trace-id': '2' };
    expect(headersEqualNormalized(a, b, custom)).toBe(true);
  });

  it('DEFAULT_IGNORE_HEADERS contains the documented volatile set', () => {
    for (const h of ['date', 'cf-ray', 'etag', 'last-modified', 'age']) {
      expect(DEFAULT_IGNORE_HEADERS).toContain(h);
    }
  });
});

describe('sha256', () => {
  it('is deterministic for the same input', () => {
    expect(sha256('hello')).toBe(sha256('hello'));
  });

  it('matches the known hash for "hello"', () => {
    expect(sha256('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    );
  });

  it('differs for different inputs', () => {
    expect(sha256('a')).not.toBe(sha256('b'));
  });
});

describe('redactBody', () => {
  it('returns body unchanged when under the byte limit and no redaction', () => {
    expect(redactBody('hi', { maxBodyBytes: 4000 })).toBe('hi');
  });

  it('returns [REDACTED] when redactBodies is set without hashing', () => {
    expect(redactBody('secret', { redactBodies: true })).toBe('[REDACTED]');
  });

  it('returns a sha256:<hex> marker when redact+hash are both set', () => {
    const out = redactBody('secret', { redactBodies: true, hashBodies: true });
    expect(out).toBe(`sha256:${sha256('secret')}`);
  });

  it('produces equal hashes for equal inputs (equality survives redaction)', () => {
    const a = redactBody('same', { redactBodies: true, hashBodies: true });
    const b = redactBody('same', { redactBodies: true, hashBodies: true });
    expect(a).toBe(b);
  });

  it('truncates oversize bodies with a byte annotation', () => {
    const big = 'x'.repeat(100);
    const out = redactBody(big, { maxBodyBytes: 10 });
    expect(out.startsWith('xxxxxxxxxx')).toBe(true);
    expect(out).toContain('truncated 90B');
  });

  it('hashes truncated bodies when --hash-bodies is on', () => {
    const big = 'x'.repeat(100);
    const out = redactBody(big, { maxBodyBytes: 10, hashBodies: true });
    expect(out).toBe(`sha256:${sha256(big)} (orig 100B)`);
  });

  it('passes null/undefined through unchanged', () => {
    expect(redactBody(null)).toBe(null);
    expect(redactBody(undefined)).toBe(undefined);
  });
});
