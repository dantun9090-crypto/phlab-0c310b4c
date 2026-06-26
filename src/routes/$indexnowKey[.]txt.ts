// Bing / IndexNow key verification file.
// IndexNow requires a file named `{key}.txt` at the site root whose body is
// exactly the key. We serve it dynamically from the BING_INDEXNOW_API_KEY
// secret so the key never lives in the client bundle or repo.
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/$indexnowKey.txt')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const key = process.env.BING_INDEXNOW_API_KEY;
        if (!key) {
          return new Response('IndexNow key not configured', { status: 503 });
        }

        // Expected request: /{key}.txt
        const requested = (params as Record<string, string>)['indexnowKey.txt'];
        if (requested !== key) {
          // Let the SPA / 404 handler take over for anything else.
          return new Response('Not Found', { status: 404 });
        }

        return new Response(key, {
          status: 200,
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': 'public, max-age=3600',
            'x-robots-tag': 'noindex',
          },
        });
      },
    },
  },
});
