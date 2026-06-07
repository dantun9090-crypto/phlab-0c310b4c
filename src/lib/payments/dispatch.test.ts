/**
 * Tests for the cross-gateway dispatcher.
 *
 * Simulates enabled gateways and confirms that `createPaymentLinkForOrder`
 * only uses the configured primary gateway. Failed primary payments must be
 * surfaced clearly instead of silently redirecting customers to a backup.
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

const fenaCreateAndProcess = vi.fn<(...a: any[]) => any>();
vi.mock("@/lib/fena.server", () => ({
  fenaCreateAndProcess: (...args: any[]) => fenaCreateAndProcess(...args),
}));

const truelayerCreatePayment = vi.fn<(...a: any[]) => any>();
vi.mock("@/lib/payments/truelayer.server", () => ({
  truelayerCreatePayment: (...args: any[]) =>
    truelayerCreatePayment(...args),
}));

const yapilyCreatePayment = vi.fn<(...a: any[]) => any>();
vi.mock("@/lib/payments/yapily.server", () => ({
  yapilyCreatePayment: (...args: any[]) => yapilyCreatePayment(...args),
}));

const resolveActiveGateways = vi.fn<(...a: any[]) => any>();
const recordGatewayTest = vi.fn<(...a: any[]) => any>(async () => undefined);
const getGatewayConfig = vi.fn<(...a: any[]) => any>();
vi.mock("@/lib/payments/gateway-config.server", () => ({
  resolveActiveGateways: (...args: any[]) => resolveActiveGateways(...args),
  recordGatewayTest: (...args: any[]) => recordGatewayTest(...args),
  getGatewayConfig: (...args: any[]) => getGatewayConfig(...args),
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

describe("createPaymentLinkForOrder", () => {
  it("does not retry a backup gateway when the primary throws", async () => {
    resolveActiveGateways.mockResolvedValue({
      primary: gw("fena", { priority: "primary" }),
      backups: [gw("truelayer")],
    });

    // Primary fails…
    fenaCreateAndProcess.mockRejectedValueOnce(
      new Error("Fena API 502 Bad Gateway"),
    );
    const { createPaymentLinkForOrder } = await import(
      "@/lib/payments/dispatch.server"
    );
    await expect(createPaymentLinkForOrder(ORDER_CTX)).rejects.toThrow(
      /Fena API 502 Bad Gateway/,
    );

    expect(fenaCreateAndProcess).toHaveBeenCalledTimes(1);
    expect(truelayerCreatePayment).not.toHaveBeenCalled();

    // Health tracker should record the primary failure only.
    const calls = (recordGatewayTest.mock.calls as Array<[string, { ok: boolean }]>).map(
      ([gateway, payload]) => ({ gateway, ok: payload.ok }),
    );
    expect(calls).toContainEqual({ gateway: "fena", ok: false });
    expect(calls).not.toContainEqual({ gateway: "truelayer", ok: true });
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

  it("throws the primary error without trying configured backups", async () => {
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
      /fena down/,
    );
    expect(fenaCreateAndProcess).toHaveBeenCalledTimes(1);
    expect(truelayerCreatePayment).not.toHaveBeenCalled();
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
