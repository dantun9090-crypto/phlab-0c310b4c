import { useState, useEffect } from 'react';
import {
  Shield, Search, Download, RefreshCw, CheckCircle2, XCircle,
  Calendar, Users, AlertTriangle, ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, getAllOrders, collection, getDocs } from '@/lib/firebase';

interface ComplianceRecord {
  uid: string;
  email: string;
  firstName?: string;
  lastName?: string;
  termsAccepted: boolean;
  termsAcceptedAt?: any;
  orderCount: number;
  totalSpend: number;
  registeredAt?: string | null;
}

const SortIcon = ({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) =>
  active ? (
    <ChevronDown className={`w-3 h-3 ml-0.5 inline transition-transform ${dir === 'asc' ? 'rotate-180' : ''}`} />
  ) : null;

export default function ComplianceTab() {
  const [records, setRecords] = useState<ComplianceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'accepted' | 'not_accepted'>('all');
  const [sortKey, setSortKey] = useState<'email' | 'date' | 'spend'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchData = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'customers'));
      const users = snap.docs.map(d => ({ uid: d.id, ...d.data() } as any));
      const orders = await getAllOrders();

      const enriched: ComplianceRecord[] = users.map((u: any) => {
        const userOrders = orders.filter((o: any) => o.userId === u.uid);
        const totalSpend = userOrders
          .filter((o: any) => o.status !== 'cancelled')
          .reduce((s: number, o: any) => s + (o.totalAmount || 0), 0);
        const termsOrder = userOrders.find((o: any) => o.termsAccepted === true || o.tcAccepted === true) as any;
        const termsAccepted = termsOrder ? true : (u.termsAccepted || u.tcAccepted || false);
        const termsAcceptedAt = termsOrder ? (termsOrder.termsAcceptedAt || termsOrder.tcAcceptedAt) : (u.termsAcceptedAt || u.tcAcceptedAt);
        return {
          uid: u.uid,
          email: u.email || '',
          firstName: u.firstName,
          lastName: u.lastName,
          termsAccepted,
          termsAcceptedAt,
          orderCount: userOrders.length,
          totalSpend,
          registeredAt: u.createdAt?.toDate?.()?.toLocaleDateString('en-GB') || null,
        };
      });

      setRecords(enriched);
    } catch (e) {
      console.error('ComplianceTab error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const accepted = records.filter(r => r.termsAccepted);
  const notAccepted = records.filter(r => !r.termsAccepted);
  const rate = records.length > 0 ? Math.round((accepted.length / records.length) * 100) : 0;
  const nonCompliantBuyers = notAccepted.filter(r => r.orderCount > 0).length;

  const filtered = records
    .filter(r => {
      if (filter === 'accepted') return r.termsAccepted;
      if (filter === 'not_accepted') return !r.termsAccepted;
      return true;
    })
    .filter(r => {
      const q = search.toLowerCase();
      return (r.email || '').toLowerCase().includes(q) ||
        (r.firstName || '').toLowerCase().includes(q) ||
        (r.lastName || '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'email') cmp = (a.email || '').localeCompare(b.email || '');
      else if (sortKey === 'date') {
        cmp = (a.termsAcceptedAt?.toDate?.()?.getTime?.() || 0) -
              (b.termsAcceptedAt?.toDate?.()?.getTime?.() || 0);
      } else if (sortKey === 'spend') {
        cmp = a.totalSpend - b.totalSpend;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const handleSort = (key: 'email' | 'date' | 'spend') => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const exportCSV = () => {
    const rows = [
      ['Email', 'First Name', 'Last Name', 'T&C Accepted', 'Date Accepted', 'Orders', 'Total Spend (GBP)', 'Registered'],
      ...filtered.map(r => [
        r.email,
        r.firstName || '',
        r.lastName || '',
        r.termsAccepted ? 'Yes' : 'No',
        r.termsAcceptedAt?.toDate?.()?.toLocaleDateString('en-GB') || '',
        String(r.orderCount),
        r.totalSpend.toFixed(2),
        r.registeredAt || '',
      ])
    ];
    const csv = rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.3)]" style={{ background: 'linear-gradient(135deg, #059669, #34d399)' }}>
              <Shield className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">Compliance</h1>
          </div>
          <p className="text-[#6b8fba] text-sm">Terms &amp; Conditions acceptance records</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            aria-label="Refresh compliance data"
            className="p-2 text-[#6b8fba] hover:text-white bg-[#0b1a30] hover:bg-[#1a3a5c] border border-white/[0.07] rounded-xl transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={exportCSV}
            disabled={loading || filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'Total Customers', value: records.length, icon: Users,
            color: 'text-blue-400', bg: 'from-blue-600/15 to-blue-600/5', border: 'border-blue-500/20',
          },
          {
            label: 'T&C Accepted', value: accepted.length, icon: CheckCircle2,
            color: 'text-emerald-400', bg: 'from-emerald-600/15 to-emerald-600/5', border: 'border-emerald-500/20',
          },
          {
            label: 'Not Accepted', value: notAccepted.length, icon: XCircle,
            color: 'text-red-400', bg: 'from-red-600/15 to-red-600/5', border: 'border-red-500/20',
          },
          {
            label: 'Acceptance Rate', value: `${rate}%`, icon: Shield,
            color: 'text-amber-400', bg: 'from-amber-600/15 to-amber-600/5', border: 'border-amber-500/20',
          },
        ].map((s) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className={`bg-gradient-to-b ${s.bg} border ${s.border} rounded-2xl p-4`}
          >
            <s.icon className={`w-5 h-5 ${s.color} mb-3`} />
            <p className="text-2xl font-bold text-white">{loading ? '—' : s.value}</p>
            <p className="text-[#6b8fba] text-xs mt-1">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Rate bar */}
      {!loading && records.length > 0 && (
        <div className="bg-[#0b1a30] border border-white/[0.07] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[#6b8fba] text-sm">Acceptance Rate</span>
            <span className="text-white font-bold text-sm">{rate}%</span>
          </div>
          <div className="h-2 bg-[#04101f] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${rate}%` }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full"
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-emerald-400 text-xs">{accepted.length} accepted</span>
            <span className="text-red-400 text-xs">{notAccepted.length} pending</span>
          </div>
        </div>
      )}

      {/* Compliance alert */}
      {!loading && nonCompliantBuyers > 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/25 rounded-2xl">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-300 font-semibold text-sm">Compliance Alert</p>
            <p className="text-amber-400/70 text-xs mt-0.5">
              {nonCompliantBuyers} customer(s) placed orders without a recorded T&amp;C acceptance.
              This may apply to orders made before compliance tracking was activated.
            </p>
          </div>
        </div>
      )}

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3a5a82]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by email or name..."
            className="w-full pl-10 pr-4 py-2.5 bg-[#0b1a30] border border-white/[0.07] text-white rounded-xl text-sm placeholder-[#3a5a82] focus:outline-none focus:border-blue-500/50 transition-colors"
          />
        </div>
        <div className="flex gap-1 p-1 bg-[#0b1a30] border border-white/[0.07] rounded-xl shrink-0">
          {(['all', 'accepted', 'not_accepted'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filter === f
                  ? f === 'accepted'
                    ? 'bg-emerald-600 text-white'
                    : f === 'not_accepted'
                    ? 'bg-red-600 text-white'
                    : 'bg-blue-600 text-white'
                  : 'text-[#6b8fba] hover:text-white'
              }`}
            >
              {f === 'all' ? 'All' : f === 'accepted' ? 'Accepted' : 'Not Accepted'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(180deg, #0d1f38, #091528)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Shield className="w-10 h-10 text-[#1a3a5c]" />
            <p className="text-[#3a5a82] text-sm">No records found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th
                    onClick={() => handleSort('email')}
                    className="text-left text-[#6b8fba] text-xs font-semibold px-4 py-3 uppercase tracking-wider cursor-pointer hover:text-white transition-colors select-none"
                  >
                    Customer <SortIcon active={sortKey === 'email'} dir={sortDir} />
                  </th>
                  <th className="text-center text-[#6b8fba] text-xs font-semibold px-4 py-3 uppercase tracking-wider">
                    T&amp;C Status
                  </th>
                  <th
                    onClick={() => handleSort('date')}
                    className="text-left text-[#6b8fba] text-xs font-semibold px-4 py-3 uppercase tracking-wider cursor-pointer hover:text-white transition-colors hidden md:table-cell select-none"
                  >
                    Date Accepted <SortIcon active={sortKey === 'date'} dir={sortDir} />
                  </th>
                  <th
                    onClick={() => handleSort('spend')}
                    className="text-right text-[#6b8fba] text-xs font-semibold px-4 py-3 uppercase tracking-wider cursor-pointer hover:text-white transition-colors hidden lg:table-cell select-none"
                  >
                    Total Spend <SortIcon active={sortKey === 'spend'} dir={sortDir} />
                  </th>
                  <th className="text-right text-[#6b8fba] text-xs font-semibold px-4 py-3 uppercase tracking-wider hidden lg:table-cell">
                    Orders
                  </th>
                  <th className="text-right text-[#6b8fba] text-xs font-semibold px-4 py-3 uppercase tracking-wider hidden xl:table-cell">
                    Registered
                  </th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {filtered.map((r, i) => (
                    <motion.tr
                      key={r.uid}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: i * 0.015 }}
                      className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-700 to-blue-900 flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {(r.firstName?.[0] || r.email?.[0] || '?').toUpperCase()}
                          </div>
                          <div>
                            {(r.firstName || r.lastName) && (
                              <p className="text-white text-sm font-medium leading-tight">
                                {r.firstName} {r.lastName}
                              </p>
                            )}
                            <p className="text-[#6b8fba] text-xs">{r.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.termsAccepted ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> Accepted
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-full">
                            <XCircle className="w-3 h-3" /> Not accepted
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {r.termsAccepted && r.termsAcceptedAt?.toDate ? (
                          <span className="flex items-center gap-1.5 text-[#8caad4] text-xs">
                            <Calendar className="w-3 h-3 text-[#3a5a82]" />
                            {r.termsAcceptedAt.toDate().toLocaleDateString('en-GB')}
                          </span>
                        ) : (
                          <span className="text-[#2a4a7a] text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell">
                        <span className="text-white text-sm font-semibold">£{r.totalSpend.toFixed(2)}</span>
                      </td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell">
                        <span className="text-[#8caad4] text-sm">{r.orderCount}</span>
                      </td>
                      <td className="px-4 py-3 text-right hidden xl:table-cell">
                        <span className="text-[#6b8fba] text-xs">{r.registeredAt || '—'}</span>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <p className="text-center text-[#3a5a82] text-xs">
          Showing {filtered.length} of {records.length} customers
          {filter !== 'all' && ` — filter: ${filter === 'accepted' ? 'accepted only' : 'not accepted only'}`}
        </p>
      )}
    </div>
  );
}
