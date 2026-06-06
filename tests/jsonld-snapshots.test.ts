/**
 * JSON-LD snapshot tests.
 *
 * Locks the exact rendered JSON-LD blocks emitted by the product
 * detail route (`/products/$slug`) and the resource route
 * (`/$` → `/resources/:slug`) for a fixed catalogue of slugs.
 *
 * Any change to the JSON-LD shape, fields, or values will fail the
 * snapshot. Re-run with `bunx vitest run -u` to accept intentional
 * updates after review.
 */
import { describe, it, expect } from "vitest";
import { Route as ProductRoute } from "../src/routes/products.$slug";
import { Route as SplatRoute } from "../src/routes/$";
import { articles } from "../src/pages/Resources/data/articles";
import type { SeoProduct } from "../src/lib/firestore-rest";

type Script = { type: string; children: string };
type HeadResult = { scripts?: Script[] };

function extractJsonLd(head: HeadResult): unknown[] {
  return (head.scripts ?? [])
    .filter((s) => s.type === "application/ld+json")
    .map((s) => JSON.parse(s.children));
}

function callHead(route: any, ctx: any): HeadResult {
  return (route.options ?? route).head(ctx);
}

/**
 * Fixed product fixtures — locked here so snapshots are deterministic
 * regardless of Firestore data drift. Covers the live catalogue slugs.
 */
const PRODUCT_FIXTURES: Array<SeoProduct> = [
  {
    id: "prod_tirzepatide",
    name: "Tirzepatide 10mg",
    slug: "tirzepatide",
    description: "Research-grade tirzepatide, ≥99% HPLC verified.",
    category: "Metabolic Research",
    price: 49.99,
    imageUrl: "https://phlabs.co.uk/products/tirzepatide.jpg",
    isActive: true,
    visibility: "public",
    displayOrder: 1,
    stock: 25,
  },
  {
    id: "prod_retatrutide",
    name: "Retatrutide 5mg",
    slug: "retatrutide",
    description: "Triple-agonist research peptide (GIP/GLP-1/glucagon).",
    category: "Metabolic Research",
    price: 79.0,
    imageUrl: "https://phlabs.co.uk/products/retatrutide.jpg",
    isActive: true,
    visibility: "public",
    displayOrder: 2,
    stock: 10,
  },
  {
    id: "prod_bpc157",
    name: "BPC-157 5mg",
    slug: "bpc-157",
    description: "Synthetic pentadecapeptide for tissue-repair research.",
    category: "Tissue Repair Research",
    price: 29.99,
    imageUrl: "https://phlabs.co.uk/products/bpc-157.jpg",
    isActive: true,
    visibility: "public",
    displayOrder: 3,
    stock: 0,
  },
  {
    id: "prod_tb500",
    name: "TB-500 5mg",
    slug: "tb-500",
    description: "Thymosin Beta-4 fragment for regenerative research.",
    category: "Tissue Repair Research",
    price: 34.5,
    imageUrl: "https://phlabs.co.uk/products/tb-500.jpg",
    isActive: true,
    visibility: "public",
    displayOrder: 4,
    stock: 15,
  },
  {
    id: "prod_ghkcu",
    name: "GHK-Cu 50mg",
    slug: "ghk-cu",
    description: "Copper-binding tripeptide for skin and tissue research.",
    category: "Cosmetic Research",
    price: 24.0,
    imageUrl: "https://phlabs.co.uk/products/ghk-cu.jpg",
    isActive: true,
    visibility: "public",
    displayOrder: 5,
    stock: 50,
  },
];

describe("Product JSON-LD snapshots", () => {
  for (const product of PRODUCT_FIXTURES) {
    it(`/products/${product.slug}`, () => {
      const head = callHead(ProductRoute, {
        params: { slug: product.slug },
        loaderData: { product },
      });
      expect(extractJsonLd(head)).toMatchSnapshot();
    });
  }
});

describe("Article JSON-LD snapshots", () => {
  for (const article of articles) {
    it(`/resources/${article.slug}`, () => {
      const head = callHead(SplatRoute, {
        params: { _splat: `resources/${article.slug}` },
      });
      expect(extractJsonLd(head)).toMatchSnapshot();
    });
  }
});
