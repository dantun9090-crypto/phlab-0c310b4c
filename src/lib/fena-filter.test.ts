import { describe, it, expect } from "vitest";
import { isFenaAutoPaid } from "./fena-filter";

describe("isFenaAutoPaid (admin Orders 'Fena Auto-Paid' filter)", () => {
  it("matches when paymentProvider='fena' AND fenaStatus='paid'", () => {
    expect(isFenaAutoPaid({ paymentProvider: "fena", fenaStatus: "paid" })).toBe(true);
  });

  it("is case-insensitive on fenaStatus", () => {
    expect(isFenaAutoPaid({ paymentProvider: "fena", fenaStatus: "PAID" })).toBe(true);
    expect(isFenaAutoPaid({ paymentProvider: "fena", fenaStatus: "Paid" })).toBe(true);
  });

  it("rejects when fenaStatus is not 'paid'", () => {
    expect(isFenaAutoPaid({ paymentProvider: "fena", fenaStatus: "sent" })).toBe(false);
    expect(isFenaAutoPaid({ paymentProvider: "fena", fenaStatus: "pending" })).toBe(false);
    expect(isFenaAutoPaid({ paymentProvider: "fena", fenaStatus: "cancelled" })).toBe(false);
    expect(isFenaAutoPaid({ paymentProvider: "fena", fenaStatus: "" })).toBe(false);
    expect(isFenaAutoPaid({ paymentProvider: "fena" })).toBe(false);
  });

  it("rejects non-Fena providers even if they're paid", () => {
    expect(isFenaAutoPaid({ paymentProvider: "stripe", fenaStatus: "paid" })).toBe(false);
    expect(isFenaAutoPaid({ paymentProvider: "bank_transfer", fenaStatus: "paid" })).toBe(false);
    expect(isFenaAutoPaid({ status: "paid", paidAt: new Date() })).toBe(false);
  });

  it("rejects Fena-adjacent payment methods without explicit paymentProvider='fena'", () => {
    // Old code treated fena_ob / pay_by_bank as "Fena" — the strict filter must NOT.
    expect(isFenaAutoPaid({ paymentMethod: "fena_ob", fenaStatus: "paid" })).toBe(false);
    expect(isFenaAutoPaid({ paymentMethod: "pay_by_bank", fenaStatus: "paid" })).toBe(false);
  });

  it("rejects nullish / non-object input", () => {
    expect(isFenaAutoPaid(null)).toBe(false);
    expect(isFenaAutoPaid(undefined)).toBe(false);
    expect(isFenaAutoPaid("paid")).toBe(false);
    expect(isFenaAutoPaid(42)).toBe(false);
  });
});
