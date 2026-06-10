import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const LegacyApp = lazy(() => import("./LegacyApp"));

function LegacyFallback() {
  return null;
}

export default function LegacyClientApp() {
  return (
    <ClientOnly fallback={<LegacyFallback />}>
      <Suspense fallback={<LegacyFallback />}>
        <LegacyApp />
      </Suspense>
    </ClientOnly>
  );
}