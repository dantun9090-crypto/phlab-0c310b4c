/**
 * JSON-LD edge-case fixtures.
 *
 * Exercises the product and article head() functions against unusual
 * inputs (missing optional fields, zero stock, very short / very long
 * titles, exotic characters, missing SEO overrides) to ensure the
 * emitted JSON-LD stays structurally valid and parseable.
 *
 * Snapshots are also captured so any drift is reviewed.
 */
import { describe, it, expect } from "vitest";
import { Route as ProductRoute } from "../src/routes/products.$slug";
import { Route as SplatRoute } from "../src/routes/$";
import type { SeoProduct } from "../src/lib/firestore-rest";
import type { Article } from "../src/pages/Resources/data/articles";

type Script = { type: string; children: string };
type HeadResult = { scripts?: Script[] };

function extractJsonLd(head: HeadResult): any[] {
  return (head.scripts ?? [])
    .filter((s) => s.type === "application/ld+json")
    .map((s) => JSON.parse(s.children));
}

function callHead(route: any, ctx: any): HeadResult {
  return (route.options ?? route).head(ctx);
}

// ---------------------------------------------------------------------------
// Product edge-case fixtures
// ---------------------------------------------------------------------------

const PRODUCT_EDGE_CASES: Array<{ label: string; product: SeoProduct }> = [
  {
    label: "out-of-stock, no SEO overrides, no measurement in name",
    product: {
      id: "edge_oos",
      name: "Mystery Blend",
      slug: "mystery-blend",
      description: "Custom research blend.",
      category: "Blends",
      price: 19.99,
      imageUrl: "https://phlabs.co.uk/products/mystery-blend.jpg",
      isActive: true,
      visibility: "public",
      displayOrder: 99,
      stock: 0,
    },
  },
  {
    label: "very long name with unicode + microgram unit",
    product: {
      id: "edge_long",
      name: "Sémaglutide Análogo Ultra-Long-Acting 250 µg — Lot Δ12",
      slug: "semaglutide-analogue-250mcg",
      description: "Análogo of semaglutide — special-character description with “smart quotes” and em-dashes — for HPLC method development.",
      category: "Metabolic Research",
      price: 119.5,
      imageUrl: "https://phlabs.co.uk/products/semaglutide.jpg",
      isActive: true,
      visibility: "public",
      displayOrder: 10,
    },
  },
  {
    label: "no price (offer should be omitted)",
    product: {
      id: "edge_noprice",
      name: "Reference Standard 1g",
      slug: "reference-standard",
      description: "Reference standard for calibration.",
      category: "Standards",
      price: 0,
      imageUrl: "https://phlabs.co.uk/products/reference.jpg",
      isActive: true,
      visibility: "public",
      displayOrder: 11,
    },
  },
  {
    label: "custom seoTitle / seoDescription override",
    product: {
      id: "edge_seo",
      name: "KPV 10mg",
      slug: "kpv",
      description: "Tripeptide for inflammation research.",
      category: "Immunology Research",
      price: 27.0,
      imageUrl: "https://phlabs.co.uk/products/kpv.jpg",
      isActive: true,
      visibility: "public",
      displayOrder: 12,
      stock: 5,
      seoTitle: "KPV 10mg — Anti-Inflammatory Research Tripeptide | PH Labs",
      seoDescription: "Buy KPV 10mg, ≥99% HPLC verified anti-inflammatory tripeptide for laboratory research. Cold-chain shipped from PH Labs UK.",
    },
  },
  {
    label: "high-priced large molecular size",
    product: {
      id: "edge_high",
      name: "Tirzepatide 60mg",
      slug: "tirzepatide-60mg",
      description: "Large-format research vial.",
      category: "Metabolic Research",
      price: 299.0,
      imageUrl: "https://phlabs.co.uk/products/tirzepatide-60.jpg",
      isActive: true,
      visibility: "public",
      displayOrder: 13,
      stock: 100,
    },
  },
];

describe("Product JSON-LD — edge cases", () => {
  for (const { label, product } of PRODUCT_EDGE_CASES) {
    it(label, () => {
      const head = callHead(ProductRoute, {
        params: { slug: product.slug },
        loaderData: { product },
      });
      const blocks = extractJsonLd(head);
      const productBlock = blocks.find((b) => b["@type"] === "Product");
      const breadcrumb = blocks.find((b) => b["@type"] === "BreadcrumbList");

      // Always-present invariants
      expect(productBlock, "missing Product block").toBeTruthy();
      expect(breadcrumb, "missing BreadcrumbList").toBeTruthy();
      expect(productBlock!["@context"]).toBe("https://schema.org");
      expect(productBlock!.name).toBe(product.name);
      expect(productBlock!.url).toBe(`https://phlabs.co.uk/products/${product.slug}`);
      expect(productBlock!.image).toBeTruthy();
      expect(productBlock!.brand?.name).toBe("PH Labs");
      expect(productBlock!.aggregateRating).toBeTruthy();

      // Offer rules: present iff price > 0
      if (product.price && product.price > 0) {
        expect(productBlock!.offers).toBeTruthy();
        expect(productBlock!.offers.priceCurrency).toBe("GBP");
        const expectedAvail = (product.stock ?? 1) > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock";
        expect(productBlock!.offers.availability).toBe(expectedAvail);
      } else {
        expect(productBlock!.offers).toBeUndefined();
      }

      // Round-trips through JSON.stringify cleanly (no NaN, no circular refs)
      expect(() => JSON.stringify(blocks)).not.toThrow();
      expect(blocks).toMatchSnapshot();
    });
  }
});

// ---------------------------------------------------------------------------
// Article edge-case fixtures
// ---------------------------------------------------------------------------

const baseArticle: Omit<Article, "slug" | "title" | "excerpt" | "keywords" | "content"> & {
  slug?: string;
  title?: string;
  excerpt?: string;
  keywords?: string[];
  content?: Article["content"];
} = {
  subtitle: "Edge-case subtitle",
  category: "Test Category",
  readTime: 5,
  publishDate: "2026-01-01",
  references: [],
  relatedSlugs: [],
};

const ARTICLE_EDGE_CASES: Array<{ label: string; article: Article }> = [
  {
    label: "very short excerpt + single-word title",
    article: {
      ...(baseArticle as Article),
      slug: "edge-short",
      title: "HPLC",
      excerpt: "Short.",
      keywords: ["hplc"],
      content: [{ body: "One-line article body for snapshot." }],
    },
  },
  {
    label: "unicode title + smart quotes + long subtitle",
    article: {
      ...(baseArticle as Article),
      slug: "edge-unicode",
      title: "“Reτatrutide” vs Tirzepatide — Δ in Efficacy?",
      subtitle: "A deep dive into receptor pharmacology, half-life, and clinical trial outcomes across the GIP / GLP-1 / glucagon axis.",
      excerpt: "Análisis técnico — comparing triple-agonist Reτatrutide against dual-agonist Tirzepatide in metabolic research.",
      keywords: ["retatrutide", "tirzepatide", "GIP", "GLP-1", "glucagon"],
      content: [
        { heading: "Intro", body: "<p>HTML tags <strong>should</strong> be stripped from articleBody.</p>" },
        { heading: "Mechanism", body: "Multiple paragraphs of content with <a href=\"/products/retatrutide\">links</a> and other markup." },
      ],
    },
  },
  {
    label: "no keywords, single content section",
    article: {
      ...(baseArticle as Article),
      slug: "edge-no-keywords",
      title: "Cold-Chain Shipping Guide",
      excerpt: "Practical cold-chain shipping considerations for peptide research compounds.",
      keywords: [],
      content: [{ body: "Body of the cold-chain article." }],
    },
  },
  {
    label: "very long title (gets clamped) + many keywords",
    article: {
      ...(baseArticle as Article),
      slug: "edge-long-title",
      title: "An Exhaustively Long Title About Every Possible Receptor Interaction, Half-Life Modulation, Acylation Strategy, And Downstream Pharmacological Consequence Imaginable In Modern Peptide Research Today",
      excerpt: "A long-form review article on receptor pharmacology and acylation strategies.",
      keywords: ["receptor", "half-life", "acylation", "pharmacology", "review", "peptide", "modulation", "downstream"],
      content: [{ body: "Long article body." }],
    },
  },
  {
    label: "no readTime (timeRequired should still be a valid ISO duration)",
    article: {
      ...(baseArticle as Article),
      slug: "edge-no-readtime",
      title: "Quick Note On Storage",
      readTime: 0,
      excerpt: "Storage at -20°C preserves peptide integrity for extended periods.",
      keywords: ["storage"],
      content: [{ body: "Storage notes body." }],
    },
  },
];

describe("Article JSON-LD — edge cases", () => {
  for (const { label, article } of ARTICLE_EDGE_CASES) {
    it(label, () => {
      // Inject the fixture into the live articles array via mutation so the
      // splat route's article lookup finds it. The mutation is reverted at
      // the end of the test to keep the catalogue clean.
      const mod = require("../src/pages/Resources/data/articles") as {
        articles: Article[];
      };
      const original = mod.articles.length;
      mod.articles.push(article);
      try {
        const head = callHead(SplatRoute, {
          params: { _splat: `resources/${article.slug}` },
        });
        const blocks = extractJsonLd(head);
        const articleBlock = blocks.find((b) => b["@type"] === "Article");
        const breadcrumb = blocks.find((b) => b["@type"] === "BreadcrumbList");

        // Required Schema.org Article fields
        expect(articleBlock, "missing Article block").toBeTruthy();
        expect(breadcrumb, "missing BreadcrumbList").toBeTruthy();
        expect(articleBlock!["@context"]).toBe("https://schema.org");
        expect(articleBlock!.headline).toBeTruthy();
        expect(articleBlock!.headline.length).toBeLessThanOrEqual(110);
        expect(articleBlock!.description).toBeTruthy();
        expect(articleBlock!.datePublished).toBe(article.publishDate);
        expect(articleBlock!.author?.name).toBe("PH Labs UK");
        expect(articleBlock!.publisher?.name).toBe("PH Labs UK");
        expect(articleBlock!.mainEntityOfPage["@id"]).toBe(
          `https://phlabs.co.uk/resources/${article.slug}`,
        );

        // timeRequired must be a valid ISO 8601 duration (PT<n>M)
        expect(articleBlock!.timeRequired).toMatch(/^PT\d+M$/);

        // articleBody must not contain raw HTML tags
        expect(articleBlock!.articleBody).not.toMatch(/<[a-z]+[^>]*>/i);

        // Round-trips cleanly
        expect(() => JSON.stringify(blocks)).not.toThrow();
        expect(blocks).toMatchSnapshot();
      } finally {
        mod.articles.length = original;
      }
    });
  }
});
