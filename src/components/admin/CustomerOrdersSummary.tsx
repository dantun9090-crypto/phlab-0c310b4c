import { useMemo } from 'react';
import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import type { Order } from '@/lib/firebase';

/**
 * CustomerOrdersSummary — one-click per-customer order stats for the admin
 * Orders tab.
 *
 * Pure in-memory computation over the already-loaded orders array — no
 * extra Firestore reads. Matches the customer by any known email field
 * (customer.email / userEmail / customerEmail / email), case-insensitive.
 */

const PAID_STATUSES = new Set(['paid', 'processing', 'shipped', 'delivered', 'completed']);
const FAILED_STATUSES = new Set(['failed', 'expired', 'cancelled', 'canceled', 'refunded']);

export function orderEmail(order: any): string {
  return String(
    order?.customer?.email
      || order?.userEmail
      || order?.customerEmail
      || order?.email
      || '',
  ).trim().toLowerCase();
}

export function orderTotal(order: any): number {
  const v = Number(order?.total ?? order?.totalAmount ?? order?.totalPrice ?? 0);
  return Number.isFinite(v) ? v : 0;
}

function orderMillis(order: any): number {
  const ts = order?.orderDate ?? order?.createdAt;
  if (ts?.toDate) return ts.toDate().getTime();
  if (typeof ts?.seconds === 'number') return ts.seconds * 1000;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export function orderRefLabel(order: any): string {
  return order?.orderId || order?.orderRef || `#${String(order?.id ?? '').slice(-8).toUpperCase()}`;
}

export interface CustomerStats {
  email: string;
  total: number;
  paidCount: number;
  paidValue: number;
  failedCount: number;
  pendingCount: number;
  recent: Order[];
}

export function computeCustomerStats(orders: Order[], email: string): CustomerStats {
  const needle = email.trim().toLowerCase();
  const mine = needle
    ? orders.filter((o) => orderEmail(o) === needle)
    : [];
  let paidCount = 0;
  let paidValue = 0;
  let failedCount = 0;
  let pendingCount = 0;
  for (const o of mine) {
    const s = String((o as any).status ?? '').toLowerCase();
    if (PAID_STATUSES.has(s)) {
      paidCount += 1;
      paidValue += orderTotal(o);
    } else if (FAILED_STATUSES.has(s)) {
      failedCount += 1;
    } else {
      pendingCount += 1;
    }
  }
  const recent = [...mine].sort((a, b) => orderMillis(b) - orderMillis(a)).slice(0, 10);
  return {
    email: needle,
    total: mine.length,
    paidCount,
    paidValue,
    failedCount,
    pendingCount,
    recent,
  };
}

interface Props {
  email: string;
  orders: Order[];
  /** Optional — clicking a recent-order row opens it in the detail panel. */
  onOpenOrder?: (order: Order) => void;
  /** Hide the recent-orders list (e.g. compact inline usage). */
  compact?: boolean;
}

export default function CustomerOrdersSummary({ email, orders, onOpenOrder, compact = false }: Props) {
  const stats = useMemo(() => computeCustomerStats(orders, email), [orders, email]);

  if (!stats.email) {
    return <p className="text-slate-500 text-xs">No email on this order — customer history unavailable.</p>;
  }

  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#0b1a30]/60 p-3">
      <p className="text-slate-300 text-xs font-semibold mb-2">
        Customer history — <span className="text-white">{stats.email}</span>
      </p>
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="px-2 py-1 rounded bg-slate-500/15 border border-slate-500/25 text-slate-300">
          Total: <span className="font-semibold text-white">{stats.total}</span>
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/15 border border-emerald-500/25 text-emerald-300">
          <CheckCircle2 className="w-3 h-3" />
          Paid: <span className="font-semibold">{stats.paidCount}</span>
          <span className="text-emerald-400/70">(£{stats.paidValue.toFixed(2)})</span>
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-500/15 border border-red-500/25 text-red-300">
          <XCircle className="w-3 h-3" />
          Failed: <span className="font-semibold">{stats.failedCount}</span>
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-500/15 border border-amber-500/25 text-amber-300">
          <Clock className="w-3 h-3" />
          Pending: <span className="font-semibold">{stats.pendingCount}</span>
        </span>
      </div>

      {!compact && stats.recent.length > 0 && (
        <div className="mt-3 space-y-1">
          {stats.recent.map((o) => {
            const s = String((o as any).status ?? '').toLowerCase();
            const tone = PAID_STATUSES.has(s)
              ? 'text-emerald-300'
              : FAILED_STATUSES.has(s)
                ? 'text-red-300'
                : 'text-amber-300';
            const date = orderMillis(o);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => onOpenOrder?.(o)}
                disabled={!onOpenOrder}
                className="w-full flex items-center justify-between gap-3 px-2 py-1.5 rounded hover:bg-white/[0.04] text-left transition-colors disabled:cursor-default"
              >
                <span className="font-mono text-xs text-white truncate">{orderRefLabel(o)}</span>
                <span className="text-[11px] text-[#9cb8d9] shrink-0">
                  {date ? new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                </span>
                <span className={`text-[11px] font-medium capitalize shrink-0 ${tone}`}>{s.replace(/_/g, ' ')}</span>
                <span className="text-xs text-green-400 font-semibold shrink-0">£{orderTotal(o).toFixed(2)}</span>
              </button>
            );
          })}
        </div>
      )}
      {!compact && stats.recent.length === 0 && (
        <p className="text-slate-500 text-[11px] mt-2 inline-flex items-center gap-1">
          <Loader2 className="w-3 h-3" /> No other orders found for this customer in the loaded list.
        </p>
      )}
    </div>
  );
}
