/**
 * Daily newsletter → Klaviyo sync.
 * URL: POST https://phlabs.co.uk/api/public/hooks/klaviyo-sync
 * Auth: `x-cron-secret: ${CRON_SECRET}` (constant-time compare).
 * Called once a day by .github/workflows/klaviyo-sync.yml. Idempotent.
 */
import { createFileRoute } from "@tanstack/react-router";
import { NO_STORE_HEADERS } from "@/lib/no-store-headers";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...NO_STORE_HEADERS },
  });
}

function secretOk(provided: string): boolean {
  const expected = process.env.CRON_SECRET || "";
  if (!expected || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/hooks/klaviyo-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!secretOk(request.headers.get("x-cron-secret") || "")) return json({ error: "forbidden" }, 403);
        try {
          const { runSubscriberSync } = await import("@/lib/klaviyo.server");
          const result = await runSubscriberSync({ uid: "system", email: null });
          return json({ ok: true, ...result });
        } catch (err) {
          console.error("[klaviyo-sync] failed:", err);
          return json({ ok: false, error: err instanceof Error ? err.message : "sync failed" }, 500);
        }
      },
    },
  },
});
