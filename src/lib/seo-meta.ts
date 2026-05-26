/**
 * Pure SEO metadata helpers shared by the splat route and the
 * automated regression check (scripts/seo-check.ts).
 *
 * Keeping this module dependency-free lets us import it from Node without
 * pulling in the TanStack/React route runtime.
 */

export const SEO_LIMITS = {
  /** Max <title> length before search engines truncate. */
  titleMax: 60,
  /** Max meta description length before search engines truncate. */
  descriptionMax: 160,
  /** Soft lower bound — anything shorter is usually too thin. */
  descriptionMin: 50,
} as const;

export const SITE_URL = "https://www.prohealthpeptides.co.uk";
export const SITE_NAME = "PH Labs UK";
export const BRAND = "PH Labs UK";

/**
 * Build the canonical URL for a splat-rendered path. Strips leading and
 * trailing slashes from the splat so /products and /products/ produce the
 * exact URL the sitemap advertises. Home ("") stays as "${SITE_URL}/".
 */
export function canonicalUrl(splat: string): string {
  const normalised = (splat || "").replace(/^\/+|\/+$/g, "");
  return normalised ? `${SITE_URL}/${normalised}` : `${SITE_URL}/`;
}


export type PageMeta = {
  title: string;
  description: string;
  ogType: "website" | "product" | "article";
};

export function titleize(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

/** Clamp a string to a max length, trimming on a word boundary where possible. */
export function clamp(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + "…";
}

export function metaForPath(splat: string): PageMeta {
  const path = (splat || "").replace(/^\/+|\/+$/g, "");
  const segments = path.split("/").filter(Boolean);
  const first = segments[0] ?? "";
  const last = segments[segments.length - 1] ?? "";

  if (first === "products" && segments.length > 1) {
    const name = titleize(last);
    return {
      title: clamp(`${name} — Peptide | ${BRAND}`, SEO_LIMITS.titleMax),
      description: clamp(
        `${name}: HPLC-verified research peptide with COA. UK dispatch from PH Labs.`,
        SEO_LIMITS.descriptionMax,
      ),
      ogType: "product",
    };
  }

  if ((first === "research" || first === "resources") && segments.length > 1) {
    const name = titleize(last);
    const parent = first === "research" ? "Research" : "Resource";
    return {
      title: clamp(`${name} — ${parent} | ${BRAND}`, SEO_LIMITS.titleMax),
      description: clamp(
        `${name}: ${parent.toLowerCase()} notes and references from PH Labs UK.`,
        SEO_LIMITS.descriptionMax,
      ),
      ogType: "article",
    };
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
