import { useState, useEffect } from 'react';
import {
  Mail, Send, Users, FileText, Eye, EyeOff,
  CheckCircle2, AlertCircle, Loader2, ChevronDown,
  Megaphone, Gift, Newspaper, Package, RefreshCw, Sparkles, Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, collection, addDoc, getDocs, Timestamp, query, where, orderBy, limit, deleteDoc, doc } from '@/lib/firebase';

interface EmailRecord {
  id: string;
  subject: string;
  recipientCount: number;
  status: 'pending' | 'sent' | 'failed';
  createdAt: Date;
}

interface Customer {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  marketingOptIn?: boolean;
}

const TEMPLATES = [
  {
    id: 'protocol-library',
    label: '🎁 Protocol Library Lead Magnet',
    icon: Gift,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
    subject: '🎉 Your Free Protocol Library is Ready — Plus 10% Off',
    body: `Hi [First Name],

Thank you for your interest in PH Labs UK!

Your FREE 28-page Protocol Library is ready to download. Inside you'll find:

✅ BPC-157 Research Protocol — Complete dosing, reconstitution & storage guide
✅ TB-500 Application Guide — Evidence-based usage protocols
✅ Semaglutide Handbook — Safe handling & administration
✅ Storage Best Practices — Maximise peptide stability & shelf life
✅ Certificate of Analysis Guide — How to read HPLC test results
✅ UK Legal Compliance — Research-only use requirements

📥 DOWNLOAD YOUR FREE GUIDE:
https://www.prohealthpeptides.co.uk/downloads/protocol-library.pdf

🎁 BONUS: Use discount code PROTOCOL10 to save 10% on your first order (valid 30 days).

Browse all HPLC-verified peptides:
https://www.prohealthpeptides.co.uk/products

Questions? Email us at info@prohealthpeptides.co.uk

⚠️ Research Use Only
All peptides supplied by PH Labs UK are for in-vitro research purposes only. Not for human or veterinary use.

Best regards,
PH Labs UK Team`
  },
  {
    id: 'new-product',
    label: 'New Product Launch',
    icon: Package,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
    subject: 'New Arrival: [Product Name] — Now Available',
    body: `Hi [First Name],

We're excited to announce the arrival of [Product Name] to our research catalogue.

[Product Name] is a [brief description of the compound and its research applications].

HPLC-tested purity. Lyophilised and nitrogen-sealed for maximum stability.

View the full product listing and technical specifications here:
[Product URL]

This compound is supplied strictly for laboratory research use only. Not for human administration.

Best regards,
PH Labs Research Team

---
PH Labs Ltd | research@prohealthpeptides.co.uk
For laboratory research use only. Not approved by MHRA or FDA.
To unsubscribe from research updates, reply with UNSUBSCRIBE.`,
  },
  {
    id: 'discount',
    label: 'Promotional Discount',
    icon: Gift,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
    subject: 'Exclusive Offer: [X]% Off Selected Research Compounds',
    body: `Hi [First Name],

As a valued researcher, we're pleased to offer you an exclusive discount on selected compounds.

Use code [DISCOUNT_CODE] at checkout to save [X]% on:
• [Product 1]
• [Product 2]
• [Product 3]

Offer valid until [Date]. Cannot be combined with other offers.

Shop now: https://www.prohealthpeptides.co.uk/products

All compounds are HPLC-tested and supplied for laboratory research use only.

Best regards,
PH Labs Research Team

---
PH Labs Ltd | research@prohealthpeptides.co.uk
For laboratory research use only. Not approved by MHRA or FDA.
To unsubscribe, reply with UNSUBSCRIBE.`,
  },
  {
    id: 'newsletter',
    label: 'Research Newsletter',
    icon: Newspaper,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10 border-purple-500/20',
    subject: 'PH Labs — Research Update [Month Year]',
    body: `Hi [First Name],

Welcome to the [Month] research update from PH Labs.

WHAT'S NEW
• [New product or update]
• [Research highlight or compound note]
• [Upcoming restocks or announcements]

FEATURED RESEARCH AREA: [Topic]
[Brief 2–3 sentence description of the research topic and how your compounds support it]

POPULAR COMPOUNDS THIS MONTH
• [Compound 1] — [brief note]
• [Compound 2] — [brief note]

Browse our full catalogue: https://www.prohealthpeptides.co.uk/products

All compounds are supplied strictly for in-vitro and laboratory research use only. For educational and research purposes only. Not for human administration or clinical use.

Best regards,
PH Labs Research Team

---
PH Labs Ltd | research@prohealthpeptides.co.uk
For laboratory research use only. Not approved by MHRA or FDA.
To unsubscribe, reply with UNSUBSCRIBE.`,
  },
  {
    id: 'restock',
    label: 'Back in Stock',
    icon: RefreshCw,
    color: 'text-green-400',
    bg: 'bg-green-500/10 border-green-500/20',
    subject: '[Product Name] is Back in Stock',
    body: `Hi [First Name],

Great news — [Product Name] is back in stock and available to order.

[Product Name]: [brief research description]
• HPLC-tested purity
• Lyophilised powder, nitrogen-sealed
• Ships within 1–2 business days

Order before [Date] for priority dispatch.

View product: [Product URL]

Supplied strictly for laboratory research use only. Not for human administration.

Best regards,
PH Labs Research Team

---
PH Labs Ltd | research@prohealthpeptides.co.uk
For laboratory research use only. Not approved by MHRA or FDA.
To unsubscribe, reply with UNSUBSCRIBE.`,
  },
  {
    id: 'mhra-update',
    label: 'Compliance Update',
    icon: Sparkles,
    color: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/20',
    subject: 'Important: Compliance Update from PH Labs',
    body: `Hi [First Name],

We want to keep you informed of an important update regarding our terms and product supply.

[Describe the compliance change — e.g. updated Terms & Conditions, regulatory change, new verification requirement]

This change takes effect from [Date].

What this means for your research orders:
• [Impact 1]
• [Impact 2]

You can review our updated Terms & Conditions here:
https://www.prohealthpeptides.co.uk/terms

All our products remain supplied strictly for laboratory research use only. Not approved by MHRA or FDA. Not for human administration or therapeutic use.

If you have any questions, please contact us:
research@prohealthpeptides.co.uk

Best regards,
PH Labs Compliance Team

---
PH Labs Ltd
For laboratory research use only. Not approved by MHRA or FDA.
To unsubscribe, reply with UNSUBSCRIBE.`,
  },
];

export default function EmailMarketingTab() {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerCount, setCustomerCount] = useState<number | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [recentEmails, setRecentEmails] = useState<EmailRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [loadingSubscribers, setLoadingSubscribers] = useState(false);

  useEffect(() => {
    loadCustomers();
    loadHistory();
    loadSubscribers();
  }, []);

  const loadSubscribers = async () => {
    setLoadingSubscribers(true);
    try {
      const snap = await getDocs(query(collection(db, 'emailSubscribers'), orderBy('subscribedAt', 'desc')));
      const list: any[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });
      setSubscribers(list);
    } catch {
      setSubscribers([]);
    } finally {
      setLoadingSubscribers(false);
    }
  };

  const exportSubscribers = () => {
    const csv = 'Email,Source,Date,Status,Discount Code\n' + subscribers.map(s => 
      `${s.email},${s.source || 'unknown'},${s.subscribedAt || ''},${s.status || 'pending'},${s.discountCode || 'N/A'}`
    ).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `email-subscribers-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteSubscriber = async (id: string) => {
    if (!confirm('Delete this subscriber?')) return;
    try {
      await deleteDoc(doc(db, 'emailSubscribers', id));
      setSubscribers(subscribers.filter(s => s.id !== id));
    } catch (err) {
      alert('Failed to delete subscriber');
    }
  };

  const loadCustomers = async () => {
    setLoadingCustomers(true);
    try {
      const snap = await getDocs(query(collection(db, 'customers'), where('email', '!=', '')));
      const list: Customer[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.email) list.push({ id: d.id, ...data } as Customer);
      });
      setCustomers(list);
      setCustomerCount(list.length);
    } catch {
      setCustomerCount(0);
    } finally {
      setLoadingCustomers(false);
    }
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'emailQueue'), orderBy('createdAt', 'desc'), limit(10))
      );
      const list: EmailRecord[] = [];
      snap.forEach(d => {
        const data = d.data();
        list.push({
          id: d.id,
          subject: data.subject || '(no subject)',
          recipientCount: data.recipientCount || 0,
          status: data.status || 'pending',
          createdAt: data.createdAt?.toDate?.() || new Date(),
        });
      });
      setRecentEmails(list);
    } catch {
      setRecentEmails([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const applyTemplate = (tplId: string) => {
    const tpl = TEMPLATES.find(t => t.id === tplId);
    if (!tpl) return;
    setSubject(tpl.subject);
    setBody(tpl.body);
    setSelectedTemplate(tplId);
    setTemplateOpen(false);
  };

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      setMsg({ type: 'error', text: 'Subject and body are required.' });
      return;
    }
    if (!customers.length) {
      setMsg({ type: 'error', text: 'No customers with email addresses found.' });
      return;
    }

    const confirmed = window.confirm(
      `Send email to ${customers.length} customer${customers.length === 1 ? '' : 's'}?\n\nSubject: ${subject}\n\nThis action cannot be undone.`
    );
    if (!confirmed) return;

    setSending(true);
    setMsg(null);

    try {
      // Write individual queue items for each customer
      const batchWrites = customers.map(c =>
        addDoc(collection(db, 'emailQueue'), {
          to: c.email,
          recipientName: c.firstName ? `${c.firstName} ${c.lastName || ''}`.trim() : c.email,
          subject: subject.trim(),
          body: body.trim(),
          status: 'pending',
          createdAt: Timestamp.now(),
          campaignId: `campaign_${Date.now()}`,
          recipientCount: customers.length,
        })
      );
      await Promise.all(batchWrites);

      setMsg({ type: 'success', text: `Campaign queued for ${customers.length} recipient${customers.length === 1 ? '' : 's'}. Emails will be sent by your Firebase Cloud Function.` });
      setTimeout(() => setMsg(null), 8000);
      loadHistory();
    } catch (e: any) {
      setMsg({ type: 'error', text: 'Failed to queue campaign: ' + (e?.message || 'unknown error') });
    } finally {
      setSending(false);
    }
  };

  const selectedTpl = TEMPLATES.find(t => t.id === selectedTemplate);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Megaphone className="w-6 h-6 text-pink-400" />
            Email Marketing
          </h1>
          <p className="text-[#9cb8d9] text-sm mt-1">
            Compose and send promotional emails to all registered customers.
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-[#0b1a30]/80 border border-white/10 rounded-xl">
          <Users className="w-4 h-4 text-blue-400" />
          {loadingCustomers ? (
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
          ) : (
            <span className="text-white text-sm font-semibold">{customerCount ?? 0}</span>
          )}
          <span className="text-[#9cb8d9] text-sm">recipients</span>
        </div>
      </div>

      {/* Email Subscribers — Lead Magnet */}
      <div className="bg-[#0b1a30]/70 border border-white/[0.08] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-white font-bold flex items-center gap-2">
              <Mail className="w-5 h-5 text-green-400" />
              Email Subscribers (Lead Magnet)
            </h2>
            <p className="text-[#9cb8d9] text-xs mt-1">
              Users who signed up for the Free Protocol Library
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadSubscribers}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors"
              aria-label="Refresh subscribers"
            >
              <RefreshCw className="w-4 h-4 text-[#9cb8d9]" />
            </button>
            <button
              onClick={exportSubscribers}
              disabled={subscribers.length === 0}
              className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {loadingSubscribers ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-green-400 animate-spin" />
          </div>
        ) : subscribers.length === 0 ? (
          <p className="text-[#3a5a82] text-xs text-center py-6">No subscribers yet.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {subscribers.map(sub => (
              <div key={sub.id} className="flex items-center justify-between gap-3 p-3 bg-[#04101f]/60 rounded-xl border border-white/5">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{sub.email}</p>
                  <p className="text-[#3a5a82] text-[10px] mt-0.5">
                    {sub.source || 'unknown'} · {sub.subscribedAt ? new Date(sub.subscribedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                  </p>
                  {sub.discountCode && (
                    <p className="text-green-400 text-xs font-semibold mt-1">
                      Code: {sub.discountCode}
                    </p>
                  )}
                </div>
                <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                  sub.status === 'sent' ? 'bg-green-500/15 text-green-400' : 'bg-amber-500/15 text-amber-400'
                }`}>
                  {sub.status || 'pending'}
                </span>
                <button
                  onClick={() => deleteSubscriber(sub.id)}
                  className="p-1 hover:bg-red-500/10 text-red-400/50 hover:text-red-400 rounded transition-colors"
                  aria-label="Delete subscriber"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status message */}
      <AnimatePresence>
        {msg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${
              msg.type === 'success'
                ? 'bg-green-500/10 border-green-500/30 text-green-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}
          >
            {msg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{msg.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid lg:grid-cols-5 gap-6">

        {/* Left: compose */}
        <div className="lg:col-span-3 space-y-4">

          {/* Template picker */}
          <div className="bg-[#0b1a30]/60 border border-white/10 rounded-2xl p-5 space-y-3">
            <h3 className="font-semibold text-white text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-400" /> Start from a Template
            </h3>
            <div className="relative">
              <button
                type="button"
                onClick={() => setTemplateOpen(!templateOpen)}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#04101f]/60 border border-white/10 rounded-xl text-sm text-white hover:border-blue-500/40 transition-colors"
              >
                <span className="flex items-center gap-2">
                  {selectedTpl ? (
                    <>
                      <selectedTpl.icon className={`w-4 h-4 ${selectedTpl.color}`} />
                      {selectedTpl.label}
                    </>
                  ) : (
                    <span className="text-[#2a4a7a]">Choose a template...</span>
                  )}
                </span>
                <ChevronDown className={`w-4 h-4 text-[#9cb8d9] transition-transform ${templateOpen ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {templateOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute top-full left-0 right-0 mt-1 z-20 bg-[#07192e] border border-white/10 rounded-xl overflow-hidden shadow-2xl"
                  >
                    {TEMPLATES.map(tpl => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => applyTemplate(tpl.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                      >
                        <div className={`w-8 h-8 rounded-lg ${tpl.bg} flex items-center justify-center shrink-0`}>
                          <tpl.icon className={`w-4 h-4 ${tpl.color}`} />
                        </div>
                        <div>
                          <p className="text-white font-medium">{tpl.label}</p>
                          <p className="text-[#3a5a82] text-xs mt-0.5 truncate">{tpl.subject}</p>
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Compose */}
          <div className="bg-[#0b1a30]/60 border border-white/10 rounded-2xl p-5 space-y-4">
            <h3 className="font-semibold text-white text-sm flex items-center gap-2">
              <Mail className="w-4 h-4 text-pink-400" /> Compose Email
            </h3>

            <div>
              <label className="block text-[#9cb8d9] text-xs font-medium mb-1.5">Subject Line</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="e.g. New Arrival: Retatrutide — Now Available"
                className="w-full bg-white border border-gray-300 text-gray-900 text-sm placeholder-gray-400 py-2.5 px-4 rounded-xl focus:outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-100 transition-colors"
              />
            </div>

            <div>
              <label className="block text-[#9cb8d9] text-xs font-medium mb-1.5">Email Body</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Write your message here, or select a template above..."
                rows={18}
                className="w-full bg-white border border-gray-300 text-gray-900 text-sm placeholder-gray-400 py-2.5 px-4 rounded-xl focus:outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-100 transition-colors resize-y font-mono leading-relaxed"
              />
              <p className="text-gray-700 text-xs mt-1">{body.length} characters</p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setPreview(!preview)}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#04101f]/60 hover:bg-[#0b1a30] border border-white/10 hover:border-white/20 text-[#8caad4] hover:text-white rounded-xl text-sm font-medium transition-all"
              >
                {preview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {preview ? 'Edit' : 'Preview'}
              </button>

              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !subject.trim() || !body.trim() || !customerCount}
                className="flex items-center gap-2 px-5 py-2.5 bg-pink-600 hover:bg-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-colors ml-auto"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? 'Queuing...' : `Send to ${customerCount ?? '…'} recipients`}
              </button>
            </div>
          </div>
        </div>

        {/* Right: preview + history */}
        <div className="lg:col-span-2 space-y-4">

          {/* Preview */}
          <AnimatePresence>
            {preview && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-white rounded-2xl p-5 space-y-3">
                  <div className="border-b border-gray-200 pb-3">
                    <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Subject</p>
                    <p className="text-gray-900 text-sm font-semibold mt-0.5">{subject || '(no subject)'}</p>
                  </div>
                  <pre className="text-gray-800 text-xs leading-relaxed whitespace-pre-wrap font-sans">
                    {body || '(empty)'}
                  </pre>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* How it works */}
          <div className="bg-[#0b1a30]/60 border border-white/10 rounded-2xl p-5 space-y-3">
            <h3 className="font-semibold text-white text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400" /> How it works
            </h3>
            <ul className="space-y-2 text-[#9cb8d9] text-xs leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>
                Emails are written to an <span className="text-white font-medium mx-1">emailQueue</span> collection in Firebase.
              </li>
              <li className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>
                A Firebase Cloud Function (or SMTP trigger) monitors the queue and sends each email.
              </li>
              <li className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>
                Queue items update to <span className="text-green-400 font-medium mx-1">sent</span> or <span className="text-red-400 font-medium mx-1">failed</span> once processed.
              </li>
            </ul>
          </div>

          {/* Recent campaigns */}
          <div className="bg-[#0b1a30]/60 border border-white/10 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-400" /> Recent Campaigns
              </h3>
              <button
                type="button"
                onClick={loadHistory}
                aria-label="Refresh campaign history"
                className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#9cb8d9]" />
              </button>
            </div>

            {loadingHistory ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
              </div>
            ) : recentEmails.length === 0 ? (
              <p className="text-[#3a5a82] text-xs text-center py-4">No campaigns sent yet.</p>
            ) : (
              <div className="space-y-2">
                {recentEmails.map(e => (
                  <div key={e.id} className="flex items-start gap-3 p-3 bg-[#04101f]/60 rounded-xl border border-white/5">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                      e.status === 'sent' ? 'bg-green-400' :
                      e.status === 'failed' ? 'bg-red-400' : 'bg-amber-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-medium truncate">{e.subject}</p>
                      <p className="text-[#3a5a82] text-[10px] mt-0.5">
                        {e.recipientCount} recipient{e.recipientCount === 1 ? '' : 's'} · {e.createdAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                      e.status === 'sent' ? 'bg-green-500/15 text-green-400' :
                      e.status === 'failed' ? 'bg-red-500/15 text-red-400' :
                      'bg-amber-500/15 text-amber-400'
                    }`}>
                      {e.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
