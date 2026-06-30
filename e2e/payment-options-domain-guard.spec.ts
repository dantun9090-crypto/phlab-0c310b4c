/**
 * Payment step — domain guard e2e.
 *
 * Drives the payment selector with real keyboard + mouse and asserts that
 * EVERY navigation target, anchor href, form action, and programmatic
 * navigation that fires during the flow points at the canonical host
 * (https://phlabs.co.uk) — never the legacy `prohealthpeptides.co.uk`,
 * the old preview `phlab.lovable.app`, or the `phplabs` typo.
 *
 * The harness route (/__e2e/payment-options) mounts the selector in
 * isolation and is allowed off-production only.
 */
import { test, expect, type Request } from "@playwright/test";

const HARNESS = "/__e2e/payment-options";

const FORBIDDEN = [
  /prohealthpeptides\.co\.uk/i,
  /phlab\.lovable\.app/i,
  /\bphp+labs?\b/i,
];

function assertSafe(value: string, where: string) {
  for (const rx of FORBIDDEN) {
    expect(
      rx.test(value),
      `Forbidden domain literal in ${where}: ${value}`,
    ).toBe(false);
  }
}

test.describe("Payment step — canonical-host guard", () => {
  test("anchor hrefs + form actions on the payment step are canonical", async ({
    page,
  }) => {
    await page.goto(HARNESS, { waitUntil: "domcontentloaded" });

    // Collect every <a href> and <form action> rendered in the harness.
    const urls = await page.evaluate(() => {
      const out: { kind: string; value: string }[] = [];
      document.querySelectorAll("a[href]").forEach((a) => {
        out.push({ kind: "a.href", value: (a as HTMLAnchorElement).href });
      });
      document.querySelectorAll("form[action]").forEach((f) => {
        out.push({ kind: "form.action", value: (f as HTMLFormElement).action });
      });
      document.querySelectorAll("[data-href]").forEach((el) => {
        out.push({
          kind: "data-href",
          value: (el as HTMLElement).dataset.href || "",
        });
      });
      return out;
    });

    for (const { kind, value } of urls) {
      if (!value) continue;
      assertSafe(value, `${kind} = ${value}`);
    }
  });

  test("keyboard + mouse interactions never request a legacy host", async ({
    page,
  }) => {
    const requested: string[] = [];
    page.on("request", (req: Request) => {
      requested.push(req.url());
    });
    const navigations: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations.push(frame.url());
    });

    await page.goto(HARNESS, { waitUntil: "domcontentloaded" });

    // Mouse: click manual transfer.
    const manual = page.getByTestId("manual-bank-transfer-button");
    const payByBank = page.getByTestId("pay-by-bank-button");
    await manual.click();
    await expect(manual).toHaveAttribute("aria-checked", "true");

    // Keyboard: Tab + Space back to pay-by-bank.
    await payByBank.focus();
    await page.keyboard.press("Space");
    await expect(payByBank).toHaveAttribute("aria-checked", "true");

    // No request and no navigation may target a legacy / typo host.
    for (const url of requested) assertSafe(url, `network request ${url}`);
    for (const url of navigations) assertSafe(url, `navigation ${url}`);

    // And the final document URL is still on an allowed host.
    assertSafe(page.url(), `page.url() after flow`);
  });
});
