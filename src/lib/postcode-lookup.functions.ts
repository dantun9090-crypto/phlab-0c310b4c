/**
 * Thin server-fn wrapper for the UK postcode → address lookup.
 * Implementation lives in `postcode-lookup.server.ts`.
 */
import { createServerFn } from '@tanstack/react-start';
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
    const { runPostcodeLookup } = await import('./postcode-lookup.server');
    return runPostcodeLookup(data.postcode);
  });
