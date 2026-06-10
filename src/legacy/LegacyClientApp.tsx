import { useEffect, useState, type ComponentType } from "react";

type LegacyAppComponent = ComponentType;

function LegacyFallback() {
  return null;
}

export default function LegacyClientApp() {
  const [LegacyApp, setLegacyApp] = useState<LegacyAppComponent | null>(null);

  useEffect(() => {
    let alive = true;
    void import("./LegacyApp").then((module) => {
      if (alive) setLegacyApp(() => module.default);
    });
    return () => {
      alive = false;
    };
  }, []);

  return LegacyApp ? <LegacyApp /> : <LegacyFallback />;
}