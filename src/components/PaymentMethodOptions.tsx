/**
 * Customer-facing payment method selector used on Checkout.
 *
 * Presents two selectable cards inside a single radiogroup:
 *  - Primary "Pay by Bank" (Open Banking) — recommended, richer trust signals
 *  - Secondary "Manual Bank Transfer" — reserved order for 48h
 *
 * All payment logic (API calls, webhooks, cart state, gateway routing) is
 * owned by the parent Checkout page. This component is pure UI.
 *
 * Accessibility:
 *  - role="radiogroup" wraps the two options; each option is a real
 *    <button role="radio"> with aria-checked and aria-describedby.
 *  - Selected option renders a visible + screen-reader-only "Selected" chip.
 *  - "What happens next" is a <details> disclosure — no JS required, works
 *    at build time on the pre-rendered static site.
 */
import {
  Landmark,
  CheckCircle2,
  ChevronDown,
  ShieldCheck,
  BadgeCheck,
  Zap,
  CreditCard,
  Lock,
  ArrowRightLeft,
} from "lucide-react";
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
  "Approve the payment in your bank app with Face ID, fingerprint, or your usual login.",
  "You'll be returned here automatically — your order is confirmed instantly.",
];

const MANUAL_TRANSFER_STEPS = [
  "Tap “Place order” below to reserve your items for 48 hours.",
  "We'll email you the bank name, sort code, account number, and a unique reference.",
  "Log in to your bank app and send the exact total using that reference.",
  "Once we receive the funds (usually within a few hours) we ship your order.",
];

const TRUST_ITEMS: { icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { icon: ShieldCheck, label: "Secure Open Banking" },
  { icon: BadgeCheck, label: "FCA Regulated" },
  { icon: Zap, label: "Instant Transfer" },
  { icon: CreditCard, label: "No Card Needed" },
  { icon: Lock, label: "GDPR Compliant" },
  { icon: ArrowRightLeft, label: "Direct Payment" },
];

/** Custom emerald radio indicator (not a native input). */
function RadioDot({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
        checked
          ? "border-emerald-400 bg-emerald-500/20"
          : "border-white/30 bg-transparent"
      }`}
    >
      <span
        className={`h-2.5 w-2.5 rounded-full transition-transform ${
          checked ? "bg-emerald-400 scale-100" : "bg-transparent scale-0"
        }`}
      />
    </span>
  );
}

function TrustGrid() {
  return (
    <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 py-3 border-t border-white/10">
      {TRUST_ITEMS.map(({ icon: Icon, label }) => (
        <li key={label} className="flex items-center gap-2 min-w-0">
          <Icon className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
          <span className="text-xs text-slate-400 leading-snug break-words">
            {label}
          </span>
        </li>
      ))}
    </ul>
  );
}

function InstructionList({
  id,
  steps,
}: {
  id: string;
  steps: string[];
}) {
  return (
    <details
      id={id}
      className="group mt-3 rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden"
    >
      <summary
        className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-slate-200 hover:bg-white/[0.04] transition-colors"
        aria-label="What happens next"
      >
        <span>What happens next?</span>
        <ChevronDown
          className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <ol className="px-4 pb-4 pt-1 space-y-2 text-sm text-slate-300 leading-relaxed list-none">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3 min-w-0">
            <span
              aria-hidden="true"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-semibold text-emerald-300"
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 break-words">{step}</span>
          </li>
        ))}
      </ol>
    </details>
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

  const showPrimary = hasOnline || wallidEnabled;
  const primaryValue: "pay_by_bank" | "wallid" = wallidEnabled ? "wallid" : "pay_by_bank";
  const primarySelected = value === primaryValue;
  const manualSelected = value === "bank_transfer";

  const cardBase =
    "relative w-full text-left rounded-2xl border transition-all p-4 sm:p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060f1e]";

  const primaryCardClass = `${cardBase} ${
    primarySelected
      ? "bg-emerald-500/10 border-emerald-500/40 border-l-4 border-l-emerald-500 shadow-lg shadow-emerald-500/10"
      : "bg-white/5 border-white/10 hover:bg-white/[0.07] hover:border-white/20"
  }`;

  const manualCardClass = `${cardBase} ${
    manualSelected
      ? "bg-emerald-500/10 border-emerald-500/40 border-l-4 border-l-emerald-500"
      : "bg-white/5 border-white/10 hover:bg-white/[0.07] hover:border-white/20"
  }`;

  const primaryTestId = wallidEnabled ? "wallid-pay-by-bank-button" : "pay-by-bank-button";
  const primaryInstructionsId = wallidEnabled ? "wallid-instructions" : "pay-by-bank-instructions";

  return (
    <div
      role="radiogroup"
      aria-label="Choose how you want to pay"
      className="rounded-2xl border border-white/10 bg-slate-900/40 p-3 sm:p-4 space-y-3 sm:space-y-4"
    >
      {noOnline && (
        <div
          data-testid="manual-only-notice"
          role="status"
          className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 leading-relaxed"
        >
          Instant Pay-by-Bank is temporarily unavailable. Please complete your
          order via Manual Bank Transfer below — your order will be reserved for
          48 hours.
        </div>
      )}

      {/* ── PRIMARY: Pay by Bank (Open Banking) ── */}
      {showPrimary && (
        <div>
          <button
            type="button"
            data-testid={primaryTestId}
            onClick={() => onChange(primaryValue)}
            role="radio"
            aria-checked={primarySelected}
            aria-describedby={primarySelected ? primaryInstructionsId : undefined}
            className={primaryCardClass}
          >
            {/* RECOMMENDED pill */}
            <span className="absolute top-3 right-3 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold tracking-wide text-slate-900">
              RECOMMENDED
            </span>

            <div className="flex items-start gap-3 pr-24 sm:pr-28">
              <RadioDot checked={primarySelected} />
              <span
                aria-hidden="true"
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  primarySelected
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-white/5 text-slate-300"
                }`}
              >
                <Landmark className="w-5 h-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-lg font-semibold text-white leading-tight break-words">
                    Pay by Bank
                  </p>
                  {primarySelected && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Selected
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-300 leading-relaxed break-words">
                  Pay securely from any UK bank app — instant confirmation, no
                  card needed.
                </p>
                {options?.primary && !wallidEnabled && (
                  <p
                    data-testid="active-gateway-label"
                    className="mt-1.5 text-xs text-emerald-300/90 leading-relaxed break-words"
                  >
                    via {options.primary.name}
                    {options.primary.sandbox && " (sandbox)"}
                    {options.backups.length > 0 && (
                      <span className="text-slate-400">
                        {" "}· auto-failover to{" "}
                        {options.backups.map((b) => b.name).join(", ")}
                      </span>
                    )}
                  </p>
                )}
                <span className="sr-only">
                  {primarySelected
                    ? "Selected. You will be sent to your bank app to approve the payment."
                    : "Not selected. Tap to pay instantly from your UK bank app."}
                </span>

                <UkBankBadges className="mt-3" />

                <TrustGrid />
              </div>
            </div>
          </button>

          {primarySelected && (
            <>
              <InstructionList id={primaryInstructionsId} steps={OPEN_BANKING_STEPS} />
              {wallidEnabled && <WallidTrustElements className="mt-3" showBadges={false} />}
            </>
          )}
        </div>
      )}

      {/* ── SECONDARY: Manual Bank Transfer ── */}
      <div>
        <button
          type="button"
          data-testid="manual-bank-transfer-button"
          onClick={() => onChange("bank_transfer")}
          role="radio"
          aria-checked={manualSelected}
          aria-describedby={manualSelected ? "manual-bank-instructions" : undefined}
          className={manualCardClass}
        >
          <div className="flex items-start gap-3">
            <RadioDot checked={manualSelected} />
            <span
              aria-hidden="true"
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                manualSelected
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-white/5 text-slate-300"
              }`}
            >
              <ArrowRightLeft className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-base font-medium text-white leading-tight break-words">
                  Manual Bank Transfer
                </p>
                {manualSelected && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Selected
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-400 leading-relaxed break-words">
                Receive bank details by email and transfer manually within 48
                hours.
              </p>
              <p className="mt-1.5 text-xs text-slate-500 leading-relaxed break-words">
                Your order will be reserved for 48 hours. Confirmation email
                sent immediately.
              </p>
              <span className="sr-only">
                {manualSelected
                  ? "Selected. We will email you bank details after you place the order."
                  : "Not selected. Tap to pay by manual UK bank transfer."}
              </span>
            </div>
          </div>
        </button>

        {manualSelected && (
          <InstructionList id="manual-bank-instructions" steps={MANUAL_TRANSFER_STEPS} />
        )}
      </div>
    </div>
  );
}
