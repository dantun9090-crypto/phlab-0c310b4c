/**
 * Customer-facing payment method selector used on Checkout.
 *
 * Drawer-style accordion: each method shows a compact selectable row;
 * clicking it selects the method and expands a drawer with full details.
 *
 * Pure UI: all payment logic (API calls, webhooks, cart state, gateway
 * routing) is owned by the parent Checkout page. No external logo images —
 * text + Tailwind + Lucide icons only, safe on the pre-rendered dark theme.
 */
import { useRef, useState } from "react";
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
  value: PaymentMethodValue;
  onChange: (next: PaymentMethodValue) => void;
}

const WHAT_HAPPENS_NEXT = [
  "You will be redirected to your bank app to authorise the payment.",
  "Once confirmed, your order is instantly verified.",
  "You will receive an email confirmation with your order details.",
];

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
      className={`w-5 h-5 rounded-full border-2 ${borderClass} flex items-center justify-center shrink-0 mt-0.5`}
    >
      {checked && <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />}
    </span>
  );
}

function TrustBadgesRow() {
  return (
    <div className="mt-4 pt-3 border-t border-emerald-500/20 flex flex-wrap gap-1.5">
      {TRUST_ITEMS.map(({ icon: Icon, label }) => (
        <span
          key={label}
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.07] px-2.5 py-1 text-[10.5px] font-medium text-slate-200 whitespace-nowrap"
        >
          <Icon className="w-3 h-3 text-emerald-400 shrink-0" />
          {label}
        </span>
      ))}
    </div>
  );
}

function WhatHappensNext() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-sm font-medium text-white cursor-pointer py-2"
      >
        <span>What happens next?</span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <ol className="text-sm text-slate-300 space-y-2 pt-2 pb-4 list-none">
          {WHAT_HAPPENS_NEXT.map((step, i) => (
            <li key={i} className="flex gap-2">
              <span
                aria-hidden="true"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-semibold text-emerald-300"
              >
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function WallidCheckoutTrustInline({ className = "" }: { className?: string }) {
  return (
    <div
      data-testid="wallid-trust-elements"
      className={`mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-center ${className}`}
    >
      <p className="text-sm font-semibold text-emerald-200">Pay by Bank — Open Banking secure checkout</p>
      <p className="mt-1 text-[11px] leading-snug text-slate-200">
        Your payment is processed securely via FCA-regulated open banking. No card details stored.
      </p>
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
        open ? "grid-rows-[1fr] opacity-100 mt-2" : "grid-rows-[0fr] opacity-0 mt-0"
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
    if (next === value) return;
    console.log(`[PAYMENT] select method=${next}`);
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

  const baseCardClass =
    "relative rounded-2xl border p-4 sm:p-5 cursor-pointer transition-all text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70";

  const primaryCardClass = `${baseCardClass} border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15 ${
    primarySelected ? "ring-2 ring-emerald-500/50" : ""
  }`;

  const manualCardClass = `${baseCardClass} border-white/10 bg-white/5 hover:bg-white/10 ${
    manualSelected ? "ring-2 ring-emerald-500/50" : ""
  }`;

  const peptidepayCardClass = `${baseCardClass} border-white/10 bg-white/5 hover:bg-white/10 ${
    value === "peptidepay" ? "ring-2 ring-emerald-500/50" : ""
  }`;

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white">
            Payment method
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {methodCount} secure ways to pay — choose one below
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
          <div>
            <button
              type="button"
              data-testid={primaryTestId}
              onClick={(e) => handleSelect(primaryValue, e.currentTarget)}
              role="radio"
              aria-checked={primarySelected}
              aria-describedby={primarySelected ? primaryInstructionsId : undefined}
              className={primaryCardClass}
            >
              <span className="absolute top-3 right-3 bg-emerald-500 text-slate-900 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                Recommended
              </span>

              <div className="flex items-center gap-3 pr-20">
                <Radio checked={primarySelected} tone="emerald" />
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10"
                >
                  <Landmark className="h-4 w-4 text-emerald-300" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-semibold text-white leading-tight">
                      Pay by Bank
                    </span>
                    {primarySelected && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        Selected
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Instant UK bank transfer — no card needed.
                  </p>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                    primarySelected ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                />
              </div>
            </button>

            <Drawer open={primarySelected} id={primaryInstructionsId}>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-slate-200 space-y-3">
                <p className="text-slate-300">
                  Pay securely from any UK bank app — instant confirmation, no card needed.
                </p>

                <p
                  data-testid="international-payment-note"
                  className="text-xs text-slate-300"
                >
                  International customers: pay with{" "}
                  <span className="text-emerald-300 font-medium">Revolut</span> or{" "}
                  <span className="text-emerald-300 font-medium">Wise</span> through the same Open
                  Banking checkout — select your Revolut or Wise account when choosing your bank.
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

                <div className="flex flex-wrap gap-2 pt-1">
                  <UkBankBadges />
                </div>

                <TrustBadgesRow />

                {wallidEnabled && <WallidCheckoutTrustInline />}

                <WhatHappensNext />
              </div>
            </Drawer>
          </div>
        )}

        {/* SECONDARY: PeptidePay — card / Apple Pay / Google Pay / crypto */}
        {peptidepayEnabled && (
          <div>
            <button
              type="button"
              data-testid="peptidepay-button"
              onClick={(e) => handleSelect("peptidepay", e.currentTarget)}
              role="radio"
              aria-checked={value === "peptidepay"}
              aria-describedby={value === "peptidepay" ? "peptidepay-instructions" : undefined}
              className={peptidepayCardClass}
            >
              <div className="flex items-center gap-3">
                <Radio checked={value === "peptidepay"} tone="slate" />
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5"
                >
                  <CreditCard className="h-4 w-4 text-slate-300" />
                </span>
                <div className="min-w-0 flex-1">
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
                  <p className="text-xs text-slate-300 mt-0.5">
                    Secure hosted checkout — we never see your card details.
                  </p>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                    value === "peptidepay" ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                />
              </div>
            </button>

            <Drawer open={value === "peptidepay"} id="peptidepay-instructions">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-slate-300">
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
        <div>
          <button
            type="button"
            data-testid="manual-bank-transfer-button"
            onClick={(e) => handleSelect("bank_transfer", e.currentTarget)}
            role="radio"
            aria-checked={manualSelected}
            aria-describedby={manualSelected ? "manual-bank-transfer-details" : undefined}
            className={manualCardClass}
          >
            <div className="flex items-center gap-3">
              <Radio checked={manualSelected} tone="slate" />
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5"
              >
                <ArrowLeftRight className="h-4 w-4 text-slate-300" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-semibold text-white leading-tight">
                    Manual Bank Transfer
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                    48h hold
                  </span>
                  {manualSelected && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Selected
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Receive bank details by email and transfer manually within 48 hours.
                </p>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                  manualSelected ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              />
            </div>
          </button>

          <Drawer
            open={manualSelected}
            id="manual-bank-transfer-details"
            data-testid="manual-bank-transfer-details"
          >
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-slate-200 space-y-2">
              <p className="font-semibold text-emerald-200">How Manual Bank Transfer works</p>
              <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[13px] leading-relaxed">
                <li>Place your order — we reserve your items for 48 hours.</li>
                <li>
                  You'll get an email with our UK bank details and a unique reference number.
                </li>
                <li>Transfer the total from your bank app using that reference.</li>
                <li>Once funds clear, we ship your order and email tracking.</li>
              </ol>
              <p className="text-[11px] text-slate-300 pt-1">
                No card details required. Reference expires after 48 hours if unpaid.
              </p>
            </div>
          </Drawer>
        </div>
      </div>
    </>
  );
}
