/**
 * Safe dynamic import with monitoring + self-healing.
 *
 * - Retries transient failures (mobile WebView blips, slow 3G) with
 *   exponential backoff.
 * - Detects stale-chunk errors (redeploy dropped the hashed file the
 *   old index.html points at) and triggers a hard reload with cache
 *   eviction — the user lands on the fresh deploy instead of a blank.
 * - Reports every terminal (post-retry, non-stale) failure to Sentry as
 *   a distinct `DynamicImportError` with the module label as a tag, so
 *   the Sentry dashboard groups repeat failures by module instead of by
 *   stack trace (dynamic import stacks are notoriously anonymous).
 * - Reports stale-chunk auto-recovery as a breadcrumb so we can measure
 *   how often it fires without spamming issues.
 *
 * Never re-throws — callers get `null` on terminal failure and can
 * render a fallback UI. Never leaves an unhandled rejection.
 */
import * as Sentry from "@sentry/react";
import { hardReload, isStaleChunkError } from "@/lib/recovery";

export interface DynamicImportOptions {
  /** Human-readable module name for Sentry grouping. Required. */
  label: string;
  /** Max retry attempts on transient failures. Default: 2. */
  maxRetries?: number;
  /** Base backoff in ms; doubled each retry. Default: 400. */
  backoffMs?: number;
  /** Signal to abort retries (e.g. component unmounted). */
  signal?: AbortSignal;
}

export type DynamicImportOutcome<T> =
  | { ok: true; module: T }
  | { ok: false; reason: "stale"; error: unknown }
  | { ok: false; reason: "aborted" }
  | { ok: false; reason: "failed"; error: unknown; attempts: number };

/** Wait `ms` while respecting an abort signal. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function safeDynamicImport<T>(
  importer: () => Promise<T>,
  options: DynamicImportOptions,
): Promise<DynamicImportOutcome<T>> {
  const { label, maxRetries = 2, backoffMs = 400, signal } = options;
  let lastError: unknown = undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) return { ok: false, reason: "aborted" };
    try {
      const module = await importer();
      // If we retried at least once, note it as a breadcrumb — success
      // after backoff is useful signal for flaky-network diagnosis.
      if (attempt > 0) {
        Sentry.addBreadcrumb({
          category: "dynamic-import",
          level: "info",
          message: `Recovered ${label} after ${attempt} retry`,
          data: { label, attempt },
        });
      }
      return { ok: true, module };
    } catch (err) {
      lastError = err;

      // Stale deploy: hard-reload instead of retrying — the chunk is gone.
      if (isStaleChunkError(err)) {
        Sentry.addBreadcrumb({
          category: "dynamic-import",
          level: "warning",
          message: `Stale chunk for ${label} — hard reloading`,
          data: { label, attempt },
        });
        void hardReload({ clean: true });
        return { ok: false, reason: "stale", error: err };
      }

      // Transient failure — back off and retry.
      if (attempt < maxRetries) {
        try {
          await delay(backoffMs * Math.pow(2, attempt), signal);
        } catch {
          return { ok: false, reason: "aborted" };
        }
        continue;
      }
    }
  }

  // Terminal failure. Report to Sentry with a stable fingerprint per module.
  try {
    Sentry.withScope((scope) => {
      scope.setTag("dynamic_import_module", label);
      scope.setContext("dynamic_import", {
        label,
        attempts: maxRetries + 1,
      });
      scope.setFingerprint(["dynamic-import-failed", label]);
      const wrapped =
        lastError instanceof Error
          ? lastError
          : new Error(`Dynamic import failed: ${label}`);
      if (!(lastError instanceof Error)) {
        (wrapped as Error & { cause?: unknown }).cause = lastError;
      }
      wrapped.name = "DynamicImportError";
      Sentry.captureException(wrapped);
    });
  } catch {
    /* never let monitoring crash the app */
  }
  console.error(`[dynamic-import] ${label} failed`, lastError);
  return { ok: false, reason: "failed", error: lastError, attempts: maxRetries + 1 };
}
