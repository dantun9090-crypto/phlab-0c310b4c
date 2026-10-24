import { RouterProvider } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { useEffect, useState } from "react";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { createLegacyRouter } from "./AppRouter";
import { SSRDataProvider, type SSRBanner } from "./SSRDataContext";
import { LegacySsrShell } from "./LegacySsrShell";
import "@/legacy-styles.css";

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
