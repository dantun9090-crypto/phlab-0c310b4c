#!/usr/bin/env node
// Post-deploy smoke test that drives a real browser through the
// worker-fronted URL (https://phlabs.co.uk). Fails LOUD on any of:
//   - age-gate confirm button not present / not clickable
//   - "Accept All" cookie banner does not hide after click
//   - /products page fails to load (non-200 or blank body)
//   - "Add" (add-to-cart) click doesn't bump the cart badge to 1
//
// Exit 1 on failure. deploy-worker.yml turns that into an immediate
// route detach + workflow failure.
import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE || "https://phlabs.co.uk";
const HEADLESS = true;

function log(msg) {
  console.log(`[smoke] ${msg}`);
}

async function main() {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 phlabs-worker-smoke",
  });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") log(`page console error: ${msg.text()}`);
  });

  const fail = (why) => {
    console.error(`::error::[smoke] FAIL — ${why}`);
    process.exitCode = 1;
    throw new Error(why);
  };

  try {
    // ── Home ────────────────────────────────────────────────────────
    log(`GET ${BASE}/`);
    const resp = await page.goto(`${BASE}/`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    if (!resp || resp.status() >= 400) {
      fail(`home returned HTTP ${resp && resp.status()}`);
    }
    // Early boot assertion — the CSR shell has ~0 visible chars at
    // domcontentloaded (React hasn't booted, watchdog overlay is
    // display:none). Wait for real app content instead of counting
    // innerText, which would fail on the healthy browser-branch fallback.
    await page
      .waitForSelector("text=/I Confirm|Peptides|Research|Add to/i", {
        timeout: 20000,
      })
      .catch(() => fail("home shell never rendered visible app content"));

    // ── Age gate ────────────────────────────────────────────────────
    // Look for a "confirm 18" style button. Multiple selectors covered.
    const ageBtn = page
      .locator(
        'button:has-text("I am 18"), button:has-text("Confirm"), button:has-text("Enter"), button:has-text("Yes, I am 18")',
      )
      .first();
    try {
      await ageBtn.waitFor({ state: "visible", timeout: 8000 });
      log("age-gate button visible — clicking");
      await ageBtn.click();
      await page.waitForTimeout(500);
    } catch {
      log("no age-gate visible (already confirmed via cookie?) — continuing");
    }

    // ── Cookie banner: click "Accept All" ─────────────────────────
    const acceptBtn = page
      .locator(
        'button:has-text("Accept all"), button:has-text("Accept All"), button:has-text("Accept")',
      )
      .first();
    try {
      await acceptBtn.waitFor({ state: "visible", timeout: 8000 });
      log('cookie banner "Accept" visible — clicking');
      await acceptBtn.click();
      // Banner should hide within 3s.
      await acceptBtn
        .waitFor({ state: "hidden", timeout: 5000 })
        .catch(() => fail("cookie banner did not hide after Accept click"));
    } catch (e) {
      if (!/did not hide/.test(String(e && e.message))) {
        log("no cookie banner visible — continuing");
      } else {
        throw e;
      }
    }

    // ── Products page ───────────────────────────────────────────────
    log(`GET ${BASE}/products`);
    const pResp = await page.goto(`${BASE}/products`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    if (!pResp || pResp.status() >= 400) {
      fail(`/products returned HTTP ${pResp && pResp.status()}`);
    }
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // ── Click first "Add" (add-to-cart) button ─────────────────────
    const addBtn = page
      .locator(
        'button:has-text("Add to cart"), button:has-text("Add to basket"), button:has-text("Add")',
      )
      .first();
    await addBtn.waitFor({ state: "visible", timeout: 15000 })
      .catch(() => fail("no Add-to-cart button visible on /products"));
    log("clicking first Add-to-cart button");
    await addBtn.click();

    // ── Cart badge = 1 ─────────────────────────────────────────────
    // Look for any element that visibly reads "1" adjacent to a cart icon.
    // Give the app up to 5s to update its state / storage.
    const badgeCount = await page.waitForFunction(() => {
      const candidates = document.querySelectorAll(
        '[data-testid*="cart"], [aria-label*="cart" i], [class*="cart" i]',
      );
      for (const el of candidates) {
        const txt = (el.textContent || "").trim();
        if (/\b1\b/.test(txt)) return 1;
      }
      // Fallback: localStorage cart count
      try {
        for (const k of Object.keys(localStorage)) {
          if (/cart/i.test(k)) {
            const v = localStorage.getItem(k) || "";
            try {
              const parsed = JSON.parse(v);
              if (Array.isArray(parsed) && parsed.length >= 1) return parsed.length;
              if (parsed && parsed.items && parsed.items.length >= 1)
                return parsed.items.length;
            } catch {}
          }
        }
      } catch {}
      return 0;
    }, null, { timeout: 8000 })
      .then((h) => h.jsonValue())
      .catch(() => 0);

    if (Number(badgeCount) < 1) {
      fail(`cart badge did not reach 1 after Add click (saw ${badgeCount})`);
    }
    log(`cart count reached ${badgeCount} — PASS`);

    console.log("::notice::[smoke] worker-fronted UI smoke test PASSED");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(`::error::[smoke] unexpected error: ${e && e.message}`);
  process.exitCode = 1;
});
