/**
 * Admin-only reader for `monitor_head_get_log`.
 * Verifies caller is a Firebase admin, then queries Supabase via service role
 * (RLS bypass) with filters: host, time range, had_alert.
 *
 * POST body:
 *   { idToken, host?, since?, until?, hadAlert?: "all"|"true"|"false",
 *     limit?: number (max 500), offset?: number }
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";

const Body = z.object({
  idToken: z.string().min(10),
  host: z.string().max(200).optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  hadAlert: z.enum(["all", "true", "false"]).optional().default("all"),
  limit: z.number().int().min(1).max(500).optional().default(100),
  offset: z.number().int().min(0).max(100000).optional().default(0),
});

function json(v: unknown, status = 200): Response {
  return new Response(JSON.stringify(v), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/monitor-log")({
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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let q = supabaseAdmin
          .from("monitor_head_get_log")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(body.offset, body.offset + body.limit - 1);

        if (body.host) q = q.eq("host", body.host);
        if (body.since) q = q.gte("created_at", body.since);
        if (body.until) q = q.lte("created_at", body.until);
        if (body.hadAlert === "true") q = q.eq("had_alert", true);
        else if (body.hadAlert === "false") q = q.eq("had_alert", false);

        const { data, error, count } = await q;
        if (error) return json({ error: "query_failed", detail: error.message }, 500);

        // Distinct hosts (last 30 days) — cheap dropdown data.
        const { data: hostsData } = await supabaseAdmin
          .from("monitor_head_get_log")
          .select("host")
          .order("host", { ascending: true })
          .limit(1000);
        const hosts = Array.from(new Set((hostsData ?? []).map((r: any) => r.host))).sort();

        return json({ rows: data ?? [], total: count ?? 0, hosts });
      },
    },
  },
});
