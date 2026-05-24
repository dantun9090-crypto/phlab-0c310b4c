import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, PoundSterling, ShoppingCart, Users, Package,
  RefreshCw, Activity, Bell, ArrowUpRight, Zap, AlertTriangle,
  Clock, CheckCircle2, Truck, Shield, FileText, Megaphone,
  Settings, BarChart3, ArrowRight, FlaskConical, X
} from 'lucide-react';
import { motion } from 'framer-motion';
import { db, collection, query, orderBy, limit, onSnapshot } from '@/lib/firebase';

import { getAdminAnalytics } from '@/lib/firebase';

interface ActivityItem {
  id: string;
  type: 'order' | 'signup' | 'review' | 'lowstock';
  message: string;
  time: string;
  color: string;
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const card = 'bg-gradient-to-b from-[#0d1f38] to-[#091528] border border-white/[0.07] rounded-2xl';
const cardPad = 'p-5';

const StatCard = ({
  title, value, sub, icon: Icon, trend, accent, loading, glowColor
}: {
  title: string; value: string; sub: string; icon: any;
  trend?: number; accent: string; loading?: boolean; glowColor?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 18 }}
    animate={{ opacity: 1, y: 0 }}
    className="relative overflow-hidden bg-gradient-to-b from-[#0d1f38] to-[#091528] border border-white/[0.08] rounded-2xl p-5 flex flex-col gap-3 hover:border-white/[0.16] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.6)] group"
  >
    <div className={`absolute top-0 left-0 right-0 h-px ${accent} opacity-70`} />
    <div className={`absolute -top-8 -right-8 w-28 h-28 rounded-full opacity-0 group-hover:opacity-15 transition-opacity duration-500 ${glowColor || 'bg-blue-400'}`} />
    <div className="flex items-start justify-between relative z-10">
      <p className="text-[#4a6a8a] text-[11px] font-semibold uppercase tracking-widest">{title}</p>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${accent} shadow-[0_4px_16px_rgba(0,0,0,0.4)]`}>
        <Icon className="text-white" style={{ width: 17, height: 17 }} />
      </div>
    </div>
    {loading ? (
      <div className="h-8 bg-white/[0.05] rounded-lg animate-pulse w-28" />
    ) : (
      <p className="text-[30px] font-bold text-[#e8f0fe] leading-none tracking-tight relative z-10">{value}</p>
    )}
    <div className="flex items-center gap-1.5 text-xs relative z-10">
      {trend !== undefined ? (
        trend >= 0 ? (
          <span className="flex items-center gap-0.5 bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full font-semibold border border-emerald-500/20">
            <TrendingUp style={{ width: 10, height: 10 }} /> +{trend}%
          </span>
        ) : (
          <span className="flex items-center gap-0.5 bg-red-500/15 text-red-400 px-2 py-0.5 rounded-full font-semibold border border-red-500/20">
            <TrendingDown style={{ width: 10, height: 10 }} /> {trend}%
          </span>
        )
      ) : null}
      <span className="text-[#3a5a82]">{sub}</span>
    </div>
  </motion.div>
);

// ── Mini bar chart ─────────────────────────────────────────────────────────────
const MiniBar = ({ data }: { data: { label: string; revenue: number }[] }) => {
  const max = Math.max(...data.map(d => d.revenue), 1);
  return (
    <div className="flex items-end gap-1.5 h-20 mt-2">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group/bar">
          <div
            className="w-full bg-blue-500/30 group-hover/bar:bg-blue-500/60 rounded-md transition-all duration-200 relative"
            style={{ height: `${Math.max((d.revenue / max) * 64, d.revenue > 0 ? 4 : 0)}px` }}
          >
            {d.revenue > 0 && (
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-blue-400/40 rounded-b-md" />
            )}
          </div>
          <span className="text-[#2a4a7a] text-[9px] font-medium">{d.label}</span>
        </div>
      ))}
    </div>
  );
};

export default function DashboardTab() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recachePending, setRecachePending] = useState(() => !!localStorage.getItem('php_recache_pending'));

  const fetchAnalytics = useCallback(async () => {
    try {
      const data = await getAdminAnalytics();
      setAnalytics(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('orderDate', 'desc'), limit(20));
    const unsub = onSnapshot(q, (snap) => {
      const items: ActivityItem[] = snap.docs.slice(0, 8).map(d => {
        const data = d.data();
        return {
          id: d.id,
          type: 'order',
          message: `New order #${d.id.slice(-6).toUpperCase()} — £${(data.totalAmount || 0).toFixed(2)}`,
          time: data.orderDate?.toDate
            ? new Date(data.orderDate.toDate()).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
            : 'Just now',
          color: 'bg-blue-500',
        };
      });
      setActivity(items);
    });
    return () => unsub();
  }, []);

  const handleRefresh = () => { setRefreshing(true); fetchAnalytics(); };

  // Recache pending banner — show when a save has been made and pages need recaching
  useEffect(() => {
    const onSave = () => { localStorage.setItem('php_recache_pending', String(Date.now())); setRecachePending(true); };
    const onDone = () => { localStorage.removeItem('php_recache_pending'); setRecachePending(false); };
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'php_recache_pending') setRecachePending(!!e.newValue);
    };
    window.addEventListener('admin:save', onSave);
    window.addEventListener('admin:recache-done', onDone);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('admin:save', onSave);
      window.removeEventListener('admin:recache-done', onDone);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  const fmt = (n: number) => n >= 1000 ? `£${(n / 1000).toFixed(1)}k` : `£${n.toFixed(2)}`;

  // Order pipeline counts
  const pending = analytics?.pendingOrders ?? 0;
  const processing = analytics?.processingOrders ?? 0;
  const shipped = analytics?.shippedOrders ?? 0;
  const totalOrders = analytics?.totalOrders ?? 0;
  const completedOrders = Math.max(0, totalOrders - pending - processing - shipped);

  // Quick actions
  const quickActions = [
    { label: 'New Order', icon: ShoppingCart, tab: 'orders', color: 'text-blue-400', bg: 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20' },
    { label: 'Add Product', icon: FlaskConical, tab: 'inventory', color: 'text-cyan-400', bg: 'bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/20' },
    { label: 'Customers', icon: Users, tab: 'customers', color: 'text-purple-400', bg: 'bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/20' },
    { label: 'Marketing', icon: Megaphone, tab: 'marketing', color: 'text-amber-400', bg: 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20' },
    { label: 'Compliance', icon: Shield, tab: 'compliance', color: 'text-emerald-400', bg: 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20' },
    { label: 'Invoices', icon: FileText, tab: 'invoices', color: 'text-indigo-400', bg: 'bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/20' },
    { label: 'Analytics', icon: BarChart3, tab: 'database', color: 'text-rose-400', bg: 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/20' },
    { label: 'Settings', icon: Settings, tab: 'settings', color: 'text-gray-400', bg: 'bg-gray-500/10 hover:bg-gray-500/20 border-gray-500/20' },
  ];

  const stats = [
    {
      title: 'Total Revenue', icon: PoundSterling,
      value: analytics ? fmt(analytics.gmv ?? analytics.totalRevenue ?? 0) : '—',
      sub: 'all time',
      trend: analytics?.revenueGrowth,
      accent: 'bg-blue-600',
    },
    {
      title: 'Orders', icon: ShoppingCart,
      value: analytics ? String(analytics.totalOrders ?? 0) : '—',
      sub: 'total orders',
      trend: analytics?.ordersGrowth,
      accent: 'bg-blue-600',
    },
    {
      title: 'Customers', icon: Users,
      value: analytics ? String(analytics.totalUsers ?? analytics.totalCustomers ?? 0) : '—',
      sub: 'registered',
      trend: analytics?.customersGrowth,
      accent: 'bg-blue-700',
    },
    {
      title: 'Products', icon: Package,
      value: analytics ? String(analytics.allProducts?.length ?? analytics.totalProducts ?? 0) : '—',
      sub: `${analytics?.lowStockProducts?.length ?? analytics?.lowStockCount ?? 0} low stock`,
      accent: 'bg-cyan-600',
    },
  ];

  return (
    <div className="space-y-6 min-h-screen">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-[22px] font-bold text-[#e8f0fe] tracking-tight">Dashboard</h1>
          <p className="text-[#2a4a7a] text-xs sm:text-sm mt-0.5">Real-time business overview</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] rounded-xl text-xs sm:text-sm text-[#4a6a8a] transition-all hover:text-[#8caad4]"
        >
          <RefreshCw style={{ width: 14, height: 14 }} className={refreshing ? 'animate-spin text-blue-400' : ''} />
          Refresh
        </button>
      </div>

      {/* ── Recache Reminder Banner ── */}
      {recachePending && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl"
        >
          <Bell style={{ width: 16, height: 16 }} className="text-amber-400 shrink-0" />
          <p className="flex-1 text-amber-200/90 text-sm">
            You've saved changes — recache Prerender.io so Google sees the updated pages.
          </p>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('admin:navigate', { detail: 'seo' }))}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 text-xs font-semibold rounded-xl transition-colors"
          >
            Go to Prerender.io <ArrowRight style={{ width: 12, height: 12 }} />
          </button>
          <button
            onClick={() => { localStorage.removeItem('php_recache_pending'); setRecachePending(false); }}
            className="shrink-0 p-1 text-amber-500/60 hover:text-amber-400 transition-colors rounded-lg hover:bg-amber-500/10"
            aria-label="Dismiss reminder"
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        </motion.div>
      )}

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        {stats.map((s) => (
          <StatCard key={s.title} {...s} loading={loading} />
        ))}
      </div>

      {/* ── Revenue Chart + Quick Actions ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">

        {/* Revenue chart */}
        <div className={`lg:col-span-2 ${card} ${cardPad}`}>
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="text-[#c8daf0] font-semibold text-sm">Revenue — Last 7 Days</h3>
              <p className="text-[#2a4a7a] text-xs mt-0.5">Daily revenue from completed orders</p>
            </div>
            <Activity style={{ width: 16, height: 16 }} className="text-blue-500/50" />
          </div>
          {analytics?.revenueByDay ? (
            <MiniBar data={analytics.revenueByDay} />
          ) : (
            <div className="h-20 flex items-center justify-center">
              <p className="text-[#2a4a7a] text-xs">No revenue data yet</p>
            </div>
          )}
        </div>

        {/* Quick stats column */}
        <div className={`${card} ${cardPad} flex flex-col gap-3`}>
          <h3 className="text-[#c8daf0] font-semibold text-sm mb-1">Quick Stats</h3>
          {[
            { label: 'Avg. Order Value', value: analytics ? fmt((analytics.totalRevenue ?? 0) / Math.max(analytics.totalOrders ?? 1, 1)) : '—', icon: ArrowUpRight, color: 'text-emerald-400' },
            { label: 'Pending Orders', value: String(analytics?.pendingOrders ?? 0), icon: Zap, color: 'text-amber-400' },
            { label: 'Low Stock Items', value: String(analytics?.lowStockCount ?? 0), icon: AlertTriangle, color: 'text-red-400' },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between py-2 border-b border-white/[0.05] last:border-0">
              <span className="text-[#3a5a82] text-xs">{item.label}</span>
              <span className={`text-sm font-bold ${item.color}`}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className={`${card} ${cardPad}`}>
        <div className="flex items-center gap-2 mb-4">
          <Zap style={{ width: 14, height: 14 }} className="text-amber-400" />
          <h3 className="text-[#c8daf0] font-semibold text-sm">Quick Actions</h3>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {quickActions.map((a) => (
            <button
              key={a.tab}
              onClick={() => window.dispatchEvent(new CustomEvent('admin:navigate', { detail: a.tab }))}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all duration-200 ${a.bg} group`}
            >
              <a.icon className={`w-5 h-5 ${a.color} group-hover:scale-110 transition-transform`} />
              <span className="text-[#6b8fba] text-[10px] font-medium text-center leading-tight group-hover:text-white transition-colors">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Order Pipeline ── */}
      <div className={`${card} ${cardPad}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity style={{ width: 14, height: 14 }} className="text-blue-400" />
            <h3 className="text-[#c8daf0] font-semibold text-sm">Order Pipeline</h3>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('admin:navigate', { detail: 'orders' }))}
            className="flex items-center gap-1 text-[#3a5a82] hover:text-blue-400 text-xs transition-colors"
          >
            View all <ArrowRight style={{ width: 12, height: 12 }} />
          </button>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-white/[0.04] rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Pending', value: pending, icon: Clock, color: 'text-amber-400', bg: 'border-amber-500/20 bg-amber-500/5' },
              { label: 'Processing', value: processing, icon: Zap, color: 'text-blue-400', bg: 'border-blue-500/20 bg-blue-500/5' },
              { label: 'Shipped', value: shipped, icon: Truck, color: 'text-cyan-400', bg: 'border-cyan-500/20 bg-cyan-500/5' },
              { label: 'Completed', value: completedOrders, icon: CheckCircle2, color: 'text-emerald-400', bg: 'border-emerald-500/20 bg-emerald-500/5' },
            ].map((s) => (
              <div key={s.label} className={`flex items-center gap-3 p-3 rounded-xl border ${s.bg}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.bg} shrink-0`}>
                  <s.icon className={`w-4.5 h-4.5 ${s.color}`} style={{ width: 18, height: 18 }} />
                </div>
                <div>
                  <p className="text-white font-bold text-lg leading-none">{s.value}</p>
                  <p className="text-[#4a6a8a] text-[11px] mt-0.5">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Pipeline progress bar */}
        {!loading && totalOrders > 0 && (
          <div className="mt-4">
            <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
              {pending > 0 && <div className="bg-amber-400/60 transition-all" style={{ width: `${(pending / totalOrders) * 100}%` }} title={`Pending: ${pending}`} />}
              {processing > 0 && <div className="bg-blue-400/60 transition-all" style={{ width: `${(processing / totalOrders) * 100}%` }} title={`Processing: ${processing}`} />}
              {shipped > 0 && <div className="bg-cyan-400/60 transition-all" style={{ width: `${(shipped / totalOrders) * 100}%` }} title={`Shipped: ${shipped}`} />}
              {completedOrders > 0 && <div className="bg-emerald-400/60 transition-all" style={{ width: `${(completedOrders / totalOrders) * 100}%` }} title={`Completed: ${completedOrders}`} />}
            </div>
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              {[
                { label: 'Pending', color: 'bg-amber-400/60', v: pending },
                { label: 'Processing', color: 'bg-blue-400/60', v: processing },
                { label: 'Shipped', color: 'bg-cyan-400/60', v: shipped },
                { label: 'Completed', color: 'bg-emerald-400/60', v: completedOrders },
              ].map(l => l.v > 0 && (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${l.color}`} />
                  <span className="text-[#4a6a8a] text-[10px]">{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Low Stock + Activity Feed ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">

        {/* Low Stock Alerts */}
        <div className={`${card} ${cardPad}`}>
          <div className="flex items-center gap-2 mb-4">
            <Bell style={{ width: 14, height: 14 }} className="text-red-400" />
            <h3 className="text-[#c8daf0] font-semibold text-sm">Low Stock</h3>
            {(analytics?.lowStockProducts?.length ?? 0) > 0 && (
              <span className="ml-auto bg-red-500/15 text-red-400 text-[10px] px-2 py-0.5 rounded-full border border-red-500/25 font-semibold">
                {analytics.lowStockProducts.length}
              </span>
            )}
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-10 bg-white/[0.04] rounded-xl animate-pulse" />)}
            </div>
          ) : (analytics?.lowStockProducts?.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 gap-2">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Package style={{ width: 16, height: 16 }} className="text-emerald-400" />
              </div>
              <p className="text-[#2a4a7a] text-xs text-center">All products well-stocked</p>
            </div>
          ) : (
            <div className="space-y-2">
              {analytics.lowStockProducts.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between px-3 py-2 bg-red-500/[0.06] border border-red-500/[0.12] rounded-xl">
                  <span className="text-[#c8daf0] text-xs font-medium truncate mr-2">{p.name}</span>
                  <span className="shrink-0 text-red-400 text-xs font-bold">{p.stock} left</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activity Feed */}
        <div className={`lg:col-span-2 ${card} ${cardPad}`}>
          <div className="flex items-center gap-2 mb-4">
            <Activity style={{ width: 14, height: 14 }} className="text-blue-400" />
            <h3 className="text-[#c8daf0] font-semibold text-sm">Recent Activity</h3>
          </div>
          {activity.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Activity style={{ width: 24, height: 24 }} className="text-[#1a3a5a]" />
              <p className="text-[#2a4a7a] text-xs">No activity yet — orders will appear here</p>
            </div>
          ) : (
            <div className="space-y-1">
              {activity.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.03] transition-colors"
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.color}`} />
                  <span className="text-[#6b8fba] text-xs flex-1">{item.message}</span>
                  <span className="text-[#2a4a7a] text-[10px] shrink-0 font-mono">{item.time}</span>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
