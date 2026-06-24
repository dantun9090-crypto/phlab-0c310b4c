/**
 * Schema validation for the mismatch-bundle export (single-scenario + global).
 *
 * Guards the contract every downloaded mismatch-bundle JSON must satisfy:
 *   - schemaVersion stamp
 *   - redaction metadata (so consumers know what was masked)
 *   - per-item `redirectChain` + `timing` on both fixture and live sides
 *   - global wrapper carries scenarios that each validate individually
 *
 * Mirrors the validator the e2e script runs before embedding the bundle into
 * report.html (scripts/e2e-stale-assets.mjs); a failure here means a future
 * report would ship a malformed download.
 */
import { describe, it, expect } from 'vitest';
import {
  BUNDLE_SCHEMA_VERSION,
  validateMismatchBundle,
  validateGlobalMismatchBundle,
} from '../scripts/lib/e2e-diff-helpers.mjs';

function makeItem(over: Partial<Record<string, unknown>> = {}) {
  return {
    match: true,
    url: 'http://localhost:8080/assets/main.js',
    index: 0,
    reasons: [],
    kinds: [],
    resourceType: 'script',
    bodyRedacted: false,
    redirectChain: [],
    timing: { fixture: { startedAt: 1, durationMs: 5, recordedAt: 2 }, live: { startedAt: 3, durationMs: 7, recordedAt: 4 } },
    fixture: { status: 200, headers: null, body: null, bodyBytes: 0, redirectChain: [], timing: { startedAt: 1, durationMs: 5, recordedAt: 2 } },
    live:    { status: 200, headers: null, body: null, bodyBytes: 0, redirectChain: [], timing: { startedAt: 3, durationMs: 7, recordedAt: 4 } },
    ...over,
  };
}

function makeBundle(over: Partial<Record<string, unknown>> = {}) {
  return {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    scenario: 'js-chunk-404',
    generatedAt: '2026-06-24T00:00:00.000Z',
    redaction: { redactBodies: false, hashBodies: false, maxBodyBytes: 4000, redactHeaders: [], redactUrlParams: [] },
    thresholds: { maxMismatches: 0, maxStatusMismatches: 0, maxBodyByteDelta: 0, observed: {}, breached: [] },
    summary: { matchCount: 1, mismatchCount: 0, statusMismatchCount: 0, maxBodyDelta: 0 },
    items: [makeItem()],
    ...over,
  };
}

describe('validateMismatchBundle (per-scenario)', () => {
  it('accepts a well-formed bundle', () => {
    const r = validateMismatchBundle(makeBundle());
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('rejects a non-object input', () => {
    expect(validateMismatchBundle(null as unknown as object).ok).toBe(false);
    expect(validateMismatchBundle('nope' as unknown as object).ok).toBe(false);
  });

  it('flags missing top-level fields', () => {
    const b = makeBundle();
    delete (b as { scenario?: string }).scenario;
    const r = validateMismatchBundle(b);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/scenario/);
  });

  it('rejects an outdated schemaVersion', () => {
    const r = validateMismatchBundle(makeBundle({ schemaVersion: 999 }));
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/schemaVersion/);
  });

  it('requires redaction metadata fields', () => {
    const r = validateMismatchBundle(makeBundle({ redaction: { redactBodies: false } }));
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/hashBodies|maxBodyBytes|redactHeaders|redactUrlParams/);
  });

  it('requires redirectChain on each item', () => {
    const it = makeItem();
    delete (it as { redirectChain?: unknown[] }).redirectChain;
    const r = validateMismatchBundle(makeBundle({ items: [it] }));
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/redirectChain/);
  });

  it('requires timing.startedAt + durationMs on each item', () => {
    const it = makeItem({ timing: { fixture: {}, live: {} } });
    delete (it as { timing?: unknown }).timing;
    const r = validateMismatchBundle(makeBundle({ items: [it] }));
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/timing/);
  });

  it('requires redirectChain + timing on fixture / live side objects', () => {
    const it = makeItem();
    (it.fixture as { redirectChain?: unknown[] }).redirectChain = undefined;
    delete (it.fixture as { redirectChain?: unknown[] }).redirectChain;
    const r = validateMismatchBundle(makeBundle({ items: [it] }));
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/fixture.*redirectChain/);
  });

  it('allows fixture or live to be null (only-live / only-fixture)', () => {
    const it = makeItem({ fixture: null, match: false, reasons: ['only-live'], kinds: ['only-live'] });
    const r = validateMismatchBundle(makeBundle({ items: [it] }));
    expect(r.ok).toBe(true);
  });
});

describe('validateGlobalMismatchBundle', () => {
  it('accepts a global wrapper with valid scenarios', () => {
    const g = {
      schemaVersion: BUNDLE_SCHEMA_VERSION,
      generatedAt: '2026-06-24T00:00:00.000Z',
      redaction: { redactBodies: false, hashBodies: false, maxBodyBytes: 4000, redactHeaders: [], redactUrlParams: [] },
      scenarios: [makeBundle(), makeBundle({ scenario: 'css-link-error' })],
    };
    const r = validateGlobalMismatchBundle(g);
    expect(r.ok).toBe(true);
  });

  it('flags missing scenarios array', () => {
    const r = validateGlobalMismatchBundle({
      schemaVersion: BUNDLE_SCHEMA_VERSION,
      generatedAt: 'x',
      redaction: { redactBodies: false, hashBodies: false, maxBodyBytes: 4000, redactHeaders: [], redactUrlParams: [] },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/scenarios/);
  });

  it('propagates per-scenario validation errors with index prefix', () => {
    const bad = makeBundle();
    delete (bad as { items?: unknown }).items;
    const r = validateGlobalMismatchBundle({
      schemaVersion: BUNDLE_SCHEMA_VERSION,
      generatedAt: 'x',
      redaction: { redactBodies: false, hashBodies: false, maxBodyBytes: 4000, redactHeaders: [], redactUrlParams: [] },
      scenarios: [makeBundle(), bad],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /^scenarios\[1\]/.test(e))).toBe(true);
  });
});
