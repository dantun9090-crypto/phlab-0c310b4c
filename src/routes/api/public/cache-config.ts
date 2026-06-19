import { createFileRoute } from '@tanstack/react-router';
import { getHtmlTtlSeconds } from '@/lib/server/cache-config-server';

/**
 * Public, unauthenticated read of the current HTML edge-cache TTL set by
 * the admin panel. Consumed by `cloudflare/worker.js` on cold start so the
 * Worker stays in lock-step with the origin's TTL setting.
 *
 * No PII, no admin data. Cached for 30s at the edge.
 */
export const Route = createFileRoute('/api/public/cache-config')({
  server: {
    handlers: {
      GET: async () => {
        const htmlTtlSeconds = await getHtmlTtlSeconds();
        return new Response(
          JSON.stringify({ htmlTtlSeconds }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json; charset=utf-8',
              'cache-control': 'public, max-age=30, s-maxage=30',
              'cdn-cache-control': 'public, max-age=30',
              'access-control-allow-origin': '*',
            },
          },
        );
      },
    },
  },
});
