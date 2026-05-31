/**
 * Server-fn wrapper for cart validation. Thin file — the implementation
 * lives in `cart-validation.server.ts` (which imports Firebase Admin
 * helpers and must not be bundled into the client).
 */
import { createServerFn } from '@tanstack/react-start';
import { cartInputSchema, type ValidateCartResult } from './cart-validation.server';

export type { ValidateCartResult } from './cart-validation.server';

export const validateCartPrices = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => cartInputSchema.parse(input))
  .handler(async ({ data }): Promise<ValidateCartResult> => {
    const { runValidateCart } = await import('./cart-validation.server');
    return runValidateCart(data);
  });
