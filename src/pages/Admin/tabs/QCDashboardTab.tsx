import { useState, useEffect } from 'react';
import { subscribeToProducts } from '@/lib/firebase';
import type { Product } from '@/lib/firebase';
import {
  FlaskConical, AlertTriangle, CheckCircle2, RefreshCw,
  TrendingUp, Package, ShieldCheck, ChevronDown, ChevronUp
} from 'lucide-react';

const CATEGORY_COLORS: Record<string, string> = {
  'tissue-repair':       '#10b981',
  'metabolic-signaling': '#3b82f6',
  'cellular-aging':      '#f59e0b',
  'neurological':        '#a855f7',
  'melanin':             '#ec4899',
  'blends':              '#06b6d4',
  'accessories':         '#64748b',
};

function parsePurity(raw: string | undefined): number {
  if (!raw) return 0;
  const n = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
}

function getPurityStatus(purity: number): { label: string; color: string; bg: string } {
  if (purity === 0)    return { label: 'No data',   color: '#4a6e8a', bg: 'rgba(74,110,138,0.12)' };
  if (purity >= 99.5)  return { label: 'Excellent',  color: '#10b981', bg: 'rgba(16,185,129,0.12)' };
  if (purity >= 99.0)  return { label: 'Good',       color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' };
  if (purity >= 98.0)  return { label: 'Acceptable', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' };
  return               { label: 'Review needed', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
}

export default function QCDashboardTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'name' | 'purity' | 'category'>('purity');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterCat, setFilterCat] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    const unsub = subscribeToProducts(prods => {
      setProducts(prods);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Stats
  const active = products.filter(p => p.isActive !== false && p.stock > 0);
  const withPurity = active.filter(p => p.purity && parsePurity(p.purity) > 0);
  const avgPurity = withPurity.length
    ? withPurity.reduce((s, p) => s + parsePurity(p.purity), 0) / withPurity.length
    : 0;
  const excellent = withPurity.filter(p => parsePurity(p.purity) >= 99.5).length;
  const needsReview = active.filter(p => !p.purity || parsePurity(p.purity) < 98).length;

  // Unique categories
  const categories = ['all', ...Array.from(new Set(products.map(p => p.category).filter(Boolean) as string[]))];

  // Filtered + sorted
  const filtered = products
    .filter(p => filterCat === 'all' || p.category === filterCat)
    .filter(p => {
      if (filterStatus === 'all') return true;
      const pur = parsePurity(p.purity);
      if (filterStatus === 'excellent')    return pur >= 99.5;
      if (filterStatus === 'good')         return pur >= 99 && pur < 99.5;
      if (filterStatus === 'acceptable')   return pur >= 98 && pur < 99;
      if (filterStatus === 'review')       return pur < 98 || pur === 0;
      if (filterStatus === 'missing')      return !p.purity || pur === 0;
      return true;
    })
    .sort((a, b) => {
      let diff = 0;
      if (sortBy === 'purity') diff = parsePurity(a.purity) - parsePurity(b.purity);
      else if (sortBy === 'name') diff = a.name.localeCompare(b.name);
      else if (sortBy === 'category') diff = (a.category ?? '').localeCompare(b.category ?? '');
      return sortDir === 'asc' ? diff : -diff;
    });

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: typeof sortBy }) =>
    sortBy === col
      ? sortDir === 'desc' ? <ChevronDown className="w-3 h-3 inline ml-1" /> : <ChevronUp className="w-3 h-3 inline ml-1" />
      : null;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-blue-400" />
            QC Purity Dashboard
          </h2>
          <p className="text-sm text-slate-400 mt-1">Live HPLC purity data from product catalogue</p>
        </div>
        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading…
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Products',
            value: products.length,
            icon: Package,
            color: '#3b82f6',
            sub: `${active.length} in stock`,
          },
          {
            label: 'Avg Purity',
            value: avgPurity > 0 ? `${avgPurity.toFixed(2)}%` : '—',
            icon: TrendingUp,
            color: '#10b981',
            sub: `${withPurity.length} products with data`,
          },
          {
            label: 'Excellent ≥99.5%',
            value: excellent,
            icon: CheckCircle2,
            color: '#10b981',
            sub: withPurity.length ? `${Math.round(excellent / withPurity.length * 100)}% of catalogue` : '—',
          },
          {
            label: 'Needs Review',
            value: needsReview,
            icon: AlertTriangle,
            color: needsReview > 0 ? '#f59e0b' : '#10b981',
            sub: needsReview > 0 ? 'missing data or <98%' : 'All good!',
          },
        ].map(stat => (
          <div
            key={stat.label}
            className="rounded-xl p-4"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400">{stat.label}</span>
              <stat.icon className="w-4 h-4" style={{ color: stat.color }} />
            </div>
            <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
            <div className="text-xs text-slate-500">{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Horizontal purity bar chart — top 10 active */}
      <div
        className="rounded-xl p-5"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-400" />
          Purity by Product — Active Stock
        </h3>
        <div className="space-y-3">
          {active
            .filter(p => p.purity && parsePurity(p.purity) > 0)
            .sort((a, b) => parsePurity(b.purity) - parsePurity(a.purity))
            .slice(0, 12)
            .map(p => {
              const pur = parsePurity(p.purity);
              const color = CATEGORY_COLORS[p.category ?? ''] ?? '#3b82f6';
              const status = getPurityStatus(pur);
              return (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-32 shrink-0 truncate">{p.name}</span>
                  <div className="flex-1 h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(pur, 100)}%`, background: color }}
                    />
                  </div>
                  <span className="text-xs font-bold w-12 text-right" style={{ color }}>{pur > 0 ? `${pur}%` : '—'}</span>
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md w-24 text-center shrink-0"
                    style={{ color: status.color, background: status.bg }}
                  >
                    {status.label}
                  </span>
                </div>
              );
            })}
          {active.filter(p => p.purity && parsePurity(p.purity) > 0).length === 0 && (
            <p className="text-sm text-slate-500 py-4 text-center">
              No purity data yet — add purity values in the Inventory tab
            </p>
          )}
        </div>
      </div>

      {/* Full table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid rgba(255,255,255,0.07)' }}
      >
        {/* Filters */}
        <div
          className="flex flex-wrap items-center gap-3 p-4"
          style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <span className="text-xs text-slate-400 font-medium mr-1">Filter:</span>
          <select
            value={filterCat}
            onChange={e => setFilterCat(e.target.value)}
            className="text-xs rounded-lg px-2.5 py-1.5 outline-none"
            style={{ background: '#0b1a2e', border: '1px solid rgba(255,255,255,0.1)', color: '#c8dff5' }}
          >
            <option value="all">All Categories</option>
            {categories.filter(c => c !== 'all').map(c => (
              <option key={c} value={c}>{c.replace(/-/g, ' ').replace(/\b\w/g, x => x.toUpperCase())}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="text-xs rounded-lg px-2.5 py-1.5 outline-none"
            style={{ background: '#0b1a2e', border: '1px solid rgba(255,255,255,0.1)', color: '#c8dff5' }}
          >
            <option value="all">All Statuses</option>
            <option value="excellent">Excellent ≥99.5%</option>
            <option value="good">Good ≥99%</option>
            <option value="acceptable">Acceptable ≥98%</option>
            <option value="review">Needs Review</option>
            <option value="missing">Missing Data</option>
          </select>
          <span className="ml-auto text-xs text-slate-500">{filtered.length} products</span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.025)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {[
                  { col: 'name' as const, label: 'Product' },
                  { col: 'category' as const, label: 'Category' },
                  { col: 'purity' as const, label: 'Purity' },
                ].map(({ col, label }) => (
                  <th
                    key={col}
                    onClick={() => toggleSort(col)}
                    className="text-left px-4 py-3 text-xs font-semibold text-slate-400 cursor-pointer select-none hover:text-slate-200 transition-colors"
                  >
                    {label}<SortIcon col={col} />
                  </th>
                ))}
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400">Bar</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400">Stock</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400">Active</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const pur = parsePurity(p.purity);
                const color = CATEGORY_COLORS[p.category ?? ''] ?? '#3b82f6';
                const status = getPurityStatus(pur);
                const catLabel = p.category?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? '—';
                return (
                  <tr
                    key={p.id}
                    style={{
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}
                  >
                    <td className="px-4 py-3 font-medium text-white">{p.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs px-2 py-0.5 rounded-md font-medium"
                        style={{ background: `${color}15`, color }}
                      >
                        {catLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold" style={{ color: pur > 0 ? color : '#4a6e8a' }}>
                      {pur > 0 ? `${pur}%` : '—'}
                    </td>
                    <td className="px-4 py-3 w-32">
                      <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        {pur > 0 && (
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.min(pur, 100)}%`, background: color }}
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-[11px] font-semibold px-2 py-0.5 rounded-md"
                        style={{ color: status.color, background: status.bg }}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{p.stock ?? 0}</td>
                    <td className="px-4 py-3">
                      <span
                        className="text-[11px] font-semibold px-2 py-0.5 rounded-md"
                        style={p.isActive !== false
                          ? { color: '#10b981', background: 'rgba(16,185,129,0.12)' }
                          : { color: '#ef4444', background: 'rgba(239,68,68,0.1)' }
                        }
                      >
                        {p.isActive !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500 text-sm">
                    No products match the selected filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
