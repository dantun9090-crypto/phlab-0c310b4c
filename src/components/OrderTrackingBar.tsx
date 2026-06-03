import { Check, X, RotateCcw } from "lucide-react";
import {
  ORDER_TRACKING_STEPS,
  getOrderTrackingIndex,
} from "@/lib/order-tracking";

/**
 * Compact 4-step timeline rendered on the customer order history page:
 *   Placed → Processing → Shipped → Delivered
 *
 * Special states (no bar shown):
 *   - cancelled → red "Order Cancelled" message
 *   - refunded  → orange "Order Refunded" message
 *
 * Status mapping (see `lib/order-tracking.ts`):
 *   pending / pending_payment → step 0 (Placed)
 *   paid                      → step 1 (Processing, Placed checkmarked)
 *   processing                → step 1
 *   shipped                   → step 2
 *   delivered                 → step 3
 */
export function OrderTrackingBar({ status }: { status: string }) {
  if (status === "cancelled") {
    return (
      <div
        data-testid="order-tracking-cancelled"
        className="flex items-center gap-2 text-red-400 text-xs"
      >
        <X className="w-4 h-4" />
        <span>Order Cancelled</span>
      </div>
    );
  }
  if (status === "refunded") {
    return (
      <div
        data-testid="order-tracking-refunded"
        className="flex items-center gap-2 text-orange-400 text-xs"
      >
        <RotateCcw className="w-4 h-4" />
        <span>Order Refunded</span>
      </div>
    );
  }

  const steps = ORDER_TRACKING_STEPS;
  const currentIdx = getOrderTrackingIndex(status);

  return (
    <div
      data-testid="order-tracking-bar"
      data-current-index={currentIdx}
      className="flex items-center gap-1 mt-2"
    >
      {steps.map((step, i) => {
        const isComplete = i < currentIdx;
        const isActive = i === currentIdx;
        const state = isComplete ? "complete" : isActive ? "active" : "upcoming";
        return (
          <div
            key={step}
            data-testid={`tracking-step-${step}`}
            data-state={state}
            className="flex items-center gap-1 flex-1 last:flex-none"
          >
            <div
              className={`relative w-7 h-7 rounded-full flex items-center justify-center text-xs border-2 transition-all duration-300
                ${
                  i <= currentIdx
                    ? "bg-gradient-to-br from-blue-500 to-violet-600 border-blue-500/50 text-white shadow-[0_0_12px_rgba(99,102,241,0.4)]"
                    : "bg-[#060f1e] border-white/[0.08] text-[#3a5a82]"
                }`}
            >
              {isComplete ? (
                <Check data-testid={`step-check-${step}`} className="w-3 h-3" />
              ) : (
                <span className="text-[10px] font-bold">{i + 1}</span>
              )}
            </div>
            {i < steps.length - 1 && (
              <div
                className={`flex-1 h-px transition-all duration-500 ${
                  i < currentIdx
                    ? "bg-gradient-to-r from-blue-500/60 to-violet-500/40"
                    : "bg-white/[0.06]"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
