/**
 * SSR vs post-JS banner/promo parity.
 *
 * Goal: catch any layout "jump" for promotional/banner surfaces between the
 * SSR first paint and the hydrated client render. If a banner appears,
 * disappears, or moves vertically more than a few pixels after JS runs, the
 * test fails — that's exactly the flicker users complained about.
 *
 * Surfaces checked (each identified by a stable data-attribute so this test
 * doesn't break on copy/style tweaks):
 *   - [data-advert-placement="homepage_hero"] — MarketingAdvertSlot hero
 *   - [data-advert-placement="homepage_mid"]  — MarketingAdvertSlot mid
 *   - [data-phl-disclaimer-banner]            — MHRA / research disclaimer
 *   - [aria-label="Launch promotion"]         — LandingPromoStrip
 *
 * A surface is allowed to be entirely absent in both SSR and hydrated DOM
 * (nothing to show, no jump). It's a failure only when presence, height, or
 * top-offset differs beyond a tight threshold between the two snapshots.
 */
import { test, expect, request as pwRequest, type Page } from "@playwright/test";

const ROUTE = "/";
const PX_TOLERANCE = 8; // sub-pixel + font-metric drift
const SURFACES = [
  { name: "hero advert", selector: '[data-advert-placement="homepage_hero"]' },
  { name: "mid advert", selector: '[data-advert-placement="homepage_mid"]' },
  { name: "disclaimer banner", selector: "[data-phl-disclaimer-banner]" },
  { name: "landing promo strip", selector: '[aria-label="Launch promotion"]' },
] as const;

type Snapshot = {
  present: boolean;
  offsetTop: number;
  height: number;
};

/** Count occurrences of a data-attribute / aria-label in raw SSR HTML.
 *  We can't compute layout from HTML alone, but we can prove presence and
 *  detect the "appears only after JS" jump class of bugs. */
function ssrPresence(html: string, selector: string): boolean {
  const attrMatch = selector.match(/^\[([\w-]+)(?:="([^"]+)")?\]$/);
  if (!attrMatch) return false;
  const [, attr, value] = attrMatch;
  const needle = value
    ? new RegExp(`\\b${attr}\\s*=\\s*"${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`)
    : new RegExp(`\\b${attr}\\b`);
  return needle.test(html);
}

async function measure(page: Page, selector: string): Promise<Snapshot> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return { present: false, offsetTop: 0, height: 0 };
    const rect = el.getBoundingClientRect();
    return {
      present: true,
      offsetTop: Math.round(rect.top + window.scrollY),
      height: Math.round(rect.height),
    };
  }, selector);
}

test.describe("SSR vs post-JS parity — banners & promo", () => {
  test("no layout jump for banner/promo surfaces on /", async ({ page, baseURL }, testInfo) => {
    const base = baseURL ?? "http://localhost:8080";

    // 1) Raw SSR HTML — no JS, no hydration.
    const api = await pwRequest.newContext();
    const res = await api.get(base + ROUTE, {
      headers: { "user-agent": "PHLabs-SsrParity/1.0", accept: "text/html" },
    });
    expect(res.status(), "SSR fetch should return 200").toBe(200);
    const html = await res.text();
    await api.dispose();

    const ssrPresent: Record<string, boolean> = {};
    for (const s of SURFACES) ssrPresent[s.name] = ssrPresence(html, s.selector);

    // 2) Hydrated DOM — real browser, wait for network + a settling frame so
    //    animations/appearance transitions can't be misread as jumps.
    await page.goto(base + ROUTE, { waitUntil: "networkidle" });
    // Give lazy MarketingAdvertSlot + client-fetched promo settings time to land.
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

    const rows: string[] = [
      "| Surface | SSR present | Client present | Δtop (px) | Δheight (px) | Verdict |",
      "| --- | --- | --- | --- | --- | --- |",
    ];
    const failures: string[] = [];

    for (const s of SURFACES) {
      const client = await measure(page, s.selector);
      const ssr = ssrPresent[s.name];

      // For a fair "top offset" reference in SSR we'd need layout; instead
      // enforce the strong invariant: if it's shown to the user post-JS it
      // MUST have been in the SSR HTML too (no post-JS-only banner pop-in).
      // Height stability is checked against a second client measurement taken
      // shortly after — catches late-arriving image swaps that reflow.
      let clientLater: Snapshot = client;
      if (client.present) {
        await page.waitForTimeout(1200);
        clientLater = await measure(page, s.selector);
      }
      const dTop = Math.abs(clientLater.offsetTop - client.offsetTop);
      const dH = Math.abs(clientLater.height - client.height);

      let verdict = "✅ stable";
      if (client.present && !ssr) {
        verdict = "❌ appears only after JS";
        failures.push(`${s.name}: not in SSR HTML but rendered client-side (post-JS pop-in)`);
      } else if (!client.present && ssr) {
        verdict = "❌ removed by JS";
        failures.push(`${s.name}: present in SSR HTML but removed after hydration`);
      } else if (dTop > PX_TOLERANCE || dH > PX_TOLERANCE) {
        verdict = "❌ reflow";
        failures.push(`${s.name}: reflow after hydration (Δtop=${dTop}px, Δheight=${dH}px)`);
      }

      rows.push(
        `| ${s.name} | ${ssr ? "yes" : "no"} | ${client.present ? "yes" : "no"} | ${dTop} | ${dH} | ${verdict} |`,
      );
    }

    await testInfo.attach("ssr-vs-post-js-report.md", {
      body: rows.join("\n") + "\n",
      contentType: "text/markdown",
    });

    if (failures.length) {
      throw new Error(
        `SSR/client parity broken:\n  - ${failures.join("\n  - ")}\n\n${rows.join("\n")}`,
      );
    }
  });
});
