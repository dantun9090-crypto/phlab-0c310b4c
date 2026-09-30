/**
 * Thin server-fn wrapper for the UK postcode → address lookup.
 * Implementation lives in `postcode-lookup.server.ts`.
 */
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import type { PostcodeLookupResult } from './postcode-lookup.server';

export type { PostcodeLookupResult, PostcodeAddress } from './postcode-lookup.server';

export const lookupPostcode = createServerFn({ method: 'POST' })
  .validator((input: unknown) => {
    const pc = typeof (input as { postcode?: unknown })?.postcode === 'string'
      ? (input as { postcode: string }).postcode
      : '';
    return { postcode: pc.slice(0, 12) };
  })
  .handler(async ({ data }): Promise<PostcodeLookupResult> => {
    // Per-IP cap so visitors can't burn paid lookup credits; blocked callers
    // get the manual-entry fallback instead of a paid provider call.
    const blocked = await enforceRateLimit(getRequest(), 'checkout.postcode-lookup', {
      limit: 20,
      windowMs: 10 * 60 * 1000,
      retryAfterSec: 600,
    });
    if (blocked) {
      return {
        ok: false, mode: 'outcode', postcode: data.postcode, city: '', county: '', addresses: [],
        message: 'Too many lookups — please enter your address manually.',
      };
    }
    const { runPostcodeLookup } = await import('./postcode-lookup.server');
    return runPostcodeLookup(data.postcode);
  });

/** Admin-panel status: which provider is active + live key health. Never returns key values. */
export const getPostcodeLookupStatus = createServerFn({ method: 'GET' })
  .handler(async (): Promise<{
    provider: 'getaddress' | 'ideal' | 'postcodes-io';
    mode: 'outcode' | 'full';
    health: { ok: boolean; status?: number; reason?: string };
  }> => {
    const { getLookupProvider, probeProviderHealth } = await import('./postcode-lookup.server');
    const provider = getLookupProvider();
    const health = await probeProviderHealth();
    return { provider, mode: provider === 'postcodes-io' ? 'outcode' : 'full', health };
  });


