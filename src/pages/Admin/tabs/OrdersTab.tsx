import { useState, useEffect } from 'react';
import {
  ShoppingCart, Search, Clock, Package, Truck, CheckCircle, XCircle,
  Eye, Printer, RefreshCw, ChevronDown, X, Send, Hash, Copy,
  Banknote, CheckCheck, AlertCircle, Loader2, CreditCard, ExternalLink,
  Trash2, ChevronRight, RotateCcw, ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAllOrders, updateOrderStatus, Order, db, doc, updateDoc, addDoc, collection, Timestamp, deleteDoc, sendOrderStatusEmail } from '@/lib/firebase';
import { logAdminAction } from '@/lib/admin-audit';

import { buildDispatchEmail } from '@/templates/dispatchEmail';

// ── Payment status config for bank transfer orders ──
const PAYMENT_STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending_bank_transfer: { label: 'Awaiting Payment', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: Clock },
  paid:                  { label: 'Paid',             color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: CheckCheck },
  cancelled:             { label: 'Cancelled',        color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: XCircle },
};

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  pending:    { label: 'Pending',    icon: Clock,       color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  processing: { label: 'Processing', icon: Package,     color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  shipped:    { label: 'Shipped',    icon: Truck,       color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  delivered:  { label: 'Delivered',  icon: CheckCircle, color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  cancelled:  { label: 'Cancelled',  icon: XCircle,     color: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

const WORKFLOW: Order['status'][] = ['pending', 'processing', 'shipped', 'delivered'];

// Escape HTML special chars to prevent stored XSS from customer-supplied fields
// (first/last name, shipping address, tracking number, courier) when written
// into the print-label window via document.write.
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function generateShippingLabelPDF(order: Order) {
  // Generate printable shipping label using browser print - no dependencies needed
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to print shipping labels');
    return;
  }

  const rawName = `${(order as any).customer?.firstName || ''} ${(order as any).customer?.lastName || ''}`.trim();
  const customerName = esc(rawName || 'Customer');
  const orderDate = esc(order.orderDate?.toDate?.()?.toLocaleDateString('en-GB') || 'N/A');
  const orderIdShort = esc(order.id?.slice(-8) || '');
  const orderIdUpper = esc(order.id?.slice(-8).toUpperCase() || 'N/A');
  const shippingAddress = esc(order.shippingAddress || 'No address').replace(/\n/g, '<br>');
  const trackingNumber = order.trackingNumber ? esc(order.trackingNumber) : '';
  const courier = order.courier ? esc(order.courier) : '';

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Shipping Label - ${orderIdShort}</title>
      <style>
        @media print {
          body { margin: 0; padding: 0; }
          .label { width: 105mm; height: 148mm; page-break-after: always; }
          @page { size: A6 portrait; margin: 0; }
        }
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
        .label { 
          border: 2px solid #000; 
          padding: 10mm; 
          box-sizing: border-box; 
          width: 105mm; 
          height: 148mm; 
          margin: 10mm auto;
        }
        h2 { margin: 0 0 8px; font-size: 16px; text-align: center; font-weight: bold; }
        .section { margin: 10px 0; border-top: 1px dashed #000; padding-top: 8px; }
        .section-title { font-weight: bold; font-size: 11px; margin-bottom: 4px; }
        p { margin: 2px 0; font-size: 10px; line-height: 1.3; }
        .tracking { font-size: 12px; font-weight: bold; margin-top: 8px; }
        .no-print { display: block; text-align: center; margin: 20px; }
        @media print {
          .no-print { display: none; }
        }
      </style>
    </head>
    <body onload="window.print()">
      <div class="label">
        <h2>PH LABS</h2>
        
        <div class="section">
          <div class="section-title">FROM:</div>
          <p>PH Labs</p>
          <p>United Kingdom</p>
          <p>info@phlabs.co.uk</p>
        </div>
        
        <div class="section">
          <div class="section-title">TO:</div>
          <p><strong>${customerName}</strong></p>
          <p>${shippingAddress}</p>
        </div>
        
        <div class="section">
          <div class="section-title">Order Information:</div>
          <p><strong>Order #:</strong> ${orderIdUpper}</p>
          <p><strong>Date:</strong> ${orderDate}</p>
          ${trackingNumber ? `<p class="tracking">Tracking: ${trackingNumber}</p>` : ''}
          ${courier ? `<p><strong>Courier:</strong> ${courier}</p>` : ''}
        </div>
      </div>
      <div class="no-print">
        <p>Label will print automatically. If not, use Ctrl+P (Windows) or Cmd+P (Mac)</p>
      </div>
    </body>
    </html>
  `);
  
  printWindow.document.close();
}


function StatusBadge({ status }: { status: Order['status'] }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.color}`}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

function PaymentStatusBadge({ paymentStatus }: { paymentStatus: string }) {
  const cfg = PAYMENT_STATUS_CONFIG[paymentStatus] || PAYMENT_STATUS_CONFIG.pending_bank_transfer;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.color}`}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

// ── Fena (Open Banking) status badge ──
// Webhook is the authoritative source for Fena payments — no manual confirmation.
function isFenaOrder(order: any): boolean {
  return order?.paymentProvider === 'fena'
    || order?.paymentMethod === 'fena_ob'
    || order?.paymentMethod === 'pay_by_bank'
    || typeof order?.fenaStatus === 'string';
}
function FenaStatusBadge({ order }: { order: any }) {
  const fenaStatus = String(order?.fenaStatus || '').toLowerCase();
  if (fenaStatus === 'paid') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-green-500/20 text-green-400 border-green-500/30">
        <CheckCheck className="w-3 h-3" />Auto-paid by Fena
      </span>
    );
  }
  if (fenaStatus === 'cancelled' || fenaStatus === 'expired') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-red-500/20 text-red-400 border-red-500/30">
        <XCircle className="w-3 h-3" />Fena {fenaStatus}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-blue-500/20 text-blue-400 border-blue-500/30">
      <CreditCard className="w-3 h-3" />Fena {fenaStatus || 'pending'}
    </span>
  );
}
export default function OrdersTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Order | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Tracking number state
  const [trackingInput, setTrackingInput] = useState('');
  const [courierInput, setCourierInput] = useState('');
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingSuccess, setTrackingSuccess] = useState('');
  const [trackingError, setTrackingError] = useState('');
  const [copiedTrackingId, setCopiedTrackingId] = useState<string | null>(null);

  // Bank transfer payment state
  const [transferRefInput, setTransferRefInput] = useState('');
  const [paymentStatusInput, setPaymentStatusInput] = useState<'pending_bank_transfer' | 'paid' | 'cancelled'>('pending_bank_transfer');
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferMsg, setTransferMsg] = useState('');

  useEffect(() => {
    loadOrders();
  }, []);

  // Sync inputs when selected order changes
  useEffect(() => {
    setTrackingInput(selected?.trackingNumber || '');
    setCourierInput(selected?.courier || '');
    setTrackingSuccess('');
    setTrackingError('');
    setCopiedTrackingId(null);
    // Bank transfer fields
    setTransferRefInput((selected as any)?.transferReference || '');
    setPaymentStatusInput((selected as any)?.paymentStatus || 'pending_bank_transfer');
    setTransferMsg('');
  }, [selected?.id]);

  const loadOrders = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await getAllOrders();
      setOrders(data);
    } catch (e: any) {
      console.error('Failed to load orders:', e);
      setLoadError(e?.message || 'Failed to load orders. Check Firestore rules and indexes.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (orderId: string, status: Order['status']) => {
    setUpdating(orderId);
    try {
      await updateOrderStatus(orderId, status);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
      if (selected?.id === orderId) setSelected(prev => prev ? { ...prev, status } : prev);

      // Send order status email notification to customer
      const order = orders.find(o => o.id === orderId);
      const customerEmail = order?.userEmail || (order as any)?.customer?.email;
      if (customerEmail && ['processing', 'shipped', 'delivered', 'canceled', 'paid', 'refunded'].includes(status)) {
        const firstName = (order as any)?.shippingFirstName || (order as any)?.customer?.firstName || 'Customer';
        const orderItems = (order?.items || []).map((it: any) => ({
          name: it.name || '',
          variantName: it.variantName,
          quantity: it.quantity || 1,
          priceNum: it.priceNum || 0,
        }));
        sendOrderStatusEmail(
          customerEmail, firstName, orderId, status,
          undefined, undefined, undefined, undefined,
          orderItems, order?.totalAmount
        ).catch(console.error);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating(null);
    }
  };

  const [reinstating, setReinstating] = useState<string | null>(null);

  const handleReinstateOrder = async (orderId: string) => {
    if (!window.confirm('Reinstate this order? It will be set back to Pending and the customer will receive a new payment reminder.')) return;
    setReinstating(orderId);
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'pending',
        cancelledAt: null,
        cancelReason: null,
      });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'pending', cancelledAt: undefined, cancelReason: undefined } : o));
      if (selected?.id === orderId) setSelected(prev => prev ? { ...prev, status: 'pending' } : prev);
    } catch (e: any) {
      alert('Failed to reinstate order: ' + (e?.message || 'Please try again.'));
    } finally {
      setReinstating(null);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    const orderRef = orders.find(o => o.id === orderId);
    const label = (orderRef as any)?.bankTransferRef || `#${orderId?.slice(-8).toUpperCase()}`;
    if (!window.confirm(`Permanently delete order ${label}?\n\nThis cannot be undone.`)) return;
    setDeleting(orderId);
    try {
      await deleteDoc(doc(db, 'orders', orderId));
      await logAdminAction({
        action: 'order.delete',
        target: `orders/${orderId}`,
        before: orderRef,
      });
      setOrders(prev => prev.filter(o => o.id !== orderId));
      if (selected?.id === orderId) setSelected(null);
    } catch (e: any) {
      alert('Failed to delete order: ' + (e?.message || 'Please try again.'));
    } finally {
      setDeleting(null);
    }
  };

  // Save bank transfer payment status + transfer reference
  const handleSavePaymentStatus = async () => {
    if (!selected) return;
    setTransferLoading(true);
    setTransferMsg('');
    try {
      const update: Record<string, any> = {
        paymentStatus: paymentStatusInput,
      };
      if (transferRefInput.trim()) {
        update.transferReference = transferRefInput.trim();
      }
      // If marking as paid, also advance order status to processing
      if (paymentStatusInput === 'paid' && selected.status === 'pending') {
        update.status = 'processing';
        update.paidAt = new Date();
      }
      if (paymentStatusInput === 'cancelled') {
        update.status = 'cancelled';
      }
      await updateDoc(doc(db, 'orders', selected.id), update);
      await logAdminAction({
        action: 'order.status.update',
        target: `orders/${selected.id}`,
        before: { status: selected.status, paymentStatus: (selected as any).paymentStatus ?? null },
        after: update,
      });
      setOrders(prev => prev.map(o => o.id === selected.id ? { ...o, ...update } : o));
      setSelected(prev => prev ? { ...prev, ...update } : prev);
      setTransferMsg(
        paymentStatusInput === 'paid'
          ? 'Payment confirmed — order advanced to Processing.'
          : paymentStatusInput === 'cancelled'
          ? 'Order marked as cancelled.'
          : 'Payment status updated.'
      );
    } catch (e: any) {
      setTransferMsg('Failed to update: ' + (e?.message || 'Please try again.'));
    } finally {
      setTransferLoading(false);
    }
  };

  // Save tracking number + courier to order
  const handleSaveTracking = async () => {
    if (!selected || !trackingInput.trim()) {
      setTrackingError('Please enter a tracking number first.');
      return;
    }
    setTrackingLoading(true);
    setTrackingError('');
    setTrackingSuccess('');
    try {
      const tracking = trackingInput.trim();
      const courier = courierInput.trim();

      // Save tracking number and courier to the order
      await updateDoc(doc(db, 'orders', selected.id), {
        trackingNumber: tracking,
        ...(courier ? { courier } : {}),
      });

      // Update local state
      setOrders(prev => prev.map(o =>
        o.id === selected.id ? { ...o, trackingNumber: tracking, ...(courier ? { courier } : {}) } : o
      ));
      setSelected(prev => prev ? { ...prev, trackingNumber: tracking, ...(courier ? { courier } : {}) } : prev);
      setTrackingSuccess('Tracking number saved successfully!');
    } catch (e: any) {
      console.error(e);
      setTrackingError(e?.message || 'Failed to save. Please try again.');
    } finally {
      setTrackingLoading(false);
    }
  };

  // Dispatch order: save tracking number + mark as shipped + write dispatch email to Firestore
  // (Firebase Trigger Email extension picks up docs in 'mail' collection)
  const handleDispatch = async () => {
    if (!selected || !trackingInput.trim()) {
      setTrackingError('Please enter a tracking number first.');
      return;
    }
    setTrackingLoading(true);
    setTrackingError('');
    setTrackingSuccess('');
    try {
      const tracking = trackingInput.trim();
      const courier = courierInput.trim();

      // 1. Save tracking number + courier to the order and mark as shipped
      await updateDoc(doc(db, 'orders', selected.id), {
        trackingNumber: tracking,
        status: 'shipped',
        ...(courier ? { courier } : {}),
      });
      await logAdminAction({
        action: 'order.dispatch',
        target: `orders/${selected.id}`,
        after: { trackingNumber: tracking, courier: courier || null, status: 'shipped' },
      });

       // 2. Write dispatch email to 'mail' collection
       // Firebase Trigger Email extension sends it automatically
       const customerEmail = selected.userEmail || (selected as any).customer?.email;
       if (customerEmail) {
         const firstName = (selected as any).shippingFirstName || (selected as any).customer?.firstName || 'Customer';
         const orderItems = (selected.items || []).map((it: any) => ({
           name: it.name || '',
           variantName: it.variantName,
           quantity: it.quantity || 1,
           priceNum: it.priceNum || 0,
         }));
         await addDoc(collection(db, 'mail'), {
           to: customerEmail,
           bcc: 'phlabs.co.uk+88474c9b36@invite.trustpilot.com',
           message: {
             subject: `Order #${selected.id?.slice(-8).toUpperCase()} — Your Order Has Shipped!`,
             html: buildDispatchEmail({
               firstName,
               orderId: selected.id || '',
               trackingNumber: tracking,
               trackingUrl: tracking ? `https://www.royalmail.com/track-your-item#/tracking-results/${tracking}` : undefined,
               courier,
               items: orderItems,
               totalAmount: selected.totalAmount || 0,
               shippingAddress: selected.shippingAddress,
             }),
           },
           createdAt: Timestamp.now(),
         });
       }

      // 3. Update local state
      setOrders(prev => prev.map(o =>
        o.id === selected.id ? { ...o, trackingNumber: tracking, status: 'shipped', ...(courier ? { courier } : {}) } : o
      ));
      setSelected(prev => prev ? { ...prev, trackingNumber: tracking, status: 'shipped', ...(courier ? { courier } : {}) } : prev);
      setTrackingSuccess(customerEmail
        ? `Dispatched! Tracking saved & email sent to ${customerEmail}`
        : 'Tracking number saved. (No customer email found — email not sent)');
    } catch (e: any) {
      console.error(e);
      setTrackingError(e?.message || 'Failed to save. Please try again.');
    } finally {
      setTrackingLoading(false);
    }
  };

  const copyToClipboard = (text: string, orderId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTrackingId(orderId);
    setTimeout(() => setCopiedTrackingId(null), 2000);
  };

  const filtered = orders.filter(o => {
    const c = (o as any).customer;
    const customerName = c ? `${c.firstName || ''} ${c.lastName || ''}`.trim() : (o.userName || '');
    const customerEmail = c?.email || o.userEmail || '';
    const address = c ? `${c.address || ''} ${c.city || ''} ${c.postcode || ''}`.trim() : (o.shippingAddress || '');
    const orderId = (o as any).orderId || o.id || '';
    const s = search.toLowerCase();
    const matchSearch = !search ||
      orderId.toLowerCase().includes(s) ||
      o.id?.toLowerCase().includes(s) ||
      customerName.toLowerCase().includes(s) ||
      customerEmail.toLowerCase().includes(s) ||
      address.toLowerCase().includes(s);
    const matchStatus = statusFilter === 'all' || o.status === statusFilter ||
      (statusFilter === 'pending' && o.status === 'pending_payment') ||
      (statusFilter === 'fena_paid' && isFenaOrder(o) && String((o as any).fenaStatus || '').toLowerCase() === 'paid');
    return matchSearch && matchStatus;
  });

  const counts = {
    all: orders.length,
    pending: orders.filter(o => o.status === 'pending' || o.status === 'pending_payment').length,
    processing: orders.filter(o => o.status === 'processing').length,
    shipped: orders.filter(o => o.status === 'shipped').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
    fena_paid: orders.filter(o => isFenaOrder(o) && String((o as any).fenaStatus || '').toLowerCase() === 'paid').length,
  };

  // TrueLayer Open Banking orders still in 'pending' (no bank_transfer)
  const trueLayerPending = orders.filter(o =>
    o.status === 'pending' && (o as any).paymentMethod !== 'bank_transfer'
  );

  // Expired pending orders: pending (either method) older than 24h
  const EXPIRY_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const expiredPending = orders.filter(o => {
    if (o.status !== 'pending') return false;
    const ts = o.orderDate?.toDate?.()?.getTime?.() ?? 0;
    return ts > 0 && now - ts > EXPIRY_MS;
  });

  const handleCancelExpired = async (orderId: string) => {
    setUpdating(orderId);
    try {
      await updateDoc(doc(db, 'orders', orderId), { status: 'cancelled' });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'cancelled' } : o));
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating(null);
    }
  };

  const handleCancelAllExpired = async () => {
    for (const o of expiredPending) {
      await handleCancelExpired(o.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-blue-400" /> Order Management
          </h2>
          <p className="text-[#9cb8d9] text-sm mt-0.5">{orders.length} total orders</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open('https://console.truelayer.com/', '_blank')}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/30 hover:border-blue-600/50 text-blue-400 hover:text-white rounded-lg text-sm transition-all"
          >
            <CreditCard className="w-4 h-4" />
            TrueLayer Console
            <ExternalLink className="w-3 h-3 opacity-60" />
          </button>
          <button onClick={loadOrders} className="flex items-center gap-2 px-3 py-2 bg-[#0f2640] hover:bg-[#1a3a5c] text-white rounded-lg text-sm transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* TrueLayer manual verification banner */}
      {trueLayerPending.length > 0 && (
        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <div className="shrink-0 w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center mt-0.5">
            <CreditCard className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-amber-400 font-semibold text-sm">
              {trueLayerPending.length} Open Banking order{trueLayerPending.length > 1 ? 's' : ''} awaiting TrueLayer verification
            </p>
            <p className="text-amber-400/70 text-xs mt-0.5 leading-relaxed">
              Open Banking payments are not automatically confirmed — check your TrueLayer Console to verify each payment before dispatching. Once confirmed, advance the order to <strong className="text-amber-300">Processing</strong>.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => window.open('https://console.truelayer.com/', '_blank')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 hover:text-amber-200 rounded-lg text-xs font-medium transition-all"
              >
                Open TrueLayer Console <ExternalLink className="w-3 h-3" />
              </button>
              <button
                onClick={() => setStatusFilter('pending')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[#9cb8d9] hover:text-white rounded-lg text-xs font-medium transition-all"
              >
                View Pending Orders <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expired pending orders cleanup */}
      {expiredPending.length > 0 && (
        <div className="bg-[#0b1a30]/80 border border-red-500/20 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-red-500/15 flex items-center justify-center">
                <Clock className="w-3.5 h-3.5 text-red-400" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Expired Pending Orders</p>
                <p className="text-[#9cb8d9] text-xs">{expiredPending.length} order{expiredPending.length > 1 ? 's' : ''} pending for more than 24 hours</p>
              </div>
            </div>
            <button
              onClick={handleCancelAllExpired}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 hover:text-red-300 rounded-lg text-xs font-medium transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Cancel All
            </button>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {expiredPending.map(o => {
              const hoursAgo = Math.floor((now - (o.orderDate?.toDate?.()?.getTime?.() ?? 0)) / (60 * 60 * 1000));
              const method = (o as any).paymentMethod === 'bank_transfer' ? 'Bank Transfer' : 'Card';
              const name = `${(o as any).customer?.firstName || ''} ${(o as any).customer?.lastName || ''}`.trim() || 'Unknown';
              return (
                <div key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-mono">{(o as any).bankTransferRef || `#${o.id?.slice(-8).toUpperCase()}`}</p>
                      <p className="text-[#9cb8d9] text-xs truncate">{name} · {method} · <span className="text-red-400">{hoursAgo}h ago</span></p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-white text-sm font-semibold">£{o.totalAmount?.toFixed(2)}</span>
                    <button
                      onClick={() => handleCancelExpired(o.id)}
                      disabled={updating === o.id}
                      className="flex items-center gap-1 px-2.5 py-1 bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                    >
                      {updating === o.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              statusFilter === s
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-[#0d1f35] border-white/[0.08] text-[#9cb8d9] hover:text-white'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)} ({counts[s]})
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2a4a7a]" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by order ID or address..."
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {/* Orders list */}
      {loading ? (
        <div className="text-center py-16 text-[#9cb8d9]">Loading orders...</div>
      ) : loadError ? (
        <div className="text-center py-16">
          <p className="text-red-400 mb-3">{loadError}</p>
          <button
            onClick={loadOrders}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
          >
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-[#9cb8d9]">No orders found</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => {
            const c = (order as any).customer;
            const customerName = c ? `${c.firstName || ''} ${c.lastName || ''}`.trim() : (order.userName || 'Guest');
            const customerEmail = c?.email || order.userEmail || '';
            const addressLine = c ? [c.address, c.city, c.postcode].filter(Boolean).join(', ') : (order.shippingAddress || '');
            const orderRef = (order as any).orderId || `#${order.id?.slice(-8).toUpperCase()}`;
            const orderTs = order.orderDate || (order as any).createdAt;
            return (
            <div key={order.id} className="bg-[#0b1a30]/60 border border-white/[0.07] rounded-xl p-4 hover:border-white/[0.12] transition-colors">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono text-white font-semibold text-sm">
                      {orderRef}
                    </span>
                    <StatusBadge status={order.status} />
                    {(order as any).paymentMethod === 'bank_transfer' && (
                      <PaymentStatusBadge paymentStatus={(order as any).paymentStatus || 'pending_bank_transfer'} />
                    )}
                    {isFenaOrder(order) && <FenaStatusBadge order={order} />}
                    {order.trackingNumber && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 border border-blue-500/30 rounded text-xs text-blue-400 font-mono">
                        <Hash className="w-3 h-3" />{order.trackingNumber}
                      </span>
                    )}
                  </div>
                  <p className="text-white text-xs mt-1 font-medium">{customerName}{customerEmail ? <span className="text-[#9cb8d9] font-normal"> · {customerEmail}</span> : ''}</p>
                  <p className="text-[#9cb8d9] text-xs mt-0.5 truncate">{addressLine || 'No address'}</p>
                  <p className="text-[#2a4a7a] text-xs mt-0.5">
                    {order.items?.length || 0} item(s) ·{' '}
                    {orderTs?.toDate?.()?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) || 'Unknown date'}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-green-400 font-bold text-lg">£{((order as any).total || order.totalAmount || 0).toFixed(2)}</span>

                  {/* Status selector */}
                  <div className="relative">
                    <select
                      value={order.status}
                      onChange={e => handleStatusChange(order.id, e.target.value as Order['status'])}
                      disabled={updating === order.id}
                      className="appearance-none pl-3 pr-8 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-xs focus:outline-none focus:border-blue-500 disabled:opacity-50 cursor-pointer"
                    >
                      {WORKFLOW.map(s => (
                        <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                      ))}
                      <option value="cancelled">Cancelled</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#9cb8d9] pointer-events-none" />
                  </div>

                  {/* Quick-advance to next workflow status */}
                  {(() => {
                    const idx = WORKFLOW.indexOf(order.status as Order['status']);
                    if (idx < 0 || idx >= WORKFLOW.length - 1) return null;
                    const next = WORKFLOW[idx + 1];
                    const nextCfg = STATUS_CONFIG[next];
                    const needsDispatch = next === 'shipped';
                    return (
                      <button
                        onClick={() => {
                          if (needsDispatch) {
                            setSelected(order);
                          } else {
                            handleStatusChange(order.id, next);
                          }
                        }}
                        disabled={updating === order.id}
                        title={needsDispatch ? `Open dispatch — requires tracking number` : `Advance to ${nextCfg.label}`}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 hover:border-emerald-500/50 text-emerald-300 hover:text-emerald-200 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                      >
                        {updating === order.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <ArrowRight className="w-3.5 h-3.5" />}
                        {nextCfg.label}
                      </button>
                    );
                  })()}


                  <button
                    onClick={() => setSelected(order)}
                    className="p-1.5 bg-[#0f2640] hover:bg-[#1a3a5c] rounded-lg transition-colors"
                    title="View details"
                  >
                    <Eye className="w-4 h-4 text-[#8caad4]" />
                  </button>
                  <button
                    onClick={() => handleDeleteOrder(order.id)}
                    disabled={deleting === order.id}
                    className="p-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 rounded-lg transition-colors disabled:opacity-50"
                    title="Delete order"
                  >
                    {deleting === order.id
                      ? <Loader2 className="w-4 h-4 text-red-400 animate-spin" />
                      : <Trash2 className="w-4 h-4 text-red-400" />
                    }
                  </button>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Order Detail Modal */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
            onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#04101f] border border-white/[0.08] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            >
              <div className="p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <h3 className="text-white font-bold text-lg font-mono">
                      {(selected as any).bankTransferRef || `#${selected.id?.slice(-8).toUpperCase()}`}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <StatusBadge status={selected.status} />
                      {(selected as any).paymentMethod === 'bank_transfer' && (
                        <PaymentStatusBadge paymentStatus={(selected as any).paymentStatus || 'pending_bank_transfer'} />
                      )}
                      {(selected as any).paymentMethod === 'bank_transfer' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-400">
                          <Banknote className="w-3 h-3" /> Bank Transfer
                        </span>
                      )}
                      {isFenaOrder(selected) && <FenaStatusBadge order={selected} />}
                      <span className="text-[#9cb8d9] text-xs">
                        {selected.orderDate?.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDeleteOrder(selected.id)}
                      disabled={deleting === selected.id}
                      title="Delete this order"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 hover:border-red-500/50 text-red-400 hover:text-red-300 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                    >
                      {deleting === selected.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                      Delete Order
                    </button>
                    <button onClick={() => setSelected(null)} aria-label="Close order details" className="text-[#9cb8d9] hover:text-white transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Customer */}
                {(() => {
                  const c = (selected as any).customer;
                  const name = c ? `${c.firstName || ''} ${c.lastName || ''}`.trim() : (selected.userName || 'Guest');
                  const email = c?.email || selected.userEmail || '';
                  const phone = c?.phone || '';
                  const address = c ? [c.address, c.city, c.postcode, c.country].filter(Boolean).join(', ') : (selected.shippingAddress || '');
                  const shipping = (selected as any).shippingLabel || '';
                  return (
                    <div className="bg-[#0b1a30]/60 rounded-xl p-4 mb-4 space-y-1">
                      <p className="text-[#9cb8d9] text-xs font-medium uppercase tracking-wide mb-2">Customer</p>
                      <p className="text-white text-sm font-medium">{name}</p>
                      {email && <p className="text-[#9cb8d9] text-sm">{email}</p>}
                      {phone && <p className="text-[#9cb8d9] text-sm">{phone}</p>}
                      {address && <p className="text-[#9cb8d9] text-sm">{address}</p>}
                      {shipping && <p className="text-[#8caad4] text-xs mt-1">Shipping: {shipping}</p>}
                    </div>
                  );
                })()}

                {/* Bank Transfer Payment Panel — only for bank transfer orders */}
                {(selected as any).paymentMethod === 'bank_transfer' && (
                  <div className="bg-[#0b1a30]/60 rounded-xl p-4 mb-4 border border-amber-500/20">
                    <div className="flex items-center gap-2 mb-3">
                      <Banknote className="w-4 h-4 text-amber-400" />
                      <p className="text-amber-400 text-xs font-semibold uppercase tracking-wide">Bank Transfer Payment</p>
                    </div>

                    {/* Read-only fields */}
                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-[#9cb8d9]">Order Number</span>
                        <span className="text-white font-mono font-semibold">{(selected as any).bankTransferRef || selected.id?.slice(-10).toUpperCase()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[#9cb8d9]">Payment Method</span>
                        <span className="text-white">Manual Bank Transfer</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[#9cb8d9]">Amount Due</span>
                        <span className="text-amber-400 font-bold">£{((selected as any).total || selected.totalAmount || 0).toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Editable payment status */}
                    <div className="space-y-3">
                      <div>
                        <label className="text-[#9cb8d9] text-xs font-medium block mb-1.5">Payment Status</label>
                        <div className="flex gap-2">
                          {(['pending_bank_transfer', 'paid', 'cancelled'] as const).map(ps => (
                            <button
                              key={ps}
                              onClick={() => setPaymentStatusInput(ps)}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                paymentStatusInput === ps
                                  ? ps === 'paid'
                                    ? 'bg-green-600 border-green-500 text-white'
                                    : ps === 'cancelled'
                                    ? 'bg-red-600 border-red-500 text-white'
                                    : 'bg-amber-600 border-amber-500 text-white'
                                  : 'bg-[#0f2640] border-white/[0.12] text-[#8caad4] hover:text-white'
                              }`}
                            >
                              {ps === 'pending_bank_transfer' ? 'Awaiting' : ps === 'paid' ? 'Paid' : 'Cancelled'}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-[#9cb8d9] text-xs font-medium block mb-1.5">
                          Transfer Reference <span className="text-gray-600">(from your bank statement)</span>
                        </label>
                        <input
                          value={transferRefInput}
                          onChange={e => setTransferRefInput(e.target.value)}
                          placeholder="e.g. PHP-12345-ABCD or customer name"
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 font-mono"
                        />
                      </div>

                      {transferMsg && (
                        <div className={`flex items-center gap-2 p-2.5 rounded-lg text-xs ${
                          transferMsg.startsWith('Failed')
                            ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                            : 'bg-green-500/10 border border-green-500/30 text-green-400'
                        }`}>
                          {transferMsg.startsWith('Failed')
                            ? <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            : <CheckCheck className="w-3.5 h-3.5 shrink-0" />}
                          {transferMsg}
                        </div>
                      )}

                      <button
                        onClick={handleSavePaymentStatus}
                        disabled={transferLoading}
                        className="w-full flex items-center justify-center gap-2 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
                      >
                        {transferLoading
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <CheckCheck className="w-4 h-4" />}
                        {paymentStatusInput === 'paid' ? 'Confirm Payment Received' : paymentStatusInput === 'cancelled' ? 'Cancel Order' : 'Save Payment Status'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Items */}
                <div className="bg-[#0b1a30]/60 rounded-xl p-4 mb-4">
                  <p className="text-[#9cb8d9] text-xs font-medium uppercase tracking-wide mb-3">Items</p>
                  <div className="space-y-2">
                    {selected.items?.map((item: any, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-[#8caad4]">
                          {item.productName}
                          {item.variantName ? <span className="text-[#9cb8d9]"> — {item.variantName}</span> : ''}
                          <span className="text-[#2a4a7a]"> ×{item.quantity}</span>
                        </span>
                        <span className="text-white font-medium">£{((item.total || item.price * item.quantity) || 0).toFixed(2)}</span>
                      </div>
                    ))}
                    {(selected as any).subtotal !== undefined && (
                      <div className="border-t border-white/[0.08] pt-2 space-y-1 text-xs">
                        <div className="flex justify-between text-[#9cb8d9]">
                          <span>Subtotal</span><span>£{((selected as any).subtotal || 0).toFixed(2)}</span>
                        </div>
                        {(selected as any).discount > 0 && (
                          <div className="flex justify-between text-emerald-400">
                            <span>Discount</span><span>-£{((selected as any).discount || 0).toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-[#9cb8d9]">
                          <span>Shipping</span><span>{(selected as any).shippingCost === 0 ? 'FREE' : `£${((selected as any).shippingCost || 0).toFixed(2)}`}</span>
                        </div>
                      </div>
                    )}
                    <div className="border-t border-white/[0.08] pt-2 flex justify-between font-bold">
                      <span className="text-[#8caad4]">Total</span>
                      <span className="text-green-400">£{((selected as any).total || selected.totalAmount || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Dispatch / Tracking Section */}
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 mb-4">
                  <p className="text-blue-300 text-xs font-medium uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5" /> Dispatch & Tracking
                  </p>

                  {selected.trackingNumber && (
                    <div className="mb-3 p-2.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
                      <p className="text-xs text-[#9cb8d9] mb-0.5">Current tracking number</p>
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-blue-300 text-sm font-bold">{selected.trackingNumber}</p>
                        <button
                          onClick={() => copyToClipboard(selected.trackingNumber!, selected.id)}
                          className="p-1 hover:bg-blue-500/20 rounded transition-colors"
                          title="Copy tracking number"
                        >
                          <Copy className={`w-3.5 h-3.5 ${copiedTrackingId === selected.id ? 'text-green-400' : 'text-blue-300'}`} />
                        </button>
                      </div>
                      {selected.courier && (
                        <p className="text-xs text-[#9cb8d9] mt-1">Courier: <span className="text-blue-300">{selected.courier}</span></p>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <input
                      type="text"
                      value={trackingInput}
                      onChange={e => setTrackingInput(e.target.value)}
                      placeholder="Enter tracking number..."
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono"
                    />
                    <input
                      type="text"
                      value={courierInput}
                      onChange={e => setCourierInput(e.target.value)}
                      placeholder="Courier name (optional, e.g., DPD, DHL, Royal Mail)..."
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={handleSaveTracking}
                      disabled={trackingLoading || !trackingInput.trim()}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-[#0f2640] hover:bg-[#1a3a5c] disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      {trackingLoading ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={handleDispatch}
                      disabled={trackingLoading || !trackingInput.trim()}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {trackingLoading ? 'Sending...' : 'Dispatch'}
                    </button>
                  </div>

                  <div aria-live="polite" aria-atomic="true">
                    {trackingSuccess && (
                      <p className="mt-2 text-green-400 text-xs flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> {trackingSuccess}
                      </p>
                    )}
                    {trackingError && (
                      <p className="mt-2 text-red-400 text-xs">{trackingError}</p>
                    )}
                  </div>
                  <p className="mt-2 text-[#2a4a7a] text-xs">
                    Click "Save" to store the tracking number, or "Dispatch" to save it, mark as Shipped, and email the customer automatically.
                  </p>
                </div>

                {/* Reinstate Order — shown only for auto-cancelled orders */}
                {(selected as any).cancelReason === 'auto_72h_no_payment' && (
                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <RotateCcw className="w-4 h-4 text-amber-400" />
                      <p className="text-amber-400 text-xs font-semibold uppercase tracking-wide">Auto-Cancelled (72h no payment)</p>
                    </div>
                    <p className="text-[#9cb8d9] text-xs mb-3">This order was automatically cancelled after 72 hours without payment. You can reinstate it to allow the customer to complete payment.</p>
                    <button
                      onClick={() => handleReinstateOrder(selected.id)}
                      disabled={reinstating === selected.id}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 hover:border-amber-500/60 text-amber-400 hover:text-amber-300 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                    >
                      {reinstating === selected.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                      Reinstate Order
                    </button>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={() => generateShippingLabelPDF(selected)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#0f2640] hover:bg-[#1a3a5c] text-white rounded-xl text-sm font-medium transition-colors"
                  >
                    <Printer className="w-4 h-4" /> Print Label
                  </button>
                  <button
                    onClick={() => setSelected(null)}
                    className="flex-1 py-2.5 bg-[#0f2640] hover:bg-[#1a3a5c] text-white rounded-xl text-sm font-medium transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
