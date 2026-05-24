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
  errors: string[];
}

export const validateCartPrices = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<ValidateCartResult> => {
    const errors: string[] = [];
    const validated: ValidatedLine[] = [];

    // Fetch each product document from the Firestore REST API. The
    // `product_stock` collection has public read rules already (the shop
    // page reads it unauthenticated), so no auth token is required.
    await Promise.all(
      data.items.map(async (line) => {
        const url = `${FIRESTORE_BASE}/product_stock/${encodeURIComponent(line.productId)}`;
        let res: Response;
        try {
          res = await fetch(url, { headers: { Accept: 'application/json' } });
        } catch {
          errors.push(`Could not verify price for "${line.productId}"`);
          return;
        }

        if (res.status === 404) {
          errors.push(`Product "${line.productId}" no longer exists`);
          return;
        }
        if (!res.ok) {
          errors.push(`Could not verify price for "${line.productId}" (status ${res.status})`);
          return;
        }

        const doc = (await res.json()) as { fields?: Record<string, FsValue> };
        const fields = doc.fields ?? {};
        const productName = (decode(fields.name) as string) || line.productId;

        // Resolve canonical unit price: prefer matching variant, else top-level price.
        let unitPrice = NaN;
        let variantName: string | null = null;
        const variants = decode(fields.variants) as Array<Record<string, unknown>> | undefined;

        if (line.variantId && Array.isArray(variants)) {
          const match = variants.find((v) => v && v.id === line.variantId);
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
          productId: line.productId,
          variantId: line.variantId ?? null,
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
    return {
      ok: errors.length === 0 && validated.length === data.items.length,
      items: validated,
      subtotal,
      errors,
    };
  });
