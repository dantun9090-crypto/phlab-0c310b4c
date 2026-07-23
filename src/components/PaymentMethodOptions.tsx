/**
 * Customer-facing payment method selector used on Checkout.
 *
 * Two selectable cards inside a single radiogroup:
 *  - Primary "Pay by Bank" (Open Banking) — recommended, richer trust signals
 *  - Secondary "Manual Bank Transfer" — reserved order for 48h
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

export interface PaymentMethodOptionsProps {
  options: CheckoutPaymentOptions | null;
  /** Wallid Pay-by-Bank kill switch from admin panel (default false). */
  wallidEnabled?: boolean;
  value: "pay_by_bank" | "bank_transfer" | "wallid";
  onChange: (next: "pay_by_bank" | "bank_transfer" | "wallid") => void;
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
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 pt-4 border-t border-emerald-500/20">
      {TRUST_ITEMS.map(({ icon: Icon, label }) => (
        <div
          key={label}
          className="flex items-center gap-2 text-[11px] sm:text-xs text-slate-200 whitespace-nowrap"
        >
          <Icon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>{label}</span>
        </div>
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
      <p className="mt-1 text-[11px] leading-snug text-slate-400">
        Your payment is processed securely via FCA-regulated open banking. No card details stored.
      </p>
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

  const showPrimary = hasOnline || wallidEnabled;
  const primaryValue: "pay_by_bank" | "wallid" = wallidEnabled ? "wallid" : "pay_by_bank";
  const primarySelected = value === primaryValue;
  const manualSelected = value === "bank_transfer";

  const primaryTestId = wallidEnabled ? "wallid-pay-by-bank-button" : "pay-by-bank-button";
  const primaryInstructionsId = wallidEnabled ? "wallid-instructions" : "pay-by-bank-instructions";

  const primaryCardClass = `relative rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 sm:p-5 cursor-pointer transition-all hover:bg-emerald-500/15 text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 ${
    primarySelected ? "ring-2 ring-emerald-500/50" : ""
  }`;

  const manualCardClass = `relative rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5 cursor-pointer transition-all hover:bg-white/10 text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 ${
    manualSelected ? "ring-2 ring-emerald-500/50" : ""
  }`;

  const rootRef = useRef<HTMLDivElement>(null);
  const manualDetailsRef = useRef<HTMLDivElement>(null);

  /**
   * Scroll-preserving selection change.
   *
   * When the primary card's expanded content (WhatHappensNext + trust inline)
   * mounts/unmounts, the manual card jumps up or down and it feels like the
   * whole page scrolled to the top. We capture the clicked button's viewport
   * position before the state change, then after paint re-anchor window
   * scroll so the button stays at the same y — no visible jump.
   *
   * For manual bank transfer we additionally scroll its details into view
   * (gentle, block: 'nearest') once it's expanded.
   */
  const handleSelect = (
    next: "pay_by_bank" | "bank_transfer" | "wallid",
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
          // Only re-anchor small layout shifts (< 400px). Larger deltas mean
          // a big section expanded/collapsed and re-anchoring compounds into
          // the "infinite scroll" feel users reported on Manual Bank Transfer.
          if (Math.abs(delta) > 1 && Math.abs(delta) < 400) {
            window.scrollBy({ top: delta, left: 0, behavior: "auto" });
          }
        }
        // Deliberately no scrollIntoView here — details render inline
        // directly below the selected option; forcing scroll caused the
        // page to keep chasing the expanding accordion.
      });
    });

  };

  return (
    <>
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

            <div className="flex items-start gap-3 pr-24">
              <Radio checked={primarySelected} tone="emerald" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-semibold text-white">Pay by Bank</span>
                  {primarySelected && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Selected
                    </span>
                  )}
                </div>
              </div>
            </div>

            <p className="text-sm text-slate-300 mt-1 ml-8">
              Pay securely from any UK bank app — instant confirmation, no card needed.
            </p>

            {options?.primary && !wallidEnabled && (
              <p
                data-testid="active-gateway-label"
                className="mt-1.5 ml-8 text-xs text-emerald-300/90"
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

            <div className="flex flex-wrap gap-2 mt-3 ml-8">
              <UkBankBadges />
            </div>

            <TrustBadgesRow />
          </button>

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
          <div className="flex items-start gap-3">
            <Radio checked={manualSelected} tone="slate" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-medium text-white">Manual Bank Transfer</span>
                {manualSelected && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Selected
                  </span>
                )}
              </div>
            </div>
          </div>
          <p className="text-sm text-slate-300 mt-1 ml-8">
            Receive bank details by email and transfer manually within 48 hours.
          </p>
          <p className="text-xs text-slate-400 mt-2 ml-8">
            Your order will be reserved for 48 hours. Confirmation email sent immediately.
          </p>
        </button>

        {/* Inline expanded details — accordion under the manual card so
            selecting it never scrolls the page to the top. */}
        <div
          ref={manualDetailsRef}
          data-testid="manual-bank-transfer-details"
          id="manual-bank-transfer-details"
          aria-hidden={!manualSelected}
          className={`grid transition-all duration-300 ease-out ${
            manualSelected
              ? "grid-rows-[1fr] opacity-100 mt-2"
              : "grid-rows-[0fr] opacity-0 mt-0"
          }`}
        >
          <div className="overflow-hidden">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-slate-200 space-y-2">
              <p className="font-semibold text-emerald-200">
                How Manual Bank Transfer works
              </p>
              <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[13px] leading-relaxed">
                <li>Place your order — we reserve your items for 48 hours.</li>
                <li>
                  You'll get an email with our UK bank details and a unique
                  reference number.
                </li>
                <li>
                  Transfer the total from your bank app using that reference.
                </li>
                <li>
                  Once funds clear, we ship your order and email tracking.
                </li>
              </ol>
              <p className="text-[11px] text-slate-400 pt-1">
                No card details required. Reference expires after 48 hours if
                unpaid.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Expanded instructions for the primary option. Rendered OUTSIDE the
        radiogroup so the accordion toggle is not part of the group's tab
        order (keyboard users must be able to Shift+Tab out of the group —
        radiogroup contains only the two role=radio cards). */}
    {primarySelected && (
      <>
        <div id={primaryInstructionsId}>
          <WhatHappensNext />
        </div>
        {wallidEnabled && <WallidCheckoutTrustInline />}
      </>
    )}
    </>
  );
}
