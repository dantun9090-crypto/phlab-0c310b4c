import { useEffect, useState } from 'react';
import {
  canRetryPayment,
  payAgainHref,
  getPayAgainCooldownRemainingMs,
  markPayAgainAttempted,
  formatCooldown,
  type OrderForRetry,
} from '@/lib/order-payment-retry';

type Props = {
  order: OrderForRetry & { id: string };
};

/**
 * Orange "Payment not completed — Pay Again" card shown in the expanded
 * order detail on the customer account page. Renders nothing when the
 * order is not retryable (paid, shipped, refunded, admin-cancelled,
 * provider-cancelled-then-paid, etc.).
 *
 * After click, the button is disabled for 30 min on this device to
 * prevent double-charges from frustrated re-clicks while the bank
 * confirmation is still propagating.
 */
export function PayAgainCTA({ order }: Props) {
  const [remainingMs, setRemainingMs] = useState<number>(() =>
    getPayAgainCooldownRemainingMs(order.id),
  );

  useEffect(() => {
    if (remainingMs <= 0) return;
    const t = setInterval(() => {
      setRemainingMs(getPayAgainCooldownRemainingMs(order.id));
    }, 1000);
    return () => clearInterval(t);
  }, [order.id, remainingMs]);

  if (!canRetryPayment(order)) return null;

  const disabled = remainingMs > 0;

  return (
    <div
      data-testid="pay-again-cta"
      className="rounded-xl bg-orange-500/[0.06] border border-orange-500/20 p-4 flex items-center justify-between gap-3"
    >
      <div className="text-sm">
        <p className="text-orange-200 font-semibold">Payment not completed</p>
        <p className="text-[#9cb8d9] text-xs mt-0.5">
          {disabled
            ? `Bank confirmation can take a few minutes — you can retry in ${formatCooldown(remainingMs)} to avoid a double charge.`
            : "Your bank payment was cancelled or didn't go through. You can try again."}
        </p>
      </div>
      {disabled ? (
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="shrink-0 px-4 py-2.5 rounded-lg bg-slate-700 text-slate-300 text-sm font-semibold whitespace-nowrap cursor-not-allowed"
          data-testid="pay-again-disabled"
        >
          Retry in {formatCooldown(remainingMs)}
        </button>
      ) : (
        <a
          href={payAgainHref(order.id)}
          onClick={() => {
            markPayAgainAttempted(order.id);
            setRemainingMs(getPayAgainCooldownRemainingMs(order.id));
          }}
          className="shrink-0 px-4 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold transition-colors whitespace-nowrap"
        >
          Pay Again
        </a>
      )}
    </div>
  );
}
