/**
 * Fena order-update retry queue.
 *
 * When the webhook handler fails to persist an order update (e.g.
 * transient Firestore outage), we persist the intended mutation to
 * `fena_retry_queue/{orderId}_{fenaPaymentId}` so a follow-up worker
 * can replay it with exponential backoff. After `MAX_ATTEMPTS`
 * (default 5) the row is marked `exhausted: true` and a critical
 * alert is raised — at that point Fena has also stopped retrying, so
 * manual intervention is required.
 *
 * Backoff (minutes): 1, 2, 4, 8, 16 (capped at 60).
 *
 * Server-only.
 */
import {
  deleteDocAdmin,
  getDocAdmin,
  listDocsAdmin,
  updateDocAdmin,
} from "@/lib/server/firestore-admin";
import { raiseFenaAlert } from "@/lib/fena-alerts.server";

export const MAX_RETRY_ATTEMPTS = 5;
const BASE_BACKOFF_MIN = 1;
const MAX_BACKOFF_MIN = 60;

function nextDelayMs(attempts: number): number {
  const minutes = Math.min(
    MAX_BACKOFF_MIN,
    BASE_BACKOFF_MIN * Math.pow(2, Math.max(0, attempts)),
  );
  return minutes * 60_000;
}

function safeId(orderId: string, fenaPaymentId: string): string {
  const raw = `${orderId}__${fenaPaymentId}`;
  return raw.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 200);
}

export async function enqueueFenaUpdateRetry(input: {
  orderId: string;
  fenaPaymentId: string;
  updates: Record<string, unknown>;
  error: string;
  source: "webhook" | "selfheal" | "manual";
}): Promise<string> {
  const id = safeId(input.orderId, input.fenaPaymentId);
  const existing = await getDocAdmin("fena_retry_queue", id).catch(() => null);
  const attempts = Number(existing?.attempts ?? 0);
  const now = new Date();
  const nextAttemptAt = new Date(now.getTime() + nextDelayMs(attempts));
  await updateDocAdmin("fena_retry_queue", id, {
    orderId: input.orderId,
    fenaPaymentId: input.fenaPaymentId,
    // Persist the *intended* update so we can replay it exactly.
    updatesJson: JSON.stringify(input.updates),
    lastError: input.error.slice(0, 1000),
    source: input.source,
    attempts, // last attempted count; bumped only on actual retry
    enqueuedAt: existing?.enqueuedAt ?? now.toISOString(),
    lastEnqueuedAt: now.toISOString(),
    nextAttemptAt: nextAttemptAt.toISOString(),
    exhausted: false,
  });
  return id;
}

export interface RetryProcessResult {
  scanned: number;
  succeeded: number;
  failed: number;
  exhausted: number;
  details: Array<{
    id: string;
    outcome: "succeeded" | "failed" | "exhausted" | "skipped";
    attempts: number;
    error?: string;
  }>;
}

/**
 * Drain due rows from the retry queue.
 *
 * `applyUpdate` is injected so tests can stub it; production passes the
 * real `updateDocAdmin("orders", id, updates)` call.
 */
export async function processFenaRetries(
  applyOrderUpdate: (
    orderId: string,
    updates: Record<string, unknown>,
  ) => Promise<void>,
  options: { limit?: number } = {},
): Promise<RetryProcessResult> {
  const rows = await listDocsAdmin("fena_retry_queue", {
    orderBy: "nextAttemptAt",
    direction: "ASCENDING",
    limit: Math.min(options.limit ?? 25, 100),
  });
  const result: RetryProcessResult = {
    scanned: 0,
    succeeded: 0,
    failed: 0,
    exhausted: 0,
    details: [],
  };
  const nowIso = new Date().toISOString();
  for (const raw of rows) {
    if (raw.exhausted === true) continue;
    const nextAt = typeof raw.nextAttemptAt === "string" ? raw.nextAttemptAt : "";
    if (nextAt && nextAt > nowIso) {
      // not due yet
      result.details.push({
        id: raw.id,
        outcome: "skipped",
        attempts: Number(raw.attempts ?? 0),
      });
      continue;
    }
    result.scanned += 1;
    const attempts = Number(raw.attempts ?? 0) + 1;
    const orderId = String(raw.orderId ?? "");
    let updates: Record<string, unknown> = {};
    try {
      updates = JSON.parse(String(raw.updatesJson ?? "{}")) as Record<string, unknown>;
    } catch {
      updates = {};
    }
    if (!orderId || Object.keys(updates).length === 0) {
      // garbage row — mark exhausted to stop reprocessing.
      await updateDocAdmin("fena_retry_queue", raw.id, {
        exhausted: true,
        exhaustedAt: nowIso,
        lastError: "malformed retry row",
      });
      result.exhausted += 1;
      result.details.push({ id: raw.id, outcome: "exhausted", attempts, error: "malformed row" });
      continue;
    }
    try {
      await applyOrderUpdate(orderId, updates);
      // success → delete row (alternatively mark resolved; delete keeps the
      // queue lean and we have webhook events for the audit trail).
      await deleteDocAdmin("fena_retry_queue", raw.id);
      result.succeeded += 1;
      result.details.push({ id: raw.id, outcome: "succeeded", attempts });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (attempts >= MAX_RETRY_ATTEMPTS) {
        await updateDocAdmin("fena_retry_queue", raw.id, {
          attempts,
          exhausted: true,
          exhaustedAt: nowIso,
          lastError: errMsg.slice(0, 1000),
        });
        await raiseFenaAlert("fena_retry_exhausted", "critical", {
          orderId,
          fenaPaymentId: String(raw.fenaPaymentId ?? ""),
          attempts,
          lastError: errMsg,
          hint: "Manual intervention required — order was never marked paid.",
        });
        result.exhausted += 1;
        result.details.push({ id: raw.id, outcome: "exhausted", attempts, error: errMsg });
      } else {
        const next = new Date(Date.now() + nextDelayMs(attempts)).toISOString();
        await updateDocAdmin("fena_retry_queue", raw.id, {
          attempts,
          nextAttemptAt: next,
          lastError: errMsg.slice(0, 1000),
        });
        result.failed += 1;
        result.details.push({ id: raw.id, outcome: "failed", attempts, error: errMsg });
      }
    }
  }
  return result;
}
