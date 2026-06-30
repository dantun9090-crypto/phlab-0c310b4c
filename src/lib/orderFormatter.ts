// GDPR-safe order formatter for LiveSalesPopup.
// Never expose surnames, emails, addresses, phones or postcodes.

export interface LiveOrder {
  id: string;
  initial: string;       // "J."
  city: string;          // "London" or "UK"
  productName: string;   // "BPC-157 5mg"
  productImage?: string; // optional thumbnail
  createdAtMs: number;   // epoch ms
  userId?: string;
}

interface RawOrderLike {
  id?: string;
  userId?: string;
  userName?: string;
  customer?: { firstName?: string; uid?: string } | null;
  items?: Array<{ name?: string; image?: string; imageUrl?: string }> | null;
  shippingAddress?: { city?: string } | null;
  orderDate?: { seconds?: number } | Date | null;
  createdAt?: { seconds?: number } | Date | null;
  status?: string;
}

const toMs = (v: unknown): number => {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
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
  const productName = item?.name?.trim();
  if (!id || !productName) return null;

  const firstName = raw.customer?.firstName || raw.userName;
  const city = raw.shippingAddress?.city?.trim() || 'UK';
  const createdAtMs = toMs(raw.orderDate) || toMs(raw.createdAt);

  return {
    id,
    initial: firstInitial(firstName),
    city,
    productName,
    productImage: item?.image || item?.imageUrl,
    createdAtMs,
    userId: raw.customer?.uid || raw.userId,
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

export const formatLivePopupText = (o: LiveOrder, now?: number): string =>
  `${o.initial} from ${o.city} purchased ${o.productName} ${formatTimeAgo(o.createdAtMs, now)}`;
