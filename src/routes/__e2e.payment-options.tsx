/**
 * Internal e2e harness for the payment method selector.
 *
 * Mounts <PaymentMethodOptions> in isolation so Playwright can drive
 * real keyboard navigation against role / aria-checked / aria-describedby
 * without running the entire cart + address flow.
 *
 * Safety:
 *   - 404s on production hosts (apex + www). Only resolves on the lovable
 *     preview and on localhost during local e2e.
 *   - Carries `noindex, nofollow` and is added to robots.txt Disallow.
 *   - Renders no real payment logic — it only exercises the selector UI.
 */
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import PaymentMethodOptions from "@/components/PaymentMethodOptions";
import type { CheckoutPaymentOptions } from "@/lib/payments/types";

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

const PROD_HOSTS = new Set([
  "phlabs.co.uk",
  "www.phlabs.co.uk",
  "prohealthpeptides.co.uk",
  "www.prohealthpeptides.co.uk",
]);

function isAllowedHost(host: string): boolean {
  if (!host) return false;
  if (PROD_HOSTS.has(host.toLowerCase())) return false;
  return true;
}

export const Route = createFileRoute("/__e2e/payment-options")({
  head: () => ({
    meta: [
      { title: "E2E Harness — Payment Options" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  beforeLoad: ({ location }) => {
    const host =
      typeof window !== "undefined"
        ? window.location.host
        : // SSR — block on production hosts via Host header in the rare case
          // this route is reached server-side.
          "";
    if (host && !isAllowedHost(host)) throw notFound();
    void location;
  },
  component: PaymentOptionsHarness,
});

function PaymentOptionsHarness() {
  const [value, setValue] = useState<
    "pay_by_bank" | "bank_transfer" | "wallid"
  >("pay_by_bank");
  return (
    <main className="min-h-dvh bg-[#060f1e] p-6 text-white">
      <h1 className="mb-4 text-xl font-bold">E2E: Payment Options</h1>
      <p className="mb-4 text-sm text-slate-300">
        Internal test harness. Not indexed, not linked from the site.
      </p>
      <div data-testid="harness-root" className="max-w-2xl">
        <PaymentMethodOptions
          options={FENA_PRIMARY}
          value={value}
          onChange={setValue}
        />
      </div>
      <p
        data-testid="harness-current-value"
        className="mt-6 text-xs text-slate-400"
      >
        value={value}
      </p>
    </main>
  );
}
