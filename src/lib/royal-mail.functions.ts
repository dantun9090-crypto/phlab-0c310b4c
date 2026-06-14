/**
 * Server function: create a Royal Mail Click & Drop order.
 *
 * Admin-only. Verifies the caller's Firebase ID token + admin flag,
 * then forwards the order to the Royal Mail Cloudflare Worker using
 * the server-side `ROYAL_MAIL_WORKER_TOKEN` secret. This keeps the
 * shared secret out of the client bundle (previously leaked via
 * VITE_ROYAL_MAIL_WORKER_TOKEN).
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireFirebaseAdmin } from './server/firebase-auth-admin';

const WORKER_URL = 'https://royal-mail-order.dantun9090.workers.dev';

const Input = z.object({
  idToken: z.string().min(10).max(4096),
  orderId: z.string().min(1).max(120),
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  addressLine1: z.string().min(1).max(200),
  addressLine2: z.string().max(200).optional().default(''),
  city: z.string().max(120).optional().default(''),
  postcode: z.string().min(1).max(20),
  email: z.string().email().max(320),
  phone: z.string().max(40).optional().default(''),
  countryCode: z.string().length(2).default('GB'),
  serviceCode: z.string().max(40).optional(),
  weightGrams: z.number().int().min(1).max(30000).default(100),
  subtotal: z.number().min(0).max(1_000_000),
  shippingCostCharged: z.number().min(0).max(1_000_000),
  total: z.number().min(0).max(1_000_000),
});

export interface RoyalMailResult {
  ok: boolean;
  orderId?: string;
  trackingNumber?: string | null;
  error?: string;
  details?: unknown;
  status?: number;
}

export const createRoyalMailOrder = createServerFn({ method: 'POST' })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }): Promise<RoyalMailResult> => {
    await requireFirebaseAdmin(data.idToken);

    const token = process.env.ROYAL_MAIL_WORKER_TOKEN;
    if (!token) {
      return { ok: false, error: 'royal_mail_worker_token_missing' };
    }

    const { idToken: _omit, ...payload } = data;

    let res: Response;
    try {
      res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-phlabs-auth': token,
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return { ok: false, error: `worker_unreachable: ${(e as Error).message}` };
    }

    const body = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      const errMsg = typeof body?.error === 'string'
        ? body.error
        : body?.error
          ? JSON.stringify(body.error)
          : `worker_status_${res.status}`;
      return { ok: false, status: res.status, error: errMsg, details: body?.details };
    }
    return {
      ok: true,
      orderId: body?.orderId ? String(body.orderId) : undefined,
      trackingNumber: body?.trackingNumber ? String(body.trackingNumber) : null,
    };
  });
