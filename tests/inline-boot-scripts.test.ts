/**
 * Regression: ensure inline boot scripts in HTML (root route + live pages)
 * NEVER contain the broken `return //service-worker...` fragment that was
 * shipped once by template-literal escaping and blanked the site.
 *
 * The offending pattern parses as `return` + line-comment => `return undefined;`
 * which makes the SW registration filter always return false and completely
 * breaks isLegacy/isAppWorker detection. We assert both:
 *   1. Source (src/routes/__root.tsx) uses `new RegExp(...)` builders.
 *   2. Live production HTML never contains the bad fragment.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const BAD_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /return\s+\/\/service-worker/, why: "return + JS line comment (broken regex)" },
  { re: /return\s+\/\/\(\?:sw\|service-worker\)/, why: "return + JS line comment on grouped regex" },
  { re: /=\s*\/\/service-worker\.js/, why: "assign to line comment" },
];

describe("inline SW cleanup scripts — regression guard", () => {
  it("__root.tsx source does not contain the broken raw regex", () => {
    const src = readFileSync(resolve(process.cwd(), "src/routes/__root.tsx"), "utf8");
    for (const { re, why } of BAD_PATTERNS) {
      expect(re.test(src), `Bad fragment in __root.tsx (${why})`).toBe(false);
    }
    // The safe replacements MUST be present.
    expect(src).toMatch(/new RegExp\(\s*['"]\\\\\/service-worker\\\\\.js/);
    expect(src).toMatch(/new RegExp\(\s*['"]\\\\\/\(\?:sw\|service-worker\)/);
  });

  it("live production HTML does not contain the broken fragment", async () => {
    const base = process.env.CANARY_BASE_URL || "https://phlabs.co.uk";
    const paths = ["/", "/products", "/login"];
    for (const p of paths) {
      const res = await fetch(base + p, {
        headers: { "user-agent": "phlabs-regression-inline-boot/1.0" },
        redirect: "follow",
      }).catch(() => null);
      if (!res || !res.ok) continue; // network-restricted CI runners: skip softly
      const html = await res.text();
      for (const { re, why } of BAD_PATTERNS) {
        expect(re.test(html), `Bad fragment on ${p} (${why})`).toBe(false);
      }
    }
  }, 30_000);
});
