/**
 * Admin-only reader for `stale_asset_reports`.
 * Verifies caller is a Firebase admin, then lists recent rows.
 *
 * POST body: { idToken, host?, since?, limit? (max 500) }
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";

const Body = z.object({
  idToken: z.string().min(10),
  host: z.string().max(200).optional(),
  since: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(500).optional().default(100),
});

function json(v: unknown, status = 200): Response {
  return new Response(JSON.stringify(v), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/stale-asset-log")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch (e) {
          return json({ error: "invalid_body", detail: String((e as Error).message) }, 400);
        }

        try {
          await requireFirebaseAdmin(body.idToken);
        } catch (e) {
          const msg = (e as Error).message;
          return json(
            { error: msg === "not_admin" ? "forbidden" : "unauthorized" },
            msg === "not_admin" ? 403 : 401,
          );
        }

        const { listDocsAdmin } = await import("@/lib/server/firestore-admin");
        try {
          const rows = await listDocsAdmin("stale_asset_reports", {
            orderBy: "createdAt",
            direction: "DESCENDING",
            limit: body.limit,
            where: body.host ? { field: "host", value: body.host } : undefined,
            rangeFilter: body.since
              ? { field: "createdAt", gte: new Date(body.since) }
              : undefined,
          });

          // Distinct hosts + assets for filter dropdowns (small).
          const hosts = Array.from(
            new Set(rows.map((r) => String(r.host ?? "")).filter(Boolean)),
          ).sort();

          // Aggregated counts by asset (top offenders).
          const byAsset = new Map<string, number>();
          for (const r of rows) {
            const a = String(r.asset ?? "");
            if (!a) continue;
            byAsset.set(a, (byAsset.get(a) ?? 0) + 1);
          }
          const topAssets = Array.from(byAsset.entries())
            .map(([asset, count]) => ({ asset, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 20);

          return json({ rows, total: rows.length, hosts, topAssets });
        } catch (e) {
          return json({ error: "query_failed", detail: String((e as Error).message) }, 500);
        }
      },
    },
  },
});
