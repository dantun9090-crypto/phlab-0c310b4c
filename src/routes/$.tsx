import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, lazy, Suspense } from "react";

const LegacyApp = lazy(() => import("@/legacy/LegacyApp"));

const SITE_URL = "https://www.prohealthpeptides.co.uk";
const SITE_NAME = "Pro Health Peptides UK";
const BRAND = "Pro Health UK";

type PageMeta = {
  title: string;
  description: string;
  ogType: "website" | "product" | "article";
};

function titleize(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

// Clamp a string to a max length, trimming on a word boundary where possible.
function clamp(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + "…";
}

function metaForPath(splat: string): PageMeta {
  const path = (splat || "").replace(/^\/+|\/+$/g, "");
  const segments = path.split("/").filter(Boolean);
  const first = segments[0] ?? "";
  const last = segments[segments.length - 1] ?? "";

  // Product detail pages — keep title <60 incl. parent segment for uniqueness.
  if (first === "products" && segments.length > 1) {
    const name = titleize(last);
    const title = clamp(`${name} — Peptide | ${BRAND}`, 60);
    const description = clamp(
      `${name}: HPLC-verified research peptide with COA. UK dispatch from Pro Health Peptides.`,
      160,
    );
    return { title, description, ogType: "product" };
  }

  // Research / article pages — include parent segment so /research/x and
  // /resources/x produce distinct titles and og:titles.
  if ((first === "research" || first === "resources") && segments.length > 1) {
    const name = titleize(last);
    const parent = first === "research" ? "Research" : "Resource";
    const title = clamp(`${name} — ${parent} | ${BRAND}`, 60);
    const description = clamp(
      `${name}: ${parent.toLowerCase()} notes and references from Pro Health Peptides UK.`,
      160,
    );
    return { title, description, ogType: "article" };
  }


  const presets: Record<string, PageMeta> = {
    products: {
      title: `Research Peptides — Full Catalogue | ${SITE_NAME}`,
      description: `Browse HPLC-verified research peptides from ${SITE_NAME}. Lab-tested purity, transparent COAs, fast UK dispatch.`,
      ogType: "website",
    },
    research: {
      title: `Research Library | ${SITE_NAME}`,
      description: `Research notes, protocols, and reference material for peptides supplied by ${SITE_NAME}.`,
      ogType: "website",
    },
    resources: {
      title: `Resources | ${SITE_NAME}`,
      description: `Guides, FAQs, and reference material for research peptide users.`,
      ogType: "website",
    },
    "lab-reports": {
      title: `Lab Reports & Purity Certificates | ${SITE_NAME}`,
      description: `Third-party HPLC and mass-spectrometry reports for every batch of ${SITE_NAME} peptides.`,
      ogType: "website",
    },
    "quality-control": {
      title: `Quality Control — HPLC & MS Testing | ${SITE_NAME}`,
      description: `How ${SITE_NAME} verifies purity through HPLC and mass-spectrometry analysis on every batch.`,
      ogType: "website",
    },
    "storage-guide": {
      title: `Peptide Storage Guide | ${SITE_NAME}`,
      description: `Best practices for storing, reconstituting, and handling research peptides safely.`,
      ogType: "article",
    },
    about: {
      title: `About ${SITE_NAME}`,
      description: `UK-based research peptide supplier focused on HPLC-verified purity and transparent quality control.`,
      ogType: "website",
    },
    contact: {
      title: `Contact ${SITE_NAME}`,
      description: `Get in touch with ${SITE_NAME} for research peptide enquiries, lab reports, or trade accounts.`,
      ogType: "website",
    },
    "shipping-policy": {
      title: `Shipping Policy | ${SITE_NAME}`,
      description: `UK and international shipping information for ${SITE_NAME} research peptide orders.`,
      ogType: "website",
    },
    "refund-policy": {
      title: `Refund Policy | ${SITE_NAME}`,
      description: `Refund and returns policy for research peptide orders from ${SITE_NAME}.`,
      ogType: "website",
    },
    "terms-and-conditions": {
      title: `Terms & Conditions | ${SITE_NAME}`,
      description: `Terms and conditions for using ${SITE_NAME} and purchasing research peptides.`,
      ogType: "website",
    },
    "privacy-policy": {
      title: `Privacy Policy | ${SITE_NAME}`,
      description: `How ${SITE_NAME} collects, uses, and protects customer data.`,
      ogType: "website",
    },
    cookies: {
      title: `Cookie Policy | ${SITE_NAME}`,
      description: `How ${SITE_NAME} uses cookies and similar technologies on this site.`,
      ogType: "website",
    },
    search: {
      title: `Search | ${SITE_NAME}`,
      description: `Search the ${SITE_NAME} catalogue of research peptides.`,
      ogType: "website",
    },
  };

  if (first && presets[first]) return presets[first];

  // Generic fallback derived from path
  const label = path ? titleize(last) : SITE_NAME;
  const trail = segments.length > 1 ? segments.slice(0, -1).map(titleize).join(" › ") : "";
  return {
    title: path ? `${label} | ${SITE_NAME}` : `${SITE_NAME} — HPLC-Verified Research Peptides`,
    description: path
      ? `${label}${trail ? ` (${trail})` : ""} — information and resources from ${SITE_NAME}, UK supplier of HPLC-verified research peptides.`
      : `${SITE_NAME} — UK supplier of HPLC-verified research peptides with transparent COAs and fast dispatch.`,
    ogType: "website",
  };

}

export const Route = createFileRoute("/$")({
  ssr: false,
  head: ({ params }) => {
    const splat = (params as { _splat?: string })._splat ?? "";
    const pageMeta = metaForPath(splat);
    const url = `${SITE_URL}/${splat.replace(/^\/+/, "")}`;
    return {
      meta: [
        { title: pageMeta.title },
        { name: "description", content: pageMeta.description },
        { property: "og:title", content: pageMeta.title },
        { property: "og:description", content: pageMeta.description },
        { property: "og:type", content: pageMeta.ogType },
        { property: "og:url", content: url },
        { name: "twitter:title", content: pageMeta.title },
        { name: "twitter:description", content: pageMeta.description },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
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
