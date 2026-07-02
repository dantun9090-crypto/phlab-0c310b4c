import { useEffect, useState, type ComponentType } from "react";
import { safeDynamicImport } from "@/lib/dynamic-import";
import { DynamicImportFallback } from "@/components/DynamicImportFallback";

type LegacyAppComponent = ComponentType;

export default function LegacyClientApp() {
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

  if (LegacyApp) return <LegacyApp />;
  if (failed) return <DynamicImportFallback label="LegacyApp" />;
  return null;
}
