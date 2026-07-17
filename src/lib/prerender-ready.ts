/**
 * Prerender.io readiness helpers.
 *
 * Crawlers (prerender.io, Googlebot via prerender) read
 * `window.prerenderReady`. While it is `false`, the snapshot is held;
 * when it flips to `true`, the current DOM is captured.
 *
 * Contract (post-2026-07-17 stale-watchdog-snapshot incident):
 *  1. The root inline script sets `window.prerenderReady = false` as
 *     early as possible (before any React code runs).
 *  2. Data-dependent routes call `markPrerenderPending()` synchronously
 *     when their loader starts — that sets `prerenderReady = false` AND
 *     raises the `__phlPrerenderHold` flag so useSEO's route-agnostic
 *     flip can't overwrite the pending state.
 *  3. On data-loaded, routes call `markPrerenderReady()` (directly or
 *     via `flipPrerenderReadyWhen*`) which clears the hold and sets
 *     `prerenderReady = true`.
 *  4. If the blank watchdog fires we intentionally leave
 *     `prerenderReady = false` so prerender.io waits (up to its own
 *     timeout, ~20s) rather than snapshotting the fallback overlay.
 */

const MAX_WAIT_MS_DEFAULT = 8000;

type PrerenderWindow = Window & {
  prerenderReady?: boolean;
  __phlPrerenderHold?: boolean;
};

/**
 * Mark the current route as data-pending. Holds the prerender snapshot
 * open until the route calls `markPrerenderReady` (or a flip helper).
 */
export function markPrerenderPending(): void {
  if (typeof window === 'undefined') return;
  const w = window as PrerenderWindow;
  w.prerenderReady = false;
  w.__phlPrerenderHold = true;
}

/** Flip prerenderReady to true and release the pending hold. */
export function markPrerenderReady(): void {
  if (typeof window === 'undefined') return;
  const w = window as PrerenderWindow;
  w.__phlPrerenderHold = false;
  w.prerenderReady = true;
}

export interface WaitForDomOptions {
  /** Max time to wait before flipping ready regardless. Default 8000ms. */
  maxWaitMs?: number;
  /** Optional one-frame delay even when predicate already true (e.g. empty state). */
  oneFrameFallback?: boolean;
}

/**
 * Poll the DOM via requestAnimationFrame until `predicate` returns true, then
 * set window.prerenderReady = true. Always resolves within `maxWaitMs`.
 */
export function flipPrerenderReadyWhen(
  predicate: () => boolean,
  options: WaitForDomOptions = {},
): void {
  if (typeof window === 'undefined') return;
  const { maxWaitMs = MAX_WAIT_MS_DEFAULT, oneFrameFallback = false } = options;

  if (oneFrameFallback && predicate()) {
    requestAnimationFrame(() => markPrerenderReady());
    return;
  }

  const start = Date.now();
  const check = () => {
    if (predicate() || Date.now() - start > maxWaitMs) {
      markPrerenderReady();
      return;
    }
    requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}

/**
 * Wait until at least `expectedCount` elements matching `selector` exist
 * in the DOM, then flip prerenderReady. If `expectedCount === 0` (e.g. the
 * "no products" empty state), we wait a single frame and flip immediately.
 *
 * Cap on expected matches keeps polling cheap when catalogues are large.
 */
export function flipPrerenderReadyWhenRendered(
  selector: string,
  expectedCount: number,
  options: { maxWaitMs?: number; cap?: number } = {},
): void {
  if (typeof window === 'undefined') return;
  if (expectedCount <= 0) {
    requestAnimationFrame(() => markPrerenderReady());
    return;
  }
  const { maxWaitMs = MAX_WAIT_MS_DEFAULT, cap = 3 } = options;
  const target = Math.min(expectedCount, cap);
  flipPrerenderReadyWhen(
    () => document.querySelectorAll(selector).length >= target,
    { maxWaitMs },
  );
}
