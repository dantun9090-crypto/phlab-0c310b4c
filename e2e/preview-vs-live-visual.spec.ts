/**
 * Preview vs Live visual parity check.
 *
 * Snapshots /, /products, /about and /contact on the PREVIEW build first,
 * then loads the same paths on the LIVE (published) origin and pixel-diffs
 * the two. Fails when the diff ratio for any page exceeds THRESHOLD.
 *
 * Both URLs come from env vars so CI can pass in the ephemeral preview URL
 * that Lovable minted for this build and the stable production host:
 *   PREVIEW_URL=https://id-preview--...lovable.app
 *   LIVE_URL=https://phlabs.co.uk
 *
 * Diff PNGs land in test-results/ and are uploaded as CI artifacts.
 */
import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PREVIEW_URL = process.env.PREVIEW_URL?.replace(/\/$/, '');
const LIVE_URL = (process.env.LIVE_URL ?? 'https://phlabs.co.uk').replace(/\/$/, '');
const THRESHOLD = Number(process.env.VISUAL_DIFF_THRESHOLD ?? '0.02'); // 2% of pixels
const VIEWPORT = { width: 1280, height: 1800 };
const PATHS = ['/', '/products', '/about', '/contact'];
const OUT_DIR = join(process.cwd(), 'test-results', 'preview-vs-live');

test.skip(!PREVIEW_URL, 'PREVIEW_URL env var required');

test.beforeAll(() => mkdirSync(OUT_DIR, { recursive: true }));

test.use({ viewport: VIEWPORT });

for (const path of PATHS) {
  test(`preview matches live for ${path}`, async ({ page }) => {
    const slug = path === '/' ? 'home' : path.replace(/\//g, '_').replace(/^_/, '');

    // Snapshot preview (fresh build we're about to ship / just shipped).
    await page.goto(`${PREVIEW_URL}${path}`, { waitUntil: 'networkidle', timeout: 45_000 });
    await page.waitForTimeout(1000); // let fonts / lazy hero images settle
    const previewBuf = await page.screenshot({ fullPage: false });
    writeFileSync(join(OUT_DIR, `${slug}-preview.png`), previewBuf);

    // Snapshot live production.
    await page.goto(`${LIVE_URL}${path}`, { waitUntil: 'networkidle', timeout: 45_000 });
    await page.waitForTimeout(1000);
    const liveBuf = await page.screenshot({ fullPage: false });
    writeFileSync(join(OUT_DIR, `${slug}-live.png`), liveBuf);

    // Pixel diff.
    const preview = PNG.sync.read(previewBuf);
    const live = PNG.sync.read(liveBuf);
    expect(
      { w: preview.width, h: preview.height },
      'preview/live viewport size mismatch',
    ).toEqual({ w: live.width, h: live.height });

    const diff = new PNG({ width: preview.width, height: preview.height });
    const mismatched = pixelmatch(
      preview.data,
      live.data,
      diff.data,
      preview.width,
      preview.height,
      { threshold: 0.15, includeAA: false },
    );
    writeFileSync(join(OUT_DIR, `${slug}-diff.png`), PNG.sync.write(diff));

    const total = preview.width * preview.height;
    const ratio = mismatched / total;
    console.log(
      `[${path}] diff ${mismatched}/${total} px = ${(ratio * 100).toFixed(2)}% (threshold ${(THRESHOLD * 100).toFixed(2)}%)`,
    );
    expect(ratio, `visual drift on ${path} exceeds ${THRESHOLD * 100}%`).toBeLessThanOrEqual(THRESHOLD);
  });
}
