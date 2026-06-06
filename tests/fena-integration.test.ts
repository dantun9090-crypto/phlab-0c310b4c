/**
 * Live integration tests for the Fena Open Banking REST client.
 *
 * Hits Fena's production API host (`https://epos.api.prod-gcp.fena.co/open`)
 * — the same endpoint used by the app at runtime — and verifies our
 * adapters in `src/lib/fena.server.ts` match the schema documented at
 * https://toolkit-docs.fena.co/toolkit-api/payments-module/single-payments/api-requests.
 *
 * Tests are SKIPPED when any of `FENA_TERMINAL_ID`, `FENA_TERMINAL_SECRET`,
 * or the explicit `FENA_INTEGRATION=1` flag is missing. This keeps CI green
 * on PRs that don't have the secrets injected, while letting maintainers
 * (and the nightly job) catch upstream contract drift early.
 *
 * To run locally:
 *   FENA_INTEGRATION=1 \
 *   FENA_TERMINAL_ID=... \
 *   FENA_TERMINAL_SECRET=... \
 *   bun run test:fena
 */
import { describe, it, expect } from "vitest";
import {
  fenaCreateAndProcess,
  fenaGetPayment,
  fenaListPayments,
} from "@/lib/fena.server";

const haveCreds =
  Boolean(process.env.FENA_TERMINAL_ID) &&
  Boolean(process.env.FENA_TERMINAL_SECRET) &&
  process.env.FENA_INTEGRATION === "1";

const d = haveCreds ? describe : describe.skip;

d("Fena live integration", () => {
  // Small, harmless amount + a unique sanitized reference so repeated runs
  // don't collide. Fena requires /^[a-z0-9-]+$/i (1..12 chars).
  const reference = `ci-${Date.now().toString(36)}`.slice(0, 12);

  let createdId = "";

  it("create-and-process returns a HPP link + payment id", async () => {
    const res = await fenaCreateAndProcess({
      reference,
      amount: 0.5,
      customerName: "CI Probe",
      customerEmail: "ci@phlabs.co.uk",
      description: "PH Labs CI integration probe",
      customRedirectUrl: "https://phlabs.co.uk/payment/success?orderId=CI-PROBE",
    });
    expect(res.id, "Fena should return a payment id").toBeTypeOf("string");
    expect(res.id.length).toBeGreaterThan(0);
    expect(res.link, "Fena should return an HPP link").toMatch(/^https:\/\//);
    expect(res.reference.toLowerCase()).toBe(reference);
    // `amount` is the same string we sent, formatted to 2dp per spec.
    expect(res.amount).toMatch(/^\d+\.\d{2}$/);
    createdId = res.id;
  }, 25_000);

  it("get payment by id returns the payment we just created", async () => {
    expect(createdId, "previous test must have populated createdId").toBeTruthy();
    const got = await fenaGetPayment(createdId);
    expect(got.id).toBe(createdId);
    expect(got.reference?.toLowerCase()).toBe(reference);
    expect(got.amount).toMatch(/^\d+\.\d{2}$/);
    // Fresh payment should be in a non-settled state (pending / sent /
    // initiated). We don't assert a specific string because Fena's enum
    // covers ~11 states.
    expect(String(got.status).length).toBeGreaterThan(0);
  }, 20_000);

  it("list payments includes the payment we just created", async () => {
    const list = await fenaListPayments(50);
    expect(Array.isArray(list)).toBe(true);
    const found = list.find((p) => p.id === createdId);
    expect(found, `payment ${createdId} should appear in the latest 50`).toBeDefined();
    if (found) {
      expect(found.amount).toMatch(/^\d+\.\d{2}$/);
      expect(found.reference?.toLowerCase()).toBe(reference);
    }
  }, 20_000);
});
