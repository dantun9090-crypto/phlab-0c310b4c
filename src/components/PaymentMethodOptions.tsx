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
import WallidTrustElements from "@/components/WallidTrustElements";
import type { CheckoutPaymentOptions } from "@/lib/payments/types";

export interface PaymentMethodOptionsProps {
  options: CheckoutPaymentOptions | null;
  /** Wallid Pay-by-Bank kill switch from admin panel (default false). */
  wallidEnabled?: boolean;
  value: "pay_by_bank" | "bank_transfer" | "wallid";
  onChange: (next: "pay_by_bank" | "bank_transfer" | "wallid") => void;
}

export default function PaymentMethodOptions({
  options,
  wallidEnabled = false,
  value,
  onChange,
}: PaymentMethodOptionsProps) {
  const hasOnline = Boolean(
    options && (options.primary || options.backups.length > 0),
  );
  const noOnline = Boolean(
    !wallidEnabled && options && !options.primary && options.backups.length === 0,
  );

  return (
    <>
      {noOnline && (
        <div
          data-testid="manual-only-notice"
          className="bg-amber-500/10 border-2 border-amber-500/40 rounded-xl p-4 text-base text-amber-100 leading-relaxed"
        >
          Instant Pay-by-Bank is temporarily unavailable. Please complete your
          order via Manual Bank Transfer below — your order will be reserved for
          48 hours.
        </div>
      )}
      {/* Wallid Pay by Bank — only when enabled by admin kill switch */}
      {wallidEnabled && (
        <button
          type="button"
          data-testid="wallid-pay-by-bank-button"
          onClick={() => onChange("wallid")}
          aria-pressed={value === "wallid"}
          className={`w-full flex items-start gap-4 text-left p-5 rounded-2xl border-2 transition-all mb-3 min-h-[88px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/60 ${
            value === "wallid"
              ? "border-emerald-400 bg-emerald-500/15 shadow-lg shadow-emerald-500/20"
              : "border-white/20 bg-[#060f1e] hover:border-emerald-400/60 hover:bg-white/5"
          }`}
        >
          <span
            className={`flex items-center justify-center w-12 h-12 rounded-xl shrink-0 ${
              value === "wallid" ? "bg-emerald-500 text-black" : "bg-white/10 text-emerald-300"
            }`}
            aria-hidden="true"
          >
            <Landmark className="w-7 h-7" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-white flex items-center gap-2 flex-wrap leading-tight">
              Pay by Bank
              <span className="text-xs font-bold uppercase tracking-wide bg-emerald-400 text-black px-2 py-0.5 rounded">
                Recommended
              </span>
            </p>
            <p className="text-sm text-slate-200 leading-relaxed mt-1.5">
              Pay securely from any UK bank app — instant confirmation, no card needed.
            </p>
            <UkBankBadges className="mt-3" />
          </div>
        </button>
      )}
      {wallidEnabled && value === "wallid" && (
        <WallidTrustElements className="mb-3" />
      )}
      <div
        className={`grid grid-cols-1 ${hasOnline ? "sm:grid-cols-2" : ""} gap-3`}
      >
        {hasOnline && (
          <button
            type="button"
            data-testid="pay-by-bank-button"
            onClick={() => onChange("pay_by_bank")}
            aria-pressed={value === "pay_by_bank"}
            className={`flex items-start gap-4 text-left p-5 rounded-2xl border-2 transition-all min-h-[88px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/60 ${
              value === "pay_by_bank"
                ? "border-emerald-400 bg-emerald-500/15 shadow-lg shadow-emerald-500/20"
                : "border-white/20 bg-[#060f1e] hover:border-emerald-400/60 hover:bg-white/5"
            }`}
          >
            <span
              className={`flex items-center justify-center w-12 h-12 rounded-xl shrink-0 ${
                value === "pay_by_bank" ? "bg-emerald-500 text-black" : "bg-white/10 text-emerald-300"
              }`}
              aria-hidden="true"
            >
              <Landmark className="w-7 h-7" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold text-white flex items-center gap-2 flex-wrap leading-tight">
                Pay by Bank
                <span className="text-xs font-bold uppercase tracking-wide bg-emerald-400 text-black px-2 py-0.5 rounded">
                  Instant
                </span>
              </p>
              <p className="text-sm text-slate-200 leading-relaxed mt-1.5">
                Pay instantly from your UK bank account — no card needed, no
                chargebacks.
              </p>
              {options?.primary && (
                <p
                  data-testid="active-gateway-label"
                  className="text-xs text-emerald-200 mt-1.5"
                >
                  via {options.primary.name}
                  {options.primary.sandbox && " (sandbox)"}
                  {options.backups.length > 0 && (
                    <span className="text-slate-300">
                      {" "}· backup configured: {" "}
                      {options.backups.map((b) => b.name).join(", ")}
                    </span>
                  )}
                </p>
              )}
              <UkBankBadges className="mt-3" />
            </div>
          </button>
        )}
        <button
          type="button"
          data-testid="manual-bank-transfer-button"
          onClick={() => onChange("bank_transfer")}
          aria-pressed={value === "bank_transfer"}
          className={`flex items-start gap-4 text-left p-5 rounded-2xl border-2 transition-all min-h-[88px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/60 ${
            value === "bank_transfer"
              ? "border-emerald-400 bg-emerald-500/15 shadow-lg shadow-emerald-500/20"
              : "border-white/20 bg-[#060f1e] hover:border-emerald-400/60 hover:bg-white/5"
          }`}
        >
          <span
            className={`flex items-center justify-center w-12 h-12 rounded-xl shrink-0 ${
              value === "bank_transfer" ? "bg-emerald-500 text-black" : "bg-white/10 text-emerald-300"
            }`}
            aria-hidden="true"
          >
            <Landmark className="w-7 h-7" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-white leading-tight">
              Manual Bank Transfer
            </p>
            <p className="text-sm text-slate-200 leading-relaxed mt-1.5">
              Receive bank details by email and transfer manually within 48 hours.
            </p>
          </div>
        </button>
      </div>
    </>
  );
}
