import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, lazy, Suspense } from "react";

const LegacyApp = lazy(() => import("@/legacy/LegacyApp"));

export const Route = createFileRoute("/$")({
  ssr: false,
  component: LegacyMount,
});

function LegacyMount() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <LegacyApp />
    </Suspense>
  );
}
