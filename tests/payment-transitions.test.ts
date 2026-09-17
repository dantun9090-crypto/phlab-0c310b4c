import { describe, expect, it } from "vitest";
import { allowFromFor, PAID_ALLOW_FROM, UNPAID_ALLOW_FROM } from "../src/lib/payment-transitions";

describe("payment transition allow-lists", () => {
  it("lets a retried payment settle from failed/expired", () => {
    for (const from of ["failed", "payment_failed", "expired", "cancelled_payment"]) {
      expect(allowFromFor("paid")).toContain(from);
    }
  });

  it("still settles ordinary pending orders", () => {
    for (const from of ["pending", "pending_payment", "awaiting_payment", "needs_review", ""]) {
      expect(PAID_ALLOW_FROM).toContain(from);
    }
  });

  it("never pulls a paid order back to failed/expired", () => {
    expect(allowFromFor("failed")).not.toContain("paid");
    expect(allowFromFor("expired")).not.toContain("paid");
    expect(UNPAID_ALLOW_FROM).not.toContain("failed");
  });
});
