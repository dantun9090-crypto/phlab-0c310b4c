/**
 * Structured logger for the Cloudflare Worker.
 *
 * Cloudflare's log pipeline (wrangler tail, Logpush, Lovable's Worker logs)
 * captures whatever the Worker writes to stdout/stderr. Emitting one JSON
 * object per line ("ndjson") lets us grep/jq/Logpush-filter on individual
 * fields (status, ms, ip, route, event) instead of regex-fishing prose.
 *
 * Kept dependency-free: no winston/pino — those pull in Node-only APIs
 * that don't work on workerd.
 */

type Level = "debug" | "info" | "warn" | "error";

export interface LogFields {
  event: string;
  [key: string]: unknown;
}

const LEVEL_STREAM: Record<Level, "log" | "warn" | "error"> = {
  debug: "log",
  info: "log",
  warn: "warn",
  error: "error",
};

function emit(level: Level, fields: LogFields): void {
  // Build a stable shape: ts → level → event → everything else.
  const line = {
    ts: new Date().toISOString(),
    level,
    ...fields,
  };
  // JSON.stringify catches BigInt/cycles only by throwing — guard so a
  // bad log line never breaks the actual request.
  let serialized: string;
  try {
    serialized = JSON.stringify(line);
  } catch {
    serialized = JSON.stringify({
      ts: line.ts,
      level,
      event: fields.event,
      _logError: "failed to serialize log fields",
    });
  }
  console[LEVEL_STREAM[level]](serialized);
}

export const log = {
  debug: (fields: LogFields) => emit("debug", fields),
  info: (fields: LogFields) => emit("info", fields),
  warn: (fields: LogFields) => emit("warn", fields),
  error: (fields: LogFields) => emit("error", fields),
};

/**
 * Extract the caller IP from Worker request headers, mirroring the same
 * priority order used by the admin IP gate so log lines and gate decisions
 * agree on which IP we saw.
 */
export function extractClientIp(req: Request): string | null {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();
  return null;
}

/** Truncate URLs / user agents to keep log lines bounded. */
export function truncate(value: string | null | undefined, max = 256): string | null {
  if (value == null) return null;
  return value.length > max ? value.slice(0, max) + "…" : value;
}
