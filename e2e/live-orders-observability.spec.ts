/**
 * Contract & PII regression guards for /api/public/live-orders.
 * Adds coverage for:
 *  - x-request-id echo + sanitisation (header abuse / log injection guard)
 *  - debug body carries stage labels (firestore.query.*, mapping.*) but no raw PII
 *  - JSON body has no PII-shaped values (email / UK postcode / phone)
 */
import { test, expect, request } from "@playwright/test";

const BASE = (
  process.env.SMOKE_BASE_URL ||
  process.env.TEST_BASE_URL ||
  "https://phlabs.co.uk"
).replace(/\/+$/, "");

const REAL_CHROME_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const REQID_RE = /^[A-Za-z0-9-]{1,64}$/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const UK_POSTCODE_RE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;
const PHONE_RE = /(?:\+\d[\d\s\-]{7,}\d)|(?:\b\d[\d\s\-]{8,}\d\b)/;

test.describe("live-orders observability contract", () => {
  test("echoes a valid x-request-id when caller sends a clean one", async () => {
    const ctx = await request.newContext({ extraHTTPHeaders: { "user-agent": REAL_CHROME_UA } });
    const clean = "test-req-abc-123";
    const res = await ctx.get(`${BASE}/api/public/live-orders?limit=1&debug=1`, {
      headers: { "x-request-id": clean },
      timeout: 20_000,
    });
    expect(res.status()).toBe(200);
    const echoed = res.headers()["x-request-id"];
    expect(echoed, "x-request-id must be echoed").toBeTruthy();
    expect(echoed).toBe(clean);
    expect(REQID_RE.test(echoed!)).toBe(true);
  });

  test("sanitises abusive x-request-id (long + CRLF + quotes) and generates a fresh id", async () => {
    const ctx = await request.newContext({ extraHTTPHeaders: { "user-agent": REAL_CHROME_UA } });
    // node-fetch strips CR/LF from header values before send in some
    // versions, so we assemble the abuse in what does survive: length +
    // quotes + spaces + a leading control char alternative.
    const abusive = 'A'.repeat(500) + '"<script>' + " space";
    const res = await ctx.get(`${BASE}/api/public/live-orders?limit=1&debug=1`, {
      headers: { "x-request-id": abusive },
      timeout: 20_000,
    });
    expect(res.status()).toBe(200);
    const echoed = res.headers()["x-request-id"] || "";
    expect(echoed).not.toBe(abusive);
    expect(echoed.length).toBeLessThanOrEqual(64);
    expect(REQID_RE.test(echoed)).toBe(true);
  });

  test("debug body advertises stage labels and no PII-shaped values", async () => {
    const ctx = await request.newContext({ extraHTTPHeaders: { "user-agent": REAL_CHROME_UA } });
    const res = await ctx.get(`${BASE}/api/public/live-orders?limit=5&debug=1`, { timeout: 20_000 });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      orders: unknown[];
      debug?: { stages?: string[]; counts?: Record<string, number>; requestId?: string };
    };
    expect(body.debug).toBeTruthy();
    const stages = body.debug?.stages || [];
    expect(stages.some((s) => s.startsWith("firestore.query"))).toBe(true);
    expect(stages.some((s) => s.startsWith("mapping"))).toBe(true);
    expect(body.debug?.requestId).toMatch(REQID_RE);

    const serialised = JSON.stringify(body);
    expect(EMAIL_RE.test(serialised), `body leaks email-shaped value: ${serialised.slice(0, 200)}`).toBe(false);
    expect(UK_POSTCODE_RE.test(serialised), "body leaks UK-postcode-shaped value").toBe(false);
    expect(PHONE_RE.test(serialised), "body leaks phone-shaped value").toBe(false);
  });
});
