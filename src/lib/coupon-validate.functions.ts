/**
 * Public server-fn to validate a promo code from the client (e.g. the
 * checkout "Apply" button). Lives outside cart validation so it can be
 * called without sending the entire cart; final authoritative validation
 * still happens in `validateCartPrices` on order creation.
 *
 * Reads from /coupons via server-side Firestore REST so client RLS
 * (admin-only read on /coupons) is respected and bypassed safely.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

const Input = z.object({
  code: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
  subtotal: z.number().min(0).max(1_000_000),
});

export type ValidateCouponResult =
  | { ok: true; coupon: { id: string; code: string; type: 'percentage' | 'fixed' | 'free_shipping'; value: number } }
  | { ok: false; error: string };

export const validateCouponFn = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<ValidateCouponResult> => {
    const { lookupCoupon } = await import('./cart-validation.server');
    const res = await lookupCoupon(data.code, data.subtotal);
    if (res.coupon) return { ok: true, coupon: res.coupon };
    return { ok: false, error: res.error ?? 'Invalid coupon.' };
  });
