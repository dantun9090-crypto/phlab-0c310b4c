import { RouterProvider } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { useEffect, useState } from "react";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { createLegacyRouter } from "./AppRouter";
import { SSRDataProvider, type SSRBanner } from "./SSRDataContext";
import "@/legacy-styles.css";

// Kick off the Home chunk download at module-eval time (parallel with
// LegacyApp's own mount). Without this the waterfall is:
//   LegacyApp chunk → LegacyApp mount → RouterProvider matches "/" →
//   THEN fetch @/pages/Home chunk → parse → first render.
// That waterfall was the ~2.5 s LegacyApp→HomePage gap in perf logs.
// Firing the import here overlaps the Home chunk fetch with LegacyApp
// rendering, so by the time the router matches "/" the module is ready.
if (typeof window !== "undefined" && window.location.pathname === "/") {
  void import("@/pages/Home");
}

let browserRouter: ReturnType<typeof createLegacyRouter> | null = null;

export function primeLegacyRouter() {
  if (typeof document !== "undefined" && !browserRouter) {
    browserRouter = createLegacyRouter("/");
  }
}

function getLegacyRouter(initialPath: string) {
  if (typeof document === "undefined") {
    return createLegacyRouter(initialPath);
  }
  if (!browserRouter) browserRouter = createLegacyRouter("/");
  return browserRouter;
}

export default function LegacyApp({
  initialPath = "/",
  initialBanner = null,
}: {
  initialPath?: string;
  initialBanner?: SSRBanner | null;
}) {
  const [mounted, setMounted] = useState(() => typeof document !== "undefined");

  useEffect(() => {
    try { performance.mark('legacy-app-mount-start'); } catch { /* ignore */ }
    // Track whether the tab was ever hidden between mount-start and mount-end.
    // Backgrounded tabs throttle rAF/timers, so a "77 s mount" in the console
    // is really just the browser suspending our RAF callback while the user
    // was on another tab — not a real perf regression. We skip the log in
    // that case so the signal isn't drowned by phantom stalls.
    let wasHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const onVis = () => { if (document.visibilityState === 'hidden') wasHidden = true; };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
    primeLegacyRouter();

    // Preload HomePage lazy children in parallel with LegacyApp mount so they
    // don't waterfall after HomePage's own chunk resolves. Fire-and-forget:
    // Vite resolves these to the built chunk URLs and the browser downloads
    // them alongside the LegacyApp chunk. When HomePage's React.lazy() reads
    // the same modules the promise is already fulfilled — no extra RTT.
    if (typeof window !== 'undefined' && window.location.pathname === '/') {
      void import('@/components/AnimatedBackground');
      void import('@/components/NewsletterPopup');
      void import('@/components/MarketingAdvertSlot');
    }

    if (!mounted) setMounted(true);
    requestAnimationFrame(() => {
      try {
        performance.mark('legacy-app-mount-end');
        performance.measure('legacy-app-mount', 'legacy-app-mount-start', 'legacy-app-mount-end');
        const m = performance.getEntriesByName('legacy-app-mount')[0];
        if (m && !wasHidden) console.log('[PERF] LegacyApp mount:', m.duration.toFixed(1), 'ms');
      } catch { /* ignore */ }
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
    });
  }, [mounted]);


  if (!mounted) {
    return (
      <div
        className="phl-ssr-shell"
        aria-hidden="false"
        style={{ minHeight: '100vh', background: '#020617', color: '#f0f8ff' }}
      >
        {/* Static hero shell — paints LCP text from SSR HTML without waiting for JS hydration.
            React replaces this with the real Home component once mounted flips true. */}
        <section
          style={{
            position: 'relative',
            padding: '80px 16px 48px',
            maxWidth: 1280,
            margin: '0 auto',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 12px',
                  borderRadius: 999,
                  background: 'rgba(16,185,129,0.1)',
                  border: '1px solid rgba(16,185,129,0.25)',
                  color: '#4ade80',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                UK Laboratory Reagent Supplier · Research Use Only
              </span>
            </div>

            <h1
              style={{
                fontSize: 'clamp(1.75rem, 7.5vw, 4.2rem)',
                fontWeight: 900,
                lineHeight: 1.04,
                color: '#f0f8ff',
                margin: 0,
              }}
            >
              <span style={{ display: 'block' }}>Pro Peptide Research Lab </span>
              <span style={{ display: 'block', color: '#10b981' }}>For In-Vitro Research</span>
              <span
                style={{
                  display: 'block',
                  color: '#c9d8f0',
                  fontWeight: 400,
                  fontSize: '0.72em',
                }}
              >
                HPLC-Verified ≥99% Purity · CoA Per Batch
              </span>
            </h1>

            <p
              style={{
                fontSize: '1.05rem',
                lineHeight: 1.75,
                color: '#9cb8d9',
                maxWidth: 480,
                margin: 0,
              }}
            >
              As a pro peptide research lab, PH Labs synthesises high-purity amino acids and analytical-grade laboratory reagents for qualified UK researchers — supplied for in-vitro scientific research purposes only. HPLC and mass-spectrometry verified, Certificate of Analysis with every batch.{' '}
              <strong style={{ color: '#f0a0a0' }}>
                Research Use Only — Not For Human Consumption.
              </strong>
            </p>

            {/* Banner skeleton — occupies real hero footprint to prevent CLS */}
            <div
              aria-hidden="true"
              style={{
                marginTop: 24,
                width: '100%',
                aspectRatio: '16 / 9',
                maxWidth: 960,
                borderRadius: 12,
                background:
                  'linear-gradient(90deg, rgba(15,23,42,0.6) 0%, rgba(30,41,59,0.6) 50%, rgba(15,23,42,0.6) 100%)',
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            />
          </div>
        </section>

        {/* Product grid skeleton */}
        <section style={{ padding: '48px 16px', maxWidth: 1280, margin: '0 auto' }}>
          <div
            style={{
              display: 'grid',
              gap: 24,
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            }}
          >
            {[0, 1, 2, 3, 4].map(i => (
              <div
                key={i}
                aria-hidden="true"
                style={{
                  height: 320,
                  borderRadius: 12,
                  background:
                    'linear-gradient(180deg, rgba(15,23,42,0.6) 0%, rgba(30,41,59,0.6) 100%)',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
              />
            ))}
          </div>
        </section>

        <span className="sr-only" style={{ position: 'absolute', left: -9999 }} aria-live="polite">
          Loading PH Labs…
        </span>
      </div>
    );
  }

  const router = getLegacyRouter(initialPath);

  return (
    <HelmetProvider>
      <ThemeProvider>
        <SSRDataProvider value={{ banner: initialBanner }}>
          <RouterProvider router={router} />
        </SSRDataProvider>
      </ThemeProvider>
    </HelmetProvider>
  );
}
