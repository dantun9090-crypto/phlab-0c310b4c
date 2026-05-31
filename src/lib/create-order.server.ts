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
import { addDocAdmin } from './server/firestore-admin';
import { verifyFirebaseIdToken } from './server/firebase-auth-admin';

const SHIPPING_OPTIONS = {
  standard: { id: 'standard', label: 'Standard Delivery', price: 4.99 },
  express:  { id: 'express',  label: 'Express Delivery',  price: 9.99 },
} as const;

const FREE_SHIPPING_THRESHOLD = 50;

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
  shippingMethod: z.enum(['standard', 'express']),
  paymentMethod: z.literal('bank_transfer'),
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
  const isFreeShipping = validation.subtotal >= FREE_SHIPPING_THRESHOLD;
  const baseCost = isFreeShipping ? 0 : baseShipping;
  const shippingCost = +Math.max(0, baseCost - validation.shippingDiscount).toFixed(2);
  const totalAmount  = +Math.max(0, validation.subtotal - validation.discount + shippingCost).toFixed(2);

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

  const shippingLabel = isFreeShipping
    ? 'Free Delivery (order over £50)'
    : SHIPPING_OPTIONS[input.shippingMethod].label;

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
    total: totalAmount,
    totalAmount,
    currency: 'GBP',
    paymentMethod: 'bank_transfer',
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

  await addDocAdmin('orders', orderData);

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
