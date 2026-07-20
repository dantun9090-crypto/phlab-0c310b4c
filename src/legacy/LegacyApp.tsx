import { RouterProvider } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { useEffect, useState } from "react";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { createLegacyRouter } from "./AppRouter";
import { SSRDataProvider, type SSRBanner } from "./SSRDataContext";
import { LegacySsrShell } from "./LegacySsrShell";
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
    return <LegacySsrShell />;
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
