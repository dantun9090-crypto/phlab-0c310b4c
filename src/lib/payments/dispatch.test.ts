/**
 * Failover tests for the cross-gateway dispatcher.
 *
 * Simulates the primary gateway throwing while creating a payment link and
 * confirms that `createPaymentLinkForOrder`:
 *   1. transparently retries the next enabled backup,
 *   2. returns a working redirect link from the backup,
 *   3. records the failure on the primary and a success on the backup,
 *   4. throws only when every candidate fails.
 *
 * All server-only collaborators (Firestore admin SDK, Fena/TrueLayer
 * adapters, gateway config) are mocked so the test runs in jsdom.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PaymentGatewayConfig } from "@/lib/payments/types";

// --- Mocks ----------------------------------------------------------------

vi.mock("@/lib/server/firestore-admin", () => ({
  getDocAdmin: vi.fn(async () => null),
  updateDocAdmin: vi.fn(async () => undefined),
  addDocAdmin: vi.fn(async () => undefined),
  listDocsAdmin: vi.fn(async () => []),
}));

const fenaCreateAndProcess = vi.fn();
vi.mock("@/lib/fena.server", () => ({
  fenaCreateAndProcess: (...args: unknown[]) => fenaCreateAndProcess(...args),
}));

const truelayerCreatePayment = vi.fn();
vi.mock("@/lib/payments/truelayer.server", () => ({
  truelayerCreatePayment: (...args: unknown[]) =>
    truelayerCreatePayment(...args),
}));

const yapilyCreatePayment = vi.fn();
vi.mock("@/lib/payments/yapily.server", () => ({
  yapilyCreatePayment: (...args: unknown[]) => yapilyCreatePayment(...args),
}));

const resolveActiveGateways = vi.fn();
const recordGatewayTest = vi.fn(async () => undefined);
const getGatewayConfig = vi.fn();
vi.mock("@/lib/payments/gateway-config.server", () => ({
  resolveActiveGateways: (...args: unknown[]) => resolveActiveGateways(...args),
  recordGatewayTest: (...args: unknown[]) => recordGatewayTest(...args),
  getGatewayConfig: (...args: unknown[]) => getGatewayConfig(...args),
}));

// --- Helpers --------------------------------------------------------------

function gw(
  id: "fena" | "truelayer" | "yapily",
  overrides: Partial<PaymentGatewayConfig> = {},
): PaymentGatewayConfig {
  return {
    id,
    name: id[0].toUpperCase() + id.slice(1),
    enabled: true,
    priority: "backup",
    sandbox: false,
    status: "enabled",
    lastTestedAt: null,
    testStatus: "ok",
    errorMessage: null,
    errorCount: 0,
    apiKeyMasked: "••••test",
    webhookUrl: `https://phlabs.co.uk/api/public/hooks/${id}`,
    credentialsConfigured: true,
    ...overrides,
  };
}

const ORDER_CTX = {
  orderId: "ord_TESTABC",
  amountGbp: 49.99,
  reference: "ph-12345",
  customerName: "Research Buyer",
  customerEmail: "buyer@example.com",
  customerUid: "uid-1",
};

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Tests ----------------------------------------------------------------

describe("createPaymentLinkForOrder — failover", () => {
  it("retries the backup gateway when the primary throws and returns its redirect link", async () => {
    resolveActiveGateways.mockResolvedValue({
      primary: gw("fena", { priority: "primary" }),
      backups: [gw("truelayer")],
    });

    // Primary fails…
    fenaCreateAndProcess.mockRejectedValueOnce(
      new Error("Fena API 502 Bad Gateway"),
    );
    // …backup succeeds.
    truelayerCreatePayment.mockResolvedValueOnce({
      id: "tl_pay_999",
      status: "authorization_required",
      hppUrl: "https://payment.truelayer-sandbox.com/payments#tl_pay_999",
    });

    const { createPaymentLinkForOrder } = await import(
      "@/lib/payments/dispatch.server"
    );
    const result = await createPaymentLinkForOrder(ORDER_CTX);

    expect(result.gateway).toBe("truelayer");
    expect(result.hppUrl).toMatch(/truelayer-sandbox\.com/);
    expect(result.externalPaymentId).toBe("tl_pay_999");

    // Failover was attempted.
    expect(fenaCreateAndProcess).toHaveBeenCalledTimes(1);
    expect(truelayerCreatePayment).toHaveBeenCalledTimes(1);

    // Health tracker should record the primary failure and the backup success.
    const calls = recordGatewayTest.mock.calls.map(([gateway, payload]) => ({
      gateway,
      ok: (payload as { ok: boolean }).ok,
    }));
    expect(calls).toContainEqual({ gateway: "fena", ok: false });
    expect(calls).toContainEqual({ gateway: "truelayer", ok: true });
  });

  it("returns the primary's link when the primary succeeds (no backup attempt)", async () => {
    resolveActiveGateways.mockResolvedValue({
      primary: gw("fena", { priority: "primary" }),
      backups: [gw("truelayer")],
    });
    fenaCreateAndProcess.mockResolvedValueOnce({
      id: "fena_pay_1",
      status: "PENDING",
      link: "https://hpp.fena.co/p/abc",
    });

    const { createPaymentLinkForOrder } = await import(
      "@/lib/payments/dispatch.server"
    );
    const result = await createPaymentLinkForOrder(ORDER_CTX);

    expect(result.gateway).toBe("fena");
    expect(result.hppUrl).toBe("https://hpp.fena.co/p/abc");
    expect(truelayerCreatePayment).not.toHaveBeenCalled();
  });

  it("throws the last error when every gateway fails", async () => {
    resolveActiveGateways.mockResolvedValue({
      primary: gw("fena", { priority: "primary" }),
      backups: [gw("truelayer")],
    });
    fenaCreateAndProcess.mockRejectedValueOnce(new Error("fena down"));
    truelayerCreatePayment.mockRejectedValueOnce(new Error("truelayer down"));

    const { createPaymentLinkForOrder } = await import(
      "@/lib/payments/dispatch.server"
    );

    await expect(createPaymentLinkForOrder(ORDER_CTX)).rejects.toThrow(
      /truelayer down/,
    );
    expect(fenaCreateAndProcess).toHaveBeenCalledTimes(1);
    expect(truelayerCreatePayment).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error when no gateways are enabled", async () => {
    resolveActiveGateways.mockResolvedValue({ primary: null, backups: [] });

    const { createPaymentLinkForOrder } = await import(
      "@/lib/payments/dispatch.server"
    );

    await expect(createPaymentLinkForOrder(ORDER_CTX)).rejects.toThrow(
      /no payment gateways enabled/i,
    );
  });
});
