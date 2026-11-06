import { createFileRoute } from "@tanstack/react-router";
import { LegacyMount, legacyHead } from "@/lib/legacy-mount";

export const Route = createFileRoute("/install")({
  head: () => {
    const h = legacyHead("/install");
    return { ...h, meta: [...h.meta, { name: "robots", content: "noindex, follow" }] };
  },
  component: () => <LegacyMount path="/install" />,
});
