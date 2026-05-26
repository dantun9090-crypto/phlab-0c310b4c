import { useState, useEffect } from 'react';
import {
  FileText, Send, RefreshCw, Download, Eye, Search,
  CheckCircle2, AlertCircle, Loader2, X, User, Mail,
  PoundSterling, ExternalLink, Plus, ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { buildAdminInvoiceEmail } from '@/templates/adminInvoiceEmail';
import { db, auth, collection, addDoc, getDocs, query, orderBy, Timestamp, doc, setDoc } from '@/lib/firebase';

interface Invoice {
  id: string;
  uid: string;
  email: string;
  customerName: string;
  status: string;
  amount_due?: number;
  amount_paid?: number;
  currency?: string;
  created: any;
  invoice_pdf?: string;
  hosted_invoice_url?: string;
  description?: string;
  number?: string;
}

interface Customer {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
}

const STATUS_COLOR: Record<string, string> = {
  paid:     'bg-green-500/15 text-green-400 border-green-500/30',
  open:     'bg-blue-500/15 text-blue-400 border-blue-500/30',
  pending:  'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  void:     'bg-gray-500/15 text-[#9cb8d9] border-gray-500/30',
  default:  'bg-gray-500/15 text-[#9cb8d9] border-gray-500/30',
};

function formatDate(ts: any): string {
  if (!ts) return 'N/A';
  const d = typeof ts === 'number' ? new Date(ts * 1000) : ts?.toDate?.() ?? new Date(ts);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatAmount(pence?: number, currency = 'gbp'): string {
  if (pence == null) return '—';
  const sym = currency.toUpperCase() === 'GBP' ? '£' : currency.toUpperCase() + ' ';
  return `${sym}${(pence / 100).toFixed(2)}`;
}

export default function InvoicesTab() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerList, setShowCustomerList] = useState(false);

  // Send invoice form
  const [form, setForm] = useState({
    selectedCustomer: null as Customer | null,
    manualEmail: '',
    manualName: '',
    useManual: false,
    amount: '',
    currency: 'gbp',
    description: 'PH Labs — Invoice',
    dueDate: '',
  });

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [invSnap, custSnap] = await Promise.all([
        getDocs(query(collection(db, 'invoices'), orderBy('created', 'desc'))).catch(() =>
          getDocs(collection(db, 'invoices'))
        ),
        getDocs(collection(db, 'customers')),
      ]);
      const invs: Invoice[] = invSnap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice));
      setInvoices(invs);
      const custs: Customer[] = custSnap.docs.map(d => {
        const data = d.data();
        return {
          uid: d.id,
          email: data.email || '',
          firstName: data.firstName || '',
          lastName: data.lastName || '',
        };
      }).filter(c => c.email);
      setCustomers(custs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    const email = form.useManual ? form.manualEmail : form.selectedCustomer?.email;
    const name = form.useManual
      ? form.manualName
      : `${form.selectedCustomer?.firstName} ${form.selectedCustomer?.lastName}`.trim();
    const uid = form.useManual ? 'admin-created' : (form.selectedCustomer?.uid || 'admin-created');

    if (!email) { setMsg({ type: 'error', text: 'Please select a customer or enter an email.' }); return; }
    if (!form.description.trim()) { setMsg({ type: 'error', text: 'Please add a description.' }); return; }

    // Must be authenticated to write to Firestore
    if (!auth.currentUser) {
      setMsg({ type: 'error', text: 'You must be logged in to send invoices.' });
      return;
    }

    setSending(true);
    setMsg(null);

    const amountNum = form.amount && !isNaN(parseFloat(form.amount)) ? parseFloat(form.amount) : null;
    const invoiceRef = `INV-${Date.now().toString(36).toUpperCase()}`;

    // Build invoice record
    const invoiceRecord: any = {
      uid,
      email,
      customerName: name,
      currency: form.currency,
      description: form.description,
      status: 'pending',
      created: Timestamp.now(),
      invoiceRef,
      createdByAdmin: auth.currentUser.uid,
    };
    if (amountNum !== null) invoiceRecord.amount_due = Math.round(amountNum * 100);
    if (form.dueDate) invoiceRecord.due_date = new Date(form.dueDate).getTime() / 1000;

    // 1. Save invoice record to the dedicated invoices collection.
    // Do NOT fall back to the publicly-readable `settings` collection — that
    // would leak customer PII (name, email, UID, amount) to any visitor.
    try {
      await addDoc(collection(db, 'invoices'), invoiceRecord);
    } catch (err) {
      console.error('Failed to write invoice record', err);
      alert('Could not save invoice. Check Firestore rules for the "invoices" collection and try again.');
      return;
    }


    // 2. Send via `mail` collection (Firebase Trigger Email extension)
    try {
      const html = buildAdminInvoiceEmail({
        customerName: name || email || 'Customer',
        email: email || '',
        invoiceRef,
        description: form.description || '',
        amount: amountNum ?? 0,
        currency: form.currency === 'gbp' ? 'GBP' : form.currency === 'usd' ? 'USD' : 'EUR',
        dueDate: form.dueDate || undefined,
        notes: undefined,
      });

      await addDoc(collection(db, 'mail'), {
        to: email,
        message: {
          subject: `Invoice from PH Labs — ${invoiceRef}`,
          html,
        },
        createdAt: Timestamp.now(),
      });

      setMsg({ type: 'success', text: `Invoice email queued for ${email}. It will be delivered shortly.` });
      setShowModal(false);
      resetForm();
      setTimeout(() => loadAll(), 1500);
      setTimeout(() => setMsg(null), 6000);
    } catch (e: any) {
      const msg = (e?.message || '').toLowerCase();
      const isRulesError = msg.includes('permission') || msg.includes('insufficient');
      setMsg({
        type: 'error',
        text: isRulesError
          ? 'Firestore permissions error — please update your Firestore rules in Firebase Console to allow writes to the "mail" collection (see setup guide).'
          : 'Failed to send invoice: ' + (e.message || 'Unknown error'),
      });
    } finally {
      setSending(false);
    }
  };

  const resetForm = () => {
    setForm({
      selectedCustomer: null,
      manualEmail: '',
      manualName: '',
      useManual: false,
      amount: '',
      currency: 'gbp',
      description: 'PH Labs — Invoice',
      dueDate: '',
    });
    setCustomerSearch('');
  };

  const filteredInvoices = invoices.filter(inv => {
    const q = search.toLowerCase();
    return (
      inv.email?.toLowerCase().includes(q) ||
      inv.customerName?.toLowerCase().includes(q) ||
      inv.number?.toLowerCase().includes(q) ||
      inv.description?.toLowerCase().includes(q) ||
      inv.status?.toLowerCase().includes(q)
    );
  });

  const filteredCustomers = customers.filter(c => {
    const q = customerSearch.toLowerCase();
    return (
      c.email.toLowerCase().includes(q) ||
      c.firstName.toLowerCase().includes(q) ||
      c.lastName.toLowerCase().includes(q)
    );
  }).slice(0, 8);

  const statusColor = (s: string) => STATUS_COLOR[s] || STATUS_COLOR.default;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <FileText className="w-7 h-7 text-blue-400" />
            Invoices
          </h1>
          <p className="text-[#2a4a7a] text-sm mt-1">
            Create & send invoices to customers via Stripe
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadAll}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-[#0f2640] hover:bg-[#1a3a5c] text-white rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Send Invoice
          </button>
        </div>
      </div>

      {/* Feedback */}
      <AnimatePresence>
        {msg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
              msg.type === 'success'
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}
          >
            {msg.type === 'success'
              ? <CheckCircle2 className="w-4 h-4 shrink-0" />
              : <AlertCircle className="w-4 h-4 shrink-0" />}
            {msg.text}
            <button onClick={() => setMsg(null)} className="ml-auto" aria-label="Dismiss message"><X className="w-4 h-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: invoices.length, color: 'text-white' },
          { label: 'Paid', value: invoices.filter(i => i.status === 'paid').length, color: 'text-green-400' },
          { label: 'Pending', value: invoices.filter(i => i.status === 'pending' || i.status === 'open').length, color: 'text-yellow-400' },
          {
            label: 'Revenue',
            value: '£' + (invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount_paid || 0), 0) / 100).toFixed(2),
            color: 'text-blue-400'
          },
        ].map(stat => (
          <div key={stat.label} className="bg-[#0b1a30]/60 border border-white/10 rounded-xl p-4">
            <p className="text-[#2a4a7a] text-xs mb-1">{stat.label}</p>
            <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2a4a7a]" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by email, name, status…"
          className="w-full bg-[#0b1a30]/60 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-[#2a4a7a] text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
        />
      </div>

      {/* Invoice list */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-[#2a4a7a]">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading invoices…
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-[#9cb8d9] font-medium mb-1">No invoices yet</p>
          <p className="text-gray-600 text-sm">Click "Send Invoice" to create the first one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredInvoices.map(inv => {
            const amount = inv.amount_paid ?? inv.amount_due;
            return (
              <motion.div
                key={inv.id}
                layout
                className="flex items-center gap-4 bg-[#0b1a30]/60 border border-white/10 hover:border-white/20 rounded-xl p-4 transition-colors cursor-pointer"
                onClick={() => setSelectedInvoice(inv)}
              >
                {/* Icon */}
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-blue-400" />
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white text-sm font-medium truncate">
                      {inv.customerName || inv.email || 'Unknown'}
                    </p>
                    {inv.number && (
                      <span className="text-[#2a4a7a] text-xs font-mono">#{inv.number}</span>
                    )}
                  </div>
                  <p className="text-[#2a4a7a] text-xs mt-0.5 truncate">
                    {inv.email} · {formatDate(inv.created)}
                    {inv.description && ` · ${inv.description}`}
                  </p>
                </div>

                {/* Amount */}
                <div className="text-right shrink-0">
                  <p className="text-white font-semibold text-sm">
                    {amount != null ? formatAmount(amount, inv.currency) : '—'}
                  </p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize mt-1 ${statusColor(inv.status)}`}>
                    {inv.status}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                  {inv.invoice_pdf && (
                    <a
                      href={inv.invoice_pdf}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-lg transition-colors"
                      title="Download PDF"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                  {inv.hosted_invoice_url && (
                    <a
                      href={inv.hosted_invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 bg-[#0f2640] hover:bg-[#1a3a5c] text-[#8caad4] rounded-lg transition-colors"
                      title="View invoice"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    onClick={() => setSelectedInvoice(inv)}
                    className="p-1.5 bg-[#0f2640] hover:bg-[#1a3a5c] text-[#8caad4] rounded-lg transition-colors"
                    title="View details"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── SEND INVOICE MODAL ── */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setShowModal(false)}
          >
            <div className="absolute inset-0 bg-black/75" />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-lg bg-[#04101f] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
                <h2 className="text-white font-semibold text-lg flex items-center gap-2">
                  <Send className="w-5 h-5 text-blue-400" />
                  Send Invoice
                </h2>
                <button onClick={() => setShowModal(false)} aria-label="Close invoice modal" className="p-1.5 hover:bg-white/10 rounded-lg text-[#9cb8d9] hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
                {/* Customer selector */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[#9cb8d9] text-sm font-medium">Customer</label>
                    <button
                      onClick={() => setForm(f => ({ ...f, useManual: !f.useManual, selectedCustomer: null }))}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      {form.useManual ? 'Pick from customers' : 'Enter manually'}
                    </button>
                  </div>

                  {form.useManual ? (
                    <div className="space-y-2">
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2a4a7a]" />
                        <input
                          value={form.manualEmail}
                          onChange={e => setForm(f => ({ ...f, manualEmail: e.target.value }))}
                          placeholder="customer@email.com"
                          className="w-full bg-[#0d1f35] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-[#2a4a7a] text-sm focus:outline-none focus:border-blue-500/50"
                        />
                      </div>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2a4a7a]" />
                        <input
                          value={form.manualName}
                          onChange={e => setForm(f => ({ ...f, manualName: e.target.value }))}
                          placeholder="Customer name (optional)"
                          className="w-full bg-[#0d1f35] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-[#2a4a7a] text-sm focus:outline-none focus:border-blue-500/50"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <div
                        className="flex items-center gap-3 bg-[#0d1f35] border border-white/10 hover:border-white/20 rounded-xl px-3 py-2.5 cursor-pointer transition-colors"
                        onClick={() => setShowCustomerList(v => !v)}
                      >
                        <User className="w-4 h-4 text-[#2a4a7a] shrink-0" />
                        {form.selectedCustomer ? (
                          <span className="text-white text-sm flex-1">
                            {form.selectedCustomer.firstName} {form.selectedCustomer.lastName}
                            <span className="text-[#2a4a7a] ml-2 text-xs">{form.selectedCustomer.email}</span>
                          </span>
                        ) : (
                          <span className="text-[#2a4a7a] text-sm flex-1">Select a customer…</span>
                        )}
                        <ChevronDown className="w-4 h-4 text-[#2a4a7a] shrink-0" />
                      </div>

                      <AnimatePresence>
                        {showCustomerList && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="absolute top-full mt-1 w-full bg-[#0d1f35] border border-white/10 rounded-xl shadow-xl z-20 overflow-hidden"
                          >
                            <div className="p-2 border-b border-white/10">
                              <input
                                autoFocus
                                value={customerSearch}
                                onChange={e => setCustomerSearch(e.target.value)}
                                placeholder="Search customers…"
                                className="w-full bg-[#04101f] rounded-lg px-3 py-2 text-white text-sm placeholder-[#2a4a7a] focus:outline-none"
                              />
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                              {filteredCustomers.length === 0 ? (
                                <p className="text-[#2a4a7a] text-sm text-center py-4">No customers found</p>
                              ) : filteredCustomers.map(c => (
                                <button
                                  key={c.uid}
                                  onClick={() => {
                                    setForm(f => ({ ...f, selectedCustomer: c }));
                                    setShowCustomerList(false);
                                    setCustomerSearch('');
                                  }}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors text-left"
                                >
                                  <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                                    <span className="text-blue-400 text-xs font-bold">
                                      {(c.firstName[0] || c.email[0]).toUpperCase()}
                                    </span>
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-white text-sm font-medium">
                                      {c.firstName} {c.lastName}
                                    </p>
                                    <p className="text-[#2a4a7a] text-xs truncate">{c.email}</p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label className="text-[#9cb8d9] text-sm font-medium block mb-2">Description</label>
                  <input
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Invoice description…"
                    className="w-full bg-[#0d1f35] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-[#2a4a7a] text-sm focus:outline-none focus:border-blue-500/50"
                  />
                </div>

                {/* Amount + Currency */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[#9cb8d9] text-sm font-medium block mb-2">Amount</label>
                    <div className="relative">
                      <PoundSterling className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2a4a7a]" />
                      <input
                        value={form.amount}
                        onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                        placeholder="0.00"
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-full bg-[#0d1f35] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-[#2a4a7a] text-sm focus:outline-none focus:border-blue-500/50"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[#9cb8d9] text-sm font-medium block mb-2">Currency</label>
                    <select
                      value={form.currency}
                      onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                      className="w-full bg-[#0d1f35] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/50"
                    >
                      <option value="gbp">GBP (£)</option>
                      <option value="usd">USD ($)</option>
                      <option value="eur">EUR (€)</option>
                    </select>
                  </div>
                </div>

                {/* Due date */}
                <div>
                  <label className="text-[#9cb8d9] text-sm font-medium block mb-2">Due Date (optional)</label>
                  <input
                    value={form.dueDate}
                    onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                    type="date"
                    className="w-full bg-[#0d1f35] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/50 [color-scheme:dark]"
                  />
                </div>

                {/* Info note */}
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 text-xs text-blue-300 leading-relaxed">
                  This creates a document in the <code className="bg-blue-500/10 px-1 rounded">invoices</code> collection.
                  The <strong>Firebase Stripe Invoices</strong> extension will pick it up and send the email automatically.
                </div>

                {/* Feedback in modal */}
                {msg && (
                  <div className={`flex items-center gap-2 p-3 rounded-xl text-sm border ${
                    msg.type === 'success'
                      ? 'bg-green-500/10 border-green-500/30 text-green-400'
                      : 'bg-red-500/10 border-red-500/30 text-red-400'
                  }`}>
                    {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    {msg.text}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex gap-3 px-6 py-4 border-t border-white/10">
                <button
                  onClick={() => { setShowModal(false); resetForm(); setMsg(null); }}
                  className="flex-1 py-2.5 bg-[#0f2640] hover:bg-[#1a3a5c] text-white rounded-xl text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {sending ? 'Sending…' : 'Send Invoice'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── INVOICE DETAIL MODAL ── */}
      <AnimatePresence>
        {selectedInvoice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedInvoice(null)}
          >
            <div className="absolute inset-0 bg-black/75" />
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="relative w-full max-w-md bg-[#04101f] border border-white/10 rounded-2xl shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                <h3 className="text-white font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-400" />
                  {selectedInvoice.number ? `Invoice #${selectedInvoice.number}` : 'Invoice Details'}
                </h3>
                <button onClick={() => setSelectedInvoice(null)} aria-label="Close invoice details" className="p-1.5 hover:bg-white/10 rounded-lg text-[#9cb8d9] hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-6 space-y-3">
                {[
                  { label: 'Customer', value: selectedInvoice.customerName || '—' },
                  { label: 'Email', value: selectedInvoice.email || '—' },
                  { label: 'Status', value: selectedInvoice.status, badge: true },
                  { label: 'Amount', value: formatAmount(selectedInvoice.amount_paid ?? selectedInvoice.amount_due, selectedInvoice.currency) },
                  { label: 'Created', value: formatDate(selectedInvoice.created) },
                  { label: 'Description', value: selectedInvoice.description || '—' },
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-center text-sm py-1.5 border-b border-white/5">
                    <span className="text-[#2a4a7a]">{row.label}</span>
                    {row.badge ? (
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border capitalize ${statusColor(selectedInvoice.status)}`}>
                        {selectedInvoice.status}
                      </span>
                    ) : (
                      <span className="text-white font-medium">{row.value}</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-3 px-6 pb-6">
                {selectedInvoice.invoice_pdf && (
                  <a href={selectedInvoice.invoice_pdf} target="_blank" rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors">
                    <Download className="w-4 h-4" /> Download PDF
                  </a>
                )}
                {selectedInvoice.hosted_invoice_url && (
                  <a href={selectedInvoice.hosted_invoice_url} target="_blank" rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#0f2640] hover:bg-[#1a3a5c] text-white rounded-xl text-sm font-medium transition-colors">
                    <ExternalLink className="w-4 h-4" /> View Online
                  </a>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
