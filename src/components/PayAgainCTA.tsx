import { canRetryPayment, payAgainHref, type OrderForRetry } from '@/lib/order-payment-retry';

type Props = {
  order: OrderForRetry & { id: string };
};

/**
 * Orange "Payment not completed — Pay Again" card shown in the expanded
 * order detail on the customer account page. Renders nothing when the
 * order is not retryable (paid, shipped, refunded, admin-cancelled,
 * provider-cancelled, etc.).
 */
export function PayAgainCTA({ order }: Props) {
  if (!canRetryPayment(order)) return null;

  return (
    <div
      data-testid="pay-again-cta"
      className="rounded-xl bg-orange-500/[0.06] border border-orange-500/20 p-4 flex items-center justify-between gap-3"
    >
      <div className="text-sm">
        <p className="text-orange-200 font-semibold">Payment not completed</p>
        <p className="text-[#9cb8d9] text-xs mt-0.5">
          Your bank payment was cancelled or didn't go through. You can try again.
        </p>
      </div>
      <a
        href={payAgainHref(order.id)}
        className="shrink-0 px-4 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold transition-colors whitespace-nowrap"
      >
        Pay Again
      </a>
    </div>
  );
}
