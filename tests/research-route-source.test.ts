// @vitest-environment node
/**
 * Integration test: /research route source-of-truth guard.
 *
 * The /research path MUST always be served by the legacy article page at
 * src/pages/Research/index.tsx via the splat catch-all (src/routes/$.tsx
 * → LegacyApp → react-router /research route). Any TanStack route file
 * that claims /research (e.g. src/routes/research.tsx,
 * src/routes/research.index.tsx, src/routes/_marketing.research.tsx)
 * would override it and re-introduce the Google-Ads landing regression.
 *
 * Conversely, /compound MUST be served by the marketing landing route
 * src/routes/_marketing.compound.tsx (PremiumLanding).
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROUTES_DIR = join(process.cwd(), "src", "routes");

function listRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listRouteFiles(full));
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("/research route source-of-truth", () => {
  const routeFiles = listRouteFiles(ROUTES_DIR);

  it("has NO TanStack route file claiming /research", () => {
    const offenders: string[] = [];
    for (const f of routeFiles) {
      // Filename-based check — any file that would generate the /research
      // route id (research.tsx, research.index.tsx, _marketing.research.tsx,
      // research/index.tsx, etc.).
      const rel = f.replace(ROUTES_DIR + "/", "");
      const isResearchFile =
        /(^|\/|\.)research(\.index)?\.(tsx?|jsx?)$/.test(rel) ||
        /(^|\/|\.)research\/index\.(tsx?|jsx?)$/.test(rel);
      if (isResearchFile) {
        offenders.push(rel);
        continue;
      }
      // Content-based check — any createFileRoute("/research" ...) string.
      const src = readFileSync(f, "utf8");
      if (/createFileRoute\(\s*["']\/research(["']|\/)/.test(src)) {
        offenders.push(`${rel} (contains createFileRoute("/research"))`);
      }
    }
    expect(
      offenders,
      `Found TanStack route(s) overriding /research — delete them so the splat ($.tsx) serves the legacy article page:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("legacy article page exists and exports default", () => {
    const p = join(process.cwd(), "src", "pages", "Research", "index.tsx");
    expect(existsSync(p)).toBe(true);
    const src = readFileSync(p, "utf8");
    expect(src).toMatch(/export\s+default\s+function\s+Research\b/);
    // The stable data marker the runtime guard + e2e tests look for.
    expect(src).toMatch(/data-source=["']legacy-research-page["']/);
  });

  it("legacy AppRouter still wires /research → src/pages/Research", () => {
    const p = join(process.cwd(), "src", "legacy", "AppRouter.tsx");
    const src = readFileSync(p, "utf8");
    expect(src).toMatch(/import\(\s*['"]@\/pages\/Research['"]\s*\)/);
    expect(src).toMatch(/path:\s*['"]research['"]/);

  });

  it("splat catch-all ($.tsx) mounts LegacyApp", () => {
    const p = join(ROUTES_DIR, "$.tsx");
    const src = readFileSync(p, "utf8");
    expect(src).toMatch(/createFileRoute\(\s*["']\/\$["']/);
    expect(src).toMatch(/LegacyApp/);
  });
});

describe("/compound route source-of-truth", () => {
  it("is served by src/routes/_marketing.compound.tsx → PremiumLanding", () => {
    const p = join(ROUTES_DIR, "_marketing.compound.tsx");
    expect(existsSync(p)).toBe(true);
    const src = readFileSync(p, "utf8");
    expect(src).toMatch(/createFileRoute\(\s*["']\/_marketing\/compound["']/);
    expect(src).toMatch(/PremiumLanding/);
  });

  it("has NO competing TanStack route claiming /compound", () => {
    const offenders: string[] = [];
    for (const f of listRouteFiles(ROUTES_DIR)) {
      const rel = f.replace(ROUTES_DIR + "/", "");
      if (rel === "_marketing.compound.tsx") continue;
      const src = readFileSync(f, "utf8");
      if (/createFileRoute\(\s*["']\/compound(["']|\/)/.test(src)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
