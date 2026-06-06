/**
 * Drain the Fena retry queue. Called by pg_cron every few minutes.
 *
 * URL: https://phlabs.co.uk/api/public/hooks/fena-process-retries
 *
 * Auth: this is under `/api/public/*` (bypasses the platform auth gate),
 * so we require the Supabase `apikey` header to match the project's
 * publishable key. That keeps casual hits out without inventing a new
 * shared secret.
 *
 * Schedule (one-time SQL, run via supabase--insert):
 *
 *   select cron.schedule(
 *     'fena-process-retries',
 *     '*\/2 * * * *',
 *     $$ select net.http_post(
 *          url := 'https://phlabs.co.uk/api/public/hooks/fena-process-retries',
 *          headers := '{"Content-Type":"application/json","apikey":"<anon>"}'::jsonb,
 *          body := '{}'::jsonb
 *        ); $$
 *   );
 */
import { createFileRoute } from "@tanstack/react-router";
import { updateDocAdmin } from "@/lib/server/firestore-admin";
import { processFenaRetries } from "@/lib/fena-retry-queue.server";

const REQUIRED_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

export const Route = createFileRoute("/api/public/hooks/fena-process-retries")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") || "";
        if (REQUIRED_KEY && apikey !== REQUIRED_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const result = await processFenaRetries(async (orderId, updates) => {
            await updateDocAdmin("orders", orderId, updates);
          });
          return Response.json({ ok: true, ...result });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return Response.json(
            { ok: false, error: msg },
            { status: 500 },
          );
        }
      },
    },
  },
});
