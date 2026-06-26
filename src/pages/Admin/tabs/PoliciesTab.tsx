import { useState, useEffect } from 'react';
import { FileText, Save, AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { db, doc, getDoc, setDoc, triggerContentCdnInvalidation } from '@/lib/firebase';

// ── Default content pulled from the static pages ──────────────────────────────
const DEFAULT_TERMS = `TERMS & CONDITIONS — PH Labs UK
Last updated: ${new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}

1. AGREEMENT TO TERMS
By accessing and placing an order with PH Labs ("we", "us", "our"), you confirm that you are in agreement with and bound by the terms and conditions contained herein. These Terms apply to all visitors, users, and customers of the website located at phlabs.co.uk (the "Site"). If you do not agree to these Terms, you must immediately cease use of the Site.

2. PRODUCTS AND SERVICES — RESEARCH USE ONLY
All products are supplied strictly for research purposes only. They are NOT intended for human consumption, self-administration, medical use, or any therapeutic application. Products must not be used in clinical trials involving human subjects without appropriate regulatory approval.

Buyer Eligibility: By purchasing, you confirm that you are at least 18 years of age, a qualified researcher, scientist, or acting on behalf of a licensed research institution, and that you understand and agree to the research-only restriction.

3. ORDERING AND CONTRACT
An order placed through the Site constitutes an offer to purchase. No contract exists until we send you an Order Confirmation email. We reserve the right to refuse or cancel any order at our discretion.

4. PRICING AND PAYMENT
All prices are in GBP (£) and include applicable VAT unless stated otherwise. Prices may change without notice. We accept payment via Pay by Bank (Open Banking) and bank transfer.

5. SHIPPING AND DELIVERY
We aim to dispatch orders within 1–3 working days. UK delivery is typically 1–2 working days after dispatch. International shipping may be subject to customs delays. Risk passes to you upon delivery. See our Shipping Policy for full details.

6. RETURNS AND REFUNDS
Due to the nature of research chemicals, returns are only accepted for: items arrived damaged or incorrectly sent. Requests must be made within 48 hours of delivery with photographic evidence.

7. LIMITATION OF LIABILITY
Our total liability is limited to the order value. We are not liable for any indirect, consequential, or incidental damages arising from use of our products or services.

8. GOVERNING LAW
These Terms are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.

9. CONTACT
PH Labs UK — info@phlabs.co.uk — phlabs.co.uk`;

const DEFAULT_PRIVACY = `PRIVACY POLICY — PH Labs UK
Last updated: ${new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}

1. INTRODUCTION
PH Labs ("we", "us") is committed to protecting your personal data. This Privacy Policy explains how we collect, use, and safeguard your information when you use our website phlabs.co.uk.

2. DATA WE COLLECT
- Account data: name, email address, password (hashed)
- Order data: shipping address, billing address, order history
- Payment data: processed by our regulated Open Banking provider — we never store card details
- Usage data: pages visited, browser type, IP address (via analytics)
- Communications: messages you send us via email or contact form

3. HOW WE USE YOUR DATA
- To process and fulfil your orders
- To send transactional emails (order confirmation, shipping updates)
- To manage your account
- To comply with legal obligations
- To improve our website and services

4. LEGAL BASIS (GDPR)
We process your data on the following lawful bases:
- Contract performance: to fulfil orders you place
- Legal obligation: VAT records, fraud prevention
- Legitimate interests: website security and analytics
- Consent: marketing emails (opt-in only)

5. DATA RETENTION
- Order data: 7 years (UK tax law)
- Account data: until account deletion requested
- Analytics data: 26 months

6. YOUR RIGHTS
Under GDPR you have the right to: access your data, correct inaccurate data, request deletion, object to processing, and data portability. To exercise these rights, email: info@phlabs.co.uk

7. THIRD PARTIES
- FCA-regulated Open Banking provider: payment processing
- Firebase/Google: hosting and database
- Analytics providers: anonymised usage data

8. COOKIES
We use essential cookies for site functionality and analytics cookies (with your consent). You may withdraw cookie consent at any time via the cookie banner.

9. CONTACT
Data Controller: PH Labs UK — info@phlabs.co.uk`;

const DEFAULT_SHIPPING = `SHIPPING & DELIVERY POLICY — PH Labs UK
Last updated: ${new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}

1. ORDER PROCESSING
Orders are typically processed within 1–3 working days. Orders placed before 2pm on working days may be dispatched the same day. Working days: Monday–Friday, excluding UK public holidays.

2. UK SHIPPING OPTIONS
- Standard (Royal Mail 2nd Class): 2–3 working days — FREE on orders over £50, otherwise £3.99
- Tracked (Royal Mail 1st Class Tracked): 1–2 working days — £5.99
- Express (Next Day Courier): Next working day if ordered before 2pm — £9.99

3. INTERNATIONAL SHIPPING
We currently ship to EU countries and select international destinations. International orders are subject to customs clearance, which may cause delays beyond our control. Import duties and taxes are the buyer's responsibility.

4. PACKAGING
All orders are dispatched in thermally sealed bags to protect compounds during transit. No ice packs are included. Lyophilised peptides are stable at ambient temperature for the duration of standard UK domestic delivery. Upon receipt, store immediately at the temperature specified on the product page.

5. TRACKING
All tracked orders receive a tracking number via email upon dispatch. You can track your order via the carrier's website or in your account dashboard.

6. LOST OR DAMAGED PARCELS
If your parcel is lost, please contact us within 10 working days of the expected delivery date. Damaged items must be reported within 48 hours of delivery with photographic evidence. We will arrange a replacement or refund as appropriate.

7. ADDRESS ERRORS
Please ensure your shipping address is correct at checkout. We are not liable for orders lost or delayed due to incorrect address information provided by the customer.

8. RETURNS
Returns accepted within 48 hours for damaged or incorrectly supplied items only. Due to the nature of research chemicals, we cannot accept returns for change of mind.

CONTACT: info@phlabs.co.uk — phlabs.co.uk`;

interface Policies {
  termsContent?: string;
  privacyContent?: string;
  shippingContent?: string;
  updatedAt?: any;
}

const DEFAULTS: Record<string, string> = {
  termsContent: DEFAULT_TERMS,
  privacyContent: DEFAULT_PRIVACY,
  shippingContent: DEFAULT_SHIPPING,
};

export default function PoliciesTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [policies, setPolicies] = useState<Policies>({});
  const [activeTab, setActiveTab] = useState<'terms' | 'privacy' | 'shipping'>('terms');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'siteSettings', 'policies'));
      if (snap.exists()) {
        setPolicies(snap.data() as Policies);
      } else {
        // Load defaults so user sees content immediately
        setPolicies({
          termsContent: DEFAULT_TERMS,
          privacyContent: DEFAULT_PRIVACY,
          shippingContent: DEFAULT_SHIPPING,
        });
      }
    } catch (e: any) {
      // On permission error, still show defaults so user can edit
      setPolicies({
        termsContent: DEFAULT_TERMS,
        privacyContent: DEFAULT_PRIVACY,
        shippingContent: DEFAULT_SHIPPING,
      });
      const msg = String(e?.message || '').toLowerCase();
      if (msg.includes('permission') || msg.includes('denied')) {
        showToast('⚠️ Firebase permissions needed — deploy Firestore Rules', false);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Compliance guard — block forbidden medical/health claims in policy copy.
    const { checkComplianceAndLog } = await import('@/lib/compliance-guard');
    for (const field of ['termsContent', 'privacyContent', 'shippingContent'] as const) {
      const c = checkComplianceAndLog(field, (policies as any)[field], {
        collection: 'siteSettings/policies',
      });
      if (!c.ok) { showToast(c.message, false); return; }
    }
    setSaving(true);
    try {
      await setDoc(doc(db, 'siteSettings', 'policies'), {
        ...policies,
        updatedAt: new Date().toISOString(),
      });
      const policyPaths = ['/terms', '/privacy', '/cookies', '/returns', '/shipping', '/research-use-only'];
      triggerContentCdnInvalidation(policyPaths);
      // Auto-ping IndexNow for the updated policy URLs (best-effort, silent).
      try {
        const { submitToIndexNow } = await import('@/lib/indexnow.functions');
        const urls = policyPaths.map(p => `https://phlabs.co.uk${p}`);
        submitToIndexNow({ data: { urls } }).catch(() => {});
      } catch { /* best-effort */ }
      showToast('Policies saved successfully!');
    } catch (e: any) {
      showToast(e?.message || 'Save failed', false);
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { key: 'terms' as const, label: 'Terms & Conditions', field: 'termsContent' },
    { key: 'privacy' as const, label: 'Privacy Policy', field: 'privacyContent' },
    { key: 'shipping' as const, label: 'Shipping Policy', field: 'shippingContent' },
  ];

  const activeField = tabs.find(t => t.key === activeTab)?.field || 'termsContent';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-400" /> Legal Policies
          </h1>
          <p className="text-[#9cb8d9] text-sm mt-0.5">
            Edit Terms, Privacy, and Shipping policies (plain text or HTML supported)
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" /> Save All
            </>
          )}
        </button>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border ${
              toast.ok
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}
          >
            {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
        </div>
      ) : (
        <>
          {/* Tab Navigation */}
          <div className="flex gap-2 border-b border-white/[0.08]">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-[#9cb8d9] hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Editor */}
          <div className="bg-[#0b1a30]/60 border border-white/[0.08] rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-semibold text-white">
                {tabs.find(t => t.key === activeTab)?.label} Content
              </label>
              <button
                onClick={() => setPolicies(prev => ({ ...prev, [activeField]: DEFAULTS[activeField] }))}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0b1a30] border border-white/[0.1] hover:border-blue-500/50 text-[#9cb8d9] hover:text-blue-400 rounded-lg text-xs font-medium transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Load Default Content
              </button>
            </div>
            <textarea
              value={policies[activeField as keyof Policies] || ''}
              onChange={(e) => setPolicies(prev => ({ ...prev, [activeField]: e.target.value }))}
              className="w-full h-[calc(100vh-450px)] min-h-[400px] px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] font-mono leading-relaxed resize-none focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)]"
              placeholder={`Enter ${tabs.find(t => t.key === activeTab)?.label.toLowerCase()} content here...\n\nYou can use plain text or basic HTML tags like <p>, <strong>, <ul>, <li>, etc.`}
            />
            <p className="text-[#3a5a82] text-xs mt-3">
              💡 Tip: Use basic HTML for formatting. Changes save to Firebase and will be displayed on the live site.
            </p>
          </div>

          {/* Info Box */}
          <div className="flex items-start gap-3 p-4 bg-blue-900/20 border border-blue-500/20 rounded-xl">
            <AlertCircle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-blue-300">Important Notes</p>
              <ul className="text-xs text-[#8cabd8] space-y-1 list-disc list-inside">
                <li>These policies are legally binding — ensure accuracy before publishing</li>
                <li>If you leave a field empty, the default hardcoded policy will display</li>
                <li>Changes take effect immediately after saving</li>
                <li>Consider consulting a legal professional for compliance</li>
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
