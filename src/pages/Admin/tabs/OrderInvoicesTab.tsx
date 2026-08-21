import { useEffect, useMemo, useState } from 'react';
import { FileText, Download, RefreshCw, Search, Loader2, ShieldCheck } from 'lucide-react';
import { getAllOrders, Order } from '@/lib/firebase';
import { toDateSafe, toMillisSafe } from '@/lib/to-date';
import { buildInvoiceNumber, downloadBankSafeInvoicePdf } from '@/lib/bank-safe-invoice';

interface Row {
  order: Order;
  invoiceNumber: string;
  date: Date | null;
}

function customerName(o: Order): string {
  const c = (o as any).customer || {};
  const name = `${c.firstName || (o as any).shippingFirstName || ''} ${c.lastName || (o as any).shippingLastName || ''}`.trim();
  return name || o.userName || o.userEmail || 'Customer';
}

function addressLines(o: Order): string[] {
  const c = (o as any).customer || {};
  if (c.address || c.city || c.postcode) {
    return [c.address, c.city, String(c.postcode || '').toUpperCase(), c.country || 'United Kingdom'].filter(
      Boolean,
    );
  }
  return String(o.shippingAddress || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function OrderInvoicesTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const orders = await getAllOrders();
      // Deterministic invoice numbering: oldest order in a year gets 0001.
      const ascending = [...orders].sort((a, b) => toMillisSafe(a.orderDate) - toMillisSafe(b.orderDate));
      const perYear = new Map<number, number>();
      const numbered = new Map<string, string>();
      ascending.forEach((o) => {
        const d = toDateSafe(o.orderDate);
        const year = d ? d.getFullYear() : new Date().getFullYear();
        const next = (perYear.get(year) || 0) + 1;
        perYear.set(year, next);
        numbered.set(o.id, buildInvoiceNumber(year, next));
      });
      setRows(
        [...orders]
          .sort((a, b) => toMillisSafe(b.orderDate) - toMillisSafe(a.orderDate))
          .map((order) => ({
            order,
            invoiceNumber: numbered.get(order.id) || buildInvoiceNumber(new Date().getFullYear(), 1),
            date: toDateSafe(order.orderDate),
          })),
      );
    } catch (e) {
      console.error('[OrderInvoicesTab] failed to load orders', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.invoiceNumber.toLowerCase().includes(q) ||
        (r.order.orderId || r.order.id).toLowerCase().includes(q) ||
        customerName(r.order).toLowerCase().includes(q) ||
        (r.order.userEmail || '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  const handleDownload = async (row: Row) => {
    setBusy(row.order.id);
    try {
      const o = row.order;
      await downloadBankSafeInvoicePdf({
        invoiceNumber: row.invoiceNumber,
        issuedDate: row.date,
        orderReference: o.orderId || o.id,
        buyerName: customerName(o),
        buyerAddressLines: addressLines(o),
        buyerEmail: (o as any).customer?.email || o.userEmail,
        items: (o.items || []).map((it) => ({
          sku: it.sku || it.variantId || it.productId,
          quantity: it.quantity,
          unitPrice: Number(it.price) || 0,
          lineTotal: Number(it.total) || undefined,
        })),
        subtotal: typeof o.subtotal === 'number' ? o.subtotal : undefined,
        discount: Number(o.discount ?? o.discountAmount ?? 0) || 0,
        shipping: Number(o.shippingCost ?? 0) || 0,
        total: Number(o.total ?? o.totalAmount ?? 0) || 0,
        currency: 'GBP',
        paymentMethod: 'Bank transfer (open banking)',
      });
    } catch (e) {
      console.error('[OrderInvoicesTab] PDF generation failed', e);
      alert('Could not generate the invoice PDF. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <FileText className="w-7 h-7 text-emerald-400" />
            Invoices / Faktury
          </h1>
          <p className="text-[#2a4a7a] text-sm mt-1">
            Download a bank-safe PDF invoice for any completed customer order.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-[#0f2640] hover:bg-[#1a3a5c] text-white rounded-lg text-sm transition-colors disabled:opacity-50 min-h-[44px]"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-200">
        <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
        <p>
          Line items print as neutral laboratory descriptions plus the internal SKU — no trade names.
          Footer: “{INVOICE_FOOTER_NOTE}”
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2a4a7a]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by invoice no., order ID, customer or email…"
          className="w-full bg-[#0b1a30]/60 border-2 border-slate-600 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-[#2a4a7a] text-sm min-h-[48px] focus:outline-none focus:border-emerald-500/60 transition-colors"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-[#2a4a7a]">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading orders…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-[#9cb8d9] font-medium">No orders found</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-[#0b1a30] text-[#9cb8d9]">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Invoice</th>
                  <th className="text-left px-4 py-3 font-semibold">Order ID</th>
                  <th className="text-left px-4 py-3 font-semibold">Customer</th>
                  <th className="text-left px-4 py-3 font-semibold">Date</th>
                  <th className="text-right px-4 py-3 font-semibold">Amount</th>
                  <th className="text-right px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.order.id} className="border-t border-white/5 hover:bg-white/5">
                    <td className="px-4 py-3 font-mono text-emerald-300">{r.invoiceNumber}</td>
                    <td className="px-4 py-3 font-mono text-[#9cb8d9]">{r.order.orderId || r.order.id}</td>
                    <td className="px-4 py-3 text-white">{customerName(r.order)}</td>
                    <td className="px-4 py-3 text-[#9cb8d9]">
                      {r.date ? r.date.toLocaleDateString('en-GB') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-white font-semibold">
                      £{(Number(r.order.total ?? r.order.totalAmount ?? 0) || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => void handleDownload(r)}
                        disabled={busy === r.order.id}
                        className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-60"
                      >
                        {busy === r.order.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        Download Invoice
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((r) => (
              <div key={r.order.id} className="rounded-xl border border-white/10 bg-[#0b1a30]/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-emerald-300 text-sm">{r.invoiceNumber}</span>
                  <span className="text-white font-semibold">
                    £{(Number(r.order.total ?? r.order.totalAmount ?? 0) || 0).toFixed(2)}
                  </span>
                </div>
                <p className="text-white text-sm mt-1">{customerName(r.order)}</p>
                <p className="text-[#2a4a7a] text-xs mt-0.5">
                  {r.order.orderId || r.order.id} · {r.date ? r.date.toLocaleDateString('en-GB') : '—'}
                </p>
                <button
                  onClick={() => void handleDownload(r)}
                  disabled={busy === r.order.id}
                  className="mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold min-h-[44px] disabled:opacity-60"
                >
                  {busy === r.order.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Download Invoice
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
