/**
 * Per-isolate in-memory rate limiter for /api/public/hooks/* endpoints.
 *
 * Limitations (accepted tradeoff — see also no-backend-rate-limiting):
 *  - Per Cloudflare Worker isolate; an attacker hitting many POPs gets
 *    independent buckets.
 *  - Lost on cold start.
 *  - Not a substitute for HMAC / signature verification; this is a speed
 *    bump against brute-force and replay storms only.
 *
 * Use `CF-Connecting-IP` as the real client IP. Workers set this header
 * from the verified TCP source and clients cannot spoof it (unlike
 * X-Forwarded-For).
 */
import { addDocAdmin } from "@/lib/server/firestore-admin";

interface Bucket {
  count: number;
  resetAt: number; // epoch ms when the window expires
}

// Map<`${endpoint}|${ip}|${bucketKind}`, Bucket>. Kept small by lazy GC on
// each check — buckets are deleted as soon as they expire.
const buckets = new Map<string, Bucket>();

// Hard cap on map size so a flood of unique IPs in a single isolate can't
// bloat memory beyond a few MB. Oldest entries are evicted FIFO.
const MAX_BUCKETS = 10_000;

function gc(now: number): void {
  if (buckets.size < MAX_BUCKETS) return;
  // Evict ~10% oldest by insertion order (Map preserves insertion order).
  let toDrop = Math.ceil(MAX_BUCKETS / 10);
  for (const key of buckets.keys()) {
    if (toDrop-- <= 0) break;
    buckets.delete(key);
  }
  // Also drop anything already expired.
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number; // seconds until the window resets
}

/**
 * Returns whether the request is allowed and how long until the window resets.
 * Always counts the current request toward the limit (call once per request).
 */
export function checkRateLimit(
  ip: string,
  endpoint: string,
  limit: number,
  windowMs: number,
  bucketKind: "default" | "bad-auth" = "default",
): RateLimitResult {
  const now = Date.now();
  const key = `${endpoint}|${ip}|${bucketKind}`;
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    gc(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      remaining: limit - 1,
      retryAfterSec: Math.ceil(windowMs / 1000),
    };
  }

  existing.count += 1;
  const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  if (existing.count > limit) {
    return { allowed: false, remaining: 0, retryAfterSec };
  }
  return {
    allowed: true,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSec,
  };
}

/**
 * Real client IP. CF-Connecting-IP is set by Cloudflare from the verified
 * TCP source and cannot be spoofed; X-Forwarded-For can. Falls back to
 * 'unknown' so a missing header still groups requests together.
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Standard 429 response shape required by the spec.
 */
export function rateLimitedResponse(retryAfterSec: number): Response {
  return new Response(
    JSON.stringify({ error: "Rate limit exceeded", retryAfter: retryAfterSec }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(retryAfterSec),
        "cache-control": "no-store",
      },
    },
  );
}

/**
 * Best-effort append to `securityEvents`. Never throws — a logging failure
 * must not block the 429 we're already returning.
 */
export async function logRateLimitBlocked(opts: {
  endpoint: string;
  ip: string;
  userAgent: string | null;
  retryAfterSec: number;
  reason?: "rate_limit" | "bad_auth_rate_limit";
}): Promise<void> {
  try {
    await addDocAdmin("securityEvents", {
      type: opts.reason === "bad_auth_rate_limit" ? "bad_auth_rate_limit_blocked" : "rate_limit_blocked",
      endpoint: opts.endpoint,
      ip: opts.ip,
      userAgent: opts.userAgent ?? null,
      retryAfter: opts.retryAfterSec,
      createdAt: new Date(),
    });
  } catch {
    /* swallow — logger must never throw */
  }
}

/**
 * Convenience wrapper: enforce a limit, log on block, return 429 or null.
 * Returns the 429 Response to send, or null when the request is allowed.
 */
export async function enforceRateLimit(
  request: Request,
  endpoint: string,
  opts: {
    limit: number;
    windowMs: number;
    retryAfterSec: number;
    bucketKind?: "default" | "bad-auth";
  },
): Promise<Response | null> {
  const ip = getClientIp(request);
  const result = checkRateLimit(
    ip,
    endpoint,
    opts.limit,
    opts.windowMs,
    opts.bucketKind ?? "default",
  );
  if (result.allowed) return null;

  // Use the spec-defined retry-after for the response, not the dynamic
  // window-remaining — gives callers a consistent backoff hint.
  const retryAfter = opts.retryAfterSec;
  await logRateLimitBlocked({
    endpoint,
    ip,
    userAgent: request.headers.get("user-agent"),
    retryAfterSec: retryAfter,
    reason: opts.bucketKind === "bad-auth" ? "bad_auth_rate_limit" : "rate_limit",
  });
  return rateLimitedResponse(retryAfter);
}
