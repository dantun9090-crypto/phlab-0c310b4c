/**
 * Customer-facing payment method selector used on Checkout.
 *
 * Renders "Pay by Bank" (instant Open Banking) only when at least one
 * gateway is enabled in the admin panel. When no online gateway is
 * available, hides the option and shows an amber "manual bank transfer
 * only" notice; the parent controls the form state.
 *
 * Extracted from src/pages/Checkout/index.tsx so the dynamic-gateway
 * behaviour can be tested in isolation.
 */
import { Landmark } from "lucide-react";
import UkBankBadges from "@/components/UkBankBadges";
import type { CheckoutPaymentOptions } from "@/lib/payments/types";

export interface PaymentMethodOptionsProps {
  options: CheckoutPaymentOptions | null;
  value: "pay_by_bank" | "bank_transfer";
  onChange: (next: "pay_by_bank" | "bank_transfer") => void;
}

export default function PaymentMethodOptions({
  options,
  value,
  onChange,
}: PaymentMethodOptionsProps) {
  const hasOnline = Boolean(
    options && (options.primary || options.backups.length > 0),
  );
  const noOnline = Boolean(
    options && !options.primary && options.backups.length === 0,
  );

  return (
    <>
      {noOnline && (
        <div
          data-testid="manual-only-notice"
          className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-200"
        >
          Instant Pay-by-Bank is temporarily unavailable. Please complete your
          order via Manual Bank Transfer below — your order will be reserved for
          48 hours.
        </div>
      )}
      <div
        className={`grid grid-cols-1 ${hasOnline ? "sm:grid-cols-2" : ""} gap-2`}
      >
        {hasOnline && (
          <button
            type="button"
            data-testid="pay-by-bank-button"
            onClick={() => onChange("pay_by_bank")}
            className={`flex items-start gap-3 text-left p-3 rounded-xl border transition-all ${
              value === "pay_by_bank"
                ? "border-emerald-500/60 bg-emerald-500/10"
                : "border-white/10 bg-[#060f1e] hover:border-white/20"
            }`}
          >
            <Landmark
              className={`w-5 h-5 mt-0.5 shrink-0 ${
                value === "pay_by_bank" ? "text-emerald-400" : "text-gray-400"
              }`}
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white flex items-center gap-2 flex-wrap">
                Pay by Bank
                <span className="text-[10px] uppercase tracking-wider bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded">
                  Instant
                </span>
              </p>
              <p className="text-[11px] text-gray-400 leading-snug mt-0.5">
                Pay instantly from your UK bank account — no card needed, no
                chargebacks.
              </p>
              {options?.primary && (
                <p
                  data-testid="active-gateway-label"
                  className="text-[10px] text-emerald-300/80 mt-1"
                >
                  via {options.primary.name}
                  {options.primary.sandbox && " (sandbox)"}
                  {options.backups.length > 0 && (
                    <span className="text-gray-400">
                      {" "}· auto-failover to{" "}
                      {options.backups.map((b) => b.name).join(", ")}
                    </span>
                  )}
                </p>
              )}
              <UkBankBadges className="mt-2" />
            </div>
          </button>
        )}
        <button
          type="button"
          data-testid="manual-bank-transfer-button"
          onClick={() => onChange("bank_transfer")}
          className={`flex items-start gap-3 text-left p-3 rounded-xl border transition-all ${
            value === "bank_transfer"
              ? "border-emerald-500/60 bg-emerald-500/10"
              : "border-white/10 bg-[#060f1e] hover:border-white/20"
          }`}
        >
          <Landmark
            className={`w-5 h-5 mt-0.5 shrink-0 ${
              value === "bank_transfer" ? "text-emerald-400" : "text-gray-400"
            }`}
          />
          <div>
            <p className="text-sm font-semibold text-white">
              Manual Bank Transfer
            </p>
            <p className="text-[11px] text-gray-400 leading-snug mt-0.5">
              Receive bank details by email and transfer manually within 48h.
            </p>
          </div>
        </button>
      </div>
    </>
  );
}
