/**
 * Prerender.io readiness helpers.
 *
 * Crawlers (prerender.io, Googlebot via prerender) read
 * `window.prerenderReady`. While it is `false`, the snapshot is held;
 * when it flips to `true`, the current DOM is captured.
 *
 * Use these helpers to coordinate "wait until real content is in the DOM"
 * across routes so we never snapshot an empty shell.
 */

const MAX_WAIT_MS_DEFAULT = 8000;

/**
 * No-op: route loaders now provide data synchronously to prerender, so we
 * never want to set prerenderReady=false (it would block snapshot capture
 * while we wait for client-side Firebase reads that aren't required for SEO).
 */
export function markPrerenderPending(): void {
  if (typeof window === 'undefined') return;
  (window as any).prerenderReady = true;
}

/** Force-flip prerenderReady to true (use for hard errors / abort paths). */
export function markPrerenderReady(): void {
  if (typeof window === 'undefined') return;
  (window as any).prerenderReady = true;
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
