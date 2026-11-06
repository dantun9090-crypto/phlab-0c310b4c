/**
 * Releases queued marketing emails within the hourly sending cap.
 * URL: POST https://phlabs.co.uk/api/public/hooks/marketing-drip
 * Auth: `x-cron-secret: ${CRON_SECRET}` (constant-time compare).
 * Called every 10 minutes by .github/workflows/marketing-drip.yml. Idempotent.
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

export const Route = createFileRoute("/api/public/hooks/marketing-drip")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!secretOk(request.headers.get("x-cron-secret") || "")) return json({ error: "forbidden" }, 403);
        try {
          const { releaseMarketingBatch } = await import("@/lib/server/marketing-drip");
          return json({ ok: true, ...(await releaseMarketingBatch()) });
        } catch (err) {
          console.error("[marketing-drip] failed:", err);
          return json({ ok: false, error: err instanceof Error ? err.message : "drip failed" }, 500);
        }
      },
    },
  },
});
