import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { safeDynamicImport } from "@/lib/dynamic-import";
import { DynamicImportFallback } from "@/components/DynamicImportFallback";
import { LegacySsrShell } from "./LegacySsrShell";
import type { SSRBanner } from "./SSRDataContext";

type LegacyAppComponent = ComponentType<{
  initialPath?: string;
  initialBanner?: SSRBanner | null;
}>;

export default function LegacyClientApp({
  initialPath = "/",
  initialBanner = null,
  fallback = null,
}: {
  initialPath?: string;
  initialBanner?: SSRBanner | null;
  fallback?: ReactNode;
}) {
  const [LegacyApp, setLegacyApp] = useState<LegacyAppComponent | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    void safeDynamicImport(() => import("./LegacyApp"), {
      label: "LegacyApp",
      maxRetries: 2,
      backoffMs: 400,
      signal: controller.signal,
    }).then((outcome) => {
      if (controller.signal.aborted) return;
      if (outcome.ok) {
        outcome.module.primeLegacyRouter?.();
        setLegacyApp(() => outcome.module.default);
        return;
      }
      // "stale" already triggered hardReload; showing the fallback for the
      // few ms before navigation is harmless. "aborted" only fires when the
      // component unmounted, so state won't be set anyway.
      if (outcome.reason === "failed" || outcome.reason === "stale") {
        setFailed(true);
      }
    });

    return () => controller.abort();
  }, []);

  if (LegacyApp) return <LegacyApp initialPath={initialPath} initialBanner={initialBanner} />;
  if (failed) return <DynamicImportFallback label="LegacyApp" />;
  // Pre-mount: keep painting the static hero shell so something meaningful
  // stays on screen during the LegacyApp chunk waterfall instead of a blank
  // dark page. This matters for EVERY legacy route, not just "/": the SSR
  // worker already serves this same generic shell in the HTML, so when the
  // hydrated tree rendered `null` here, the painted shell got unmounted and
  // the page went blank ("Loading PH Labs…") until the chunk arrived —
  // pushing mobile LCP on /research to ~6.5s in the Lighthouse gate.
  // Keeping the shell until LegacyApp is ready preserves the early LCP
  // paint; the swap cost is identical either way.
  if (!fallback) {
    return <LegacySsrShell />;
  }
  return <>{fallback}</>;
}
