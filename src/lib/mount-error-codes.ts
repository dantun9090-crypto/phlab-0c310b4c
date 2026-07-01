/**
 * Mount / boot telemetry error normalization.
 *
 * Turns free-form error messages/stacks into a small set of stable machine
 * codes so canary runs, Slack alerts, and admin charts can correlate the
 * same failure across sessions and builds.
 *
 * Keep the list SHORT and STABLE. Adding a new code is fine — renaming or
 * repurposing an existing one breaks historical charts.
 */

export type MountErrorCode =
  | 'MOUNT_TIMEOUT_BLANK'          // 5s timeout, body empty / boot overlay still showing
  | 'MOUNT_TIMEOUT_UNMOUNTED'      // 5s timeout, DOM present but no react root markers
  | 'MOUNT_PARSE_ERROR'            // JS SyntaxError / bad bundle
  | 'MOUNT_CHUNK_LOAD_FAILED'      // chunk / dynamic import failure (stale assets)
  | 'MOUNT_HYDRATION_MISMATCH'     // React 18 hydration text mismatch
  | 'MOUNT_BOOT_BAD'               // Edge worker flagged x-phl-boot-bad=1
  | 'MOUNT_UNKNOWN';

export interface ClassifyInput {
  message?: string | null;
  stack?: string | null;
  /** Structured hints from the timeout probe. */
  bootStillVisible?: boolean;
  reactRootMounted?: boolean;
  bodyChildCount?: number;
}

export interface ClassifyResult {
  code: MountErrorCode;
  category: 'timeout' | 'parse' | 'chunk' | 'hydration' | 'edge' | 'unknown';
  reason: string;
}

const RX_PARSE = /SyntaxError|Unexpected (token|end of|identifier)|Invalid or unexpected token/i;
const RX_CHUNK = /ChunkLoadError|Loading chunk \d+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i;
const RX_HYDRATION = /Hydration|did not match|Text content does not match|Minified React error #(418|423|425)/i;

export function classifyMountError(input: ClassifyInput): ClassifyResult {
  const msg = String(input.message || '');
  const stk = String(input.stack || '');
  const blob = `${msg}\n${stk}`;

  if (RX_PARSE.test(blob))
    return { code: 'MOUNT_PARSE_ERROR', category: 'parse', reason: 'JS parse/syntax error' };
  if (RX_CHUNK.test(blob))
    return { code: 'MOUNT_CHUNK_LOAD_FAILED', category: 'chunk', reason: 'Dynamic chunk load failed' };
  if (RX_HYDRATION.test(blob))
    return { code: 'MOUNT_HYDRATION_MISMATCH', category: 'hydration', reason: 'React hydration mismatch' };
  if (/x-phl-boot-bad/i.test(blob))
    return { code: 'MOUNT_BOOT_BAD', category: 'edge', reason: 'Worker flagged bad boot script' };

  // Timeout-shaped signals from the client.tsx probe.
  const looksLikeTimeout = /MOUNT-TIMEOUT|did not mount within/i.test(msg);
  if (looksLikeTimeout || input.bootStillVisible || input.reactRootMounted === false) {
    if (input.bootStillVisible || (input.bodyChildCount ?? 99) <= 1) {
      return { code: 'MOUNT_TIMEOUT_BLANK', category: 'timeout', reason: 'Blank page / boot overlay stuck' };
    }
    return { code: 'MOUNT_TIMEOUT_UNMOUNTED', category: 'timeout', reason: 'DOM present but React never mounted' };
  }

  return { code: 'MOUNT_UNKNOWN', category: 'unknown', reason: 'Unclassified mount failure' };
}

// -----------------------------------------------------------------------------
// Retained sample buffer (per browser, capped) — powers CSV export + chart.
// -----------------------------------------------------------------------------

export interface MountSample {
  /** Wall-clock time the sample was persisted (client). */
  ts: number;
  /**
   * Wall-clock time the underlying event actually fired (may differ from `ts`
   * if the sample was buffered/flushed later — critical for accurate rate
   * calculations and ordering audits). Defaults to `ts` when absent.
   */
  eventTs?: number;
  /** ms from navigationStart (performance.now snapshot) to failure detection. */
  mountDurationMs?: number;
  code: MountErrorCode;
  category: ClassifyResult['category'];
  route: string;
  buildId: string;
  assetHash: string;
  message: string;
}

const SAMPLE_KEY = '__phl_mount_samples';
const SAMPLE_CAP = 100;

export function loadMountSamples(): MountSample[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SAMPLE_KEY);
    const arr = raw ? (JSON.parse(raw) as MountSample[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function pushMountSample(s: MountSample): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const cur = loadMountSamples();
    cur.push(s);
    localStorage.setItem(SAMPLE_KEY, JSON.stringify(cur.slice(-SAMPLE_CAP)));
  } catch {
    /* ignore quota */
  }
}

export function clearMountSamples(): void {
  try { localStorage.removeItem(SAMPLE_KEY); } catch { /* ignore */ }
}

export function mountSamplesToCsv(samples: MountSample[]): string {
  const header = [
    'ts_iso',            // when the sample was retained
    'event_ts_iso',      // when the underlying event fired
    'mount_duration_ms', // ms from navigation start to failure
    'code',
    'category',
    'route',
    'buildId',
    'assetHash',
    'message',
  ];
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = samples.map((s) => {
    const eventTs = s.eventTs ?? s.ts;
    return [
      new Date(s.ts).toISOString(),
      new Date(eventTs).toISOString(),
      s.mountDurationMs ?? '',
      s.code,
      s.category,
      s.route,
      s.buildId,
      s.assetHash,
      s.message,
    ].map(esc).join(',');
  });
  return [header.join(','), ...rows].join('\n');
}

