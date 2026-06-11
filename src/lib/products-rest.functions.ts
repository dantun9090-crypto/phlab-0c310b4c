/**
 * Server-fn wrappers around src/lib/firestore-rest.ts.
 *
 * Why this file exists:
 *   firestore-rest.ts calls https://firestore.googleapis.com/v1/... with
 *   custom request headers (Cache-Control, Pragma, X-PH-Cache-Bust). The
 *   Firestore REST endpoint only allows CORS-simple headers on browser
 *   requests, so when a TanStack Start loader ran client-side (route
 *   navigation to /products) the preflight failed with:
 *     "Response to preflight request doesn't pass access control check:
 *      No 'Access-Control-Allow-Origin' header is present"
 *
 *   Wrapping in createServerFn forces the fetch to ALWAYS run on the
 *   Cloudflare Worker (no browser, no preflight) regardless of whether
 *   the loader is invoked during SSR or client-side navigation.
 *
 *   The underlying helpers are unchanged so SSR / sitemap / merchant feed
 *   behaviour stays identical.
 */
import { createServerFn } from '@tanstack/react-start';
import {
  fetchAllProducts,
  fetchProductBySlug,
  type SeoProduct,
} from './firestore-rest';

export type { SeoProduct } from './firestore-rest';

export const fetchAllProductsFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SeoProduct[]> => {
    try {
      return await fetchAllProducts();
    } catch (err) {
      // Never leak Firestore error details to the client. Loader code
      // catches and falls back to an empty list.
      console.error('[products-rest.functions] fetchAllProducts failed', err);
      return [];
    }
  },
);

export const fetchProductBySlugFn = createServerFn({ method: 'GET' })
  .inputValidator((input: { slug: string }) => {
    if (
      !input ||
      typeof input.slug !== 'string' ||
      input.slug.length === 0 ||
      input.slug.length > 200 ||
      !/^[a-z0-9-]+$/.test(input.slug)
    ) {
      throw new Error('invalid_slug');
    }
    return { slug: input.slug };
  })
  .handler(async ({ data }): Promise<SeoProduct | null> => {
    try {
      return await fetchProductBySlug(data.slug);
    } catch (err) {
      console.error('[products-rest.functions] fetchProductBySlug failed', err);
      return null;
    }
  });
