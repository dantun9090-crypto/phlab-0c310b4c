// GDPR-safe order formatter for LiveSalesPopup.
// Never expose surnames, emails, addresses, phones or postcodes.

export interface LiveOrder {
  id: string;
  initial: string;       // "J."
  city: string;          // "London" or "UK"
  productName: string;   // "BPC-157 5mg"
  productImage?: string; // optional thumbnail
  createdAtMs: number;   // epoch ms
  status?: string;
}

interface RawOrderLike {
  id?: string;
  userId?: string;
  userName?: string;
  customerName?: string;
  firstName?: string;
  customer?: { firstName?: string; uid?: string; city?: string } | null;
  items?: Array<{ name?: string; productName?: string; image?: string; imageUrl?: string }> | null;
  shippingAddress?: { city?: string } | string | null;
  orderDate?: { seconds?: number } | Date | string | null;
  createdAt?: { seconds?: number } | Date | string | null;
  status?: string;
}

const toMs = (v: unknown): number => {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string') {
    const parsed = Date.parse(v);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof v === 'object' && v !== null && 'seconds' in (v as any)) {
    const s = (v as { seconds?: number }).seconds;
    return typeof s === 'number' ? s * 1000 : 0;
  }
  return 0;
};

const firstInitial = (name?: string): string => {
  if (!name) return 'A.';
  const trimmed = name.trim();
  if (!trimmed) return 'A.';
  const ch = trimmed.charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? `${ch}.` : 'A.';
};

export const mapRawOrderToLive = (raw: RawOrderLike): LiveOrder | null => {
  const id = raw.id;
  const item = raw.items?.[0];
  const productName = (item?.name || item?.productName)?.trim();
  if (!id || !productName) return null;

  const firstName = raw.customer?.firstName || raw.firstName || raw.userName || raw.customerName;
  const city =
    (typeof raw.shippingAddress === 'object' && raw.shippingAddress?.city?.trim()) ||
    raw.customer?.city?.trim() ||
    'UK';
  const createdAtMs = toMs(raw.orderDate) || toMs(raw.createdAt) || Date.now();

  return {
    id,
    initial: firstInitial(firstName),
    city,
    productName,
    productImage: item?.image || item?.imageUrl,
    createdAtMs,
    userId: raw.customer?.uid || raw.userId,
    status: raw.status,
  };
};

export const formatTimeAgo = (ms: number, now: number = Date.now()): string => {
  if (!ms) return 'just now';
  const diff = Math.max(0, now - ms);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
};

export const formatLivePopupText = (o: LiveOrder, now?: number): string => {
  const status = String(o.status || '').toLowerCase();
  const verb = ['paid', 'completed', 'processing', 'shipped', 'delivered', 'fulfilled'].includes(status)
    ? 'purchased'
    : 'placed an order for';
  return `${o.initial} from ${o.city} ${verb} ${o.productName} ${formatTimeAgo(o.createdAtMs, now)}`;
};
