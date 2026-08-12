import { useState, useEffect } from 'react';
import {
  Users, Search, DollarSign, ShoppingBag, UserX, RefreshCw, Shield, ChevronDown, Crown, Trash2, AlertTriangle, X, KeyRound
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, collection, getDocs, updateDoc, doc, auth } from '@/lib/firebase';
import { getAllOrders } from '@/lib/firebase';
import { logAdminAction } from '@/lib/admin-audit';
import { toDateSafe, toMillisSafe } from '@/lib/to-date';


interface CustomerProfile {
  uid: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  isAdmin?: boolean;
  isActive?: boolean;
  isVip?: boolean;
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
  const [removeTarget, setRemoveTarget] = useState<CustomerProfile | null>(null);
  const [removeMode, setRemoveMode] = useState<'full' | 'anonymise'>('full');
  const [removeConfirm, setRemoveConfirm] = useState('');
  const [removeReason, setRemoveReason] = useState('');
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeResult, setRemoveResult] = useState<string | null>(null);
  // Password assistance (reset link / set temporary password)
  const [pwTarget, setPwTarget] = useState<CustomerProfile | null>(null);
  const [pwMode, setPwMode] = useState<'reset-link' | 'set'>('reset-link');
  const [pwValue, setPwValue] = useState('');
  const [pwReason, setPwReason] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwResult, setPwResult] = useState<string | null>(null);


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
          toMillisSafe(b.orderDate) - toMillisSafe(a.orderDate)
        );
        // Check if any order has termsAccepted
        const termsOrder = userOrders.find((o: any) => o.termsAccepted === true);
        return {
          ...u,
          totalSpend,
          orderCount: userOrders.length,
          avgOrderValue: userOrders.length > 0 ? totalSpend / userOrders.length : 0,
          lastPurchase: toDateSafe(sorted[0]?.orderDate)?.toLocaleDateString('en-GB') || null,
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
      const prevRole = customers.find(c => c.uid === uid)?.role ?? null;
      await updateDoc(doc(db, 'customers', uid), { role });
      await logAdminAction({
        action: 'customer.role.update',
        target: `customers/${uid}`,
        before: { role: prevRole },
        after: { role },
      });
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
      await logAdminAction({
        action: 'customer.deactivate',
        target: `customers/${uid}`,
        after: { isActive: false },
      });
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
      await logAdminAction({
        action: 'customer.vip.toggle',
        target: `customers/${uid}`,
        before: { isVip: currentVip },
        after: { isVip: !currentVip },
      });
      setCustomers(prev => prev.map(c => c.uid === uid ? { ...c, isVip: !currentVip } : c));
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(null);
    }
  };

  const openPassword = (c: CustomerProfile) => {
    setPwTarget(c);
    setPwMode('reset-link');
    setPwValue('');
    setPwReason('');
    setPwError(null);
    setPwResult(null);
  };

  /**
   * Admin-assisted password recovery. "reset-link" emails the customer a
   * Firebase reset link; "set" writes a password directly (blank = server
   * generates an easy one) and revokes the customer's existing sessions.
   */
  const handlePassword = async () => {
    const target = pwTarget;
    if (!target) return;
    setPwBusy(true);
    setPwError(null);
    setPwResult(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not signed in');
      const idToken = await user.getIdToken();
      const res = await fetch('/api/admin/customer-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idToken,
          uid: target.uid,
          mode: pwMode,
          password: pwMode === 'set' && pwValue.trim() ? pwValue.trim() : undefined,
          reason: pwReason || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);

      setPwResult(
        pwMode === 'reset-link'
          ? `Reset email sent to ${target.email}. The link expires after 1 hour.`
          : `New password: ${data.password}\nAll their existing sessions were signed out. Share this once and ask them to change it in Account → Security.`,
      );
      if (pwMode === 'set') setPwValue('');
    } catch (err: any) {
      const code = err?.message || 'unknown_error';
      const friendly: Record<string, string> = {
        forbidden: 'Your account is not an admin.',
        unauthorized: 'Session expired — sign in again.',
        not_found: 'Customer record no longer exists.',
        no_email: 'This customer has no email address on file.',
        auth_user_not_found: 'No sign-in account exists for this customer.',
        weak_password: 'Password too weak — use at least 6 characters.',
        cannot_set_admin_password: 'Cannot set another admin’s password — send a reset link instead.',
        reset_link_failed: 'Firebase refused to send the reset email — try again.',
        password_update_failed: 'Password update failed — try again.',
      };
      setPwError(friendly[code] || code);
    } finally {
      setPwBusy(false);
    }
  };

  const openRemove = (c: CustomerProfile) => {
    setRemoveTarget(c);
    setRemoveMode('full');
    setRemoveConfirm('');
    setRemoveReason('');
    setRemoveError(null);
    setRemoveResult(null);
  };

  /**
   * Permanent removal. The server route deletes the Firebase Auth account,
   * the customer document and newsletter subscriptions, and redacts personal
   * data on past orders (order rows are kept for 6 years for HMRC).
   */
  const handleRemove = async () => {
    const target = removeTarget;
    if (!target) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not signed in');
      const idToken = await user.getIdToken();
      const res = await fetch('/api/admin/customer-delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idToken,
          uid: target.uid,
          mode: removeMode,
          reason: removeReason || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);

      const s = data.summary || {};
      setRemoveResult(
        removeMode === 'full'
          ? `Account removed. Auth: ${s.authDeleted ? 'deleted' : s.authMissing ? 'already gone' : 'unchanged'} · Orders redacted: ${s.orders ?? 0} · Newsletter entries removed: ${s.emailSubscribers ?? 0}`
          : `Personal data erased. Orders redacted: ${s.orders ?? 0} · Newsletter entries removed: ${s.emailSubscribers ?? 0}`,
      );

      if (removeMode === 'full') {
        setCustomers(prev => prev.filter(c => c.uid !== target.uid));
      } else {
        setCustomers(prev =>
          prev.map(c => (c.uid === target.uid ? { ...c, email: '[REMOVED]', firstName: '', lastName: '', isActive: false } : c)),
        );
      }
    } catch (err: any) {
      const code = err?.message || 'unknown_error';
      const friendly: Record<string, string> = {
        forbidden: 'Your account is not an admin.',
        unauthorized: 'Session expired — sign in again.',
        cannot_remove_self: 'You cannot remove your own account.',
        cannot_remove_admin: 'Demote this admin to customer before removing.',
        not_found: 'Customer record no longer exists.',
        deletion_failed: 'Removal failed part-way — check the audit log and retry.',
      };
      setRemoveError(friendly[code] || code);
    } finally {
      setRemoveBusy(false);
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
                          <button
                            onClick={() => openPassword(c)}
                            disabled={saving === c.uid}
                            title="Password help (reset link or temporary password)"
                            aria-label="Password help"
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded transition-colors disabled:opacity-50"
                          >
                            <KeyRound className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                          </button>
                          <button
                            onClick={() => openRemove(c)}
                            disabled={saving === c.uid}
                            title="Remove customer permanently"
                            aria-label="Remove customer permanently"
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-red-600/15 hover:bg-red-600/30 text-red-300 border border-red-500/30 rounded transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                          </button>

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

      {/* Password help modal */}
      {pwTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-lg bg-[#0b1a30] border border-blue-500/30 rounded-2xl p-5 sm:p-6 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-blue-400" />
                <h3 className="text-white font-bold text-lg">Password help</h3>
              </div>
              <button
                onClick={() => setPwTarget(null)}
                aria-label="Close"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[#9cb8d9] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-[#9cb8d9] text-sm mb-4">
              {pwTarget.email || 'no email on file'}
            </p>

            <div className="space-y-2 mb-4">
              <label className="flex items-start gap-2 text-sm text-[#cfe0f5]">
                <input
                  type="radio"
                  name="pw-mode"
                  checked={pwMode === 'reset-link'}
                  onChange={() => setPwMode('reset-link')}
                  className="mt-1"
                />
                <span>
                  <strong className="text-white">Send reset link</strong> — the customer gets an
                  email and chooses their own new password. Recommended.
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-[#cfe0f5]">
                <input
                  type="radio"
                  name="pw-mode"
                  checked={pwMode === 'set'}
                  onChange={() => setPwMode('set')}
                  className="mt-1"
                />
                <span>
                  <strong className="text-white">Set a temporary password</strong> — use when the
                  customer cannot receive email. Signs them out everywhere.
                </span>
              </label>
            </div>

            {pwMode === 'set' && (
              <div className="mb-4">
                <label htmlFor="pw-value" className="block text-xs text-[#9cb8d9] mb-1">
                  New password (leave blank to generate an easy one)
                </label>
                <input
                  id="pw-value"
                  type="text"
                  value={pwValue}
                  onChange={e => setPwValue(e.target.value)}
                  placeholder="e.g. Lab-4821-Peptide"
                  className="w-full px-3 py-2 bg-slate-800 border-2 border-slate-600 rounded-lg text-white text-sm min-h-[48px] focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            <div className="mb-4">
              <label htmlFor="pw-reason" className="block text-xs text-[#9cb8d9] mb-1">
                Reason (stored in the audit log)
              </label>
              <input
                id="pw-reason"
                type="text"
                value={pwReason}
                onChange={e => setPwReason(e.target.value)}
                placeholder="Customer phoned — forgot password"
                className="w-full px-3 py-2 bg-slate-800 border-2 border-slate-600 rounded-lg text-white text-sm min-h-[48px] focus:outline-none focus:border-blue-500"
              />
            </div>

            {pwError && (
              <p className="text-red-300 text-sm mb-3">{pwError}</p>
            )}
            {pwResult && (
              <p className="text-emerald-300 text-sm mb-3 whitespace-pre-line break-words">{pwResult}</p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setPwTarget(null)}
                className="px-4 min-h-[44px] rounded-lg bg-[#0f2640] text-[#cfe0f5] text-sm"
              >
                Close
              </button>
              <button
                onClick={handlePassword}
                disabled={pwBusy}
                className="px-4 min-h-[44px] rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50"
              >
                {pwBusy ? 'Working…' : pwMode === 'reset-link' ? 'Send reset email' : 'Set password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent removal modal */}
      {removeTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-lg bg-[#0b1a30] border border-red-500/30 rounded-2xl p-5 sm:p-6 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <h3 className="text-white font-bold text-lg">Remove customer</h3>
              </div>
              <button
                onClick={() => setRemoveTarget(null)}
                aria-label="Close"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[#9cb8d9] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-[#9cb8d9] text-sm mb-4">
              <span className="text-white font-semibold">{removeTarget.email || removeTarget.uid}</span>
              {' — '}{removeTarget.orderCount} order(s), £{removeTarget.totalSpend.toFixed(2)} lifetime value.
            </p>

            {removeResult ? (
              <>
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 text-emerald-300 text-sm mb-4">
                  {removeResult}
                </div>
                <button
                  onClick={() => setRemoveTarget(null)}
                  className="w-full min-h-[48px] bg-[#0f2640] hover:bg-[#1a3a5c] text-white rounded-lg font-semibold"
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <div className="space-y-2 mb-4">
                  {([
                    ['full', 'Delete in full', 'Deletes the login account, the customer record and newsletter entries. Personal data on past orders is redacted (order rows kept 6 years for HMRC).'],
                    ['anonymise', 'Erase personal data only', 'Keeps the customer row but wipes name, email, phone and addresses, and deactivates the account.'],
                  ] as const).map(([value, label, hint]) => (
                    <label
                      key={value}
                      className={`block cursor-pointer rounded-lg border-2 p-3 ${removeMode === value ? 'border-red-500/60 bg-red-500/10' : 'border-[#475569] bg-[#1e293b]'}`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="remove-mode"
                          value={value}
                          checked={removeMode === value}
                          onChange={() => setRemoveMode(value)}
                          className="accent-red-500"
                        />
                        <span className="text-white text-sm font-semibold">{label}</span>
                      </span>
                      <span className="block text-[#9cb8d9] text-xs mt-1">{hint}</span>
                    </label>
                  ))}
                </div>

                <label className="block text-[#9cb8d9] text-xs mb-1" htmlFor="remove-reason">
                  Reason (stored in the audit log)
                </label>
                <input
                  id="remove-reason"
                  value={removeReason}
                  onChange={e => setRemoveReason(e.target.value)}
                  placeholder="e.g. GDPR erasure request"
                  className="w-full mb-4 px-3 py-2 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-white text-sm min-h-[48px] focus:outline-none focus:border-[#3b82f6]"
                />

                <label className="block text-[#9cb8d9] text-xs mb-1" htmlFor="remove-confirm">
                  Type <span className="text-red-300 font-mono">DELETE</span> to confirm
                </label>
                <input
                  id="remove-confirm"
                  value={removeConfirm}
                  onChange={e => setRemoveConfirm(e.target.value)}
                  autoComplete="off"
                  className="w-full mb-4 px-3 py-2 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-white text-sm min-h-[48px] focus:outline-none focus:border-red-500"
                />

                {removeError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-300 text-sm mb-4">
                    {removeError}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={() => setRemoveTarget(null)}
                    disabled={removeBusy}
                    className="flex-1 min-h-[48px] bg-[#0f2640] hover:bg-[#1a3a5c] text-white rounded-lg font-semibold disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRemove}
                    disabled={removeBusy || removeConfirm.trim().toUpperCase() !== 'DELETE'}
                    className="flex-1 min-h-[48px] bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold disabled:opacity-40"
                  >
                    {removeBusy ? 'Removing…' : removeMode === 'full' ? 'Delete in full' : 'Erase personal data'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>

  );
}
