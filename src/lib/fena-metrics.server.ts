/**
 * Fena outbound API call metering.
 *
 * Fena does NOT publish quota/rate-limit headers, so we approximate
 * usage ourselves: every outbound HTTP call increments a daily counter
 * in `fena_api_metrics/{YYYY-MM-DD}`. 429 responses raise a critical
 * alert and stamp `last429At`.
 *
 * The threshold (`dailyLimit`) lives in `settings/fena.quotaDailyLimit`
 * — defaults to 5000. Crossing 80% raises a warn alert (throttled).
 *
 * Server-only.
 */
import { getDocAdmin, updateDocAdmin } from "@/lib/server/firestore-admin";
import { raiseFenaAlert } from "@/lib/fena-alerts.server";

const DEFAULT_DAILY_LIMIT = 5000;
const WARN_FRACTION = 0.8;

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export interface FenaQuotaSnapshot {
  date: string;
  requests: number;
  errors: number;
  count429: number;
  last429At?: string;
  lastUpdatedAt?: string;
  dailyLimit: number;
  warnThreshold: number;
  percent: number;
  warning: boolean;
  critical: boolean;
}

async function loadDailyLimit(): Promise<number> {
  try {
    const s = await getDocAdmin("settings", "fena");
    const v = Number(s?.quotaDailyLimit ?? NaN);
    if (Number.isFinite(v) && v > 0) return Math.floor(v);
  } catch { /* ignore */ }
  return DEFAULT_DAILY_LIMIT;
}

export async function setFenaDailyLimit(limit: number): Promise<number> {
  const safe = Math.max(10, Math.min(1_000_000, Math.floor(limit)));
  await updateDocAdmin("settings", "fena", {
    quotaDailyLimit: safe,
    quotaUpdatedAt: new Date(),
  });
  return safe;
}

/**
 * Record one outbound Fena API call. Increments daily counters.
 * Never throws — telemetry must not break the caller.
 */
export async function recordFenaApiCall(opts: {
  ok: boolean;
  status?: number;
  endpoint?: string;
}): Promise<void> {
  const key = dayKey();
  try {
    const existing = await getDocAdmin("fena_api_metrics", key);
    const requests = Number(existing?.requests ?? 0) + 1;
    const errors = Number(existing?.errors ?? 0) + (opts.ok ? 0 : 1);
    const count429 =
      Number(existing?.count429 ?? 0) + (opts.status === 429 ? 1 : 0);
    const patch: Record<string, unknown> = {
      date: key,
      requests,
      errors,
      count429,
      lastUpdatedAt: new Date().toISOString(),
      lastStatus: opts.status ?? null,
      lastEndpoint: opts.endpoint ?? null,
    };
    if (opts.status === 429) patch.last429At = new Date().toISOString();
    await updateDocAdmin("fena_api_metrics", key, patch);

    // Quota threshold check
    const dailyLimit = await loadDailyLimit();
    const fraction = requests / dailyLimit;
    if (fraction >= WARN_FRACTION) {
      await raiseFenaAlert(
        "fena_quota_warning",
        fraction >= 1 ? "critical" : "warn",
        {
          date: key,
          requests,
          dailyLimit,
          percent: Math.round(fraction * 100),
          hint: "Adjust settings/fena.quotaDailyLimit if Fena raised your plan.",
        },
      );
    }
    if (opts.status === 429) {
      await raiseFenaAlert("fena_quota_429", "critical", {
        date: key,
        endpoint: opts.endpoint,
        count429,
        hint: "Fena rate-limited us. Slow down outbound calls or contact Fena.",
      });
    }
  } catch {
    // swallow — never break payment flows for metrics
  }
}

export async function getFenaQuotaSnapshot(): Promise<FenaQuotaSnapshot> {
  const key = dayKey();
  const dailyLimit = await loadDailyLimit();
  let row: Record<string, unknown> | null = null;
  try {
    row = await getDocAdmin("fena_api_metrics", key);
  } catch { /* ignore */ }
  const requests = Number(row?.requests ?? 0);
  const errors = Number(row?.errors ?? 0);
  const count429 = Number(row?.count429 ?? 0);
  const percent = dailyLimit > 0 ? Math.round((requests / dailyLimit) * 100) : 0;
  return {
    date: key,
    requests,
    errors,
    count429,
    last429At: typeof row?.last429At === "string" ? row.last429At : undefined,
    lastUpdatedAt:
      typeof row?.lastUpdatedAt === "string" ? row.lastUpdatedAt : undefined,
    dailyLimit,
    warnThreshold: Math.floor(dailyLimit * WARN_FRACTION),
    percent,
    warning: percent >= WARN_FRACTION * 100,
    critical: percent >= 100 || count429 > 0,
  };
}
