import { useState, useEffect } from 'react';
import {
  Mail, Send, Users, FileText, Eye, EyeOff,
  CheckCircle2, AlertCircle, Loader2, ChevronDown,
  Megaphone, Gift, Newspaper, Package, RefreshCw, Sparkles, Download, UserX
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, collection, addDoc, getDocs, Timestamp, query, where, orderBy, limit, deleteDoc, doc, auth } from '@/lib/firebase';
import { logAdminAction } from '@/lib/admin-audit';

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
https://phlabs.co.uk/downloads/protocol-library.pdf

🎁 BONUS: Use discount code PROTOCOL10 to save 10% on your first order (valid 30 days).

Browse all HPLC-verified peptides:
https://phlabs.co.uk/products

Questions? Email us at info@phlabs.co.uk

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
PH Labs Ltd | research@phlabs.co.uk
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

Shop now: https://phlabs.co.uk/products

All compounds are HPLC-tested and supplied for laboratory research use only.

Best regards,
PH Labs Research Team

---
PH Labs Ltd | research@phlabs.co.uk
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

Browse our full catalogue: https://phlabs.co.uk/products

All compounds are supplied strictly for in-vitro and laboratory research use only. For educational and research purposes only. Not for human administration or clinical use.

Best regards,
PH Labs Research Team

---
PH Labs Ltd | research@phlabs.co.uk
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
PH Labs Ltd | research@phlabs.co.uk
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
https://phlabs.co.uk/terms

All our products remain supplied strictly for laboratory research use only. Not approved by MHRA or FDA. Not for human administration or therapeutic use.

If you have any questions, please contact us:
research@phlabs.co.uk

Best regards,
PH Labs Compliance Team

---
PH Labs Ltd
For laboratory research use only. Not approved by MHRA or FDA.
To unsubscribe, reply with UNSUBSCRIBE.`,
  },
];

// Mirror of server-side personalise() in src/routes/api/public/send-marketing.ts
// Keep both in sync so the admin preview matches actual send output.
function personalisePreview(
  template: string,
  vars: { firstName: string; lastName: string; fullName: string; email: string },
): string {
  const map: Record<string, string> = {
    firstname: vars.firstName,
    first: vars.firstName,
    name: vars.firstName || vars.fullName,
    fullname: vars.fullName,
    lastname: vars.lastName,
    last: vars.lastName,
    email: vars.email,
  };
  const key = (raw: string) => raw.toLowerCase().replace(/[\s_-]+/g, '');
  return template
    .replace(/\[([a-zA-Z][a-zA-Z\s_-]{0,30})\]/g, (m, k) => {
      const v = map[key(k)];
      return v != null && v !== '' ? v : m;
    })
    .replace(/\{\{\s*([a-zA-Z][a-zA-Z\s_-]{0,30})\s*\}\}/g, (m, k) => {
      const v = map[key(k)];
      return v != null && v !== '' ? v : m;
    });
}

export default function EmailMarketingTab() {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testRecipients, setTestRecipients] = useState('');
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
  const [repairingQueue, setRepairingQueue] = useState(false);
  const [selectedPreviewId, setSelectedPreviewId] = useState<string>('');
  const [previewSearch, setPreviewSearch] = useState('');
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<null | {
    knownPlaceholders: string[];
    unknownPlaceholders: string[];
    hasPersonalisation: boolean;
    recipientCount: number;
    fallbackFirstNameCount: number;
    fallbackFullNameCount: number;
    fallbackAffectsPct: number;
    fallbackEmailsSample: string[];
  }>(null);

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
      const [snap, mailSnap] = await Promise.all([
        getDocs(query(collection(db, 'emailQueue'), orderBy('createdAt', 'desc'), limit(10))),
        getDocs(query(collection(db, 'mail'), orderBy('createdAt', 'desc'), limit(250))).catch(() => null),
      ]);
      const mailStatus = new Map<string, EmailRecord['status']>();
      mailSnap?.forEach(d => {
        const data: any = d.data();
        if (data.source !== 'admin:marketing') return;
        const state = String(data.delivery?.state || '').toUpperCase();
        if (state === 'SUCCESS') mailStatus.set(d.id, 'sent');
        else if (state === 'ERROR' || data.delivery?.error) mailStatus.set(d.id, 'failed');
        else mailStatus.set(d.id, 'pending');
      });
      const list: EmailRecord[] = [];
      snap.forEach(d => {
        const data = d.data();
        const linkedStatus = typeof data.mailDocId === 'string' ? mailStatus.get(data.mailDocId) : undefined;
        list.push({
          id: d.id,
          subject: data.subject || '(no subject)',
          recipientCount: data.recipientCount || 0,
          status: linkedStatus || data.status || 'pending',
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

  const runValidation = async (): Promise<typeof validation> => {
    if (!subject.trim() || !body.trim()) {
      setMsg({ type: 'error', text: 'Subject and body are required.' });
      return null;
    }
    if (!customers.length) {
      setMsg({ type: 'error', text: 'No customers with email addresses found.' });
      return null;
    }
    setValidating(true);
    setMsg(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not signed in as admin');
      const res = await fetch('/api/public/send-marketing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idToken,
          subject: subject.trim(),
          html: body.trim(),
          dryRun: true,
          recipients: customers.map(c => ({
            email: c.email,
            firstName: c.firstName || undefined,
            lastName: c.lastName || undefined,
          })),
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.ok) throw new Error(result.error || result.detail || `HTTP ${res.status}`);
      setValidation(result.validation);
      return result.validation;
    } catch (e: any) {
      setMsg({ type: 'error', text: 'Validation failed: ' + (e?.message || 'unknown error') });
      return null;
    } finally {
      setValidating(false);
    }
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

    // Always validate first — surfaces unknown placeholders and fallback usage
    // BEFORE we enqueue thousands of emails.
    const v = await runValidation();
    if (!v) return;

    const warnings: string[] = [];
    if (v.unknownPlaceholders.length > 0) {
      warnings.push(`⚠ Unknown placeholders will ship as literal text:\n  ${v.unknownPlaceholders.join(', ')}`);
    }
    if (!v.hasPersonalisation) {
      warnings.push('⚠ No personalisation placeholders detected — every recipient will get identical content.');
    }
    if (v.fallbackFirstNameCount > 0) {
      warnings.push(`⚠ ${v.fallbackFirstNameCount} of ${v.recipientCount} recipients (${v.fallbackAffectsPct}%) have no firstName and will see the "there" fallback.`);
    }

    const confirmed = window.confirm(
      `${warnings.length ? warnings.join('\n\n') + '\n\n' : ''}Send email to ${customers.length} customer${customers.length === 1 ? '' : 's'}?\n\nSubject: ${subject}\n\nThis action cannot be undone.`
    );
    if (!confirmed) return;

    setSending(true);
    setMsg(null);


    try {
      // Enqueue via server route (uses Firebase Admin SDK — bypasses
      // client-side Firestore rules that previously failed with
      // "Missing or insufficient permissions"). Writes to BOTH `mail`
      // (Trigger Email extension sends) and `emailQueue` (audit trail).
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not signed in as admin');

      const res = await fetch('/api/public/send-marketing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idToken,
          subject: subject.trim(),
          html: body.trim(),
          recipients: customers.map(c => ({
            email: c.email,
            firstName: c.firstName || undefined,
            lastName: c.lastName || undefined,
            name: c.firstName ? `${c.firstName} ${c.lastName || ''}`.trim() : undefined,
          })),
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.ok) {
        throw new Error(result.error || result.detail || `HTTP ${res.status}`);
      }

      const missingFirstName = customers.filter(c => !(c.firstName || '').trim()).length;
      await logAdminAction({
        action: 'marketing.campaign.send',
        target: `marketing/campaign/${Date.now()}`,
        meta: {
          subject: subject.trim(),
          recipientCount: customers.length,
          enqueued: result.enqueued ?? 0,
          failed: result.failed ?? 0,
          fallbackFirstNameCount: missingFirstName,
        },
      });

      setMsg({
        type: 'success',
        text: `Campaign queued for ${result.enqueued} recipient${result.enqueued === 1 ? '' : 's'}${result.failed ? ` (${result.failed} failed)` : ''}. ${missingFirstName} got the "there" fallback (no first name).`,
      });
      setTimeout(() => setMsg(null), 10000);
      loadHistory();

    } catch (e: any) {
      setMsg({ type: 'error', text: 'Failed to queue campaign: ' + (e?.message || 'unknown error') });
    } finally {
      setSending(false);
    }
  };

  const requeuePendingMarketing = async () => {
    const pendingSubject = recentEmails.find(e => e.status === 'pending')?.subject;
    if (!pendingSubject) {
      setMsg({ type: 'error', text: 'No pending marketing campaign found to repair.' });
      return;
    }
    if (!window.confirm(`Requeue pending emails for this campaign?\n\n${pendingSubject}`)) return;
    setRepairingQueue(true);
    setMsg(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not signed in as admin');
      const res = await fetch('/api/public/send-marketing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken, requeuePending: true, subject: pendingSubject, sinceHours: 72, limit: 1000 }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.ok) throw new Error(result.error || result.detail || `HTTP ${res.status}`);
      await logAdminAction({
        action: 'marketing.campaign.requeue',
        target: `marketing/requeue/${Date.now()}`,
        meta: { subject: pendingSubject, requeued: result.requeued ?? 0, duplicates: result.duplicates ?? 0 },
      });
      setMsg({
        type: 'success',
        text: `Requeued ${result.requeued || 0} stuck email${result.requeued === 1 ? '' : 's'}${result.duplicates ? ` (${result.duplicates} already in send queue)` : ''}.`,
      });
      setTimeout(() => setMsg(null), 8000);
      loadHistory();
    } catch (e: any) {
      setMsg({ type: 'error', text: 'Failed to requeue campaign: ' + (e?.message || 'unknown error') });
    } finally {
      setRepairingQueue(false);
    }
  };

  const handleSendTest = async () => {
    const emails = testRecipients
      .split(/[,\s;]+/)
      .map(s => s.trim().toLowerCase())
      .filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
    if (!subject.trim() || !body.trim()) {
      setMsg({ type: 'error', text: 'Subject and body are required.' });
      return;
    }
    if (emails.length === 0) {
      setMsg({ type: 'error', text: 'Enter at least one valid test email address.' });
      return;
    }
    setSendingTest(true);
    setMsg(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not signed in as admin');
      // Match test emails to a known customer so [First Name] resolves; fall back to the local-part.
      const recipients = emails.map(email => {
        const match = customers.find(c => c.email?.toLowerCase() === email);
        const localGuess = email.split('@')[0].split(/[._-]/)[0];
        const firstName = match?.firstName || (localGuess ? localGuess[0].toUpperCase() + localGuess.slice(1) : undefined);
        const lastName = match?.lastName || undefined;
        return {
          email,
          firstName,
          lastName,
          name: firstName ? `${firstName} ${lastName || ''}`.trim() : undefined,
        };
      });
      const res = await fetch('/api/public/send-marketing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idToken,
          subject: `[TEST] ${subject.trim()}`,
          html: body.trim(),
          recipients,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.ok) throw new Error(result.error || result.detail || `HTTP ${res.status}`);
      await logAdminAction({
        action: 'marketing.campaign.test',
        target: `marketing/test/${Date.now()}`,
        meta: {
          subject: subject.trim(),
          recipients: emails,
          enqueued: result.enqueued ?? 0,
        },
      });
      setMsg({
        type: 'success',
        text: `Test sent to ${result.enqueued} address${result.enqueued === 1 ? '' : 'es'}: ${emails.join(', ')}. Arrives within 1–2 min.`,
      });
      setTimeout(() => setMsg(null), 10000);
      loadHistory();
    } catch (e: any) {
      setMsg({ type: 'error', text: 'Test send failed: ' + (e?.message || 'unknown error') });
    } finally {
      setSendingTest(false);
    }
  };

  // Build 3 personalisation samples from real customers (or synthetic if none) so admin
  // can see how [First Name] renders per recipient before sending.
  const previewSamples = (() => {
    const base = customers.filter(c => c.email).slice(0, 3);
    const fallback = [
      { id: 'x1', email: 'anna.kowalska@example.com', firstName: 'Anna', lastName: 'Kowalska' },
      { id: 'x2', email: 'john@example.com', firstName: 'John', lastName: '' },
      { id: 'x3', email: 'noname@example.com', firstName: '', lastName: '' },
    ] as Customer[];
    const list = base.length > 0 ? base : fallback;
    return list.map(c => {
      const firstName = (c.firstName || '').trim();
      const lastName = (c.lastName || '').trim();
      const fullName = `${firstName} ${lastName}`.trim();
      const vars = {
        firstName: firstName || 'there',
        lastName,
        fullName: fullName || firstName || 'there',
        email: c.email,
      };
      return {
        email: c.email,
        rawFirstName: firstName || '(missing)',
        subject: personalisePreview(subject, vars),
        body: personalisePreview(body, vars),
      };
    });
  })();

  // Filtered recipient list for the "preview as recipient" picker.
  const previewSearchLc = previewSearch.trim().toLowerCase();
  const previewCandidates = customers
    .filter(c => c.email)
    .filter(c => {
      if (!previewSearchLc) return true;
      return (
        c.email.toLowerCase().includes(previewSearchLc) ||
        (c.firstName || '').toLowerCase().includes(previewSearchLc) ||
        (c.lastName || '').toLowerCase().includes(previewSearchLc)
      );
    })
    .slice(0, 50);

  const selectedRecipient = customers.find(c => c.id === selectedPreviewId) || previewCandidates[0] || null;

  const selectedPreview = (() => {
    if (!selectedRecipient) return null;
    const firstName = (selectedRecipient.firstName || '').trim();
    const lastName = (selectedRecipient.lastName || '').trim();
    const fullName = `${firstName} ${lastName}`.trim();
    const vars = {
      firstName: firstName || 'there',
      lastName,
      fullName: fullName || firstName || 'there',
      email: selectedRecipient.email,
    };
    return {
      email: selectedRecipient.email,
      rawFirstName: firstName || '(missing)',
      rawLastName: lastName || '(missing)',
      subject: personalisePreview(subject, vars),
      body: personalisePreview(body, vars),
    };
  })();

  // Personalisation coverage — how many recipients will get the "there" fallback
  // because their firstName is missing/blank in Firestore.
  const emailedCustomers = customers.filter(c => c.email);
  const missingFirstName = emailedCustomers.filter(c => !(c.firstName || '').trim());
  const missingLastName = emailedCustomers.filter(c => !(c.lastName || '').trim());
  const missingBoth = emailedCustomers.filter(
    c => !(c.firstName || '').trim() && !(c.lastName || '').trim(),
  );
  const totalEmailable = emailedCustomers.length;
  const fallbackPct = totalEmailable > 0
    ? Math.round((missingFirstName.length / totalEmailable) * 100)
    : 0;
  const [showFallbackList, setShowFallbackList] = useState(false);

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
                    {sub.source || 'unknown'} · {(() => {
                      const raw = sub.subscribedAt;
                      const d = raw?.toDate ? raw.toDate() : (raw?.seconds ? new Date(raw.seconds * 1000) : (raw ? new Date(raw) : null));
                      return d && !isNaN(d.getTime()) ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
                    })()}
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

      {/* Personalisation coverage — highlights recipients who will get the "there" fallback */}
      <div className="bg-[#0b1a30]/70 border border-white/[0.08] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-white font-bold flex items-center gap-2 text-sm">
              <UserX className="w-4 h-4 text-amber-400" />
              Personalisation coverage
            </h2>
            <p className="text-[#7591b8] text-xs mt-1">
              How many recipients have a name on file and how many will receive the <span className="font-mono text-amber-300">there</span> fallback.
            </p>
          </div>
          <button
            type="button"
            onClick={loadCustomers}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors"
            aria-label="Refresh customer data"
          >
            <RefreshCw className="w-4 h-4 text-[#9cb8d9]" />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-[#04101f]/60 border border-white/5 rounded-xl p-3">
            <p className="text-[#7591b8] text-[10px] uppercase tracking-wider">Total recipients</p>
            <p className="text-white text-xl font-bold mt-1">{totalEmailable}</p>
          </div>
          <div className="bg-[#04101f]/60 border border-amber-500/20 rounded-xl p-3">
            <p className="text-amber-300 text-[10px] uppercase tracking-wider">Missing firstName</p>
            <p className="text-amber-300 text-xl font-bold mt-1">
              {missingFirstName.length}
              <span className="text-amber-300/60 text-xs font-normal ml-1">({fallbackPct}%)</span>
            </p>
          </div>
          <div className="bg-[#04101f]/60 border border-white/5 rounded-xl p-3">
            <p className="text-[#7591b8] text-[10px] uppercase tracking-wider">Missing lastName</p>
            <p className="text-white text-xl font-bold mt-1">{missingLastName.length}</p>
          </div>
          <div className="bg-[#04101f]/60 border border-red-500/20 rounded-xl p-3">
            <p className="text-red-300 text-[10px] uppercase tracking-wider">Missing both</p>
            <p className="text-red-300 text-xl font-bold mt-1">{missingBoth.length}</p>
          </div>
        </div>

        {missingFirstName.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowFallbackList(v => !v)}
              className="flex items-center gap-2 text-xs text-amber-300 hover:text-amber-200 transition-colors"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFallbackList ? 'rotate-180' : ''}`} />
              {showFallbackList ? 'Hide' : 'Show'} {missingFirstName.length} recipient{missingFirstName.length === 1 ? '' : 's'} that will get the "there" fallback
            </button>
            <AnimatePresence>
              {showFallbackList && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 max-h-64 overflow-y-auto space-y-1 bg-[#04101f]/60 rounded-xl border border-white/5 p-2">
                    {missingFirstName.map(c => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5"
                      >
                        <span className="text-white text-xs font-mono truncate">{c.email}</span>
                        <span className="text-[10px] text-[#7591b8] shrink-0">
                          {c.lastName ? `lastName: ${c.lastName}` : 'no name on file'}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

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

            {/* Test send — verify [First Name] substitution before broadcasting */}
            <div className="bg-[#04101f]/60 border border-white/10 rounded-xl p-4 space-y-2">
              <label className="block text-white text-xs font-semibold flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                Send test to a few addresses
              </label>
              <p className="text-[#7591b8] text-[11px]">
                Comma-separated emails. Subject is prefixed with <span className="text-amber-300 font-mono">[TEST]</span>. Uses the same personalisation pipeline as the real send.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={testRecipients}
                  onChange={e => setTestRecipients(e.target.value)}
                  placeholder="you@example.com, other@example.com"
                  className="flex-1 bg-white border border-gray-300 text-gray-900 text-sm placeholder-gray-400 py-2 px-3 rounded-lg focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 transition-colors"
                />
                <button
                  type="button"
                  onClick={handleSendTest}
                  disabled={sendingTest || !subject.trim() || !body.trim() || !testRecipients.trim()}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 rounded-lg text-sm font-semibold transition-colors"
                >
                  {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {sendingTest ? 'Sending…' : 'Send test'}
                </button>
              </div>
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
                onClick={() => runValidation()}
                disabled={validating || !subject.trim() || !body.trim() || !customerCount}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {validating ? 'Checking…' : 'Validate placeholders'}
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

            {/* Validation report */}
            {validation && (
              <div className={`mt-3 rounded-xl border p-4 space-y-2 text-xs ${
                validation.unknownPlaceholders.length > 0
                  ? 'bg-red-500/10 border-red-500/30 text-red-200'
                  : validation.hasPersonalisation && validation.fallbackFirstNameCount === 0
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
              }`}>
                <div className="flex items-center gap-2 font-semibold">
                  {validation.unknownPlaceholders.length > 0
                    ? <><AlertCircle className="w-4 h-4" /> Placeholder issues detected</>
                    : validation.hasPersonalisation && validation.fallbackFirstNameCount === 0
                      ? <><CheckCircle2 className="w-4 h-4" /> All placeholders will resolve for every recipient</>
                      : <><AlertCircle className="w-4 h-4" /> Placeholder warnings</>}
                </div>
                <ul className="space-y-1 pl-1">
                  <li>
                    Known placeholders:{' '}
                    {validation.knownPlaceholders.length === 0
                      ? <span className="italic opacity-70">none (no personalisation)</span>
                      : validation.knownPlaceholders.map(p => (
                          <span key={p} className="inline-block font-mono bg-black/20 px-1.5 py-0.5 rounded mr-1">{p}</span>
                        ))}
                  </li>
                  {validation.unknownPlaceholders.length > 0 && (
                    <li>
                      Unknown (will ship as literal text):{' '}
                      {validation.unknownPlaceholders.map(p => (
                        <span key={p} className="inline-block font-mono bg-red-950/40 border border-red-500/40 px-1.5 py-0.5 rounded mr-1">{p}</span>
                      ))}
                    </li>
                  )}
                  <li>
                    Fallback "there" will be used for{' '}
                    <span className="font-semibold">{validation.fallbackFirstNameCount}</span>{' '}
                    of <span className="font-semibold">{validation.recipientCount}</span>{' '}
                    recipients ({validation.fallbackAffectsPct}%).
                  </li>
                  {validation.fallbackEmailsSample.length > 0 && (
                    <li className="opacity-80">
                      Sample: <span className="font-mono">{validation.fallbackEmailsSample.slice(0, 5).join(', ')}</span>
                      {validation.fallbackFirstNameCount > 5 && ` +${validation.fallbackFirstNameCount - 5} more`}
                    </li>
                  )}
                </ul>
              </div>
            )}
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
                <div className="space-y-3">
                  {/* Preview as a specific recipient */}
                  <div className="bg-[#0b1a30]/70 border border-white/10 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-emerald-400" />
                      <h4 className="text-white text-xs font-semibold">Preview as recipient</h4>
                      <span className="ml-auto text-[10px] text-[#7591b8]">{previewCandidates.length} of {customers.length}</span>
                    </div>
                    <input
                      type="text"
                      value={previewSearch}
                      onChange={e => { setPreviewSearch(e.target.value); setSelectedPreviewId(''); }}
                      placeholder="Search by name or email…"
                      className="w-full bg-white border border-gray-300 text-gray-900 text-xs placeholder-gray-400 py-2 px-3 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                    <select
                      value={selectedRecipient?.id || ''}
                      onChange={e => setSelectedPreviewId(e.target.value)}
                      className="w-full bg-white border border-gray-300 text-gray-900 text-xs py-2 px-3 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    >
                      {previewCandidates.length === 0 && <option value="">No customers loaded</option>}
                      {previewCandidates.map(c => (
                        <option key={c.id} value={c.id}>
                          {(c.firstName || '(no first name)')} {c.lastName || ''} — {c.email}
                        </option>
                      ))}
                    </select>
                    {selectedPreview && (
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="bg-[#04101f]/60 rounded-lg px-2 py-1.5">
                          <p className="text-[#7591b8] uppercase tracking-wider">firstName</p>
                          <p className={`font-mono mt-0.5 ${selectedPreview.rawFirstName === '(missing)' ? 'text-red-400' : 'text-emerald-300'}`}>{selectedPreview.rawFirstName}</p>
                        </div>
                        <div className="bg-[#04101f]/60 rounded-lg px-2 py-1.5">
                          <p className="text-[#7591b8] uppercase tracking-wider">lastName</p>
                          <p className={`font-mono mt-0.5 ${selectedPreview.rawLastName === '(missing)' ? 'text-red-400' : 'text-emerald-300'}`}>{selectedPreview.rawLastName}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {selectedPreview && (
                    <div className="bg-white rounded-2xl p-5 space-y-3">
                      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        <span>Selected recipient</span>
                        <span className="text-gray-400 normal-case font-mono truncate max-w-[60%]" title={selectedPreview.email}>{selectedPreview.email}</span>
                      </div>
                      <div className="border-b border-gray-200 pb-2">
                        <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider">Subject</p>
                        <p className="text-gray-900 text-sm font-semibold mt-0.5">{selectedPreview.subject || '(no subject)'}</p>
                      </div>
                      <pre className="text-gray-800 text-xs leading-relaxed whitespace-pre-wrap font-sans max-h-96 overflow-y-auto">
                        {selectedPreview.body || '(empty)'}
                      </pre>
                    </div>
                  )}

                  <div className="text-[10px] text-[#7591b8] uppercase tracking-wider px-1 pt-2">First 3 customers (auto-sample)</div>
                  {previewSamples.map((s, i) => (
                    <div key={s.email + i} className="bg-white rounded-2xl p-5 space-y-3">
                      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        <span>Recipient {i + 1}</span>
                        <span className="text-gray-400 normal-case font-mono truncate max-w-[60%]" title={s.email}>{s.email}</span>
                      </div>
                      <div className="text-[10px] text-gray-500">
                        First name in DB: <span className={`font-mono ${s.rawFirstName === '(missing)' ? 'text-red-500' : 'text-emerald-600'}`}>{s.rawFirstName}</span>
                      </div>
                      <div className="border-b border-gray-200 pb-2">
                        <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider">Subject</p>
                        <p className="text-gray-900 text-sm font-semibold mt-0.5">{s.subject || '(no subject)'}</p>
                      </div>
                      <pre className="text-gray-800 text-xs leading-relaxed whitespace-pre-wrap font-sans max-h-72 overflow-y-auto">
                        {s.body || '(empty)'}
                      </pre>
                    </div>
                  ))}
                  <p className="text-[#7591b8] text-[10px] px-1">
                    Substitution uses the same rules as the send route: <span className="font-mono">[First Name]</span>, <span className="font-mono">{'{{firstName}}'}</span>, <span className="font-mono">[Name]</span> etc. Empty first names fall back to <span className="font-mono">there</span>.
                  </p>
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
                Emails are written to the <span className="text-white font-medium mx-1">mail</span> send queue and tracked in <span className="text-white font-medium mx-1">emailQueue</span> history.
              </li>
              <li className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>
                The SMTP trigger monitors <span className="text-white font-medium mx-1">mail</span> and sends each email.
              </li>
              <li className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>
                Delivery status appears in Email Queue &amp; Delivery once the trigger processes each row.
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
              <button
                type="button"
                onClick={requeuePendingMarketing}
                disabled={repairingQueue || !recentEmails.some(e => e.status === 'pending')}
                className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {repairingQueue ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Requeue stuck
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
