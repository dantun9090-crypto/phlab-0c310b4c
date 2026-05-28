/**
 * Server-side cart validation.
 *
 * SECURITY: `Checkout/index.tsx` previously computed order totals from
 * `localStorage.php_cart` values and wrote them straight to the Firestore
 * `orders` collection — letting any visitor set `priceNum: 0` in DevTools
 * and place a £0 order (`cart_price_manipulation` finding).
 *
 * This server function re-reads each product's canonical price from the
 * Firestore `product_stock` collection via the REST API (the collection is
 * already publicly readable — same data the shop page uses) and returns
 * authoritative per-line and subtotal numbers. The checkout flow must use
 * THESE values when writing the order document.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

const FIREBASE_PROJECT_ID = 'prohealthpeptides-a0808';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

const cartItemSchema = z.object({
  productId: z.string().min(1).max(128),
  variantId: z.string().max(128).optional().nullable(),
  quantity: z.number().int().min(1).max(99),
});

const inputSchema = z.object({
  items: z.array(cartItemSchema).min(1).max(50),
  couponCode: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).optional().nullable(),
  shippingCost: z.number().min(0).max(1000).optional(),
});

type CouponType = 'percentage' | 'fixed' | 'free_shipping';
interface ValidatedCoupon {
  id: string;
  code: string;
  type: CouponType;
  value: number;
}

// ---- Firestore REST value decoding -----------------------------------------
type FsValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { mapValue: { fields?: Record<string, FsValue> } }
  | { arrayValue: { values?: FsValue[] } };

function decode(v: FsValue | undefined): unknown {
  if (!v) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) {
    const out: Record<string, unknown> = {};
    const fields = v.mapValue.fields ?? {};
    for (const k of Object.keys(fields)) out[k] = decode(fields[k]);
    return out;
  }
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decode);
  return undefined;
}

function parsePrice(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const n = parseFloat(raw.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

interface ValidatedLine {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  inStock: boolean;
}

export interface ValidateCartResult {
  ok: boolean;
  items: ValidatedLine[];
  subtotal: number;
  discount: number;
  shippingDiscount: number;
  coupon: ValidatedCoupon | null;
  couponError: string | null;
  errors: string[];
}

async function lookupCoupon(code: string, subtotal: number): Promise<{ coupon: ValidatedCoupon | null; error: string | null }> {
  const upper = code.toUpperCase();
  try {
    const res = await fetch(`${FIRESTORE_BASE}:runQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'coupons' }],
          where: {
            compositeFilter: {
              op: 'AND',
              filters: [
                { fieldFilter: { field: { fieldPath: 'code' }, op: 'EQUAL', value: { stringValue: upper } } },
                { fieldFilter: { field: { fieldPath: 'isActive' }, op: 'EQUAL', value: { booleanValue: true } } },
              ],
            },
          },
          limit: 1,
        },
      }),
    });
    if (!res.ok) return { coupon: null, error: 'Could not validate coupon.' };
    const rows = (await res.json()) as Array<{ document?: { name: string; fields?: Record<string, FsValue> } }>;
    const docRow = rows.find((r) => r.document)?.document;
    if (!docRow) return { coupon: null, error: 'Invalid or expired coupon code.' };
    const fields = docRow.fields ?? {};
    const id = docRow.name.split('/').pop() ?? '';
    const type = decode(fields.type) as CouponType | undefined;
    const value = parsePrice(decode(fields.value));
    const expiryRaw = fields.expiryDate as { timestampValue?: string } | undefined;
    if (expiryRaw?.timestampValue && new Date(expiryRaw.timestampValue) < new Date()) {
      return { coupon: null, error: 'Coupon has expired.' };
    }
    const maxUses = (decode(fields.maxUses) ?? decode(fields.maxUsage)) as number | undefined;
    const usedCount = (decode(fields.usedCount) ?? decode(fields.usageCount) ?? 0) as number;
    if (typeof maxUses === 'number' && maxUses > 0 && usedCount >= maxUses) {
      return { coupon: null, error: 'Coupon usage limit reached.' };
    }
    const minOrderValue = (decode(fields.minOrderValue) as number | undefined) ?? 0;
    if (minOrderValue && subtotal < minOrderValue) {
      return { coupon: null, error: `Order must be at least £${minOrderValue.toFixed(2)} to use this coupon.` };
    }
    if (!type || !['percentage', 'fixed', 'free_shipping'].includes(type)) {
      return { coupon: null, error: 'Invalid coupon configuration.' };
    }
    if (type !== 'free_shipping' && (!Number.isFinite(value) || value < 0)) {
      return { coupon: null, error: 'Invalid coupon configuration.' };
    }
    return { coupon: { id, code: upper, type, value: Number.isFinite(value) ? value : 0 }, error: null };
  } catch {
    return { coupon: null, error: 'Could not validate coupon.' };
  }
}

type ValidateInput = z.infer<typeof inputSchema>;

/**
 * Pure handler used both by the server function and by unit tests.
 * Exported so tests can call it without the TanStack server-fn wrapper.
 */
export async function runValidateCart(data: ValidateInput): Promise<ValidateCartResult> {
  const errors: string[] = [];
  const validated: ValidatedLine[] = [];

  // Fetch each product document from the Firestore REST API. The
  // `product_stock` collection has public read rules already (the shop
  // page reads it unauthenticated), so no auth token is required.
  await Promise.all(
    data.items.map(async (line) => {
      // Resolve productId + variantId, tolerating legacy carts where the
      // cart item id was stored as `<productId>-<variantId>` concatenated.
      let productId = line.productId;
      let variantId: string | null = line.variantId ?? null;
      const originalProductId = line.productId;
      const originalVariantId = line.variantId ?? null;

      const fetchDoc = async (id: string) => {
        try {
          return await fetch(
            `${FIRESTORE_BASE}/product_stock/${encodeURIComponent(id)}`,
            { headers: { Accept: 'application/json' } },
          );
        } catch {
          return null;
        }
      };

      let res = await fetchDoc(productId);
      let fallbackAttempted = false;
      let fallbackSucceeded = false;
      let fallbackProductId: string | null = null;
      let fallbackVariantId: string | null = null;

      if (res && res.status === 404 && productId.includes('-')) {
        // Legacy fallback: split on the LAST hyphen to recover variantId.
        const dash = productId.lastIndexOf('-');
        fallbackProductId = productId.slice(0, dash);
        fallbackVariantId = productId.slice(dash + 1);
        fallbackAttempted = true;
        const retry = await fetchDoc(fallbackProductId);
        if (retry && retry.ok) {
          productId = fallbackProductId;
          variantId = variantId || fallbackVariantId;
          res = retry;
          fallbackSucceeded = true;
        }
      }

      // Extended diagnostic logging. Only logs IDs (already non-sensitive —
      // product slugs and variant ids are public) and resolution status.
      // No prices, no auth, no user data are ever logged.
      const logLookup = (outcome: 'ok' | 'not_found' | 'error', extra?: Record<string, unknown>) => {
        // eslint-disable-next-line no-console
        console.info('[cart-validation] product_stock lookup', {
          outcome,
          originalProductId,
          originalVariantIdProvided: originalVariantId !== null,
          resolvedProductId: productId,
          resolvedVariantId: variantId,
          fallbackAttempted,
          fallbackSucceeded,
          fallbackProductId,
          fallbackVariantId,
          httpStatus: res?.status ?? null,
          ...extra,
        });
      };

      if (!res) {
        logLookup('error', { reason: 'fetch_threw' });
        errors.push(`Could not verify price for "${productId}"`);
        return;
      }
      if (res.status === 404) {
        logLookup('not_found');
        errors.push(`Product "${productId}" no longer exists`);
        return;
      }
      if (!res.ok) {
        logLookup('error', { reason: 'http_error' });
        errors.push(`Could not verify price for "${productId}" (status ${res.status})`);
        return;
      }

      if (fallbackSucceeded) logLookup('ok', { note: 'resolved_via_fallback' });


      const doc = (await res.json()) as { fields?: Record<string, FsValue> };
      const fields = doc.fields ?? {};
      const productName = (decode(fields.name) as string) || productId;

      // Resolve canonical unit price: prefer matching variant, else top-level price.
      let unitPrice = NaN;
      let variantName: string | null = null;
      const variants = decode(fields.variants) as Array<Record<string, unknown>> | undefined;

      if (variantId && Array.isArray(variants)) {
        const match = variants.find((v) => v && v.id === variantId);
        if (match) {
          unitPrice = parsePrice(match.price);
          variantName = typeof match.name === 'string' ? match.name : null;
        }
      }
      if (!Number.isFinite(unitPrice)) {
        unitPrice = parsePrice(decode(fields.price));
      }

      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        errors.push(`No valid price on file for "${productName}"`);
        return;
      }

      // Stock check (best-effort — admin can also enforce server-side later).
      let inStock = true;
      const stockNum = decode(fields.stock);
      const inStockFlag = decode(fields.inStock);
      if (typeof stockNum === 'number') {
        inStock = stockNum >= line.quantity;
      } else if (typeof inStockFlag === 'boolean') {
        inStock = inStockFlag;
      }
      if (!inStock) {
        errors.push(`"${productName}" is out of stock or has insufficient quantity`);
      }

      const lineTotal = +(unitPrice * line.quantity).toFixed(2);
      validated.push({
        productId,
        variantId,
        productName,
        variantName,
        quantity: line.quantity,
        unitPrice: +unitPrice.toFixed(2),
        lineTotal,
        inStock,
      });
    }),
  );

  const subtotal = +validated.reduce((s, l) => s + l.lineTotal, 0).toFixed(2);

  // SECURITY: Re-validate coupon server-side and compute the authoritative
  // discount. Never trust discount/coupon values sent from the client.
  let coupon: ValidatedCoupon | null = null;
  let couponError: string | null = null;
  let discount = 0;
  let shippingDiscount = 0;
  if (data.couponCode) {
    const result = await lookupCoupon(data.couponCode, subtotal);
    coupon = result.coupon;
    couponError = result.error;
    if (coupon) {
      if (coupon.type === 'percentage') {
        discount = +(subtotal * coupon.value / 100).toFixed(2);
      } else if (coupon.type === 'fixed') {
        discount = +Math.min(coupon.value, subtotal).toFixed(2);
      } else if (coupon.type === 'free_shipping' && typeof data.shippingCost === 'number') {
        shippingDiscount = +data.shippingCost.toFixed(2);
      }
    }
  }

  return {
    ok: errors.length === 0 && validated.length === data.items.length && !couponError,
    items: validated,
    subtotal,
    discount,
    shippingDiscount,
    coupon,
    couponError,
    errors: couponError ? [...errors, couponError] : errors,
  };
}

export const validateCartPrices = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<ValidateCartResult> => runValidateCart(data));
