/**
 * Sitemap policy validation — guarantees the live sitemap only contains
 * real, indexable URLs that policy + robots.txt allow.
 *
 * Run with: bunx vitest run tests/sitemap-validation.test.ts
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isIndexable,
  exclusionReason,
  parseRobotsDisallows,
  matchesRobotsPattern,
  TRANSACTIONAL_PREFIXES,
  NEVER_INDEX_EXACT,
} from "../src/lib/sitemap-policy";
import { KNOWN_PUBLIC_ROUTES } from "../src/lib/sitemap-audit.functions";

const ROBOTS = readFileSync(
  resolve(process.cwd(), "public/robots.txt"),
  "utf8",
);

describe("sitemap policy", () => {
  it("every known public route is indexable", () => {
    for (const path of KNOWN_PUBLIC_ROUTES) {
      expect(isIndexable(path), `${path} should be indexable`).toBe(true);
    }
  });

  it("rejects every transactional prefix", () => {
    for (const prefix of TRANSACTIONAL_PREFIXES) {
      expect(isIndexable(prefix), `${prefix} should be excluded`).toBe(false);
      expect(isIndexable(`${prefix}/anything`)).toBe(false);
    }
  });

  it("rejects splat / catch-all routes", () => {
    for (const path of NEVER_INDEX_EXACT) {
      expect(isIndexable(path)).toBe(false);
    }
  });

  it("rejects non-HTML feed endpoints", () => {
    expect(isIndexable("/google-merchant-feed.xml")).toBe(false);
    expect(isIndexable("/sitemap.xml")).toBe(false);
    expect(isIndexable("/robots.txt")).toBe(false);
  });

  it("rejects payment transactional pages", () => {
    expect(isIndexable("/payment/success")).toBe(false);
    expect(isIndexable("/payment/cancel")).toBe(false);
  });

  it("provides a clear exclusion reason for blocked paths", () => {
    expect(exclusionReason("/admin")?.kind).toBe("transactional");
    expect(exclusionReason("/google-merchant-feed.xml")?.kind).toBe("feed");
    expect(exclusionReason("/$")?.kind).toBe("splat");
  });
});

describe("robots.txt parser", () => {
  it("extracts Disallow rules from the User-agent:* block", () => {
    const rules = parseRobotsDisallows(ROBOTS);
    expect(rules.length).toBeGreaterThan(0);
    const patterns = rules.map((r) => r.pattern);
    expect(patterns).toContain("/admin");
    expect(patterns).toContain("/checkout");
    expect(patterns).toContain("/api/");
  });

  it("ignores other User-agent blocks", () => {
    const sample = [
      "User-agent: *",
      "Disallow: /a",
      "User-agent: AdsBot-Google",
      "Disallow: /b",
    ].join("\n");
    const rules = parseRobotsDisallows(sample).map((r) => r.pattern);
    expect(rules).toEqual(["/a"]);
  });

  it("supports * and $ wildcards Google understands", () => {
    expect(matchesRobotsPattern("/foo?utm_source=x", "/*?utm_*")).toBe(true);
    expect(matchesRobotsPattern("/page.pdf", "/*.pdf$")).toBe(true);
    expect(matchesRobotsPattern("/page.pdf.html", "/*.pdf$")).toBe(false);
    expect(matchesRobotsPattern("/admin/foo", "/admin")).toBe(true);
  });
});

describe("sitemap vs live routes", () => {
  it("known public routes do not collide with robots disallows", () => {
    const rules = parseRobotsDisallows(ROBOTS);
    for (const path of KNOWN_PUBLIC_ROUTES) {
      const hit = rules.find((r) => matchesRobotsPattern(path, r.pattern));
      expect(
        hit,
        `${path} is in KNOWN_PUBLIC_ROUTES but robots blocks ${hit?.pattern}`,
      ).toBeUndefined();
    }
  });
});
