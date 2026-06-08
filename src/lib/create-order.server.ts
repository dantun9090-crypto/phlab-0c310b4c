/**
 * Server-only order creation. Re-validates cart prices/stock/coupon via
 * `runValidateCart`, recomputes the canonical totals from the server-side
 * product_stock prices, and writes the order with the service account
 * (bypassing Firestore rules).
 *
 * Clients never set totalAmount/subtotal/discount/shipping — those values
 * are derived here. Anything fulfilment-related (paid, refunded, dispatch,
 * tracking, admin notes) is forbidden in the client payload schema.
 *
 * NEVER import this file from client code.
 */
import { z } from 'zod';
import { runValidateCart, type ValidateCartResult } from './cart-validation.server';
import { addDocAdmin, getDocAdmin, updateDocAdmin } from './server/firestore-admin';
import { verifyFirebaseIdToken } from './server/firebase-auth-admin';
import {
  SHIPPING_CONFIG,
  checkNextDayEligibility,
  getStandardDeliveryWindow,
  getCutoffInstant,
} from './shipping/next-day';

const SHIPPING_OPTIONS = {
  standard:    { id: 'standard',    label: 'Standard 1–3 Day Delivery', price: SHIPPING_CONFIG.standardPrice },
  next_day_12: { id: 'next_day_12', label: 'Next Day by 12 PM',         price: SHIPPING_CONFIG.nextDayPrice },
} as const;

const FREE_SHIPPING_THRESHOLD = SHIPPING_CONFIG.freeThreshold;

const itemSchema = z.object({
  productId: z.string().min(1).max(128),
  productName: z.string().min(1).max(256),
  variantId: z.string().max(128).nullable().optional(),
  variantName: z.string().max(256).nullable().optional(),
  quantity: z.number().int().min(1).max(99),
});

export const createOrderInputSchema = z.object({
  items: z.array(itemSchema).min(1).max(50),
  customer: z.object({
    firstName: z.string().min(1).max(80),
    lastName:  z.string().min(1).max(80),
    email:     z.string().email().max(320),
    phone:     z.string().max(40).optional().default(''),
    address:   z.string().min(1).max(200),
    city:      z.string().min(1).max(80),
    postcode:  z.string().min(1).max(20),
    country:   z.string().min(1).max(80),
  }),
  shippingMethod: z.enum(['standard', 'next_day_12']),
  paymentMethod: z.enum(['bank_transfer', 'pay_by_bank']),
  ageVerified: z.literal(true),
  termsAccepted: z.literal(true),
  couponCode: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).optional().nullable(),
  idToken: z.string().min(1).max(4096).optional().nullable(),
});

export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;

export interface CreateOrderResult {
  ok: true;
  orderId: string;
  bankTransferReference: string;
  subtotal: number;
  discount: number;
  shippingCost: number;
  totalAmount: number;
  couponCode: string | null;
}

export async function runCreateOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const baseShipping = SHIPPING_OPTIONS[input.shippingMethod].price;

  // Authoritative re-pricing — server reads product_stock, applies coupon.
  const validation: ValidateCartResult = await runValidateCart({
    items: input.items.map(i => ({
      productId: i.productId,
      variantId: i.variantId ?? null,
      quantity: i.quantity,
    })),
    couponCode: input.couponCode ?? null,
    shippingCost: baseShipping,
    idToken: input.idToken ?? null,
  });

  if (!validation.ok) {
    const err = new Error(validation.errors[0] ?? 'Cart validation failed');
    (err as any).validation = validation;
    throw err;
  }

  // Derive authoritative shipping + total. Never trust any client total.
  // Next-day shipping is ALWAYS paid (not eligible for free-over-£50 or free-shipping coupons).
  const isNextDay = input.shippingMethod === 'next_day_12';
  const isFreeShipping = !isNextDay && validation.subtotal >= FREE_SHIPPING_THRESHOLD;
  const baseCost = isFreeShipping ? 0 : baseShipping;
  const shippingDisc = isNextDay ? 0 : validation.shippingDiscount;
  const shippingCost = +Math.max(0, baseCost - shippingDisc).toFixed(2);
  const totalAmount  = +Math.max(0, validation.subtotal - validation.discount + shippingCost).toFixed(2);

  // Server-side guard: re-verify Next Day eligibility at order time (defence
  // in depth — client UI hides the option but never trust the client).
  const nowAtOrder = new Date();
  const eligibility = checkNextDayEligibility(nowAtOrder);
  const nextDayMissedCutoff = isNextDay && !eligibility.qualifies;

  // Resolve userId from id token (optional — guest checkout allowed).
  let userId: string | null = null;
  if (input.idToken) {
    try {
      const verified = await verifyFirebaseIdToken(input.idToken);
      userId = verified.uid;
    } catch {
      userId = null;
    }
  }

  const orderId = 'PHP-' + Date.now().toString(36).toUpperCase();
  const btRef = `PHP-${orderId.slice(4)}-BT`;
  const nowIso = new Date();

  // Rebuild items using server-validated unit prices.
  const validatedByKey = new Map<string, ValidateCartResult['items'][number]>();
  for (const v of validation.items) {
    validatedByKey.set(`${v.productId}::${v.variantId ?? ''}`, v);
  }

  const orderItems = input.items.map(i => {
    const key = `${i.productId}::${i.variantId ?? ''}`;
    const v = validatedByKey.get(key);
    const unit = v?.unitPrice ?? 0;
    return {
      productId: i.productId,
      productName: i.productName,
      variantId: i.variantId ?? null,
      variantName: i.variantName ?? null,
      quantity: i.quantity,
      price: unit,
      total: +(unit * i.quantity).toFixed(2),
    };
  });

  const shippingLabel = isNextDay
    ? SHIPPING_OPTIONS.next_day_12.label
    : (isFreeShipping ? 'Free Delivery (order over £50)' : SHIPPING_OPTIONS.standard.label);

  // Compute expected delivery + cut-off stamps for fulfilment.
  const cutoffInstant = getCutoffInstant(nowAtOrder);
  let expectedDeliveryDate: string | null = null;
  let expectedDeliveryFrom: string | null = null;
  let expectedDeliveryTo: string | null = null;
  if (isNextDay && eligibility.qualifies && eligibility.expectedDeliveryDate) {
    expectedDeliveryDate = eligibility.expectedDeliveryDate;
  } else {
    const window = getStandardDeliveryWindow(nowAtOrder);
    expectedDeliveryFrom = window.from;
    expectedDeliveryTo = window.to;
  }

  const orderData = {
    orderId,
    customer: input.customer,
    items: orderItems,
    subtotal: validation.subtotal,
    discount: validation.discount,
    couponCode: validation.coupon?.code ?? null,
    shippingCost,
    shippingMethod: input.shippingMethod,
    shippingLabel,
    cutoffTime: cutoffInstant,
    orderedBeforeCutoff: eligibility.qualifies,
    expectedDeliveryDate,
    expectedDeliveryFrom,
    expectedDeliveryTo,
    nextDayMissedCutoff,
    total: totalAmount,
    totalAmount,
    currency: 'GBP',
    paymentMethod: input.paymentMethod,
    bankTransferReference: btRef,
    status: 'pending_payment',
    userId,
    tcAccepted: true,
    tcAcceptedAt: nowIso,
    termsAccepted: true,
    termsAcceptedAt: nowIso,
    ageVerified: true,
    ageVerifiedAt: nowIso,
    termsVersion: '1.0',
    createdAt: nowIso,
    orderDate: nowIso,
  };

  await addDocAdmin('orders', orderData, orderId);

  // Server-side stock decrement. Runs AFTER the order is written so an
  // accounting trail exists. Best-effort per item — a stock-update failure
  // does NOT fail the order (admins can reconcile via /admin/inventory).
  await Promise.all(
    input.items.map(async (item) => {
      try {
        const doc = await getDocAdmin('products', item.productId);
        if (!doc) return;
        if (Array.isArray(doc.variants) && doc.variants.length > 0 && item.variantId) {
          const variants = (doc.variants as Array<Record<string, any>>).map((v) =>
            v?.id === item.variantId
              ? { ...v, stock: Math.max(0, Number(v?.stock ?? 0) - item.quantity) }
              : v,
          );
          await updateDocAdmin('products', item.productId, { variants });
        } else if (typeof doc.stock === 'number') {
          await updateDocAdmin('products', item.productId, {
            stock: Math.max(0, doc.stock - item.quantity),
          });
        }
      } catch {
        // Swallow — order is already placed, manual reconciliation possible.
      }
    }),
  );

  return {
    ok: true,
    orderId,
    bankTransferReference: btRef,
    subtotal: validation.subtotal,
    discount: validation.discount,
    shippingCost,
    totalAmount,
    couponCode: validation.coupon?.code ?? null,
  };
}
