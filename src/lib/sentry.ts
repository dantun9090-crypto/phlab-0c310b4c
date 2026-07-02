/**
 * Sentry frontend init for PH Labs.
 *
 * DSN is a publishable identifier — safe to ship in the client bundle.
 * Override at build time with VITE_SENTRY_DSN if you rotate the project.
 *
 * Loaded once from src/client.tsx before React mounts so errors during
 * hydration, mount timeouts, and checkout/payment flows are captured
 * with release context.
 */
import * as Sentry from "@sentry/react";

const DEFAULT_DSN =
  "https://621ae68ffb959b3c3e9cc664ba91e480@o4511662760525824.ingest.de.sentry.io/4511662778286160";

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  if (typeof window === "undefined") return;

  const dsn =
    (import.meta.env.VITE_SENTRY_DSN as string | undefined) || DEFAULT_DSN;
  if (!dsn) return;

  const isProd = import.meta.env.PROD;
  const buildId =
    (typeof document !== "undefined" &&
      document.querySelector('meta[name="build-id"]')?.getAttribute("content")) ||
    (import.meta.env.VITE_BUILD_ID as string | undefined) ||
    undefined;

  try {
    Sentry.init({
      dsn,
      environment: isProd ? "production" : "development",
      release: buildId,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: false,
          blockAllMedia: false,
          // Never capture inputs/PII in checkout, auth, account flows.
          mask: ['input', 'textarea', '[data-sentry-mask]'],
        }),
      ],
      // Performance: sample lightly in prod, full in dev.
      tracesSampleRate: isProd ? 0.1 : 1.0,
      tracePropagationTargets: [
        "localhost",
        /^https:\/\/phlabs\.co\.uk\/api\//,
        /^https:\/\/www\.phlabs\.co\.uk\/api\//,
      ],
      // Session replay: sample 10% normally, 100% on error.
      replaysSessionSampleRate: isProd ? 0.02 : 0.1,
      replaysOnErrorSampleRate: 1.0,
      // PII scrubbing — never send auth cookies, tokens, or bank details.
      sendDefaultPii: false,
      beforeSend(event) {
        try {
          // Drop noise from ephemeral Lovable sandbox previews — only
          // production (phlabs.co.uk) events matter for alerting.
          const host =
            (typeof window !== "undefined" && window.location?.hostname) || "";
          if (
            event.environment === "development" &&
            (/\.lovableproject\.com$/i.test(host) ||
              /\.lovable\.app$/i.test(host) ||
              /\.lovable\.dev$/i.test(host))
          ) {
            return null;
          }
          // Drop request cookies / auth headers if present.
          if (event.request) {
            delete event.request.cookies;
            if (event.request.headers) {
              delete (event.request.headers as Record<string, unknown>).authorization;
              delete (event.request.headers as Record<string, unknown>).Authorization;
              delete (event.request.headers as Record<string, unknown>).cookie;
            }
          }
          // Never ship checkout body content.
          if (event.request?.url && /\/(checkout|payment|api\/(webhooks|public\/hooks))/i.test(event.request.url)) {
            if (event.request.data) event.request.data = "[redacted]";
          }
        } catch {
          /* never break Sentry */
        }
        return event;
      },

    });
    initialized = true;
  } catch (err) {
    // Never let Sentry init crash the app.
    console.warn("[sentry] init failed", err);
  }
}
