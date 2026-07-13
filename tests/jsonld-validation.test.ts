/**
 * Build-time JSON-LD validation.
 *
 * Parses the JSON-LD emitted by the product detail route
 * (`/products/$slug`) and the catch-all resource route (`/$`) for every
 * known product and article, and fails the build if required
 * Schema.org properties are missing or if duplicate @type blocks of
 * the same primary entity are emitted on a single page.
 *
 * Run with: bunx vitest run tests/jsonld-validation.test.ts
 */
import { describe, it, expect } from "vitest";
import { Route as ProductRoute } from "../src/routes/products.$slug";
import { Route as SplatRoute } from "../src/routes/$";
import { articles } from "../src/pages/Resources/data/articles";
import type { SeoProduct } from "../src/lib/firestore-rest";

type Script = { type: string; children: string };
type HeadResult = { scripts?: Script[]; meta?: any[]; links?: any[] };

function extractJsonLd(head: HeadResult): any[] {
  const scripts = head.scripts ?? [];
  return scripts
    .filter((s) => s.type === "application/ld+json")
    .map((s) => {
      try {
        return JSON.parse(s.children);
      } catch (err) {
        throw new Error(`Invalid JSON in <script type=application/ld+json>: ${(err as Error).message}\n${s.children}`);
      }
    });
}

function callHead(route: any, ctx: any): HeadResult {
  const head = (route.options ?? route).head;
  if (typeof head !== "function") {
    throw new Error("Route has no head() function");
  }
  return head(ctx);
}

const PRODUCT_REQUIRED = ["@context", "@type", "name", "description", "image", "url", "brand"] as const;
const ARTICLE_REQUIRED = [
  "@context",
  "@type",
  "headline",
  "description",
  "image",
  "datePublished",
  "author",
  "publisher",
  "mainEntityOfPage",
] as const;

const SAMPLE_PRODUCT: SeoProduct = {
  id: "test-id",
  name: "Tirzepatide 10mg",
  slug: "tirzepatide",
  description: "Research-grade tirzepatide for laboratory use.",
  category: "Metabolic Research",
  price: 49.99,
  imageUrl: "https://phlabs.co.uk/products/tirzepatide.jpg",
  isActive: true,
  visibility: "public",
  displayOrder: 1,
  stock: 25,
};

describe("Product JSON-LD (/products/$slug)", () => {
  const head = callHead(ProductRoute, {
    params: { slug: SAMPLE_PRODUCT.slug },
    loaderData: { product: SAMPLE_PRODUCT },
  });
  const blocks = extractJsonLd(head);
  const productBlocks = blocks.filter((b) => b["@type"] === "Product");
  const breadcrumbBlocks = blocks.filter((b) => b["@type"] === "BreadcrumbList");

  it("emits exactly one Product block", () => {
    expect(productBlocks).toHaveLength(1);
  });

  it("emits exactly one BreadcrumbList block", () => {
    expect(breadcrumbBlocks).toHaveLength(1);
  });

  it("Product block has all required Schema.org fields", () => {
    const p = productBlocks[0];
    for (const key of PRODUCT_REQUIRED) {
      expect(p[key], `Product is missing "${key}"`).toBeTruthy();
    }
    expect(p.offers, "Product.offers required when price is present").toBeTruthy();
    expect(p.offers.priceCurrency).toBe("GBP");
    expect(p.offers.price).toBe("49.99");
    expect(p.offers.availability).toMatch(/InStock|OutOfStock/);
    expect(p.offers.shippingDetails).toBeTruthy();
    expect(p.offers.hasMerchantReturnPolicy).toBeTruthy();
    expect(p.aggregateRating).toBeTruthy();
  });

  it("Product url and breadcrumb leaf match the slug (unique per page)", () => {
    const expectedUrl = `https://phlabs.co.uk/products/${SAMPLE_PRODUCT.slug}`;
    expect(productBlocks[0].url).toBe(expectedUrl);
    const leaf = breadcrumbBlocks[0].itemListElement.at(-1);
    expect(leaf.item).toBe(expectedUrl);
    expect(leaf.name).toBe(SAMPLE_PRODUCT.name);
  });

  it("no two JSON-LD blocks share the same @type+@id (no duplicates)", () => {
    const seen = new Set<string>();
    for (const b of blocks) {
      const key = `${b["@type"]}|${b["@id"] ?? b.url ?? JSON.stringify(b.itemListElement ?? "")}`;
      expect(seen.has(key), `Duplicate JSON-LD block: ${key}`).toBe(false);
      seen.add(key);
    }
  });
});

describe("Article JSON-LD (/$ splat → /resources/:slug)", () => {
  it("every article emits a complete Article + BreadcrumbList pair", () => {
    expect(articles.length).toBeGreaterThan(0);

    for (const article of articles) {
      const splat = `resources/${article.slug}`;
      const head = callHead(SplatRoute, { params: { _splat: splat } });
      const blocks = extractJsonLd(head);
      const articleBlocks = blocks.filter((b) => b["@type"] === "Article");
      const breadcrumbBlocks = blocks.filter((b) => b["@type"] === "BreadcrumbList");

      expect(articleBlocks, `[${article.slug}] expected exactly 1 Article block`).toHaveLength(1);
      expect(breadcrumbBlocks, `[${article.slug}] expected exactly 1 BreadcrumbList block`).toHaveLength(1);

      const a = articleBlocks[0];
      for (const key of ARTICLE_REQUIRED) {
        expect(a[key], `[${article.slug}] Article is missing "${key}"`).toBeTruthy();
      }

      // Uniqueness: headline + mainEntityOfPage must reflect the article slug
      const expectedUrl = `https://phlabs.co.uk/resources/${article.slug}`;
      expect(a.mainEntityOfPage["@id"]).toBe(expectedUrl);
      expect(a.headline).toContain(article.title.slice(0, 20));
      expect(a.datePublished).toBe(article.publishDate);

      // No duplicate @type+@id blocks on a single page
      const seen = new Set<string>();
      for (const b of blocks) {
        const key = `${b["@type"]}|${b["@id"] ?? JSON.stringify(b.itemListElement ?? "")}`;
        expect(seen.has(key), `[${article.slug}] Duplicate JSON-LD block: ${key}`).toBe(false);
        seen.add(key);
      }
    }
  });

  it("article slugs are unique (prevents duplicate JSON-LD across pages)", () => {
    const slugs = articles.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
