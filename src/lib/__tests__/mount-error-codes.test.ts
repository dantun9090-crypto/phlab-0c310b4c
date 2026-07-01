/**
 * Unit tests for mount error normalization.
 *
 * These lock the mapping from free-form error shapes to stable machine codes.
 * Renaming a code here is a breaking change for canary correlation + admin
 * charts — do not adjust without updating downstream dashboards.
 */
import { describe, expect, it } from 'vitest';
import {
  classifyMountError,
  mountSamplesToCsv,
  type MountSample,
} from '../mount-error-codes';

describe('classifyMountError', () => {
  it('maps SyntaxError → MOUNT_PARSE_ERROR', () => {
    const r = classifyMountError({ message: "Uncaught SyntaxError: Unexpected token '<'" });
    expect(r.code).toBe('MOUNT_PARSE_ERROR');
    expect(r.category).toBe('parse');
  });

  it('maps "Unexpected end of input" → MOUNT_PARSE_ERROR', () => {
    const r = classifyMountError({ message: 'Unexpected end of input' });
    expect(r.code).toBe('MOUNT_PARSE_ERROR');
  });

  it('maps "Invalid or unexpected token" (from stack) → MOUNT_PARSE_ERROR', () => {
    const r = classifyMountError({
      message: 'boot failed',
      stack: 'at eval (index.js:1)\nSyntaxError: Invalid or unexpected token',
    });
    expect(r.code).toBe('MOUNT_PARSE_ERROR');
  });

  it('maps ChunkLoadError → MOUNT_CHUNK_LOAD_FAILED', () => {
    const r = classifyMountError({ message: 'ChunkLoadError: Loading chunk 42 failed.' });
    expect(r.code).toBe('MOUNT_CHUNK_LOAD_FAILED');
    expect(r.category).toBe('chunk');
  });

  it('maps "Failed to fetch dynamically imported module" → MOUNT_CHUNK_LOAD_FAILED', () => {
    const r = classifyMountError({
      message: 'TypeError: Failed to fetch dynamically imported module: /assets/x.js',
    });
    expect(r.code).toBe('MOUNT_CHUNK_LOAD_FAILED');
  });

  it('maps "Importing a module script failed" (Safari) → MOUNT_CHUNK_LOAD_FAILED', () => {
    const r = classifyMountError({ message: 'Importing a module script failed.' });
    expect(r.code).toBe('MOUNT_CHUNK_LOAD_FAILED');
  });

  it('maps hydration mismatch text → MOUNT_HYDRATION_MISMATCH', () => {
    const r = classifyMountError({
      message: 'Hydration failed because the initial UI does not match what was rendered on the server.',
    });
    expect(r.code).toBe('MOUNT_HYDRATION_MISMATCH');
    expect(r.category).toBe('hydration');
  });

  it('maps "Text content does not match" → MOUNT_HYDRATION_MISMATCH', () => {
    const r = classifyMountError({ message: 'Text content does not match server-rendered HTML' });
    expect(r.code).toBe('MOUNT_HYDRATION_MISMATCH');
  });

  it('maps minified React hydration codes (#418/#423/#425) → MOUNT_HYDRATION_MISMATCH', () => {
    for (const code of [418, 423, 425]) {
      const r = classifyMountError({ message: `Minified React error #${code}; visit https://reactjs.org/...` });
      expect(r.code).toBe('MOUNT_HYDRATION_MISMATCH');
    }
  });

  it('maps x-phl-boot-bad → MOUNT_BOOT_BAD', () => {
    const r = classifyMountError({ message: 'edge marker x-phl-boot-bad=1 detected' });
    expect(r.code).toBe('MOUNT_BOOT_BAD');
    expect(r.category).toBe('edge');
  });

  it('timeout + boot overlay still visible → MOUNT_TIMEOUT_BLANK', () => {
    const r = classifyMountError({
      message: '[MOUNT-TIMEOUT] React did not mount within 5s',
      bootStillVisible: true,
      reactRootMounted: false,
      bodyChildCount: 1,
    });
    expect(r.code).toBe('MOUNT_TIMEOUT_BLANK');
    expect(r.category).toBe('timeout');
  });

  it('timeout + DOM present but React never mounted → MOUNT_TIMEOUT_UNMOUNTED', () => {
    const r = classifyMountError({
      message: '[MOUNT-TIMEOUT] did not mount within 5s',
      bootStillVisible: false,
      reactRootMounted: false,
      bodyChildCount: 12,
    });
    expect(r.code).toBe('MOUNT_TIMEOUT_UNMOUNTED');
  });

  it('unclassifiable input → MOUNT_UNKNOWN', () => {
    const r = classifyMountError({ message: 'something exotic happened' });
    expect(r.code).toBe('MOUNT_UNKNOWN');
    expect(r.category).toBe('unknown');
  });

  it('parse+chunk collision resolves to MOUNT_PARSE_ERROR (parse checked first)', () => {
    // Determinism guard: if a message somehow matches both, the earlier rule wins.
    const r = classifyMountError({
      message: 'SyntaxError while parsing chunk (ChunkLoadError)',
    });
    expect(r.code).toBe('MOUNT_PARSE_ERROR');
  });

  it('empty input still returns a stable code, not undefined', () => {
    const r = classifyMountError({});
    expect(r.code).toBe('MOUNT_UNKNOWN');
  });
});

describe('mountSamplesToCsv', () => {
  const base: MountSample = {
    ts: Date.UTC(2026, 5, 1, 12, 0, 0),
    eventTs: Date.UTC(2026, 5, 1, 11, 59, 55),
    mountDurationMs: 5321,
    code: 'MOUNT_TIMEOUT_BLANK',
    category: 'timeout',
    route: '/products',
    buildId: 'build-abc',
    assetHash: 'hash-xyz',
    message: 'Blank page / boot overlay stuck',
  };

  it('emits the expected header row with event_ts and mount_duration', () => {
    const csv = mountSamplesToCsv([]);
    expect(csv.split('\n')[0]).toBe(
      'ts_iso,event_ts_iso,mount_duration_ms,code,category,route,buildId,assetHash,message',
    );
  });

  it('includes both ts and eventTs as ISO strings, plus mount duration', () => {
    const csv = mountSamplesToCsv([base]);
    const line = csv.split('\n')[1];
    expect(line).toContain('2026-06-01T12:00:00.000Z'); // ts
    expect(line).toContain('2026-06-01T11:59:55.000Z'); // eventTs
    expect(line).toContain(',5321,');
    expect(line).toContain('MOUNT_TIMEOUT_BLANK');
  });

  it('falls back to ts when eventTs is missing (backward compat)', () => {
    const { eventTs: _drop, mountDurationMs: _d, ...noExtras } = base;
    void _drop; void _d;
    const csv = mountSamplesToCsv([noExtras as MountSample]);
    const [, line] = csv.split('\n');
    // Both ts_iso and event_ts_iso must equal the same ISO string.
    const cells = line.split(',');
    expect(cells[0]).toBe(cells[1]);
    // mount_duration_ms is empty rather than "undefined".
    expect(cells[2]).toBe('');
  });

  it('escapes commas and quotes in the message field', () => {
    const csv = mountSamplesToCsv([{ ...base, message: 'boom, "very" bad' }]);
    expect(csv).toContain('"boom, ""very"" bad"');
  });
});
