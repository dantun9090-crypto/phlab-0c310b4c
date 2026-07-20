/**
 * Lazy Sentry bridge.
 *
 * Boot-critical modules (ErrorBoundary, dynamic-import) need to REPORT to
 * Sentry without STATICALLY importing @sentry/react: a static import pulls
 * the ~1.2MB vendor-sentry chunk into the initial bundle, where its
 * parse+eval was the single biggest main-thread cost on mobile
 * (~27s bootup-time in Lighthouse, LCP ~9.5s).
 *
 * This module has NO runtime dependency on the SDK (type-only imports are
 * erased at build), so the chunk only loads when an error/breadcrumb
 * actually occurs — or when the deferred init in client.tsx loads it.
 */
import type * as SentryTypes from "@sentry/react";

type SentryModule = typeof SentryTypes;

// Boot-time events are QUEUED, not loaded: importing the SDK on the first
// breadcrumb/exception pulls the ~1.2MB vendor-sentry chunk into the
// post-FCP main-thread window (~500ms scripting — the desktop TBT gate
// fails at >300ms). The deferred init in client.tsx (first interaction or
// load+8s) calls flushSentryQueue() to replay everything. Uncaught errors
// in the gap are still captured by the first-party client-error-reporter,
// so a closed tab before flush loses nothing operationally.
let sdk: SentryModule | null = null;
const queue: Array<(Sentry: SentryModule) => void> = [];
const QUEUE_MAX = 100;

/**
 * Called once by the deferred boot init (client.tsx) after the SDK chunk
 * loads. Replays every queued event in order. Idempotent.
 */
export function flushSentryQueue(Sentry: SentryModule): void {
  if (sdk) return;
  sdk = Sentry;
  while (queue.length) {
    const fn = queue.shift()!;
    try {
      fn(Sentry);
    } catch {
      /* never break the app for monitoring */
    }
  }
}

/** Run `fn` with the SDK once the boot init flushes. Never throws. */
export function withSentryLazy(fn: (Sentry: SentryModule) => void): void {
  try {
    if (sdk) {
      fn(sdk);
      return;
    }
    if (queue.length < QUEUE_MAX) queue.push(fn);
  } catch {
    /* never break */
  }
}

export function captureExceptionLazy(
  error: unknown,
  context?: {
    tags?: Record<string, string>;
    contexts?: Record<string, Record<string, unknown>>;
    fingerprint?: string[];
  },
): void {
  withSentryLazy((Sentry) => {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context?.tags ?? {})) {
        scope.setTag(key, value);
      }
      for (const [key, value] of Object.entries(context?.contexts ?? {})) {
        scope.setContext(key, value);
      }
      if (context?.fingerprint) scope.setFingerprint(context.fingerprint);
      Sentry.captureException(error);
    });
  });
}

export function addBreadcrumbLazy(
  breadcrumb: SentryTypes.Breadcrumb,
): void {
  withSentryLazy((Sentry) => Sentry.addBreadcrumb(breadcrumb));
}
