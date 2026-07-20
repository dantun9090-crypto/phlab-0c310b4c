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
  // Home pre-mount: paint the static hero shell so something meaningful is
  // on screen during the LegacyApp/Home chunk waterfall instead of a blank
  // dark page. Scoped to "/" — the shell's hero copy is home-specific.
  if (!fallback && (initialPath === "/" || initialPath === "")) {
    return <LegacySsrShell />;
  }
  return <>{fallback}</>;
}
