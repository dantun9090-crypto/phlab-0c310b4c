import { useState, useEffect } from 'react';
import {
  Users, Search, DollarSign, ShoppingBag, UserX, RefreshCw, Shield, ChevronDown, Crown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, collection, getDocs, updateDoc, doc } from '@/lib/firebase';
import { getAllOrders } from '@/lib/firebase';

interface CustomerProfile {
  uid: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  isAdmin?: boolean;
  isActive?: boolean;
  isVip?: boolean;
  stripeId?: string;
  stripeLink?: string;
  createdAt?: any;
  totalSpend: number;
  orderCount: number;
  avgOrderValue: number;
  lastPurchase?: string | null;
  termsAccepted?: boolean;
  termsAcceptedAt?: any;
}

const ROLES = ['customer', 'staff', 'warehouse', 'marketer', 'admin'];

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-500/20 text-red-400 border-red-500/30',
  staff: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  warehouse: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  marketer: 'bg-blue-500/20 text-blue-400 border-purple-500/30',
  customer: 'bg-gray-500/20 text-[#9cb8d9] border-gray-500/30',
};

export default function CustomersTab() {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [saving, setSaving] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      // Fetch without orderBy to avoid index requirement
      const usersSnap = await getDocs(collection(db, 'customers'));
      const usersData = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as any));

      // Sort client-side by email
      usersData.sort((a: any, b: any) => (a.email || '').localeCompare(b.email || ''));

      const orders = await getAllOrders();

      const enriched: CustomerProfile[] = usersData.map((u: any) => {
        const userOrders = orders.filter(o => o.userId === u.uid && o.status !== 'cancelled');
        const totalSpend = userOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);
        const sorted = [...userOrders].sort((a, b) =>
          (b.orderDate?.toDate?.()?.getTime() || 0) - (a.orderDate?.toDate?.()?.getTime() || 0)
        );
        // Check if any order has termsAccepted
        const termsOrder = userOrders.find((o: any) => o.termsAccepted === true);
        return {
          ...u,
          totalSpend,
          orderCount: userOrders.length,
          avgOrderValue: userOrders.length > 0 ? totalSpend / userOrders.length : 0,
          lastPurchase: sorted[0]?.orderDate?.toDate?.()?.toLocaleDateString('en-GB') || null,
          termsAccepted: termsOrder ? true : (u.termsAccepted || false),
          termsAcceptedAt: termsOrder ? (termsOrder as any).termsAcceptedAt : u.termsAcceptedAt,
        };
      });

      setCustomers(enriched);
    } catch (err: any) {
      console.error('CustomersTab fetch error:', err);
      if (err?.code === 'permission-denied') {
        setFetchError('permission-denied');
      } else {
        setFetchError(err?.message || 'Unknown error');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleRoleChange = async (uid: string, role: string) => {
    setSaving(uid);
    try {
      await updateDoc(doc(db, 'customers', uid), { role });
      setCustomers(prev => prev.map(c => c.uid === uid ? { ...c, role } : c));
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(null);
    }
  };

  const handleDeactivate = async (uid: string) => {
    if (!confirm('Deactivate this account?')) return;
    setSaving(uid);
    try {
      await updateDoc(doc(db, 'customers', uid), { isActive: false });
      setCustomers(prev => prev.map(c => c.uid === uid ? { ...c, isActive: false } : c));
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(null);
    }
  };

  const handleVipToggle = async (uid: string, currentVip: boolean) => {
    setSaving(uid);
    try {
      await updateDoc(doc(db, 'customers', uid), { isVip: !currentVip });
      setCustomers(prev => prev.map(c => c.uid === uid ? { ...c, isVip: !currentVip } : c));
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(null);
    }
  };

  const filtered = customers.filter(c => {
    const matchSearch =
      (c.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (`${c.firstName || ''} ${c.lastName || ''}`).toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || (c.role || 'customer') === roleFilter;
    return matchSearch && matchRole;
  });

  const totalRevenue = customers.reduce((s, c) => s + c.totalSpend, 0);
  const activeCustomers = customers.filter(c => c.orderCount > 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">Customer Database</h2>
          <p className="text-[#9cb8d9] text-xs sm:text-sm mt-1">{customers.length} registered users · £{totalRevenue.toFixed(2)} total revenue</p>
        </div>
        <button
          onClick={fetchData}
          aria-label="Refresh customer data"
          className="p-2 bg-[#0f2640] hover:bg-[#1a3a5c] text-[#8caad4] rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        {[
          { label: 'Total Users', value: customers.length, icon: Users, color: 'text-blue-400' },
          { label: 'Active Buyers', value: activeCustomers, icon: ShoppingBag, color: 'text-green-400' },
          { label: 'Total Revenue', value: `£${totalRevenue.toFixed(0)}`, icon: DollarSign, color: 'text-yellow-400' },
          { label: 'Avg Spend', value: activeCustomers > 0 ? `£${(totalRevenue / activeCustomers).toFixed(2)}` : '£0', icon: Shield, color: 'text-blue-400' },
        ].map((s) => (
          <div key={s.label} className="bg-[#0b1a30]/80 rounded-xl p-3 sm:p-4 border border-white/[0.07]">
            <s.icon className={`w-4 sm:w-5 h-4 sm:h-5 ${s.color} mb-2`} />
            <p className="text-lg sm:text-2xl font-bold text-white">{s.value}</p>
            <p className="text-[#9cb8d9] text-xs mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2a4a7a]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="relative">
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="pl-3 pr-8 py-2.5 bg-[#0d1f35] border border-white/[0.08] rounded-xl text-white text-sm appearance-none focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Roles</option>
            {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2a4a7a] pointer-events-none" />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-blue-500/50 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : fetchError ? (
        <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-6 text-center">
          {fetchError === 'permission-denied' ? (
            <>
              <Shield className="w-8 h-8 text-red-400 mx-auto mb-3" />
              <p className="text-red-300 font-semibold mb-1">Firebase Rules not deployed</p>
              <p className="text-[#9cb8d9] text-sm mb-4">The customers list is blocked by Firestore security rules.</p>
              <div className="bg-[#04101f] rounded-lg p-4 text-left text-xs font-mono text-[#8caad4] mb-4">
                <p className="text-amber-400 mb-2">Fix: Go to Firebase Console → Firestore → Rules</p>
                <p>Paste the rules and click <strong className="text-white">Publish</strong></p>
                <a
                  href="https://console.firebase.google.com/project/prohealthpeptides-a0808/firestore/rules"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-3 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-500 transition-colors"
                >
                  Open Firebase Console →
                </a>
              </div>
              <p className="text-[#3a5a82] text-xs">After deploying rules, click the refresh button above</p>
            </>
          ) : (
            <>
              <p className="text-red-300 font-semibold mb-1">Failed to load customers</p>
              <p className="text-[#9cb8d9] text-sm">{fetchError}</p>
            </>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-[#2a4a7a]">
          {customers.length === 0
            ? 'No registered customers yet. Customers appear here after they create an account.'
            : 'No customers match your search.'}
        </div>
      ) : (
        <div className="bg-[#0b1a30]/80 rounded-xl border border-white/[0.07] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-white/[0.07]">
                  <th className="text-left text-[#9cb8d9] text-xs font-medium px-3 sm:px-4 py-3 uppercase tracking-wider">Customer</th>
                  <th className="text-left text-[#9cb8d9] text-xs font-medium px-3 sm:px-4 py-3 uppercase tracking-wider hidden sm:table-cell">Role</th>
                  <th className="text-center text-[#9cb8d9] text-xs font-medium px-3 sm:px-4 py-3 uppercase tracking-wider hidden md:table-cell">VIP</th>
                  <th className="text-center text-[#9cb8d9] text-xs font-medium px-3 sm:px-4 py-3 uppercase tracking-wider hidden lg:table-cell">T&amp;C</th>
                  <th className="text-right text-[#9cb8d9] text-xs font-medium px-3 sm:px-4 py-3 uppercase tracking-wider">Orders</th>
                  <th className="text-right text-[#9cb8d9] text-xs font-medium px-3 sm:px-4 py-3 uppercase tracking-wider hidden md:table-cell">Lifetime Value</th>
                  <th className="text-right text-[#9cb8d9] text-xs font-medium px-3 sm:px-4 py-3 uppercase tracking-wider hidden lg:table-cell">Avg Order</th>
                  <th className="text-right text-[#9cb8d9] text-xs font-medium px-3 sm:px-4 py-3 uppercase tracking-wider hidden lg:table-cell">Last Purchase</th>
                  <th className="text-right text-[#9cb8d9] text-xs font-medium px-3 sm:px-4 py-3 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {filtered.map((c, i) => (
                    <motion.tr
                      key={c.uid}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className={`border-b border-white/[0.04] last:border-0 hover:bg-[#0f2640]/30 transition-colors ${c.isActive === false ? 'opacity-40' : ''}`}
                    >
                      <td className="px-3 sm:px-4 py-3">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="w-6 sm:w-8 h-6 sm:h-8 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {(c.firstName?.[0] || c.email?.[0] || '?').toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-white text-xs sm:text-sm font-medium truncate">
                              {c.firstName || c.lastName ? `${c.firstName || ''} ${c.lastName || ''}`.trim() : 'Unnamed'}
                              {c.isVip && <span className="ml-1 text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-500/30 inline-flex items-center gap-0.5"><Crown className="w-2.5 h-2.5" />VIP</span>}
                              {c.isAdmin && <span className="ml-1 text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full border border-purple-500/30">Admin</span>}
                              {c.isActive === false && <span className="ml-1 text-xs text-red-400">(deactivated)</span>}
                            </p>
                            <p className="text-[#9cb8d9] text-xs truncate">{c.email}</p>
                            {c.stripeLink && (
                              <a href={c.stripeLink} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                                View in Stripe →
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 sm:px-4 py-3 hidden sm:table-cell">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${ROLE_COLORS[c.role || 'customer'] || ROLE_COLORS.customer}`}>
                          {c.role || 'customer'}
                        </span>
                      </td>
                      {/* VIP column */}
                      <td className="px-3 sm:px-4 py-3 text-center hidden md:table-cell">
                        <button
                          onClick={() => handleVipToggle(c.uid, !!c.isVip)}
                          disabled={saving === c.uid}
                          title={c.isVip ? 'Remove VIP' : 'Grant VIP Access'}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border disabled:opacity-50 ${
                            c.isVip
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30'
                              : 'bg-gray-800 text-gray-600 border-white/[0.06] hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/30'
                          }`}
                        >
                          <Crown className="w-3 h-3" />
                          {c.isVip ? 'VIP' : '—'}
                        </button>
                      </td>
                      {/* T&C accepted column */}
                      <td className="px-3 sm:px-4 py-3 text-center hidden lg:table-cell">
                        {c.termsAccepted ? (
                          <span
                            title={c.termsAcceptedAt?.toDate ? `Accepted: ${c.termsAcceptedAt.toDate().toLocaleDateString('en-GB')}` : 'Terms accepted'}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/15 border border-green-500/30 text-green-400 text-xs rounded-full font-semibold"
                          >
                            <Shield className="w-2.5 h-2.5" /> Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-800 border border-white/[0.06] text-gray-600 text-xs rounded-full">
                            — No
                          </span>
                        )}
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-right text-[#8caad4] text-xs sm:text-sm">{c.orderCount}</td>
                      <td className="px-3 sm:px-4 py-3 text-right text-green-400 text-xs sm:text-sm font-semibold hidden md:table-cell">£{c.totalSpend.toFixed(2)}</td>
                      <td className="px-3 sm:px-4 py-3 text-right text-[#8caad4] text-xs hidden lg:table-cell">£{c.avgOrderValue.toFixed(2)}</td>
                      <td className="px-3 sm:px-4 py-3 text-right text-[#9cb8d9] text-xs hidden lg:table-cell">{c.lastPurchase || '—'}</td>
                      <td className="px-3 sm:px-4 py-3">
                        <div className="flex items-center justify-end gap-1 sm:gap-2">
                          <select
                            value={c.role || 'customer'}
                            onChange={e => handleRoleChange(c.uid, e.target.value)}
                            disabled={saving === c.uid}
                            className="px-3 py-2 bg-[#1e293b] border-2 border-[#475569] rounded text-[#f8fafc] text-sm focus:outline-none focus:border-[#3b82f6] disabled:opacity-50 min-h-[40px]"
                          >
                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                          {c.isActive !== false && (
                            <button
                              onClick={() => handleDeactivate(c.uid)}
                              disabled={saving === c.uid}
                              title="Deactivate user"
                              aria-label="Deactivate user"
                              className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded transition-colors disabled:opacity-50"
                            >
                              <UserX className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
