/**
 * Customer-facing payment method selector used on Checkout.
 *
 * Renders "Pay by Bank" (instant Open Banking) only when at least one
 * gateway is enabled in the admin panel. When no online gateway is
 * available, hides the option and shows an amber "manual bank transfer
 * only" notice; the parent controls the form state.
 *
 * Accessibility:
 *  - Options are exposed as a radiogroup so screen readers announce
 *    "selected / not selected" correctly.
 *  - Each option includes a screen-reader-only summary describing the
 *    current state plus next steps.
 *  - Visible step-by-step instructions appear under the selected option.
 *  - Larger type (18–20px) and generous line-height for older users.
 *  - Tap targets are ≥ 96px tall; focus-visible rings are 4px emerald.
 */
import { Landmark, CheckCircle2 } from "lucide-react";
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

const OPEN_BANKING_STEPS = [
  "Tap “Continue to payment” below.",
  "Choose your UK bank from the list (e.g. Barclays, HSBC, Lloyds, Monzo).",
  "You’ll be sent to your bank app or website to approve the payment with Face ID, fingerprint, or your usual login.",
  "You’ll be returned here automatically — your order is confirmed instantly.",
];

const MANUAL_TRANSFER_STEPS = [
  "Tap “Place order” below to reserve your items for 48 hours.",
  "We’ll email you the bank name, sort code, account number, and a unique reference.",
  "Log in to your bank app and send the exact total using that reference.",
  "Once we receive the funds (usually within a few hours) we ship your order.",
];

function InstructionList({
  id,
  title,
  steps,
}: {
  id: string;
  title: string;
  steps: string[];
}) {
  return (
    <div
      id={id}
      role="region"
      aria-label={title}
      className="mt-3 rounded-xl border-2 border-emerald-400/40 bg-emerald-500/5 p-4 sm:p-5"
    >
      <p className="text-lg sm:text-xl font-bold text-emerald-100 leading-snug">
        {title}
      </p>
      <ol className="mt-3 space-y-3 sm:space-y-4 text-base sm:text-lg text-white leading-loose break-words">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3 sm:gap-4">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-base font-bold text-black"
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 break-words">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
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

  const optionBase =
    "w-full flex items-start gap-4 text-left p-5 rounded-2xl border-2 transition-all min-h-[96px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060f1e]";
  const optionSelected =
    "border-emerald-400 bg-emerald-500/15 shadow-lg shadow-emerald-500/20";
  const optionIdle =
    "border-white/25 bg-[#060f1e] hover:border-emerald-400/60 hover:bg-white/5";

  return (
    <div
      role="radiogroup"
      aria-label="Choose how you want to pay"
      className="space-y-3"
    >
      {noOnline && (
        <div
          data-testid="manual-only-notice"
          role="status"
          className="bg-amber-500/10 border-2 border-amber-400/50 rounded-xl p-4 text-base sm:text-lg text-amber-100 leading-relaxed"
        >
          Instant Pay-by-Bank is temporarily unavailable. Please complete your
          order via Manual Bank Transfer below — your order will be reserved for
          48 hours.
        </div>
      )}

      {/* Wallid Pay by Bank — only when enabled by admin kill switch */}
      {wallidEnabled && (
        <>
          <button
            type="button"
            data-testid="wallid-pay-by-bank-button"
            onClick={() => onChange("wallid")}
            role="radio"
            aria-checked={value === "wallid"}
            aria-describedby={
              value === "wallid" ? "wallid-instructions" : undefined
            }
            className={`${optionBase} ${
              value === "wallid" ? optionSelected : optionIdle
            }`}
          >
            <span
              className={`flex items-center justify-center w-14 h-14 rounded-xl shrink-0 ${
                value === "wallid"
                  ? "bg-emerald-500 text-black"
                  : "bg-white/10 text-emerald-300"
              }`}
              aria-hidden="true"
            >
              <Landmark className="w-8 h-8" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xl font-bold text-white flex items-center gap-2 flex-wrap leading-snug">
                Pay by Bank
                <span className="text-xs font-bold uppercase tracking-wide bg-emerald-400 text-black px-2 py-0.5 rounded">
                  Recommended
                </span>
                {value === "wallid" && (
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-200">
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                    Selected
                  </span>
                )}
              </p>
              <p className="text-base text-slate-100 leading-relaxed mt-2">
                Pay securely from any UK bank app — instant confirmation, no
                card needed.
              </p>
              <span className="sr-only">
                {value === "wallid"
                  ? "Selected. You will be sent to your bank app to approve the payment."
                  : "Not selected. Tap to pay instantly from your UK bank app."}
              </span>
              <UkBankBadges className="mt-3" />
            </div>
          </button>
          {value === "wallid" && (
            <>
              <InstructionList
                id="wallid-instructions"
                title="What happens next"
                steps={OPEN_BANKING_STEPS}
              />
              <WallidTrustElements className="mb-1" />
            </>
          )}
        </>
      )}

      <div
        className={`grid grid-cols-1 ${hasOnline ? "sm:grid-cols-2" : ""} gap-3`}
      >
        {hasOnline && (
          <button
            type="button"
            data-testid="pay-by-bank-button"
            onClick={() => onChange("pay_by_bank")}
            role="radio"
            aria-checked={value === "pay_by_bank"}
            aria-describedby={
              value === "pay_by_bank" ? "pay-by-bank-instructions" : undefined
            }
            className={`${optionBase} ${
              value === "pay_by_bank" ? optionSelected : optionIdle
            }`}
          >
            <span
              className={`flex items-center justify-center w-14 h-14 rounded-xl shrink-0 ${
                value === "pay_by_bank"
                  ? "bg-emerald-500 text-black"
                  : "bg-white/10 text-emerald-300"
              }`}
              aria-hidden="true"
            >
              <Landmark className="w-8 h-8" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xl font-bold text-white flex items-center gap-2 flex-wrap leading-snug">
                Pay by Bank
                <span className="text-xs font-bold uppercase tracking-wide bg-emerald-400 text-black px-2 py-0.5 rounded">
                  Instant
                </span>
                {value === "pay_by_bank" && (
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-200">
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                    Selected
                  </span>
                )}
              </p>
              <p className="text-base text-slate-100 leading-relaxed mt-2">
                Pay instantly from your UK bank account — no card needed, no
                chargebacks.
              </p>
              {options?.primary && (
                <p
                  data-testid="active-gateway-label"
                  className="text-sm text-emerald-200 mt-2 leading-relaxed"
                >
                  via {options.primary.name}
                  {options.primary.sandbox && " (sandbox)"}
                  {options.backups.length > 0 && (
                    <span className="text-slate-200">
                      {" "}· auto-failover to{" "}
                      {options.backups.map((b) => b.name).join(", ")}
                    </span>
                  )}
                </p>
              )}
              <span className="sr-only">
                {value === "pay_by_bank"
                  ? "Selected. You will be sent to your bank app to approve the payment."
                  : "Not selected. Tap to pay instantly from your UK bank app."}
              </span>
              <UkBankBadges className="mt-3" />
            </div>
          </button>
        )}
        <button
          type="button"
          data-testid="manual-bank-transfer-button"
          onClick={() => onChange("bank_transfer")}
          role="radio"
          aria-checked={value === "bank_transfer"}
          aria-describedby={
            value === "bank_transfer" ? "manual-bank-instructions" : undefined
          }
          className={`${optionBase} ${
            value === "bank_transfer" ? optionSelected : optionIdle
          }`}
        >
          <span
            className={`flex items-center justify-center w-14 h-14 rounded-xl shrink-0 ${
              value === "bank_transfer"
                ? "bg-emerald-500 text-black"
                : "bg-white/10 text-emerald-300"
            }`}
            aria-hidden="true"
          >
            <Landmark className="w-8 h-8" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-bold text-white flex items-center gap-2 flex-wrap leading-snug">
              Manual Bank Transfer
              {value === "bank_transfer" && (
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-200">
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  Selected
                </span>
              )}
            </p>
            <p className="text-base text-slate-100 leading-relaxed mt-2">
              Receive bank details by email and transfer manually within 48
              hours.
            </p>
            <span className="sr-only">
              {value === "bank_transfer"
                ? "Selected. We will email you bank details after you place the order."
                : "Not selected. Tap to pay by manual UK bank transfer."}
            </span>
          </div>
        </button>
      </div>

      {value === "pay_by_bank" && hasOnline && (
        <InstructionList
          id="pay-by-bank-instructions"
          title="What happens next"
          steps={OPEN_BANKING_STEPS}
        />
      )}
      {value === "bank_transfer" && (
        <InstructionList
          id="manual-bank-instructions"
          title="What happens next"
          steps={MANUAL_TRANSFER_STEPS}
        />
      )}
    </div>
  );
}
