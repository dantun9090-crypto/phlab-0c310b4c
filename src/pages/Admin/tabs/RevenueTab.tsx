/**
 * RevenueTab — paid revenue per week and per month, plus payment and
 * delivery status breakdown.
 *
 * Pure in-memory computation over the orders collection (single read via
 * getAllOrders) — no extra Firestore queries, no writes.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PoundSterling, RefreshCw, CalendarDays, CalendarRange, CheckCircle2,
  Truck, Clock, XCircle, TrendingUp, TrendingDown, Package,
} from 'lucide-react';
import { getAllOrders, type Order } from '@/lib/firebase';
import { toMillisSafe } from '@/lib/to-date';

const PAID_STATUSES = new Set(['paid', 'processing', 'shipped', 'delivered', 'completed']);
const FAILED_STATUSES = new Set(['failed', 'expired', 'cancelled', 'canceled', 'refunded']);

const card = 'bg-gradient-to-b from-[#0d1f38] to-[#091528] border border-white/[0.07] rounded-2xl';

function gbp(n: number): string {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function orderTotal(o: any): number {
  const v = Number(o?.total ?? o?.totalAmount ?? o?.totalPrice ?? 0);
  return Number.isFinite(v) ? v : 0;
}

function orderMillis(o: any): number {
  return toMillisSafe(o?.orderDate) || toMillisSafe(o?.createdAt) || 0;
}

function isPaid(o: any): boolean {
  const status = String(o?.status ?? '').toLowerCase();
  const payment = String(o?.paymentStatus ?? '').toLowerCase();
  if (payment === 'paid') return true;
  if (FAILED_STATUSES.has(status)) return false;
  return PAID_STATUSES.has(status);
}

/** Monday 00:00 of the week containing `d` (London-local calendar week). */
function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Mon = 0
  x.setDate(x.getDate() - dow);
  return x;
}

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

interface Bucket {
  key: string;
  label: string;
  start: number;
  end: number;
  revenue: number;
  orders: number;
}

function buildBuckets(paid: Order[], kind: 'week' | 'month', count: number): Bucket[] {
  const now = new Date();
  const buckets: Bucket[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    let start: Date;
    let end: Date;
    let label: string;
    if (kind === 'week') {
      const s = weekStart(now);
      s.setDate(s.getDate() - i * 7);
      start = s;
      end = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7);
      label = s.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    } else {
      const s = monthStart(now);
      s.setMonth(s.getMonth() - i);
      start = s;
      end = new Date(s.getFullYear(), s.getMonth() + 1, 1);
      label = s.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    }
    buckets.push({
      key: `${kind}-${start.getTime()}`,
      label,
      start: start.getTime(),
      end: end.getTime(),
      revenue: 0,
      orders: 0,
    });
  }
  for (const o of paid) {
    const t = orderMillis(o);
    if (!t) continue;
    const b = buckets.find((x) => t >= x.start && t < x.end);
    if (!b) continue;
    b.revenue += orderTotal(o);
    b.orders += 1;
  }
  return buckets;
}

const StatCard = ({
  title, value, sub, icon: Icon, accent, trend,
}: {
  title: string; value: string; sub?: string; icon: any; accent: string; trend?: number | null;
}) => (
  <div className={`${card} p-5 flex flex-col gap-3 relative overflow-hidden`}>
    <div className={`absolute top-0 left-0 right-0 h-px ${accent} opacity-70`} />
    <div className="flex items-start justify-between">
      <p className="text-[#4a6a8a] text-[11px] font-semibold uppercase tracking-widest">{title}</p>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${accent}`}>
        <Icon className="text-white" style={{ width: 17, height: 17 }} />
      </div>
    </div>
    <p className="text-[28px] font-bold text-[#e8f0fe] leading-none tracking-tight">{value}</p>
    <div className="flex items-center gap-1.5 text-xs">
      {typeof trend === 'number' && Number.isFinite(trend) && (
        trend >= 0 ? (
          <span className="flex items-center gap-0.5 bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full font-semibold border border-emerald-500/20">
            <TrendingUp style={{ width: 10, height: 10 }} /> +{trend.toFixed(0)}%
          </span>
        ) : (
          <span className="flex items-center gap-0.5 bg-red-500/15 text-red-400 px-2 py-0.5 rounded-full font-semibold border border-red-500/20">
            <TrendingDown style={{ width: 10, height: 10 }} /> {trend.toFixed(0)}%
          </span>
        )
      )}
      {sub && <span className="text-[#3a5a82]">{sub}</span>}
    </div>
  </div>
);

const BucketTable = ({ title, icon: Icon, buckets }: { title: string; icon: any; buckets: Bucket[] }) => {
  const max = Math.max(...buckets.map((b) => b.revenue), 1);
  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-emerald-400" />
        <h3 className="text-white font-semibold text-sm">{title}</h3>
      </div>
      <div className="space-y-1.5">
        {buckets.map((b) => (
          <div key={b.key} className="flex items-center gap-3">
            <span className="text-[#9cb8d9] text-xs w-16 shrink-0 font-mono">{b.label}</span>
            <div className="flex-1 h-6 bg-white/[0.04] rounded-md overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500/70 to-emerald-400/50 rounded-md"
                style={{ width: `${Math.max((b.revenue / max) * 100, b.revenue > 0 ? 3 : 0)}%` }}
              />
            </div>
            <span className="text-xs text-[#4a6a8a] w-14 text-right shrink-0">{b.orders} ord</span>
            <span className="text-sm text-white font-semibold w-24 text-right shrink-0">{gbp(b.revenue)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function RevenueTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await getAllOrders();
      setOrders(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const paid = orders.filter(isPaid);
    const weeks = buildBuckets(paid, 'week', 12);
    const months = buildBuckets(paid, 'month', 12);
    const thisWeek = weeks[weeks.length - 1];
    const prevWeek = weeks[weeks.length - 2];
    const thisMonth = months[months.length - 1];
    const prevMonth = months[months.length - 2];

    const pct = (a?: Bucket, b?: Bucket) => {
      if (!a || !b || b.revenue <= 0) return null;
      return ((a.revenue - b.revenue) / b.revenue) * 100;
    };

    const paidRevenue = paid.reduce((sum, o) => sum + orderTotal(o), 0);
    const statusCount = (s: string) =>
      orders.filter((o) => String((o as any).status ?? '').toLowerCase() === s).length;
    const delivered = orders.filter((o) => String((o as any).status ?? '').toLowerCase() === 'delivered');
    const deliveredRevenue = delivered.reduce((sum, o) => sum + orderTotal(o), 0);
    const unpaid = orders.filter((o) => {
      const s = String((o as any).status ?? '').toLowerCase();
      return !isPaid(o) && !FAILED_STATUSES.has(s);
    });

    return {
      paidCount: paid.count ?? paid.length,
      paidRevenue,
      avgOrder: paid.length ? paidRevenue / paid.length : 0,
      weeks,
      months,
      thisWeek,
      thisMonth,
      weekTrend: pct(thisWeek, prevWeek),
      monthTrend: pct(thisMonth, prevMonth),
      delivered: delivered.length,
      deliveredRevenue,
      shipped: statusCount('shipped'),
      processing: statusCount('processing'),
      unpaid: unpaid.length,
      unpaidValue: unpaid.reduce((sum, o) => sum + orderTotal(o), 0),
      failed: orders.filter((o) => FAILED_STATUSES.has(String((o as any).status ?? '').toLowerCase())).length,
      total: orders.length,
    };
  }, [orders]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <PoundSterling className="w-5 h-5 text-emerald-400" /> Revenue
          </h2>
          <p className="text-[#7d9bbd] text-sm mt-0.5">
            Paid orders only — weekly and monthly earnings, payment and delivery status.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-lg bg-slate-800 border-2 border-slate-600 text-white text-sm font-semibold hover:bg-slate-700 transition-colors disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-300 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="This week (paid)"
          value={gbp(stats.thisWeek?.revenue ?? 0)}
          sub={`${stats.thisWeek?.orders ?? 0} orders`}
          trend={stats.weekTrend}
          icon={CalendarDays}
          accent="bg-gradient-to-br from-emerald-500 to-emerald-600"
        />
        <StatCard
          title="This month (paid)"
          value={gbp(stats.thisMonth?.revenue ?? 0)}
          sub={`${stats.thisMonth?.orders ?? 0} orders`}
          trend={stats.monthTrend}
          icon={CalendarRange}
          accent="bg-gradient-to-br from-blue-500 to-blue-600"
        />
        <StatCard
          title="All-time paid"
          value={gbp(stats.paidRevenue)}
          sub={`${stats.paidCount} of ${stats.total} orders`}
          icon={CheckCircle2}
          accent="bg-gradient-to-br from-violet-500 to-violet-600"
        />
        <StatCard
          title="Average order"
          value={gbp(stats.avgOrder)}
          sub="paid orders"
          icon={Package}
          accent="bg-gradient-to-br from-cyan-500 to-cyan-600"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <BucketTable title="Last 12 weeks" icon={CalendarDays} buckets={stats.weeks} />
        <BucketTable title="Last 12 months" icon={CalendarRange} buckets={stats.months} />
      </div>

      <div className={`${card} p-5`}>
        <h3 className="text-white font-semibold text-sm mb-4">Payment & delivery status</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-green-500/25 bg-green-500/10 p-4">
            <p className="text-green-300 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Delivered
            </p>
            <p className="text-2xl font-bold text-white mt-1">{stats.delivered}</p>
            <p className="text-green-400/80 text-xs mt-0.5">{gbp(stats.deliveredRevenue)}</p>
          </div>
          <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-4">
            <p className="text-cyan-300 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5" /> In transit
            </p>
            <p className="text-2xl font-bold text-white mt-1">{stats.shipped}</p>
            <p className="text-cyan-400/80 text-xs mt-0.5">{stats.processing} processing</p>
          </div>
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
            <p className="text-amber-300 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Awaiting payment
            </p>
            <p className="text-2xl font-bold text-white mt-1">{stats.unpaid}</p>
            <p className="text-amber-400/80 text-xs mt-0.5">{gbp(stats.unpaidValue)} outstanding</p>
          </div>
          <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4">
            <p className="text-red-300 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5" /> Cancelled / failed
            </p>
            <p className="text-2xl font-bold text-white mt-1">{stats.failed}</p>
            <p className="text-red-400/80 text-xs mt-0.5">excluded from revenue</p>
          </div>
        </div>
      </div>
    </div>
  );
}
