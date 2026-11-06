/**
 * Purchase conversion recovery.
 *
 * Problem: the GA4 `purchase` event (and the Google Ads conversion derived
 * from it) only fired while the buyer was sitting on the checkout success
 * page. After an Open Banking app-switch many buyers never return to that
 * page, so a paid order produced no conversion — Google Ads therefore shows
 * "no recent conversions" for the purchase action.
 *
 * Fix: on every app boot we look at the last pending order id
 * (`php_pending_order`, written at checkout). If that order is now paid and
 * the conversion has not been fired yet, fire it once — from whichever page
 * the buyer happens to land on.
 *
 * Idempotency uses the same `php_ga_purchase_<orderId>` flag as the success
 * page, so an order can never be counted twice.
 */
import { trackPurchase, type GaItem } from "@/lib/analytics";
import { trackBingPurchase } from "@/lib/bing-uet";

const PENDING_KEY = "php_pending_order";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const AGE_KEY = "php_pending_order_at";

const PAID_STATUSES = new Set(["paid", "processing", "shipped", "delivered", "completed", "success"]);
const DEAD_STATUSES = new Set(["failed", "expired", "cancelled", "canceled", "refunded"]);

function firedKey(orderId: string) {
  return `php_ga_purchase_${orderId}`;
}

function clearPending() {
  try {
    localStorage.removeItem(PENDING_KEY);
    localStorage.removeItem(AGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Wait until gtag exists (initAnalytics resolves it) — max ~6s. */
async function waitForGtag(): Promise<boolean> {
  for (let i = 0; i < 30; i += 1) {
    if (typeof window !== "undefined" && window.gtag) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

function toItems(data: Record<string, unknown>): GaItem[] {
  const raw = (data.items ?? data.products ?? []) as Array<Record<string, unknown>>;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({
    item_id: String(item.sku ?? item.productId ?? item.id ?? ""),
    item_name: String(item.name ?? item.title ?? "Research compound"),
    item_variant: item.variant ? String(item.variant) : undefined,
    price: Number(item.price ?? 0) || 0,
    quantity: Number(item.quantity ?? 1) || 1,
    currency: "GBP",
  }));
}

/**
 * Fire the purchase conversion for the last pending order if it is now paid.
 * Safe to call on every page load — no-ops when there is nothing to recover.
 */
export async function recoverPendingPurchase(): Promise<void> {
  if (typeof window === "undefined") return;

  let orderId = "";
  try {
    orderId = localStorage.getItem(PENDING_KEY) ?? "";
    const at = Number(localStorage.getItem(AGE_KEY) ?? 0);
    if (at && Date.now() - at > MAX_AGE_MS) {
      clearPending();
      return;
    }
    if (!orderId) return;
    if (localStorage.getItem(firedKey(orderId)) === "1") {
      clearPending();
      return;
    }
  } catch {
    return;
  }

  try {
    const [{ doc, getDoc }, { db }] = await Promise.all([
      import("firebase/firestore"),
      import("@/lib/firebase"),
    ]);
    const snap = await getDoc(doc(db, "orders", orderId));
    if (!snap.exists()) return;
    const data = snap.data() as Record<string, unknown>;
    const status = String(data.status ?? "").toLowerCase();

    if (DEAD_STATUSES.has(status)) {
      clearPending();
      return;
    }
    if (!PAID_STATUSES.has(status)) return; // still pending — try again next visit

    if (!(await waitForGtag())) return;

    const totalRaw = (data.total ?? data.totalPrice ?? data.amount ?? 0) as number | string;
    const value = typeof totalRaw === "string" ? parseFloat(totalRaw) : Number(totalRaw);
    const tax = Number(data.tax ?? 0) || 0;
    const shipping = Number(data.shipping ?? data.shippingCost ?? 0) || 0;
    const ship = (data.shippingAddress ?? data.shipping_address ?? {}) as Record<string, unknown>;

    const fired = await trackPurchase(orderId, Number.isFinite(value) ? value : 0, toItems(data), {
      tax,
      shipping,
      userData: {
        email: String(data.email ?? data.customerEmail ?? ship.email ?? "") || undefined,
        phone: String(data.phone ?? ship.phone ?? "") || undefined,
        firstName: String(ship.firstName ?? ship.first_name ?? "") || undefined,
        lastName: String(ship.lastName ?? ship.last_name ?? "") || undefined,
        country: String(ship.country ?? ship.countryCode ?? "GB") || undefined,
        postalCode: String(ship.postalCode ?? ship.postcode ?? ship.zip ?? "") || undefined,
      },
    });
    trackBingPurchase(orderId);
    // Leave the pending marker in place when the tag never became ready, so
    // the next page load retries instead of losing the conversion forever.
    if (!fired) return;
    try {
      localStorage.setItem(firedKey(orderId), "1");
    } catch {
      /* ignore */
    }
    clearPending();

  } catch {
    /* analytics must never break the page */
  }
}
