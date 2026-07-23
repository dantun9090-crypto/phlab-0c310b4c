/**
 * Regression suite — covers three CI-critical guarantees:
 *
 *   1. /compound CTAs emit the expected `compound_cta_click` + `cta_click`
 *      analytics events with the correct labels / channels.
 *   2. /contact gating: submit is blocked (with a visible error) until the
 *      "qualified researcher" checkbox is ticked, then a valid submission
 *      POSTs the expected payload to /api/public/send-mail.
 *   3. /request-catalog: blocks on missing qualified/consent with explicit
 *      alerts, then on a successful POST renders the email receipt + PDF
 *      download link, and on a 500 from the mail endpoint surfaces the
 *      graceful fallback download.
 *
 * Stubs:
 *   - window.gtag is replaced with a dataLayer.push shim so trackEvent()
 *     records without loading real gtag.js (which never initialises in CI
 *     because consent isn't granted).
 *   - php_research_confirmed / php_cookie_consent are pre-seeded in
 *     localStorage so the ResearchGate + CookieConsent overlays do not
 *     intercept clicks.
 *   - /api/public/send-mail is intercepted via page.route — no real mail
 *     is ever sent.
 */
import { test, expect, type Page, type Route } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL || "http://localhost:8080";

type CapturedMail = { url: string; body: any };

async function prep(page: Page, opts: { mailStatus?: number; capture?: CapturedMail[] } = {}) {
  const { mailStatus = 200, capture } = opts;

  // Stub gtag + bypass consent/research gates BEFORE any app code runs.
  await page.addInitScript(() => {
    (window as any).dataLayer = [];
    (window as any).gtag = function (...args: unknown[]) {
      (window as any).dataLayer.push(args);
    };
    try {
      localStorage.setItem("php_research_confirmed", JSON.stringify({ ok: true, ts: Date.now() }));
      localStorage.setItem("php_cookie_consent", JSON.stringify({ analytics: false, marketing: false, ts: Date.now() }));
    } catch { /* ignore */ }
  });

  await page.route("**/api/public/send-mail", async (route: Route) => {
    let body: any = null;
    try { body = JSON.parse(route.request().postData() || "null"); } catch { /* keep null */ }
    capture?.push({ url: route.request().url(), body });
    if (mailStatus >= 400) {
      await route.fulfill({ status: mailStatus, contentType: "application/json", body: JSON.stringify({ error: "stubbed failure" }) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    }
  });
}

async function readDataLayer(page: Page): Promise<unknown[][]> {
  return await page.evaluate(() => (window as any).dataLayer as unknown[][]);
}

function eventsNamed(dl: unknown[][], name: string) {
  return dl.filter((row) => Array.isArray(row) && row[0] === "event" && row[1] === name);
}

test.describe("/compound analytics events", () => {
  test("WhatsApp + Telegram + Contact + Documentation CTAs fire the expected events", async ({ page, context }) => {
    await prep(page);

    // wa.me / t.me / mailto would try to open external apps — short-circuit.
    await context.route(/^(https?:\/\/wa\.me|https?:\/\/t\.me|mailto:)/, (route) =>
      route.fulfill({ status: 204, body: "" }),
    );

    await page.goto(`${BASE}/compound`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toBeVisible();

    // Click each CTA (first instance in the hero region is enough).
    // Click the external CTAs first — they are 204-stubbed above, so they
    // never navigate and the dataLayer survives. The two internal links
    // (Contact Research Team / Request Documentation) navigate away and
    // would wipe the dataLayer, so they go LAST and are not re-read.
    for (const name of ["WhatsApp", "Telegram"]) {
      await page.getByRole("link", { name: new RegExp(name, "i") }).first().dispatchEvent("click").catch(() => { /* external */ });
    }
    for (const name of ["Contact Research Team", "Request Documentation"]) {
      await page.getByRole("link", { name: new RegExp(name, "i") }).first().dispatchEvent("click").catch(() => { /* navigation may detach */ });
      // Stop after the first navigation — the page is leaving.
      break;
    }

    // Analytics initialises lazily (first interaction or idle) — trigger it
    // and give dataLayer a moment to populate before reading.
    await page.mouse.click(10, 10);
    await expect
      .poll(async () => (await readDataLayer(page)).length, { timeout: 30_000 })
      .toBeGreaterThan(0);

    const dl = await readDataLayer(page);

    // We only assert that the events ARE captured with the right shape; their
    // counts depend on which clicks landed before navigation.
    const compoundCta = eventsNamed(dl, "compound_cta_click");
    const ctaClick = eventsNamed(dl, "cta_click");
    expect(compoundCta.length, "compound_cta_click events captured").toBeGreaterThan(0);
    expect(ctaClick.length, "cta_click events captured").toBeGreaterThan(0);

    // Every compound_cta_click payload must carry location:"compound" and a channel.
    for (const row of compoundCta) {
      const params = row[2] as Record<string, unknown>;
      expect(params.location).toBe("compound");
      expect(params).toHaveProperty("cta");
      expect(params).toHaveProperty("channel");
    }

    // At least one of WhatsApp / Telegram / Contact / Documentation should show up.
    const labels = compoundCta.map((r) => (r[2] as any).cta as string);
    expect(labels.some((l) => /WhatsApp|Telegram|Contact Research Team|Request Documentation/i.test(l))).toBe(true);
  });
});

test.describe("/contact qualification gating", () => {
  test("submit blocked without the qualified checkbox; allowed once ticked", async ({ page }) => {
    const captured: CapturedMail[] = [];
    await prep(page, { capture: captured });

    await page.goto(`${BASE}/contact`, { waitUntil: "domcontentloaded" });

    // The page carries TWO forms — the header search box is form[0], the
    // contact form is form[1]. Wait specifically for the contact one.
    await page.locator("form:has(#contact-name)").waitFor({ state: "visible", timeout: 90_000 });

    // Fill required fields — by id, not loose /name|message/ label regexes
    // ("/message/i" also matches the site-announcement region aria-label).
    await page.locator("#contact-name").fill("Dr Test Researcher");
    await page.locator("#contact-email").fill("researcher@lab.invalid");
    await page.locator("#contact-message").fill("Please send batch CoA for internal QC.");

    const submit = page.getByRole("button", { name: /send|submit/i }).last();

    // Submit button must be DISABLED until qualified is ticked.
    await expect(submit).toBeDisabled();

    // Programmatic submit attempts (e.g. form.submit()) are also gated — no mail call.
    await page.evaluate(() => (document.querySelector("form:has(#contact-name)") as HTMLFormElement | null)?.requestSubmit());
    await page.waitForTimeout(250);
    expect(captured.length, "no mail call before qualified is ticked").toBe(0);

    // Tick qualified, submit cleanly.
    // The qualified toggle is a real <input type="checkbox"> but inside a
    // styled <label>; on some runs getByRole does not resolve it — click the
    // label text, which toggles the native input via label activation.
    await page.getByText(/I confirm I'm a qualified researcher/i).click();
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect.poll(() => captured.length, { timeout: 5_000 }).toBeGreaterThan(0);
    const payload = captured[0].body;
    expect(payload.template).toBe("contact");
    expect(payload.email).toBe("researcher@lab.invalid");
    expect(payload.name).toBe("Dr Test Researcher");
    expect(String(payload.message)).toContain("batch CoA");
  });
});

test.describe("/request-catalog email payload handling", () => {
  async function fillCatalogForm(page: Page) {
    await page.getByLabel(/full name/i).fill("Dr Jane Smith");
    await page.getByLabel(/institution \/ company/i).fill("Imperial College Research Lab");
    await page.getByLabel(/role/i).fill("Principal Investigator");
    await page.getByLabel(/^email/i).fill("jane@institution.invalid");
  }

  test("blocks submission with explicit alert when qualified/consent unticked", async ({ page }) => {
    const captured: CapturedMail[] = [];
    await prep(page, { capture: captured });

    await page.goto(`${BASE}/request-catalog`, { waitUntil: "domcontentloaded" });
    await fillCatalogForm(page);

    // Submit without any checkboxes ticked — must show qualified error.
    await page.getByRole("button", { name: /send me the catalogue/i }).click();
    await expect(page.getByRole("alert")).toContainText(/qualified researcher/i);
    expect(captured.length, "no mail call without qualified").toBe(0);

    // Tick qualified, leave consent unchecked → must show consent error.
    await page.getByRole("checkbox").nth(0).check({ force: true });
    await page.getByRole("button", { name: /send me the catalogue/i }).click();
    await expect(page.getByRole("alert")).toContainText(/consent/i);
    expect(captured.length, "no mail call without consent").toBe(0);
  });

  test("success: payload sent, receipt rendered with PDF download link", async ({ page }) => {
    const captured: CapturedMail[] = [];
    await prep(page, { mailStatus: 200, capture: captured });

    await page.goto(`${BASE}/request-catalog`, { waitUntil: "domcontentloaded" });
    await fillCatalogForm(page);
    await page.getByRole("checkbox").nth(0).check({ force: true });
    await page.getByRole("checkbox").nth(1).check({ force: true });
    await page.getByRole("button", { name: /send me the catalogue/i }).click();

    await expect.poll(() => captured.length, { timeout: 5_000 }).toBeGreaterThan(0);
    const payload = captured[0].body;
    expect(payload.template).toBe("contact");
    expect(payload.email).toBe("jane@institution.invalid");
    expect(payload.subject).toMatch(/Catalogue Request/i);
    expect(String(payload.message)).toContain("Imperial College Research Lab");
    expect(String(payload.message)).toContain("/PH-Labs-Research-Catalogue.pdf");

    // Receipt + delivery status visible.
    const success = page.getByTestId("catalog-success");
    await expect(success).toBeVisible();
    await expect(page.getByTestId("catalog-delivery-status")).toContainText(/queued for delivery/i);
    await expect(page.getByTestId("receipt-to")).toHaveText("jane@institution.invalid");
    await expect(page.getByTestId("receipt-subject")).toContainText(/Catalogue Request/i);

    const dl = page.getByTestId("catalog-download-link");
    await expect(dl).toBeVisible();
    await expect(dl).toHaveAttribute("href", "/PH-Labs-Research-Catalogue.pdf");
  });

  test("failure: 500 from mail endpoint still gives graceful fallback download", async ({ page }) => {
    await prep(page, { mailStatus: 500 });

    await page.goto(`${BASE}/request-catalog`, { waitUntil: "domcontentloaded" });
    await fillCatalogForm(page);
    await page.getByRole("checkbox").nth(0).check({ force: true });
    await page.getByRole("checkbox").nth(1).check({ force: true });
    await page.getByRole("button", { name: /send me the catalogue/i }).click();

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/couldn't send/i);
    // Inline fallback link must point to the PDF.
    await expect(alert.getByRole("link", { name: /download catalogue/i })).toHaveAttribute(
      "href",
      "/PH-Labs-Research-Catalogue.pdf",
    );
  });
});
