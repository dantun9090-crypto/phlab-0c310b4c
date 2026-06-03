import { describe, expect, it } from "vitest";
import {
  ORDER_TRACKING_STEPS,
  getOrderTrackingIndex,
} from "./order-tracking";

describe("getOrderTrackingIndex", () => {
  it("places pending and pending_payment at step 0 (Placed)", () => {
    expect(getOrderTrackingIndex("pending")).toBe(0);
    expect(getOrderTrackingIndex("pending_payment")).toBe(0);
  });

  it("advances 'paid' to step 1 (Processing) — Placed becomes a checkmark", () => {
    expect(getOrderTrackingIndex("paid")).toBe(1);
  });

  it("matches existing workflow steps by name", () => {
    expect(getOrderTrackingIndex("processing")).toBe(1);
    expect(getOrderTrackingIndex("shipped")).toBe(2);
    expect(getOrderTrackingIndex("delivered")).toBe(3);
  });

  it("returns -1 for cancelled (UI renders its own state)", () => {
    expect(getOrderTrackingIndex("cancelled")).toBe(-1);
  });

  it("returns -1 for unknown statuses so the bar stays unhighlighted", () => {
    expect(getOrderTrackingIndex("refunded")).toBe(-1);
    expect(getOrderTrackingIndex("")).toBe(-1);
    expect(getOrderTrackingIndex("bogus")).toBe(-1);
  });

  it("step order is Placed → Processing → Shipped → Delivered", () => {
    expect([...ORDER_TRACKING_STEPS]).toEqual([
      "pending",
      "processing",
      "shipped",
      "delivered",
    ]);
  });
});
