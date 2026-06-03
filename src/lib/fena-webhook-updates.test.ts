import { describe, expect, it } from "vitest";
import { computeFenaOrderUpdates } from "./fena-webhook-updates";

const NOW = new Date("2026-06-03T12:00:00.000Z");

describe("computeFenaOrderUpdates — already-paid idempotency", () => {
  it("does not overwrite paymentProvider or fenaPaymentId when order is already paid", () => {
    const { updates, transitionedToPaid } = computeFenaOrderUpdates({
      orderRow: {
        status: "paid",
        paymentProvider: "fena",
        fenaPaymentId: "fena_original_123",
        fenaEventIds: ["paid:2026-06-01T10:00:00Z"],
      },
      authoritative: { status: "paid", completedAt: "2026-06-03T11:59:00Z" },
      fenaPaymentId: "fena_replay_999",
      now: NOW,
    });

    expect(transitionedToPaid).toBe(false);
    expect(updates).not.toHaveProperty("status");
    expect(updates).not.toHaveProperty("paidAt");
    expect(updates).not.toHaveProperty("paymentProvider");
    expect(updates).not.toHaveProperty("fenaPaymentId");
    // Tracking fields still refresh.
    expect(updates.fenaStatus).toBe("paid");
    expect(updates.fenaLastEventAt).toBe(NOW);
  });

  it("does not overwrite an existing paymentProvider even on first paid transition", () => {
    const { updates, transitionedToPaid } = computeFenaOrderUpdates({
      orderRow: {
        status: "pending",
        paymentProvider: "manual",
        fenaEventIds: [],
      },
      authoritative: { status: "paid", completedAt: "2026-06-03T11:59:00Z" },
      fenaPaymentId: "fena_abc",
      now: NOW,
    });

    expect(transitionedToPaid).toBe(true);
    expect(updates.status).toBe("paid");
    expect(updates.paidAt).toBe(NOW);
    expect(updates).not.toHaveProperty("paymentProvider");
    expect(updates.fenaPaymentId).toBe("fena_abc");
  });

  it("does not overwrite an existing fenaPaymentId even on first paid transition", () => {
    const { updates, transitionedToPaid } = computeFenaOrderUpdates({
      orderRow: {
        status: "pending",
        fenaPaymentId: "fena_original_123",
        fenaEventIds: [],
      },
      authoritative: { status: "paid", completedAt: "2026-06-03T11:59:00Z" },
      fenaPaymentId: "fena_different_999",
      now: NOW,
    });

    expect(transitionedToPaid).toBe(true);
    expect(updates.status).toBe("paid");
    expect(updates.paymentProvider).toBe("fena");
    expect(updates).not.toHaveProperty("fenaPaymentId");
  });

  it("writes paymentProvider and fenaPaymentId on a clean pending → paid transition", () => {
    const { updates, transitionedToPaid } = computeFenaOrderUpdates({
      orderRow: { status: "pending", fenaEventIds: [] },
      authoritative: { status: "paid", completedAt: "2026-06-03T11:59:00Z" },
      fenaPaymentId: "fena_first_777",
      now: NOW,
    });

    expect(transitionedToPaid).toBe(true);
    expect(updates.status).toBe("paid");
    expect(updates.paidAt).toBe(NOW);
    expect(updates.paymentProvider).toBe("fena");
    expect(updates.fenaPaymentId).toBe("fena_first_777");
  });

  it("flags duplicate events (same status+completedAt) and emits no updates", () => {
    const eventKey = "paid:2026-06-03T11:59:00Z";
    const { updates, isDuplicate } = computeFenaOrderUpdates({
      orderRow: {
        status: "paid",
        paymentProvider: "fena",
        fenaPaymentId: "fena_x",
        fenaEventIds: [eventKey],
      },
      authoritative: { status: "paid", completedAt: "2026-06-03T11:59:00Z" },
      fenaPaymentId: "fena_x",
      now: NOW,
    });
    expect(isDuplicate).toBe(true);
    expect(updates).toEqual({});
  });

  it("non-paid follow-up events never touch paymentProvider/fenaPaymentId/status/paidAt", () => {
    for (const status of ["sent", "pending", "cancelled", "expired"]) {
      const { updates } = computeFenaOrderUpdates({
        orderRow: {
          status: "paid",
          paymentProvider: "fena",
          fenaPaymentId: "fena_original",
          fenaEventIds: [],
        },
        authoritative: { status, completedAt: "2026-06-03T12:00:00Z" },
        fenaPaymentId: "fena_other",
        now: NOW,
      });
      expect(updates, `status=${status}`).not.toHaveProperty("status");
      expect(updates).not.toHaveProperty("paidAt");
      expect(updates).not.toHaveProperty("paymentProvider");
      expect(updates).not.toHaveProperty("fenaPaymentId");
      expect(updates.fenaStatus).toBe(status);
    }
  });
});

describe("computeFenaOrderUpdates — partial pre-set fields", () => {
  it("paid order with paymentProvider set but fenaPaymentId missing: never backfills fenaPaymentId", () => {
    const { updates, transitionedToPaid } = computeFenaOrderUpdates({
      orderRow: {
        status: "paid",
        paymentProvider: "fena",
        // fenaPaymentId intentionally absent
        fenaEventIds: [],
      },
      authoritative: { status: "paid", completedAt: "2026-06-03T11:59:00Z" },
      fenaPaymentId: "fena_new_999",
      now: NOW,
    });
    expect(transitionedToPaid).toBe(false);
    expect(updates).not.toHaveProperty("paymentProvider");
    expect(updates).not.toHaveProperty("fenaPaymentId");
    expect(updates).not.toHaveProperty("status");
    expect(updates).not.toHaveProperty("paidAt");
  });

  it("paid order with fenaPaymentId set but paymentProvider missing: never backfills paymentProvider", () => {
    const { updates, transitionedToPaid } = computeFenaOrderUpdates({
      orderRow: {
        status: "paid",
        // paymentProvider intentionally absent
        fenaPaymentId: "fena_original_123",
        fenaEventIds: [],
      },
      authoritative: { status: "paid", completedAt: "2026-06-03T11:59:00Z" },
      fenaPaymentId: "fena_new_999",
      now: NOW,
    });
    expect(transitionedToPaid).toBe(false);
    expect(updates).not.toHaveProperty("paymentProvider");
    expect(updates).not.toHaveProperty("fenaPaymentId");
  });

  it("pending order with paymentProvider pre-set: backfills fenaPaymentId but does not overwrite provider", () => {
    const { updates, transitionedToPaid } = computeFenaOrderUpdates({
      orderRow: {
        status: "pending",
        paymentProvider: "manual",
        // fenaPaymentId absent
        fenaEventIds: [],
      },
      authoritative: { status: "paid", completedAt: "2026-06-03T11:59:00Z" },
      fenaPaymentId: "fena_abc",
      now: NOW,
    });
    expect(transitionedToPaid).toBe(true);
    expect(updates.status).toBe("paid");
    expect(updates).not.toHaveProperty("paymentProvider");
    expect(updates.fenaPaymentId).toBe("fena_abc");
  });

  it("pending order with fenaPaymentId pre-set: stamps provider but does not overwrite payment id", () => {
    const { updates, transitionedToPaid } = computeFenaOrderUpdates({
      orderRow: {
        status: "pending",
        // paymentProvider absent
        fenaPaymentId: "fena_pre_set_111",
        fenaEventIds: [],
      },
      authoritative: { status: "paid", completedAt: "2026-06-03T11:59:00Z" },
      fenaPaymentId: "fena_different_222",
      now: NOW,
    });
    expect(transitionedToPaid).toBe(true);
    expect(updates.status).toBe("paid");
    expect(updates.paymentProvider).toBe("fena");
    expect(updates).not.toHaveProperty("fenaPaymentId");
  });
});

