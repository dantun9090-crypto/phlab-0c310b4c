/**
 * Server-fn wrapper for creating an order. Thin file — the implementation
 * lives in `create-order.server.ts` (which uses Firebase Admin and must
 * not be bundled into the client).
 */
import { createServerFn } from '@tanstack/react-start';
import { createOrderInputSchema, type CreateOrderResult } from './create-order.server';

export type { CreateOrderResult } from './create-order.server';

export const createOrder = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => createOrderInputSchema.parse(input))
  .handler(async ({ data }): Promise<CreateOrderResult> => {
    const { runCreateOrder } = await import('./create-order.server');
    try {
      return await runCreateOrder(data);
    } catch (err: any) {
      // Surface validation errors with a clean message; never leak internals.
      const message = typeof err?.message === 'string' && err.message.length < 300
        ? err.message
        : 'Order could not be created. Please review your cart and try again.';
      throw new Error(message);
    }
  });
