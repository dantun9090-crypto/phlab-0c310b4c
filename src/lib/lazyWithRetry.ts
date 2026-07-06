import { lazy, type ComponentType } from "react";
import { isStaleChunkError } from "@/lib/recovery";

/**
 * React.lazy wrapper that retries a failed dynamic import once after a short
 * delay. Handles the common post-deploy race where the browser has cached
 * HTML that references an already-deleted chunk hash — a single retry with a
 * cache-busting query is enough for most transient CDN edge cases.
 *
 * If the retry also fails, the error is re-thrown so the global chunk-error
 * auto-recovery handler (see chunk-auto-recovery.ts) can take over.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
  { retries = 1, delayMs = 400 }: { retries?: number; delayMs?: number } = {},
) {
  return lazy(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await factory();
      } catch (err) {
        lastError = err;
        if (attempt >= retries || !isStaleChunkError(err)) break;
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw lastError;
  });
}
