import { useEffect, useState, type ComponentType } from "react";
import { hardReload, isStaleChunkError } from "@/lib/recovery";

type LegacyAppComponent = ComponentType;

function LegacyFallback() {
  return null;
}

export default function LegacyClientApp() {
  const [LegacyApp, setLegacyApp] = useState<LegacyAppComponent | null>(null);

  useEffect(() => {
    let alive = true;

    const load = (attempt: number): Promise<void> =>
      import("./LegacyApp").then(
        (module) => {
          if (alive) setLegacyApp(() => module.default);
        },
        (err) => {
          if (!alive) return;
          if (isStaleChunkError(err)) {
            if (attempt < 1) {
              return new Promise<void>((resolve) => {
                setTimeout(() => resolve(load(attempt + 1)), 400);
              });
            }
            // Stale deploy — self-heal instead of throwing to onunhandledrejection.
            void hardReload({ clean: true });
            return;
          }
          // Non-stale failure: let Sentry pick it up but don't leave it as an
          // unhandled rejection.
          console.error("[LegacyClientApp] dynamic import failed", err);
        },
      );

    void load(0);
    return () => {
      alive = false;
    };
  }, []);

  return LegacyApp ? <LegacyApp /> : <LegacyFallback />;
}
