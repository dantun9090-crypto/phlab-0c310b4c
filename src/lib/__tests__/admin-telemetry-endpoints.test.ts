import { describe, expect, it } from 'vitest';
import { selectLatestActiveHold, type PublishHoldRow } from '../publish-hold-select';
import { mountSamplesToCsv, type MountSample } from '../mount-error-codes';

/**
 * Integration-style tests for the admin telemetry read paths:
 *   - CSV export contract  (ordering + duration + escaping)
 *   - publish-hold GET     (latest active hold selection)
 *
 * These do not spin up the HTTP server — we exercise the same pure helpers
 * the route handlers use, which is where all the sortable/select logic
 * lives. If a handler stops calling these helpers, its contract test in
 * this file must fail loudly.
 */

describe('mountSamplesToCsv', () => {
  const base: MountSample = {
    ts: Date.parse('2026-07-01T10:00:05Z'),
    eventTs: Date.parse('2026-07-01T10:00:00Z'),
    mountDurationMs: 5123,
    code: 'MOUNT_TIMEOUT_BLANK',
    category: 'timeout',
    route: '/products',
    buildId: 'b-abc123',
    assetHash: 'h-xyz',
    message: 'did not mount within 5000ms',
  };

  it('emits header row with event_ts_iso and mount_duration_ms columns', () => {
    const csv = mountSamplesToCsv([]);
    const [header] = csv.split('\n');
    expect(header.split(',')).toEqual([
      'ts_iso',
      'event_ts_iso',
      'mount_duration_ms',
      'code',
      'category',
      'route',
      'buildId',
      'assetHash',
      'message',
    ]);
  });

  it('preserves input ordering (does not silently re-sort samples)', () => {
    const older = { ...base, ts: Date.parse('2026-07-01T09:00:00Z'), eventTs: Date.parse('2026-07-01T09:00:00Z') };
    const newer = { ...base, ts: Date.parse('2026-07-01T11:00:00Z'), eventTs: Date.parse('2026-07-01T11:00:00Z') };
    const csv = mountSamplesToCsv([newer, older]);
    const rows = csv.split('\n').slice(1);
    expect(rows[0]).toMatch(/2026-07-01T11:00:00/);
    expect(rows[1]).toMatch(/2026-07-01T09:00:00/);
  });

  it('emits eventTs distinct from ts and numeric mountDurationMs', () => {
    const csv = mountSamplesToCsv([base]);
    const row = csv.split('\n')[1];
    expect(row).toContain('2026-07-01T10:00:05.000Z'); // ts
    expect(row).toContain('2026-07-01T10:00:00.000Z'); // eventTs
    expect(row).toContain(',5123,');                    // duration column
  });

  it('falls back eventTs to ts when omitted (backward compat)', () => {
    const legacy: MountSample = { ...base, eventTs: undefined, mountDurationMs: undefined };
    const csv = mountSamplesToCsv([legacy]);
    const row = csv.split('\n')[1];
    // Both ts columns should equal the retain-time ISO.
    const cells = row.split(',');
    expect(cells[0]).toBe(cells[1]);
    expect(cells[2]).toBe(''); // empty duration
  });
});

describe('selectLatestActiveHold', () => {
  const mk = (overrides: Partial<PublishHoldRow>): PublishHoldRow => ({
    buildId: 'b1',
    hold: true,
    updatedAt: '2026-07-01T10:00:00Z',
    ...overrides,
  });

  it('returns hold=false and null current when list is empty', () => {
    expect(selectLatestActiveHold([])).toEqual({
      hold: false,
      current: null,
      active: [],
      recent: [],
    });
  });

  it('ignores rows with hold !== true when picking current', () => {
    const rows = [
      mk({ buildId: 'released', hold: false, updatedAt: '2026-07-01T12:00:00Z' }),
      mk({ buildId: 'held', hold: true, updatedAt: '2026-07-01T11:00:00Z' }),
    ];
    const sel = selectLatestActiveHold(rows);
    expect(sel.hold).toBe(true);
    expect(sel.current?.buildId).toBe('held');
    expect(sel.active).toHaveLength(1);
    expect(sel.recent).toHaveLength(2);
  });

  it('picks the most recent updatedAt when multiple holds are active', () => {
    const rows = [
      mk({ buildId: 'old-hold', updatedAt: '2026-06-30T00:00:00Z' }),
      mk({ buildId: 'newer-hold', updatedAt: '2026-07-01T09:00:00Z' }),
      mk({ buildId: 'newest-hold', updatedAt: '2026-07-01T15:00:00Z' }),
    ];
    const sel = selectLatestActiveHold(rows);
    expect(sel.current?.buildId).toBe('newest-hold');
    // recent must also be sorted newest-first for the admin table.
    expect(sel.recent.map((r) => r.buildId)).toEqual(['newest-hold', 'newer-hold', 'old-hold']);
  });

  it('is deterministic even if Firestore returns rows in wrong order', () => {
    const shuffled = [
      mk({ buildId: 'c', updatedAt: '2026-07-01T03:00:00Z' }),
      mk({ buildId: 'a', updatedAt: '2026-07-01T05:00:00Z' }),
      mk({ buildId: 'b', updatedAt: '2026-07-01T04:00:00Z' }),
    ];
    expect(selectLatestActiveHold(shuffled).current?.buildId).toBe('a');
  });

  it('treats missing updatedAt as oldest so it never masks a real hold', () => {
    const rows = [
      mk({ buildId: 'no-ts', updatedAt: undefined }),
      mk({ buildId: 'real', updatedAt: '2026-07-01T10:00:00Z' }),
    ];
    expect(selectLatestActiveHold(rows).current?.buildId).toBe('real');
  });
});
