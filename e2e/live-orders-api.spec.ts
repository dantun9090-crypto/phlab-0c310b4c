/**
 * CI test that exercises the deployed Cloudflare Worker runtime for
 * `/api/public/live-orders` and asserts the endpoint returns a non-empty,
 * well-shaped example structure when Firestore has seeded data.
 *
 * Base URL: SMOKE_BASE_URL || TEST_BASE_URL || https://phlabs.co.uk
 *
 * Why an HTTP test (not unit): this route pulls in
 *   - Firebase Admin (`listDocsAdmin`) initialised via the Worker's env
 *   - Web Crypto (`crypto.subtle.digest`) — the previous `require('crypto')`
 *     path failed on Workers ESM
 *   - `Promise.all` async mapping through `mapRawOrderToLive`
 * Only a request against the real worker verifies all three at once.
 *
 * The endpoint has a 30s in-isolate cache, so we bust it with `debug=1` to
 * force a fresh Firestore read every run.
 */
import { test, expect, request } from "@playwright/test";

const BASE = (
  process.env.SMOKE_BASE_URL ||
  process.env.TEST_BASE_URL ||
  "https://phlabs.co.uk"
).replace(/\/+$/, "");

// Cloudflare bot manager 403s the default Playwright "HeadlessChrome" UA.
const REAL_CHROME_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

interface LiveOrderShape {
  id: unknown;
  initial: unknown;
  city: unknown;
  productName: unknown;
  createdAtMs: unknown;
  productImage?: unknown;
  userHash?: unknown;
  status?: unknown;
}

interface LiveOrdersResponse {
  orders: LiveOrderShape[];
  count: number;
  debug?: { scanned?: number };
}

test.describe("Cloudflare Worker: /api/public/live-orders", () => {
  test("returns non-empty, well-shaped example orders when Firestore has seeded data", async () => {
    const ctx = await request.newContext({
      extraHTTPHeaders: {
        "user-agent": REAL_CHROME_UA,
        "accept-language": "en-GB,en;q=0.9",
      },
    });

    // debug=1 bypasses the 30s isolate cache and adds { scanned } so we can
    // tell "worker ran, Firestore truly empty" apart from "worker crashed
    // and returned the { orders: [] } catch fallback".
    const res = await ctx.get(`${BASE}/api/public/live-orders?limit=5&debug=1`, {
      timeout: 20_000,
    });

    expect(res.status(), `HTTP ${res.status()}`).toBe(200);

    const contentType = res.headers()["content-type"] || "";
    expect(contentType).toContain("application/json");

    // Worker must NEVER leak PII via caching intermediaries; the route
    // opts out of shared caches even on the debug path (no-store fallback)
    // or serves the max-age=30 cacheable branch. Both are acceptable.
    const cacheControl = (res.headers()["cache-control"] || "").toLowerCase();
    expect(cacheControl).toMatch(/no-store|max-age=30/);

    const body = (await res.json()) as LiveOrdersResponse;

    expect(Array.isArray(body.orders), "orders must be an array").toBe(true);
    expect(typeof body.count).toBe("number");
    // debug=1 must round-trip; if it doesn't, the request hit the catch
    // block (Worker crashed) rather than the real handler.
    expect(body.debug, "debug=1 branch must round-trip { scanned }").toBeTruthy();
    expect(typeof body.debug?.scanned).toBe("number");

    // If Firestore genuinely has no non-excluded orders, fail loudly — the
    // whole point of this test is to catch a broken worker that quietly
    // returns []. Seed data is expected in the environment under test.
    expect(
      body.orders.length,
      `expected non-empty orders (scanned=${body.debug?.scanned ?? "?"}). ` +
        `Either Firestore has no seeded orders or the worker fell through ` +
        `to the empty-catch fallback.`,
    ).toBeGreaterThan(0);
    expect(body.count).toBe(body.orders.length);

    // Assert the LiveOrder shape on the first example — GDPR-safe fields
    // only; surnames/emails/addresses/postcodes/phones must never appear.
    const example = body.orders[0]!;
    expect(typeof example.id, "order.id string").toBe("string");
    expect(String(example.id).length).toBeGreaterThan(0);

    expect(typeof example.initial, "order.initial string").toBe("string");
    // "J." — one letter + dot (or just a letter). Never a full name.
    expect(String(example.initial)).toMatch(/^[A-Za-z]\.?$/);

    expect(typeof example.city, "order.city string").toBe("string");
    expect(String(example.city).length).toBeGreaterThan(0);

    expect(typeof example.productName, "order.productName string").toBe("string");
    expect(String(example.productName).length).toBeGreaterThan(0);

    expect(typeof example.createdAtMs, "order.createdAtMs number").toBe("number");
    expect(Number(example.createdAtMs)).toBeGreaterThan(0);

    // userHash (if present) must be a short non-reversible hex, not a raw UID.
    if (example.userHash !== undefined) {
      expect(typeof example.userHash).toBe("string");
      expect(String(example.userHash)).toMatch(/^[0-9a-f]{16}$/);
    }

    // PII regression guard — the serialised JSON must not contain obvious
    // PII fields even if a future mapRawOrderToLive change accidentally
    // widens the projection.
    const raw = JSON.stringify(body).toLowerCase();
    for (const banned of ["email", "postcode", "postal_code", "phone", "surname", "lastname"]) {
      expect(raw.includes(banned), `response leaks "${banned}"`).toBe(false);
    }
  });

  test("HEAD returns 200 with no-store", async () => {
    const ctx = await request.newContext({
      extraHTTPHeaders: { "user-agent": REAL_CHROME_UA },
    });
    const res = await ctx.fetch(`${BASE}/api/public/live-orders`, {
      method: "HEAD",
      timeout: 15_000,
    });
    expect(res.status()).toBe(200);
    expect((res.headers()["cache-control"] || "").toLowerCase()).toContain("no-store");
  });
});
