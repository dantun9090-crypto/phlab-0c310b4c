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

let pending: Promise<SentryModule> | null = null;

function loadSentry(): Promise<SentryModule> {
  if (!pending) {
    pending = import("@/lib/sentry").then((mod) => {
      // Idempotent — if the deferred boot init already ran this is a no-op,
      // and if an early crash beat the scheduler we still capture the event.
      mod.initSentry();
      return import("@sentry/react");
    });
  }
  return pending;
}

/** Run `fn` with the SDK once loaded. Never throws, never blocks. */
export function withSentryLazy(fn: (Sentry: SentryModule) => void): void {
  try {
    void loadSentry()
      .then((Sentry) => {
        try {
          fn(Sentry);
        } catch {
          /* never break the app for monitoring */
        }
      })
      .catch(() => {
        /* SDK chunk unavailable — drop the event */
      });
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
