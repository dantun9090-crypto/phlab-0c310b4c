/**
 * Drain the Fena retry queue. Called by pg_cron every few minutes.
 *
 * URL: https://phlabs.co.uk/api/public/hooks/fena-process-retries
 *
 * Auth: requires the `x-cleanup-secret` header to match the server-only
 * `CLEANUP_SECRET` env var (same pattern as security-cleanup.ts). The
 * Supabase publishable/anon key is NOT a secret — it ships in the client
 * bundle — so we use a dedicated pre-shared secret instead. Bad-auth
 * attempts are rate-limited to deter brute-force.
 *
 * Schedule (one-time SQL, run via supabase--insert):
 *
 *   select cron.schedule(
 *     'fena-process-retries',
 *     '*\/2 * * * *',
 *     $$ select net.http_post(
 *          url := 'https://phlabs.co.uk/api/public/hooks/fena-process-retries',
 *          headers := '{"Content-Type":"application/json","x-cleanup-secret":"<CLEANUP_SECRET>"}'::jsonb,
 *          body := '{}'::jsonb
 *        ); $$
 *   );
 */
import { createFileRoute } from "@tanstack/react-router";
import { updateDocAdmin } from "@/lib/server/firestore-admin";
import { processFenaRetries } from "@/lib/fena-retry-queue.server";
import { timingSafeEqualStr } from "@/lib/timing-safe-equal";
import { enforceRateLimit } from "@/lib/rate-limit";

const ENDPOINT = "/api/public/hooks/fena-process-retries";

export const Route = createFileRoute("/api/public/hooks/fena-process-retries")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Default per-IP throttle.
        const limited = await enforceRateLimit(request, ENDPOINT, {
          limit: 30,
          windowMs: 60_000,
          retryAfterSec: 120,
        });
        if (limited) return limited;

        const expected = process.env.CLEANUP_SECRET || "";
        const provided = request.headers.get("x-cleanup-secret") || "";
        if (!expected || !provided || !timingSafeEqualStr(provided, expected)) {
          // Separate bad-auth bucket so brute-force hits a much tighter limit.
          const badAuthLimited = await enforceRateLimit(request, ENDPOINT, {
            limit: 10,
            windowMs: 60_000,
            retryAfterSec: 120,
            bucketKind: "bad-auth",
          });
          if (badAuthLimited) return badAuthLimited;
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
