/**
 * UI tests for the dynamic payment selector on Checkout.
 *
 * Covers:
 *  - No gateways enabled → Pay-by-Bank tile is hidden, amber notice shown,
 *    manual bank transfer is the only option.
 *  - Primary only → Pay-by-Bank tile renders with "via {name}".
 *  - Primary + backups → label shows auto-failover providers.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PaymentMethodOptions from "./PaymentMethodOptions";
import type { CheckoutPaymentOptions } from "@/lib/payments/types";

const noop = () => undefined;

const FENA_PRIMARY: CheckoutPaymentOptions = {
  primary: {
    id: "fena",
    name: "Fena",
    label: "Pay by Bank",
    description: "Fena Open Banking",
    sandbox: false,
  },
  backups: [],
  manualFallback: true,
};

const FENA_PRIMARY_TL_BACKUP: CheckoutPaymentOptions = {
  primary: FENA_PRIMARY.primary,
  backups: [
    {
      id: "truelayer",
      name: "TrueLayer",
      label: "Pay by Bank",
      description: "TrueLayer Open Banking",
      sandbox: true,
    },
  ],
  manualFallback: true,
};

const MANUAL_ONLY: CheckoutPaymentOptions = {
  primary: null,
  backups: [],
  manualFallback: true,
};

describe("PaymentMethodOptions", () => {
  it("hides the Pay-by-Bank tile and shows the amber notice when no gateways are enabled", () => {
    render(
      <PaymentMethodOptions
        options={MANUAL_ONLY}
        value="bank_transfer"
        onChange={noop}
      />,
    );
    expect(screen.queryByTestId("pay-by-bank-button")).not.toBeInTheDocument();
    expect(screen.getByTestId("manual-only-notice")).toBeInTheDocument();
    expect(screen.getByTestId("manual-only-notice").textContent).toMatch(
      /temporarily unavailable/i,
    );
    expect(screen.getByTestId("manual-bank-transfer-button")).toBeInTheDocument();
  });

  it("hides the Pay-by-Bank tile while gateway options are still loading", () => {
    render(
      <PaymentMethodOptions
        options={null}
        value="bank_transfer"
        onChange={noop}
      />,
    );
    expect(screen.queryByTestId("pay-by-bank-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("manual-only-notice")).not.toBeInTheDocument();
    // Manual fallback is always offered.
    expect(screen.getByTestId("manual-bank-transfer-button")).toBeInTheDocument();
  });

  it("renders Pay-by-Bank with the primary provider label when only a primary is enabled", () => {
    render(
      <PaymentMethodOptions
        options={FENA_PRIMARY}
        value="pay_by_bank"
        onChange={noop}
      />,
    );
    expect(screen.getByTestId("pay-by-bank-button")).toBeInTheDocument();
    const label = screen.getByTestId("active-gateway-label");
    expect(label.textContent).toMatch(/via Fena/i);
    expect(label.textContent).not.toMatch(/auto-failover/i);
    expect(screen.queryByTestId("manual-only-notice")).not.toBeInTheDocument();
  });

  it("shows the auto-failover provider list when a backup gateway is configured", () => {
    render(
      <PaymentMethodOptions
        options={FENA_PRIMARY_TL_BACKUP}
        value="pay_by_bank"
        onChange={noop}
      />,
    );
    const label = screen.getByTestId("active-gateway-label");
    expect(label.textContent).toMatch(/via Fena/i);
    expect(label.textContent).toMatch(/auto-failover to TrueLayer/i);
  });

  it("appends (sandbox) to the provider label when the primary is in sandbox mode", () => {
    const sandboxPrimary: CheckoutPaymentOptions = {
      primary: { ...FENA_PRIMARY.primary!, sandbox: true },
      backups: [],
      manualFallback: true,
    };
    render(
      <PaymentMethodOptions
        options={sandboxPrimary}
        value="pay_by_bank"
        onChange={noop}
      />,
    );
    expect(screen.getByTestId("active-gateway-label").textContent).toMatch(
      /via Fena \(sandbox\)/i,
    );
  });

  it("calls onChange when the user selects each payment method", () => {
    const onChange = vi.fn();
    render(
      <PaymentMethodOptions
        options={FENA_PRIMARY_TL_BACKUP}
        value="bank_transfer"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId("pay-by-bank-button"));
    fireEvent.click(screen.getByTestId("manual-bank-transfer-button"));
    expect(onChange).toHaveBeenNthCalledWith(1, "pay_by_bank");
    expect(onChange).toHaveBeenNthCalledWith(2, "bank_transfer");
  });

  describe("accessibility semantics", () => {
    it("exposes a radiogroup with role=radio + aria-checked on each option", () => {
      render(
        <PaymentMethodOptions
          options={FENA_PRIMARY}
          value="pay_by_bank"
          onChange={noop}
        />,
      );
      const group = screen.getByRole("radiogroup", {
        name: /choose how you want to pay/i,
      });
      expect(group).toBeInTheDocument();

      const payByBank = screen.getByTestId("pay-by-bank-button");
      const manual = screen.getByTestId("manual-bank-transfer-button");
      expect(payByBank).toHaveAttribute("role", "radio");
      expect(manual).toHaveAttribute("role", "radio");
      expect(payByBank).toHaveAttribute("aria-checked", "true");
      expect(manual).toHaveAttribute("aria-checked", "false");
    });

    it("links aria-describedby to the visible instructions for the selected option", () => {
      const { rerender } = render(
        <PaymentMethodOptions
          options={FENA_PRIMARY}
          value="pay_by_bank"
          onChange={noop}
        />,
      );
      const payByBank = screen.getByTestId("pay-by-bank-button");
      const describedBy = payByBank.getAttribute("aria-describedby");
      expect(describedBy).toBe("pay-by-bank-instructions");
      expect(document.getElementById(describedBy!)).toBeInTheDocument();

      rerender(
        <PaymentMethodOptions
          options={FENA_PRIMARY}
          value="bank_transfer"
          onChange={noop}
        />,
      );
      const manual = screen.getByTestId("manual-bank-transfer-button");
      expect(manual.getAttribute("aria-describedby")).toBe(
        "manual-bank-instructions",
      );
      expect(
        document.getElementById("manual-bank-instructions"),
      ).toBeInTheDocument();
      // unselected option must not carry a stale describedby
      expect(
        screen.getByTestId("pay-by-bank-button").getAttribute("aria-describedby"),
      ).toBeNull();
    });

    it("announces selected state via a visible chip and screen-reader-only text", () => {
      render(
        <PaymentMethodOptions
          options={FENA_PRIMARY}
          value="bank_transfer"
          onChange={noop}
        />,
      );
      const manual = screen.getByTestId("manual-bank-transfer-button");
      expect(manual.textContent).toMatch(/Selected/);
      expect(manual.textContent).toMatch(/Selected\. We will email you/i);
    });

    it("renders the 4-step Open Banking instructions when pay_by_bank is selected", () => {
      render(
        <PaymentMethodOptions
          options={FENA_PRIMARY}
          value="pay_by_bank"
          onChange={noop}
        />,
      );
      const region = document.getElementById("pay-by-bank-instructions")!;
      expect(region).toBeInTheDocument();
      expect(region.querySelectorAll("ol > li").length).toBe(4);
    });

    it("renders the 4-step Manual Bank Transfer instructions when bank_transfer is selected", () => {
      render(
        <PaymentMethodOptions
          options={FENA_PRIMARY}
          value="bank_transfer"
          onChange={noop}
        />,
      );
      const region = document.getElementById("manual-bank-instructions")!;
      expect(region).toBeInTheDocument();
      expect(region.querySelectorAll("ol > li").length).toBe(4);
    });

    it("keeps each option as a single keyboard-focusable button (no tabindex traps)", () => {
      render(
        <PaymentMethodOptions
          options={FENA_PRIMARY}
          value="pay_by_bank"
          onChange={noop}
        />,
      );
      for (const id of ["pay-by-bank-button", "manual-bank-transfer-button"]) {
        const btn = screen.getByTestId(id);
        expect(btn.tagName).toBe("BUTTON");
        // Native buttons are tabbable; explicit tabindex would break order.
        expect(btn.hasAttribute("tabindex")).toBe(false);
      }
    });
  });
});

