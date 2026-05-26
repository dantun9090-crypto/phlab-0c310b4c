import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mail, RefreshCw, Send, Clock, CheckCircle2,
  AlertCircle, Loader2, Bell, XCircle, Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, collection, addDoc, getDocs, query, where, Timestamp } from '@/lib/firebase';

// Email template builders
import { buildWelcomeEmail } from '@/templates/welcomeEmail';
import { buildOrderStatusEmail } from '@/templates/orderStatusEmail';
import { buildDispatchEmail } from '@/templates/dispatchEmail';
import { buildProfessionalInvoiceEmail } from '@/templates/professionalInvoiceEmail';
import { buildContactFormEmail } from '@/templates/contactFormEmail';
import { buildReferralRewardEmail } from '@/templates/referralRewardEmail';
import { buildAdminInvoiceEmail } from '@/templates/adminInvoiceEmail';
import { buildPaymentReminderEmail } from '@/templates/paymentReminderEmail';
import { buildCancellationEmail } from '@/templates/cancellationEmail';
import { protocolLibraryEmail } from '@/templates/protocolLibraryEmail';

// ── LocalStorage key for daily auto-scan ──────────────────────────────────
const AUTO_SCAN_KEY = 'php_reminder_last_auto_scan';
const CANCEL_SCAN_KEY = 'php_cancel_last_auto_scan';
const AUTO_SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

// ── Demo data ──────────────────────────────────────────────────────────────
const DEMO_ITEMS = [
  { name: 'BPC-157', variantName: '5mg', quantity: 2, priceNum: 34.99 },
  { name: 'TB-500', variantName: '2mg', quantity: 1, priceNum: 29.99 },
];
const DEMO_ORDER_ID = 'ord_demo1234567890';

function buildPreview(templateId: string): string {
  switch (templateId) {
    case 'welcome':
      return buildWelcomeEmail({ firstName: 'James', email: 'james@example.com' });
    case 'order_processing':
      return buildOrderStatusEmail({ firstName: 'James', email: 'james@example.com', orderId: DEMO_ORDER_ID, status: 'processing', items: DEMO_ITEMS, totalAmount: 99.97 });
    case 'order_paid':
      return buildOrderStatusEmail({ firstName: 'James', email: 'james@example.com', orderId: DEMO_ORDER_ID, status: 'paid', items: DEMO_ITEMS, totalAmount: 99.97 });
    case 'order_shipped':
      return buildOrderStatusEmail({ firstName: 'James', email: 'james@example.com', orderId: DEMO_ORDER_ID, status: 'shipped', items: DEMO_ITEMS, totalAmount: 99.97, trackingNumber: 'TK123456789GB', courierName: 'Royal Mail', estimatedDelivery: 'Mon 3 Feb' });
    case 'order_delivered':
      return buildOrderStatusEmail({ firstName: 'James', email: 'james@example.com', orderId: DEMO_ORDER_ID, status: 'delivered', items: DEMO_ITEMS, totalAmount: 99.97 });
    case 'order_canceled':
      return buildOrderStatusEmail({ firstName: 'James', email: 'james@example.com', orderId: DEMO_ORDER_ID, status: 'canceled', items: DEMO_ITEMS, totalAmount: 99.97 });
    case 'order_refunded':
      return buildOrderStatusEmail({ firstName: 'James', email: 'james@example.com', orderId: DEMO_ORDER_ID, status: 'refunded', items: DEMO_ITEMS, totalAmount: 99.97 });
    case 'dispatch':
      return buildDispatchEmail({ firstName: 'James', orderId: DEMO_ORDER_ID, items: DEMO_ITEMS, totalAmount: 99.97, trackingNumber: 'TK123456789GB', courier: 'Royal Mail', estimatedDelivery: 'Mon 3 Feb', trackingUrl: 'https://www.royalmail.com/track-your-item' });
    case 'invoice_bank':
      return buildProfessionalInvoiceEmail({ firstName: 'James', orderId: DEMO_ORDER_ID, items: DEMO_ITEMS, subtotal: 99.97, discount: 0, shipping: 0, total: 99.97, paymentMethod: 'bank_transfer', bankTransferRef: DEMO_ORDER_ID.slice(-8).toUpperCase(), bankName: 'PH Labs Ltd', bankSortCode: '30-94-52', bankAccountNumber: '12345678' });
    case 'invoice_card':
      return buildProfessionalInvoiceEmail({ firstName: 'James', orderId: DEMO_ORDER_ID, items: DEMO_ITEMS, subtotal: 99.97, discount: 0, shipping: 0, total: 99.97, paymentMethod: 'card' });
    case 'payment_reminder':
      return buildPaymentReminderEmail({ firstName: 'James', orderId: DEMO_ORDER_ID, totalAmount: 99.97, bankName: 'PH Labs Ltd', sortCode: '30-94-52', accountNumber: '12345678', reference: DEMO_ORDER_ID.slice(-8).toUpperCase(), hoursElapsed: 27 });
    case 'cancellation':
      return buildCancellationEmail({ firstName: 'James', orderId: DEMO_ORDER_ID, totalAmount: 99.97, items: DEMO_ITEMS, hoursElapsed: 72 });
    case 'contact':
      return buildContactFormEmail({ senderName: 'James Smith', senderEmail: 'james@example.com', subject: 'Question about BPC-157', message: 'Hi, I had a question about the storage requirements for your BPC-157 5mg product. Could you let me know what temperature range is required?' });
    case 'referral_earned':
      return buildReferralRewardEmail({ firstName: 'James', newReferralBalance: 5, referralCount: 1 });
    case 'referral_redemption':
      return buildReferralRewardEmail({ firstName: 'James', newReferralBalance: 0, isRedemption: true, couponCode: 'REWARD-JAMES-XK9', couponValue: 15 });
    case 'admin_invoice':
      return buildAdminInvoiceEmail({ customerName: 'James Smith', email: 'james@example.com', invoiceRef: 'INV-' + DEMO_ORDER_ID.slice(-8).toUpperCase(), description: 'Research peptide order', amount: 99.97, currency: 'GBP' });
    case 'protocol_library':
      return protocolLibraryEmail({ recipientEmail: 'james@example.com', discountCode: 'PROTOCOL10', pdfDownloadUrl: 'https://www.phlabs.co.uk/protocol-library.pdf' });
    default:
      return '<p>Template not found</p>';
  }
}

// ── Template list ──────────────────────────────────────────────────────────
const TEMPLATES = [
  { id: 'welcome', label: 'Welcome Email', description: 'Sent when a new account is created', group: 'Account', trigger: 'On registration' },
  { id: 'invoice_bank', label: 'Invoice (Bank Transfer)', description: 'Sent with bank transfer payment instructions', group: 'Orders', trigger: 'On order placed (bank)' },
  { id: 'invoice_card', label: 'Invoice (Open Banking)', description: 'Sent after Open Banking / TrueLayer checkout', group: 'Orders', trigger: 'On order placed (card)' },
  { id: 'payment_reminder', label: 'Payment Reminder', description: '24h reminder for unpaid bank transfer orders', group: 'Orders', trigger: 'Auto: 24h after pending order' },
  { id: 'cancellation', label: 'Auto-Cancellation', description: '72h cancellation notice — order cancelled after no payment', group: 'Orders', trigger: 'Auto: 72h after pending order' },
  { id: 'order_processing', label: 'Order Processing', description: 'Sent when order status → Processing', group: 'Order Status', trigger: 'Admin status change' },
  { id: 'order_paid', label: 'Payment Confirmed', description: 'Sent when payment is verified', group: 'Order Status', trigger: 'Admin status change' },
  { id: 'order_shipped', label: 'Order Dispatched', description: 'Sent when tracking number is added', group: 'Order Status', trigger: 'Admin dispatch action' },
  { id: 'order_delivered', label: 'Order Delivered', description: 'Sent when status → Delivered', group: 'Order Status', trigger: 'Admin status change' },
  { id: 'order_canceled', label: 'Order Cancelled', description: 'Sent when order is cancelled', group: 'Order Status', trigger: 'Admin status change' },
  { id: 'order_refunded', label: 'Refund Processed', description: 'Sent when a refund is issued', group: 'Order Status', trigger: 'Admin status change' },
  { id: 'dispatch', label: 'Dispatch Notification', description: 'Rich dispatch email with tracking details', group: 'Orders', trigger: 'Admin dispatch action' },
  { id: 'contact', label: 'Contact Form (Admin)', description: 'Notification to admin from contact form', group: 'Support', trigger: 'Customer contact form' },
  { id: 'referral_earned', label: 'Referral Reward Earned', description: 'Sent when referrer earns £5', group: 'Referrals', trigger: 'On qualifying referral purchase' },
  { id: 'referral_redemption', label: 'Referral Code Redeemed', description: 'Sent when referral balance → discount code', group: 'Referrals', trigger: 'On referral balance redemption' },
  { id: 'admin_invoice', label: 'Admin Invoice', description: 'Manual invoice sent from admin panel', group: 'Invoices', trigger: 'Manual from Invoices tab' },
  { id: 'protocol_library', label: 'Protocol Library', description: 'Free guide + 10% discount code delivery', group: 'Marketing', trigger: 'On email opt-in' },
];

const GROUPS = ['Account', 'Orders', 'Order Status', 'Support', 'Referrals', 'Invoices', 'Marketing'];

// ── Shared order interface ─────────────────────────────────────────────────
interface PendingOrder {
  id: string;
  userEmail: string;
  firstName: string;
  totalAmount: number;
  createdAt: Date;
  reminderSentAt?: Date | null;
  cancelledAt?: Date | null;
  bankTransferRef?: string;
  bankName?: string;
  sortCode?: string;
  accountNumber?: string;
  items?: Array<{ name: string; variantName?: string; quantity: number; priceNum: number }>;
}

type SiteSettings = { bankName?: string; sortCode?: string; accountNumber?: string };

// ── Fetch helpers ──────────────────────────────────────────────────────────
async function fetchPendingBankOrders(): Promise<PendingOrder[]> {
  const snap = await getDocs(
    query(
      collection(db, 'orders'),
      where('status', '==', 'pending'),
      where('paymentMethod', '==', 'bank_transfer'),
    )
  );
  return snap.docs.map(d => {
    const data = d.data();
    const created = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || 0);
    return {
      id: d.id,
      userEmail: data.userEmail || data.customer?.email || '',
      firstName: data.shippingFirstName || data.customer?.firstName || 'Customer',
      totalAmount: data.totalAmount || 0,
      createdAt: created,
      reminderSentAt: data.reminderSentAt?.toDate ? data.reminderSentAt.toDate() : null,
      cancelledAt: data.cancelledAt?.toDate ? data.cancelledAt.toDate() : null,
      bankTransferRef: data.bankTransferRef || d.id.slice(-8).toUpperCase(),
      bankName: data.bankName,
      sortCode: data.sortCode,
      accountNumber: data.accountNumber,
      items: data.items || [],
    };
  }).filter(o => o.userEmail);
}

async function fetchOrdersDueForReminder(): Promise<PendingOrder[]> {
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const cutoff72h = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const all = await fetchPendingBankOrders();
  // Due for reminder: >24h old, no reminder sent yet, not yet >72h (those get cancelled instead)
  return all.filter(o => o.createdAt <= cutoff24h && o.createdAt > cutoff72h && !o.reminderSentAt);
}

async function fetchOrdersDueForCancellation(): Promise<PendingOrder[]> {
  const cutoff72h = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const all = await fetchPendingBankOrders();
  // Due for cancellation: >72h old, not yet cancelled
  return all.filter(o => o.createdAt <= cutoff72h && !o.cancelledAt);
}

// ── Action helpers ─────────────────────────────────────────────────────────
async function sendReminderForOrder(order: PendingOrder, settings: SiteSettings): Promise<void> {
  const html = buildPaymentReminderEmail({
    firstName: order.firstName,
    orderId: order.id,
    totalAmount: order.totalAmount,
    bankName: order.bankName || settings.bankName || 'PH Labs Ltd',
    sortCode: order.sortCode || settings.sortCode,
    accountNumber: order.accountNumber || settings.accountNumber,
    reference: order.bankTransferRef || order.id.slice(-8).toUpperCase(),
    hoursElapsed: Math.round((Date.now() - order.createdAt.getTime()) / 3600000),
  });
  await addDoc(collection(db, 'mail'), {
    to: order.userEmail,
    message: {
      subject: `Payment Reminder — Your order #${order.id.slice(-8).toUpperCase()} is awaiting payment`,
      html,
    },
    createdAt: Timestamp.now(),
  });
  const { doc, updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(db, 'orders', order.id), { reminderSentAt: Timestamp.now() });
}

async function cancelOrderAndEmail(order: PendingOrder): Promise<void> {
  const { doc, updateDoc } = await import('firebase/firestore');
  // Mark cancelled in Firestore first
  await updateDoc(doc(db, 'orders', order.id), {
    status: 'canceled',
    cancelledAt: Timestamp.now(),
    cancelReason: 'auto_72h_no_payment',
  });
  // Send cancellation email to customer
  const html = buildCancellationEmail({
    firstName: order.firstName,
    orderId: order.id,
    totalAmount: order.totalAmount,
    items: order.items,
    hoursElapsed: Math.round((Date.now() - order.createdAt.getTime()) / 3600000),
  });
  await addDoc(collection(db, 'mail'), {
    to: order.userEmail,
    message: {
      subject: `Your order #${order.id.slice(-8).toUpperCase()} has been cancelled`,
      html,
    },
    createdAt: Timestamp.now(),
  });
  // Admin alert email
  const itemsSummary = (order.items || [])
    .map(i => `${i.name}${i.variantName ? ` (${i.variantName})` : ''} ×${i.quantity}`)
    .join(', ') || 'N/A';
  await addDoc(collection(db, 'mail'), {
    to: 'info@phlabs.co.uk',
    message: {
      subject: `[Auto-Cancelled] Order #${order.id.slice(-8).toUpperCase()} — 72h no payment`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0b1a30;color:#e0eeff;border-radius:12px;">
          <h2 style="color:#f87171;margin:0 0 16px;">Order Auto-Cancelled</h2>
          <p style="color:#94a3b8;margin:0 0 20px;">An order was automatically cancelled after 72 hours without payment.</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:6px 0;color:#64748b;">Order ID</td><td style="padding:6px 0;color:#fff;font-family:monospace;">#${order.id.slice(-8).toUpperCase()}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Customer</td><td style="padding:6px 0;color:#fff;">${order.firstName} (${order.userEmail})</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Amount</td><td style="padding:6px 0;color:#fbbf24;font-weight:bold;">£${order.totalAmount.toFixed(2)}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Items</td><td style="padding:6px 0;color:#cbd5e1;">${itemsSummary}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Cancelled At</td><td style="padding:6px 0;color:#fff;">${new Date().toLocaleString('en-GB')}</td></tr>
          </table>
          <p style="margin-top:20px;font-size:12px;color:#475569;">This is an automated notification from the PH Labs order system.</p>
        </div>
      `,
    },
    createdAt: Timestamp.now(),
  });
}

// ── Main component ──────────────────────────────────────────────────────────
export default function EmailPreviewTab() {
  const [selectedId, setSelectedId] = useState<string>('welcome');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [sendTestEmail, setSendTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testSent, setTestSent] = useState<string | null>(null);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>({});

  // 24h reminder state
  const [pendingReminders, setPendingReminders] = useState<PendingOrder[]>([]);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [reminderResults, setReminderResults] = useState<Array<{ orderId: string; email: string; status: 'sent' | 'error' }>>([]);
  const [lastReminderScan, setLastReminderScan] = useState<Date | null>(null);

  // 72h cancellation state
  const [pendingCancels, setPendingCancels] = useState<PendingOrder[]>([]);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelResults, setCancelResults] = useState<Array<{ orderId: string; email: string; status: 'cancelled' | 'error' }>>([]);
  const [lastCancelScan, setLastCancelScan] = useState<Date | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const selectedTemplate = TEMPLATES.find(t => t.id === selectedId)!;
  const previewHtml = buildPreview(selectedId);

  // Load site settings
  useEffect(() => {
    (async () => {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const snap = await getDoc(doc(db, 'settings', 'site'));
        if (snap.exists()) {
          const d = snap.data();
          setSiteSettings({ bankName: d.bankTransferName, sortCode: d.bankTransferSortCode, accountNumber: d.bankTransferAccountNumber });
        }
      } catch { /* ignore */ }
    })();
  }, []);

  // Write preview HTML to iframe
  useEffect(() => {
    if (iframeRef.current) iframeRef.current.srcdoc = previewHtml;
  }, [previewHtml]);

  // ── Auto-scan logic ───────────────────────────────────────────────────────
  const runReminderScan = useCallback(async (silent = false) => {
    if (!silent) setReminderLoading(true);
    try {
      const orders = await fetchOrdersDueForReminder();
      setPendingReminders(orders);
      setLastReminderScan(new Date());
      localStorage.setItem(AUTO_SCAN_KEY, Date.now().toString());
      // Auto-send if running silently in background
      if (silent && orders.length > 0) {
        for (const order of orders) {
          try { await sendReminderForOrder(order, siteSettings); } catch { /* log silently */ }
        }
        setPendingReminders([]);
      }
    } catch { /* ignore */ }
    if (!silent) setReminderLoading(false);
  }, [siteSettings]);

  const runCancelScan = useCallback(async (silent = false) => {
    if (!silent) setCancelLoading(true);
    try {
      const orders = await fetchOrdersDueForCancellation();
      setPendingCancels(orders);
      setLastCancelScan(new Date());
      localStorage.setItem(CANCEL_SCAN_KEY, Date.now().toString());
      // Auto-cancel if running silently in background
      if (silent && orders.length > 0) {
        for (const order of orders) {
          try { await cancelOrderAndEmail(order); } catch { /* log silently */ }
        }
        setPendingCancels([]);
      }
    } catch { /* ignore */ }
    if (!silent) setCancelLoading(false);
  }, []);

  // Daily auto-scan on mount — runs silently once per 24h per browser session
  useEffect(() => {
    const checkAndRun = async () => {
      const now = Date.now();
      const lastReminder = parseInt(localStorage.getItem(AUTO_SCAN_KEY) || '0', 10);
      const lastCancel = parseInt(localStorage.getItem(CANCEL_SCAN_KEY) || '0', 10);
      if (now - lastReminder > AUTO_SCAN_INTERVAL_MS) await runReminderScan(true);
      if (now - lastCancel > AUTO_SCAN_INTERVAL_MS) await runCancelScan(true);
    };
    // Small delay so settings load first
    const t = setTimeout(checkAndRun, 2000);
    return () => clearTimeout(t);
  }, [runReminderScan, runCancelScan]);

  // ── Manual scan handlers ──────────────────────────────────────────────────
  const handleScanReminders = async () => {
    setReminderLoading(true);
    setPendingReminders([]);
    setReminderResults([]);
    await runReminderScan(false);
  };

  const handleScanCancels = async () => {
    setCancelLoading(true);
    setPendingCancels([]);
    setCancelResults([]);
    await runCancelScan(false);
  };

  const handleSendAllReminders = async () => {
    if (!pendingReminders.length) return;
    setReminderLoading(true);
    const results: typeof reminderResults = [];
    for (const order of pendingReminders) {
      try {
        await sendReminderForOrder(order, siteSettings);
        results.push({ orderId: order.id, email: order.userEmail, status: 'sent' });
      } catch {
        results.push({ orderId: order.id, email: order.userEmail, status: 'error' });
      }
    }
    setReminderResults(results);
    setPendingReminders([]);
    setReminderLoading(false);
  };

  const handleSendOneReminder = async (order: PendingOrder) => {
    setReminderLoading(true);
    try {
      await sendReminderForOrder(order, siteSettings);
      setReminderResults(prev => [...prev, { orderId: order.id, email: order.userEmail, status: 'sent' }]);
      setPendingReminders(prev => prev.filter(o => o.id !== order.id));
    } catch {
      setReminderResults(prev => [...prev, { orderId: order.id, email: order.userEmail, status: 'error' }]);
    } finally {
      setReminderLoading(false);
    }
  };

  const handleCancelAll = async () => {
    if (!pendingCancels.length) return;
    setCancelLoading(true);
    const results: typeof cancelResults = [];
    for (const order of pendingCancels) {
      try {
        await cancelOrderAndEmail(order);
        results.push({ orderId: order.id, email: order.userEmail, status: 'cancelled' });
      } catch {
        results.push({ orderId: order.id, email: order.userEmail, status: 'error' });
      }
    }
    setCancelResults(results);
    setPendingCancels([]);
    setCancelLoading(false);
  };

  const handleCancelOne = async (order: PendingOrder) => {
    setCancelLoading(true);
    try {
      await cancelOrderAndEmail(order);
      setCancelResults(prev => [...prev, { orderId: order.id, email: order.userEmail, status: 'cancelled' }]);
      setPendingCancels(prev => prev.filter(o => o.id !== order.id));
    } catch {
      setCancelResults(prev => [...prev, { orderId: order.id, email: order.userEmail, status: 'error' }]);
    } finally {
      setCancelLoading(false);
    }
  };

  const handleSendTest = async () => {
    if (!sendTestEmail.trim()) return;
    setSendingTest(true);
    setTestSent(null);
    try {
      await addDoc(collection(db, 'mail'), {
        to: sendTestEmail.trim(),
        message: {
          subject: `[TEST] ${selectedTemplate.label} — PH Labs`,
          html: previewHtml,
        },
        createdAt: Timestamp.now(),
      });
      setTestSent('sent');
    } catch {
      setTestSent('error');
    } finally {
      setSendingTest(false);
    }
  };

  const grouped = GROUPS.map(g => ({ group: g, items: TEMPLATES.filter(t => t.group === g) }));

  return (
    <div className="min-h-screen p-6" style={{ background: '#040d1a' }}>
      <div className="max-w-[1600px] mx-auto">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Mail className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-white text-xl font-bold">Email Preview</h1>
              <p className="text-[#9cb8d9] text-sm">Preview every email template and manage automated order workflows</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green-500/20 bg-green-500/5">
              <Zap className="w-3 h-3 text-green-400" />
              <span className="text-green-400 text-xs font-medium">Auto-scan active · runs daily</span>
            </div>
          </div>
        </div>

        {/* Automation panels row */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">

          {/* 24h Payment Reminder Panel */}
          <div className="rounded-2xl border border-amber-500/20 overflow-hidden" style={{ background: 'rgba(120,53,15,0.08)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-amber-500/15">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Bell className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">24h Payment Reminders</p>
                  <p className="text-[#9cb8d9] text-xs">Pending bank transfer orders · 24–72h window · auto-scanned daily</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {lastReminderScan && (
                  <span className="text-[#3a5a82] text-xs hidden sm:block">
                    {lastReminderScan.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                <button
                  onClick={handleScanReminders}
                  disabled={reminderLoading}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
                >
                  {reminderLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Scan
                </button>
              </div>
            </div>

            <AnimatePresence>
              {lastReminderScan && pendingReminders.length === 0 && reminderResults.length === 0 && !reminderLoading && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-5 py-4 flex items-center gap-2 text-green-400 text-sm">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  No orders due for a reminder. All caught up.
                </motion.div>
              )}
              {pendingReminders.length > 0 && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="px-5 py-3 flex items-center justify-between border-b border-amber-500/10">
                    <span className="text-amber-400 text-sm font-medium">{pendingReminders.length} order{pendingReminders.length !== 1 ? 's' : ''} awaiting reminder</span>
                    <button onClick={handleSendAllReminders} disabled={reminderLoading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 disabled:opacity-50 transition-all">
                      {reminderLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      Send All
                    </button>
                  </div>
                  {pendingReminders.map(order => (
                    <div key={order.id} className="flex items-center justify-between px-5 py-3 border-b border-amber-500/[0.06] last:border-0">
                      <div>
                        <p className="text-white text-sm font-medium">{order.firstName} · #{order.id.slice(-8).toUpperCase()}</p>
                        <p className="text-[#9cb8d9] text-xs">{order.userEmail} · £{order.totalAmount.toFixed(2)} · {Math.round((Date.now() - order.createdAt.getTime()) / 3600000)}h ago</p>
                      </div>
                      <button onClick={() => handleSendOneReminder(order)} disabled={reminderLoading} className="px-3 py-1 rounded-lg text-xs font-medium bg-amber-500/10 border border-amber-500/25 text-amber-400 hover:bg-amber-500/20 transition-all disabled:opacity-50">
                        Send
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
              {reminderResults.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-5 py-3 flex flex-wrap gap-2">
                  {reminderResults.map(r => (
                    <span key={r.orderId} className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border ${r.status === 'sent' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                      {r.status === 'sent' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                      #{r.orderId.slice(-8).toUpperCase()} {r.status}
                    </span>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 72h Auto-Cancellation Panel */}
          <div className="rounded-2xl border border-red-500/20 overflow-hidden" style={{ background: 'rgba(127,29,29,0.08)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-red-500/15">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <XCircle className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">72h Auto-Cancellation</p>
                  <p className="text-[#9cb8d9] text-xs">Cancels order + emails customer · no charge · auto-scanned daily</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {lastCancelScan && (
                  <span className="text-[#3a5a82] text-xs hidden sm:block">
                    {lastCancelScan.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                <button
                  onClick={handleScanCancels}
                  disabled={cancelLoading}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                >
                  {cancelLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Scan
                </button>
              </div>
            </div>

            <AnimatePresence>
              {lastCancelScan && pendingCancels.length === 0 && cancelResults.length === 0 && !cancelLoading && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-5 py-4 flex items-center gap-2 text-green-400 text-sm">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  No orders pending auto-cancellation. All clear.
                </motion.div>
              )}
              {pendingCancels.length > 0 && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="px-5 py-3 flex items-center justify-between border-b border-red-500/10">
                    <span className="text-red-400 text-sm font-medium">{pendingCancels.length} order{pendingCancels.length !== 1 ? 's' : ''} overdue — will be cancelled</span>
                    <button onClick={handleCancelAll} disabled={cancelLoading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 disabled:opacity-50 transition-all">
                      {cancelLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                      Cancel All
                    </button>
                  </div>
                  {pendingCancels.map(order => (
                    <div key={order.id} className="flex items-center justify-between px-5 py-3 border-b border-red-500/[0.06] last:border-0">
                      <div>
                        <p className="text-white text-sm font-medium">{order.firstName} · #{order.id.slice(-8).toUpperCase()}</p>
                        <p className="text-[#9cb8d9] text-xs">{order.userEmail} · £{order.totalAmount.toFixed(2)} · {Math.round((Date.now() - order.createdAt.getTime()) / 3600000)}h ago</p>
                      </div>
                      <button onClick={() => handleCancelOne(order)} disabled={cancelLoading} className="px-3 py-1 rounded-lg text-xs font-medium bg-red-500/10 border border-red-500/25 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50">
                        Cancel
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
              {cancelResults.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-5 py-3 flex flex-wrap gap-2">
                  {cancelResults.map(r => (
                    <span key={r.orderId} className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border ${r.status === 'cancelled' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                      {r.status === 'cancelled' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                      #{r.orderId.slice(-8).toUpperCase()} {r.status}
                    </span>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Template preview layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-6">

          {/* Sidebar */}
          <div className="rounded-2xl border border-white/[0.07] overflow-hidden" style={{ background: '#0b1a30' }}>
            <div className="px-4 py-3 border-b border-white/[0.07]">
              <p className="text-[#9cb8d9] text-xs font-semibold uppercase tracking-widest">Templates</p>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 720 }}>
              {grouped.map(({ group, items }) => (
                <div key={group}>
                  <div className="px-4 py-2 sticky top-0 z-10" style={{ background: '#0b1a30' }}>
                    <p className="text-[#3a5a82] text-[10px] font-bold uppercase tracking-widest">{group}</p>
                  </div>
                  {items.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedId(t.id)}
                      className={`w-full text-left px-4 py-3 transition-all border-b border-white/[0.04] last:border-0 ${selectedId === t.id ? 'bg-blue-500/10 border-l-2 border-l-blue-500' : 'hover:bg-white/[0.03]'}`}
                    >
                      <p className={`text-sm font-medium ${selectedId === t.id ? 'text-blue-300' : 'text-[#c8daf0]'}`}>{t.label}</p>
                      <p className="text-[#3a5a82] text-xs mt-0.5 leading-snug">{t.description}</p>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Preview panel */}
          <div className="flex flex-col gap-4">
            {/* Top bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-white text-lg font-semibold">{selectedTemplate.label}</h2>
                <p className="text-[#9cb8d9] text-sm">{selectedTemplate.description}</p>
              </div>
              <div className="flex items-center gap-2">
                {(['desktop', 'mobile'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setPreviewMode(m)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${previewMode === m ? 'bg-blue-500/15 border-blue-500/30 text-blue-300' : 'border-white/[0.07] text-[#9cb8d9] hover:bg-white/[0.04]'}`}
                  >
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Send test */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <input
                  type="email"
                  value={sendTestEmail}
                  onChange={e => setSendTestEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendTest()}
                  placeholder="Send test to: email@example.com"
                  className="w-full px-4 py-2.5 rounded-xl text-sm bg-white/[0.04] border border-white/[0.08] text-white placeholder-[#3a5a82] focus:outline-none focus:border-blue-500/40"
                />
              </div>
              <button
                onClick={handleSendTest}
                disabled={sendingTest || !sendTestEmail.trim()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/30 disabled:opacity-50 transition-all"
              >
                {sendingTest ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Send Test
              </button>
              {testSent && (
                <AnimatePresence>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border ${testSent === 'sent' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}
                  >
                    {testSent === 'sent' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    {testSent === 'sent' ? 'Test sent!' : 'Send failed'}
                  </motion.div>
                </AnimatePresence>
              )}
            </div>

            {/* Meta strip */}
            <div className="rounded-2xl border border-white/[0.07] px-4 py-3 flex flex-wrap gap-x-6 gap-y-1" style={{ background: '#0b1a30' }}>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-[#2a4a7a]" />
                <span className="text-[#2a4a7a] text-xs uppercase font-semibold tracking-wider">Trigger:</span>
                <span className="text-[#c8daf0] text-xs">{selectedTemplate.trigger}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[#2a4a7a] text-xs uppercase font-semibold tracking-wider">Group:</span>
                <span className="text-[#c8daf0] text-xs">{selectedTemplate.group}</span>
              </div>
            </div>

            {/* iframe preview */}
            <div
              className="rounded-2xl border border-white/[0.07] overflow-hidden transition-all duration-300"
              style={{
                background: '#04101f',
                minHeight: 600,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                padding: previewMode === 'mobile' ? '24px' : '0',
              }}
            >
              <iframe
                ref={iframeRef}
                title={`Email preview: ${selectedTemplate.label}`}
                className="rounded-xl transition-all duration-300"
                style={{
                  width: previewMode === 'mobile' ? 390 : '100%',
                  height: previewMode === 'mobile' ? 720 : 700,
                  border: 'none',
                  background: '#04101f',
                  ...(previewMode === 'mobile' ? { boxShadow: '0 0 0 2px rgba(59,130,246,0.25), 0 20px 60px rgba(0,0,0,0.6)', borderRadius: 28 } : {}),
                }}
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
