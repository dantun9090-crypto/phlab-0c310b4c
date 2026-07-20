import { chromium, type FullConfig } from "@playwright/test";

/**
 * Warm the vite dev-server transform cache before any test runs.
 *
 * The audit starts a FRESH `vite dev` per job; the first browser hit per
 * route pays the full SSR + client-chunk transform, which can hold the CSR
 * boot fallback ("Loading PH Labs…", .phl-boot) on screen for 30-60s. axe
 * scans that hit the window report ~58 spurious color-contrast violations
 * (dark boot text on the light-mode page). Walking every audited route
 * once here makes the actual tests see warm, fast boots.
 */
export default async function globalSetup(config: FullConfig) {
  const base =
    process.env.DAY_THEME_BASE_URL ||
    (config.projects[0]?.use?.baseURL as string | undefined);
  if (!base || !base.startsWith("http")) return;

  const routes = [
    "/",
    "/products",
    "/compound",
    "/login",
    "/account",
    "/account/billing",
    "/account/profile",
    "/account/settings",
  ];

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const path of routes) {
      try {
        await page.goto(`${base}${path}`, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        await page
          .waitForSelector(".phl-boot", { state: "detached", timeout: 90_000 })
          .catch(() => {});
        await page
          .waitForSelector(".phl-ssr-shell", { state: "detached", timeout: 30_000 })
          .catch(() => {});
      } catch {
        /* warm-up is best-effort — tests still run */
      }
    }
  } finally {
    await browser.close();
  }
}
