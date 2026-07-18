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
          // maskAllText/blockAllMedia: full text+media serialization on every
          // DOM mutation was the single biggest main-thread cost on mobile
          // (vendor-sentry ~29s bootup in Lighthouse). Masking is both cheaper
          // and privacy-safer (no page text ever leaves the browser).
          maskAllText: true,
          blockAllMedia: true,
          // Never capture inputs/PII in checkout, auth, account flows.
          mask: ['input', 'textarea', '[data-sentry-mask]'],
        }),
      ],
      // Noise filters — Safari network errors and third-party script errors
      // fire constantly on iOS Mobile Safari and drown real alerts.
      ignoreErrors: [
        // Safari's generic fetch/network failure — not actionable, usually
        // a dropped connection or user navigation mid-request.
        "Load failed",
        "Failed to fetch",
        "NetworkError when attempting to fetch resource",
        "The network connection was lost",
        "cancelled",
        "The operation couldn’t be completed",
        // Third-party inline script on legacy (301→apex) domain:
        // "Cannot read properties of null (reading 'document')"
        // originates from an analytics/prerender snippet, not our bundle.
        "Cannot read properties of null (reading 'document')",
        "null is not an object (evaluating 'document')",
        // Safari extensions / iframes noise.
        "ResizeObserver loop",
        "Non-Error promise rejection captured",
      ],
      denyUrls: [
        // Anything served from the legacy domain — full 301→apex, we don't
        // own the injected third-party scripts served there.
        /prohealthpeptides\.co\.uk/i,
        // Common third-party script hosts we can't fix from our side.
        /bat\.bing\.(com|net)/i,
        /googletagmanager\.com/i,
        /google-analytics\.com/i,
        /clarity\.ms/i,
        /doubleclick\.net/i,
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

          // Hydration-mismatch dedupe & downgrade on /products/*.
          // Firefox Mobile / Safari occasionally crash into a removeChild /
          // parentNode-null loop on product pages. CSR fallback recovers,
          // but Sentry issue 99f7c25b was drowning real alerts. We keep
          // sending (to know if it persists) but as `warning` and deduped
          // per (slug + message) within 5 minutes.
          try {
            const msg = String(
              (event.message as string | undefined) ??
                (event.exception?.values?.[0]?.value as string | undefined) ??
                "",
            );
            const type = String(event.exception?.values?.[0]?.type ?? "");
            const url = String(
              event.request?.url ??
                (typeof location !== "undefined" ? location.href : ""),
            );
            const isHydrationSignature =
              /removeChild|parentNode is null|insertBefore|replaceChild|hydrat|not a child of this node|NotFoundError/i.test(
                msg,
              );
            const isProductRoute = /\/products\//i.test(url);
            const isReactBundle = /\/assets\/index-[\w-]+\.js/i.test(
              (event.exception?.values?.[0]?.stacktrace?.frames || [])
                .map((f) => f.filename ?? "")
                .join(" "),
            );
            if (isHydrationSignature && (isProductRoute || type === "TypeError")) {
              event.level = "warning";
              event.tags = { ...(event.tags || {}), "hydration-mismatch": "true" };
              if (isProductRoute && isReactBundle) {
                event.fingerprint = [
                  "hydration-mismatch",
                  "products",
                  url.replace(/[?#].*$/, ""),
                ];
              }
              try {
                const slug = (url.match(/\/products\/([^/?#]+)/i) || [])[1] || "_";
                const key = `__phl_sentry_hyd_${slug}_${msg.slice(0, 40)}`;
                const now = Date.now();
                const last = Number(sessionStorage.getItem(key) || "0");
                if (now - last < 5 * 60_000) return null;
                sessionStorage.setItem(key, String(now));
              } catch {
                /* ignore */
              }
            }
          } catch {
            /* never break Sentry */
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
