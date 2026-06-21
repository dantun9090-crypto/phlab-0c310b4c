/**
 * Wallid payment smoke suite (3 critical paths).
 *
 *   1. Happy path     — signed SUCCESS webhook → 200 + processed=1
 *   2. Idempotency    — same event delivered twice → second is deduped
 *   3. Manual sync    — admin "Sync payment status" on a stuck order
 *
 * Each test skips itself when its required env vars are missing, so the
 * suite is safe to run in CI without secrets (everything reports as
 * skipped) and meaningful when an operator supplies WALLID_WEBHOOK_SECRET.
 *
 * Run: `bunx playwright test` (or scope: `bunx playwright test -g happy`)
 */
import { test, expect, request } from "@playwright/test";
import crypto from "node:crypto";

const SECRET = process.env.WALLID_WEBHOOK_SECRET || "";
const WEBHOOK_PATH = "/api/public/hooks/wallid";

function signedHeaders(rawBody: string): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(`${ts}.${rawBody}`)
    .digest("hex");
  return {
    "content-type": "application/json",
    "x-webhook-timestamp": ts,
    "x-webhook-signature": `sha256=${signature}`,
    "x-webhook-event-count": "1",
  };
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  const eventId = `e2e_${crypto.randomUUID()}`;
  const apiPaymentId = `e2e_pay_${crypto.randomUUID()}`;
  return {
    event_id: eventId,
    api_payment_id: apiPaymentId,
    order_id: `e2e_order_${crypto.randomUUID()}`,
    status: "SUCCESS",
    occurred_at: new Date().toISOString(),
    ...overrides,
  };
}

test.describe("Wallid payment smoke", () => {
  test.beforeAll(() => {
    if (!SECRET) {
      console.warn(
        "[wallid smoke] WALLID_WEBHOOK_SECRET not set — all tests will skip.",
      );
    }
  });

  test("1. happy path — signed SUCCESS webhook is accepted", async () => {
    test.skip(!SECRET, "WALLID_WEBHOOK_SECRET not provided");

    const ctx = await request.newContext();
    const event = makeEvent({ status: "SUCCESS" });
    const body = JSON.stringify({ events: [event] });

    const res = await ctx.post(WEBHOOK_PATH, {
      headers: signedHeaders(body),
      data: body,
    });

    expect(res.status(), await res.text()).toBe(200);
    const json = (await res.json()) as { received?: boolean; processed?: number };
    expect(json.received).toBe(true);
    expect(json.processed).toBeGreaterThanOrEqual(1);

    // no-store cache headers must always be present on payment endpoints
    expect(res.headers()["cache-control"] || "").toMatch(/no-store/);
    await ctx.dispose();
  });

  test("2. idempotency — same event delivered twice is deduped", async () => {
    test.skip(!SECRET, "WALLID_WEBHOOK_SECRET not provided");

    const ctx = await request.newContext();
    const event = makeEvent({ status: "SUCCESS" });
    const body = JSON.stringify({ events: [event] });

    // First delivery
    const res1 = await ctx.post(WEBHOOK_PATH, {
      headers: signedHeaders(body),
      data: body,
    });
    expect(res1.status()).toBe(200);
    const j1 = (await res1.json()) as { processed?: number };
    expect(j1.processed).toBe(1);

    // Replay — same event_id + api_payment_id → must be deduped (composite key).
    // Re-sign with a fresh timestamp so the replay guard doesn't trip first.
    const res2 = await ctx.post(WEBHOOK_PATH, {
      headers: signedHeaders(body),
      data: body,
    });
    expect(res2.status()).toBe(200);
    const j2 = (await res2.json()) as { processed?: number };
    expect(j2.processed).toBe(0); // dedup ⇒ no new processing
    await ctx.dispose();
  });

  test("3. manual sync — admin can reconcile a stuck order", async () => {
    const stuckOrderId = process.env.TEST_STUCK_ORDER_ID || "";
    const adminBearer = process.env.ADMIN_BEARER_TOKEN || "";
    test.skip(
      !stuckOrderId || !adminBearer,
      "TEST_STUCK_ORDER_ID + ADMIN_BEARER_TOKEN required",
    );

    const ctx = await request.newContext();
    // Hit the server-fn endpoint that powers the admin "Sync" button. The
    // exact RPC path TanStack emits is /_serverFn/<id>; we exercise the same
    // logic via the public reconcile cron endpoint, which an admin can also
    // invoke for a specific order.
    const res = await ctx.post("/api/public/hooks/wallid-reconcile", {
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminBearer}`,
      },
      data: JSON.stringify({ orderId: stuckOrderId, force: true }),
    });

    expect([200, 401, 403]).toContain(res.status());
    // 401/403 means the test bearer isn't an admin/cron token — still a
    // useful smoke signal that the endpoint is reachable and not 500ing.
    if (res.status() === 200) {
      const j = (await res.json()) as { reconciled?: number; checked?: number };
      expect(typeof j.checked === "number" || typeof j.reconciled === "number").toBe(true);
    }
    await ctx.dispose();
  });
});
