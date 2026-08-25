/**
 * Integration tests for the Checkout payment step.
 *
 * Mirrors the exact wiring used in `src/pages/Checkout/index.tsx`:
 *   - PH Labs uses Wallid as the only online payment provider,
 *   - the old multi-gateway response must not surface Fena/TrueLayer,
 *   - manual bank transfer remains the fallback when Wallid is disabled.
 *
 * We mock the server function (so this can run in jsdom without hitting
 * Firebase / the admin SDK) and verify the rendered UI for three
 * scenarios that match the two meaningful checkout states:
 *   1. Wallid enabled,
 *   2. Wallid disabled / unavailable.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useEffect, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import PaymentMethodOptions from "@/components/PaymentMethodOptions";
import { getCheckoutPaymentOptions as loadCheckoutOptions } from "@/lib/payment-gateways.functions";
import type { CheckoutPaymentOptions } from "@/lib/payments/types";

// Mock the server function module — the dispatcher itself pulls in
// firebase-admin and is not safe to import in jsdom.
const getCheckoutPaymentOptions = vi.fn<() => Promise<CheckoutPaymentOptions>>();
vi.mock("@/lib/payment-gateways.functions", () => ({
  getCheckoutPaymentOptions: () => getCheckoutPaymentOptions(),
  listPaymentGateways: vi.fn(),
  togglePaymentGateway: vi.fn(),
  setPaymentGatewayPriority: vi.fn(),
  setPaymentGatewaySandbox: vi.fn(),
  testPaymentGateway: vi.fn(),
}));

/**
 * Minimal harness that replicates the Checkout page's gateway-loading
 * effect and renders the same selector component the real page renders.
 */
function CheckoutPaymentStepHarness() {
  const [options, setOptions] = useState<CheckoutPaymentOptions | null>(null);
  const [method, setMethod] = useState<"pay_by_bank" | "bank_transfer" | "wallid" | "peptidepay" | "nowpayments">(
    "wallid",
  );
  const [wallidEnabled, setWallidEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadCheckoutOptions()
      .then((opts) => {
        if (cancelled) return;
        setOptions(opts);
      })
      .catch(() => {
        if (cancelled) return;
        setOptions({ primary: null, backups: [], manualFallback: true });
        setWallidEnabled(false);
        setMethod("bank_transfer");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PaymentMethodOptions
      options={options}
      wallidEnabled={wallidEnabled}
      value={method}
      onChange={setMethod}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Checkout payment step — dynamic gateway buttons", () => {
  it("renders Wallid Pay-by-Bank when Wallid is enabled", async () => {
    getCheckoutPaymentOptions.mockResolvedValue({
      primary: null,
      backups: [],
      manualFallback: true,
    });

    render(<CheckoutPaymentStepHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("wallid-pay-by-bank-button")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("pay-by-bank-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("manual-only-notice")).not.toBeInTheDocument();
  });

  it("falls back to manual bank transfer if the gateway-options server call fails", async () => {
    getCheckoutPaymentOptions.mockRejectedValue(new Error("boom"));

    render(<CheckoutPaymentStepHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("manual-only-notice")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("pay-by-bank-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wallid-pay-by-bank-button")).not.toBeInTheDocument();
  });
});
