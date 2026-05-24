import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, lazy, Suspense } from "react";

const LegacyApp = lazy(() => import("@/legacy/LegacyApp"));

const HOME_TITLE = "HPLC-Verified Research Peptides UK | Pro Health";
const HOME_DESCRIPTION =
  "UK supplier of HPLC-verified research peptides. Lab-tested purity, transparent COAs, and fast UK dispatch for research professionals.";
const HOME_URL = "https://www.prohealthpeptides.co.uk/";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { key: "title", title: HOME_TITLE },
      { key: "description", name: "description", content: HOME_DESCRIPTION },
      { key: "og:title", property: "og:title", content: HOME_TITLE },
      { key: "og:description", property: "og:description", content: HOME_DESCRIPTION },
      { key: "og:type", property: "og:type", content: "website" },
      { key: "og:url", property: "og:url", content: HOME_URL },
      { key: "twitter:title", name: "twitter:title", content: HOME_TITLE },
      { key: "twitter:description", name: "twitter:description", content: HOME_DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: HOME_URL }],
  }),
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
