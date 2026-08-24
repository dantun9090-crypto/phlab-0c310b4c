/**
 * Customer-facing payment method selector used on Checkout.
 *
 * Premium accordion-style cards. Each method is a clean, selectable row;
 * clicking it selects the method and expands a smooth drawer with full details.
 * Only one option can be expanded at a time.
 *
 * Pure UI: all payment logic (API calls, webhooks, cart state, gateway
 * routing) is owned by the parent Checkout page. No external logo images —
 * text + Tailwind + Lucide icons only, safe on the pre-rendered dark theme.
 */
import { useEffect, useRef } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ShieldCheck,
  Landmark,
  Zap,
  CreditCard,
  Lock,
  ArrowLeftRight,
  Activity,
  Wallet,
  Clock,
} from "lucide-react";

import UkBankBadges from "@/components/UkBankBadges";
import type { CheckoutPaymentOptions } from "@/lib/payments/types";

export type PaymentMethodValue = "pay_by_bank" | "bank_transfer" | "wallid" | "peptidepay";

export interface PaymentMethodOptionsProps {
  options: CheckoutPaymentOptions | null;
  /** Wallid Pay-by-Bank kill switch from admin panel (default false). */
  wallidEnabled?: boolean;
  /** PeptidePay (card / Apple Pay / Google Pay / crypto) availability. */
  peptidepayEnabled?: boolean;
  /** Manual Bank Transfer kill switch from admin panel (default true). */
  manualEnabled?: boolean;
  /** Empty string means no method selected yet — both cards stay collapsed. */
  value: PaymentMethodValue | "";
  onChange: (next: PaymentMethodValue) => void;
}

const TRUST_ITEMS: { icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { icon: ShieldCheck, label: "Secure Open Banking" },
  { icon: Landmark, label: "FCA Regulated" },
  { icon: Zap, label: "Instant Bank Transfer" },
  { icon: CreditCard, label: "No Card Needed" },
  { icon: Lock, label: "GDPR Compliant" },
  { icon: ArrowLeftRight, label: "Direct Bank Payment" },
  { icon: Activity, label: "Real-time Settlement" },
  { icon: Wallet, label: "Pay from Your Bank" },
];

function Radio({ checked, tone = "emerald" }: { checked: boolean; tone?: "emerald" | "slate" }) {
  const borderClass = tone === "emerald" ? "border-emerald-400" : "border-slate-500";
  return (
    <span
      aria-hidden="true"
      className={`w-5 h-5 rounded-full border-2 ${borderClass} flex items-center justify-center shrink-0`}
    >
      {checked && <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />}
    </span>
  );
}

function TrustBadgesGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {TRUST_ITEMS.map(({ icon: Icon, label }) => (
        <span
          key={label}
          className="flex items-center gap-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] px-2.5 py-2 text-[11px] font-medium text-slate-200"
        >
          <Icon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="leading-tight">{label}</span>
        </span>
      ))}
    </div>
  );
}

/** Smooth height drawer wrapper. */
function Drawer({
  open,
  children,
  id,
  "data-testid": testId,
}: {
  open: boolean;
  children: React.ReactNode;
  id?: string;
  "data-testid"?: string;
}) {
  return (
    <div
      data-testid={testId}
      id={id}
      aria-hidden={!open}
      className={`grid transition-all duration-300 ease-out ${
        open ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0 mt-0"
      }`}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

export default function PaymentMethodOptions({
  options,
  wallidEnabled = false,
  peptidepayEnabled = false,
  value,
  onChange,
}: PaymentMethodOptionsProps) {
  const hasOnline = Boolean(options && (options.primary || options.backups.length > 0));
  const noOnline = Boolean(
    !wallidEnabled && options && !options.primary && options.backups.length === 0,
  );

  const showPrimary = hasOnline || wallidEnabled;
  const primaryValue: "pay_by_bank" | "wallid" = wallidEnabled ? "wallid" : "pay_by_bank";
  const primarySelected = value === primaryValue;
  const manualSelected = value === "bank_transfer";

  const primaryTestId = wallidEnabled ? "wallid-pay-by-bank-button" : "pay-by-bank-button";
  const primaryInstructionsId = wallidEnabled ? "wallid-instructions" : "pay-by-bank-instructions";

  const rootRef = useRef<HTMLDivElement>(null);

  /**
   * Scroll-preserving selection change.
   *
   * When a drawer expands/collapses, the clicked button's viewport position can
   * shift. We re-anchor scroll so the button stays at the same y for small
   * shifts, avoiding the "page jumped to top" feeling.
   */
  const handleSelect = (
    next: PaymentMethodValue,
    clickTarget: HTMLElement | null,
  ) => {
    console.log(`[PAYMENT] select method=${next}`);
    if (next === value) {
      // Re-tapping the already selected card must not feel like a dead click:
      // re-emit the selection so the parent clears any validation error.
      onChange(next);
      return;
    }
    const anchorTop = clickTarget?.getBoundingClientRect().top ?? null;
    onChange(next);
    if (typeof window === "undefined") return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (anchorTop != null && clickTarget) {
          const newTop = clickTarget.getBoundingClientRect().top;
          const delta = newTop - anchorTop;
          if (Math.abs(delta) > 1 && Math.abs(delta) < 400) {
            window.scrollBy({ top: delta, left: 0, behavior: "auto" });
          }
        }
      });
    });
  };

  const methodCount = (showPrimary ? 1 : 0) + (peptidepayEnabled ? 1 : 0) + 1;

  /**
   * Manual Bank Transfer is the ONLY method available. Customers were tapping
   * the card and thinking "nothing happens" (there was no other option to
   * switch to), so we pre-select it, give it the premium emerald treatment and
   * spell out the next step instead of leaving it looking like a dead choice.
   */
  const soleManual = methodCount === 1;

  useEffect(() => {
    if (soleManual && value === "") onChange("bank_transfer");
  }, [soleManual, value, onChange]);

  const baseCardClass =
    "group relative rounded-2xl border p-4 sm:p-5 cursor-pointer transition-all text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70";

  const primaryCardClass = `${baseCardClass} border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.12] to-emerald-900/[0.08] hover:from-emerald-500/[0.16] hover:to-emerald-900/[0.10] ${
    primarySelected ? "ring-2 ring-emerald-500/50 shadow-lg shadow-emerald-900/20" : ""
  }`;

  const manualCardClass = soleManual
    ? `${baseCardClass} border-emerald-500/40 bg-gradient-to-br from-emerald-500/[0.14] to-emerald-900/[0.10] shadow-lg shadow-emerald-900/25 ring-2 ring-emerald-500/50`
    : `${baseCardClass} border-slate-700/50 bg-slate-900/60 hover:bg-slate-800/60 ${
        manualSelected ? "ring-2 ring-emerald-500/40" : ""
      }`;

  const peptidepayCardClass = `${baseCardClass} border-slate-700/50 bg-slate-900/60 hover:bg-slate-800/60 ${
    value === "peptidepay" ? "ring-2 ring-emerald-500/40" : ""
  }`;

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white">
            Payment method
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {soleManual
              ? "Manual Bank Transfer — already selected for you"
              : `${methodCount} secure ways to pay — choose one below`}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 shrink-0 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10.5px] font-semibold text-emerald-300">
          <Lock className="w-3 h-3" aria-hidden="true" />
          Secure
        </span>
      </div>

      <div
        ref={rootRef}
        role="radiogroup"
        aria-label="Choose how you want to pay"
        className="space-y-3"
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

        {/* PRIMARY: Pay by Bank */}
        {showPrimary && (
          <div className="relative">
            <button
              type="button"
              data-testid={primaryTestId}
              onClick={(e) => handleSelect(primaryValue, e.currentTarget)}
              role="radio"
              aria-checked={primarySelected}
              aria-describedby={primarySelected ? primaryInstructionsId : undefined}
              className={primaryCardClass}
            >
              {/* Badge row in normal flow */}
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="inline-flex items-center rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-900 shadow-sm">
                  Recommended
                </span>
                <ChevronDown
                  className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${
                    primarySelected ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                />
              </div>

              <div className="flex items-start gap-3">
                <Radio checked={primarySelected} tone="emerald" />
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10"
                >
                  <Landmark className="h-5 w-5 text-emerald-300" />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block text-base font-semibold leading-snug text-white">
                    Pay by Bank{" "}
                    <span className="text-xs font-medium text-emerald-300/90">— Open Banking</span>
                  </span>
                  {primarySelected && (
                    <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      Selected
                    </span>
                  )}
                  <p className="mt-1 text-xs leading-relaxed text-slate-300">
                    Instant UK bank transfer — no card needed.
                  </p>
                </div>
              </div>

            </button>

            <Drawer open={primarySelected} id={primaryInstructionsId}>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4 sm:p-5 text-sm text-slate-200 space-y-4">
                <p className="text-slate-300 leading-relaxed">
                  Pay securely from any UK bank app — instant confirmation, no card needed.
                </p>

                {options?.primary && !wallidEnabled && (
                  <p data-testid="active-gateway-label" className="text-xs text-emerald-300/90">
                    via {options.primary.name}
                    {options.primary.sandbox && " (sandbox)"}
                    {options.backups.length > 0 && (
                      <span className="text-slate-400">
                        {" "}
                        · auto-failover to {options.backups.map((b) => b.name).join(", ")}
                      </span>
                    )}
                  </p>
                )}

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Supported banks
                  </p>
                  <UkBankBadges />
                </div>

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Why it is secure
                  </p>
                  <TrustBadgesGrid />
                </div>

                {wallidEnabled && (
                  <div
                    data-testid="wallid-trust-elements"
                    className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-center"
                  >
                    <p className="text-sm font-semibold text-emerald-200">Pay by Bank — Open Banking secure checkout</p>
                    <p className="mt-1 text-[11px] leading-snug text-slate-200">
                      Your payment is processed securely via FCA-regulated open banking. No card details stored.
                    </p>
                  </div>
                )}
              </div>
            </Drawer>
          </div>
        )}

        {/* SECONDARY: PeptidePay — card / Apple Pay / Google Pay / crypto */}
        {peptidepayEnabled && (
          <div className="relative">
            <button
              type="button"
              data-testid="peptidepay-button"
              onClick={(e) => handleSelect("peptidepay", e.currentTarget)}
              role="radio"
              aria-checked={value === "peptidepay"}
              aria-describedby={value === "peptidepay" ? "peptidepay-instructions" : undefined}
              className={peptidepayCardClass}
            >
              <div className="flex items-start gap-3">
                <Radio checked={value === "peptidepay"} tone="slate" />
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5"
                >
                  <CreditCard className="h-5 w-5 text-slate-300" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-semibold text-white leading-tight">
                      Card, Apple Pay, Google Pay or crypto
                    </span>
                    {value === "peptidepay" && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        Selected
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    Secure hosted checkout — we never see your card details.
                  </p>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 shrink-0 mt-2 transition-transform ${
                    value === "peptidepay" ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                />
              </div>
            </button>

            <Drawer open={value === "peptidepay"} id="peptidepay-instructions">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-slate-300">
                <p>
                  You will be redirected to a secure payment page to complete your order. Once the
                  payment is confirmed you will receive an email with your order details.
                </p>
                <p className="mt-2 flex items-center gap-2 text-slate-400">
                  <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                  Card details are handled entirely by the payment provider.
                </p>
              </div>
            </Drawer>
          </div>
        )}

        {/* SECONDARY: Manual Bank Transfer */}
        <div className="relative">
          <button
            type="button"
            data-testid="manual-bank-transfer-button"
            onClick={(e) => handleSelect("bank_transfer", e.currentTarget)}
            role="radio"
            aria-checked={manualSelected}
            aria-describedby={manualSelected ? "manual-bank-transfer-details" : undefined}
            className={manualCardClass}
          >
            {/* Badge row: in normal flow so it never squeezes the title column */}
            <div className="mb-3 flex items-center justify-between gap-2">
              <span
                className={
                  soleManual
                    ? "inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-900 shadow-sm"
                    : "inline-flex items-center gap-1 rounded-full border border-slate-600 bg-slate-800 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300"
                }
              >
                <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
                {soleManual ? "Only option · 48h hold" : "48h hold"}
              </span>
              <ChevronDown
                className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${
                  manualSelected ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              />
            </div>

            <div className="flex items-start gap-3">
              <Radio checked={manualSelected} tone={soleManual ? "emerald" : "slate"} />
              <span
                aria-hidden="true"
                className={
                  soleManual
                    ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10"
                    : "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5"
                }
              >
                <ArrowLeftRight
                  className={soleManual ? "h-5 w-5 text-emerald-300" : "h-5 w-5 text-slate-300"}
                />
              </span>
              <div className="min-w-0 flex-1">
                <span className="block text-base font-semibold leading-snug text-white">
                  Manual Bank Transfer
                </span>
                {manualSelected && (
                  <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    Selected
                  </span>
                )}
                <p className="mt-1 text-xs leading-relaxed text-slate-300">
                  Receive bank details by email and transfer manually within 48 hours.
                </p>
              </div>
            </div>

            {soleManual && (
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11.5px] font-medium leading-snug text-emerald-200">
                <CheckCircle2 className="mt-0.5 w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Nothing to choose — continue to “Place Order” below</span>
              </p>
            )}

          </button>

          <Drawer
            open={manualSelected}
            id="manual-bank-transfer-details"
            data-testid="manual-bank-transfer-details"
          >
            <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 p-4 sm:p-5 text-sm text-slate-200 space-y-3">
              <p className="font-semibold text-emerald-200">How Manual Bank Transfer works</p>
              <ol className="list-decimal list-inside space-y-2 text-slate-300 text-[13px] leading-relaxed">
                <li>Place your order — we reserve your items for 48 hours.</li>
                <li>
                  You will get an email with our UK bank details and a unique reference number.
                </li>
                <li>Transfer the total from your bank app using that reference.</li>
                <li>Once funds clear, we ship your order and email tracking.</li>
              </ol>
              <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-700/50 mt-3">
                No card details required. Reference expires after 48 hours if unpaid.
              </p>
            </div>
          </Drawer>
        </div>
      </div>
    </>
  );
}
