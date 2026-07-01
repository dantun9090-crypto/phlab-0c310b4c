/**
 * Admin-only Firestore backup control panel API.
 *
 * POST /api/public/firestore-backups
 *   Body:
 *     { idToken, action: "list", limit?, offset? }
 *     { idToken, action: "trigger", collectionIds?: string[] }
 *     { idToken, action: "poll" }         // refresh RUNNING rows
 *     { idToken, action: "status", operationName }
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";
import {
  triggerFirestoreExport,
  getExportOperation,
  getConfiguredBackupBase,
} from "@/lib/server/firestore-backup";

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("list"),
    idToken: z.string().min(10),
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).max(100000).optional().default(0),
  }),
  z.object({
    action: z.literal("trigger"),
    idToken: z.string().min(10),
    collectionIds: z.array(z.string().min(1).max(200)).max(50).optional(),
  }),
  z.object({
    action: z.literal("poll"),
    idToken: z.string().min(10),
  }),
  z.object({
    action: z.literal("status"),
    idToken: z.string().min(10),
    operationName: z.string().min(10),
  }),
]);

function json(v: unknown, status = 200): Response {
  return new Response(JSON.stringify(v), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/firestore-backups")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch (e) {
          return json({ error: "invalid_body", detail: String((e as Error).message) }, 400);
        }

        let adminUid = "";
        try {
          const claims = await requireFirebaseAdmin(body.idToken);
          adminUid = (claims as { uid?: string; user_id?: string }).uid
            || (claims as { user_id?: string }).user_id
            || "admin";
        } catch (e) {
          const msg = (e as Error).message;
          return json(
            { error: msg === "not_admin" ? "forbidden" : "unauthorized" },
            msg === "not_admin" ? 403 : 401,
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (body.action === "list") {
          const { data, error, count } = await supabaseAdmin
            .from("firestore_backups")
            .select("*", { count: "exact" })
            .order("started_at", { ascending: false })
            .range(body.offset, body.offset + body.limit - 1);
          if (error) return json({ error: "query_failed", detail: error.message }, 500);
          return json({
            rows: data ?? [],
            total: count ?? 0,
            backupBase: getConfiguredBackupBase(),
          });
        }

        if (body.action === "trigger") {
          try {
            const trigger = await triggerFirestoreExport({ collectionIds: body.collectionIds });
            await supabaseAdmin.from("firestore_backups").insert({
              operation_name: trigger.operationName,
              run_id: trigger.runId,
              output_uri_prefix: trigger.outputUriPrefix,
              collection_ids: trigger.collectionIds,
              status: "RUNNING",
              triggered_by: `admin:${adminUid}`,
            });
            return json({ ok: true, trigger });
          } catch (e) {
            const msg = (e as Error).message;
            await supabaseAdmin.from("firestore_backups").insert({
              operation_name: null,
              run_id: `failed_${Date.now()}`,
              output_uri_prefix: getConfiguredBackupBase(),
              collection_ids: body.collectionIds ?? [],
              status: "FAILED",
              triggered_by: `admin:${adminUid}`,
              error: msg,
            });
            return json({ error: "trigger_failed", detail: msg }, 502);
          }
        }

        if (body.action === "status") {
          try {
            const op = await getExportOperation(body.operationName);
            if (op.status !== "RUNNING") {
              await supabaseAdmin
                .from("firestore_backups")
                .update({
                  status: op.status,
                  error: op.error ?? null,
                  completed_at: op.endTime
                    ? new Date(op.endTime).toISOString()
                    : new Date().toISOString(),
                  metadata: op.raw as never,
                })
                .eq("operation_name", body.operationName);
            }
            return json({ ok: true, operation: op });
          } catch (e) {
            return json({ error: "status_failed", detail: (e as Error).message }, 502);
          }
        }

        // action === "poll"
        const { data: open } = await supabaseAdmin
          .from("firestore_backups")
          .select("id, operation_name")
          .eq("status", "RUNNING")
          .not("operation_name", "is", null)
          .limit(50);

        let updated = 0;
        for (const row of open ?? []) {
          try {
            const op = await getExportOperation(row.operation_name as string);
            if (op.status === "RUNNING") continue;
            await supabaseAdmin
              .from("firestore_backups")
              .update({
                status: op.status,
                error: op.error ?? null,
                completed_at: op.endTime
                  ? new Date(op.endTime).toISOString()
                  : new Date().toISOString(),
                metadata: op.raw as never,
              })
              .eq("id", row.id);
            updated += 1;
          } catch (e) {
            console.warn("[firestore-backups] poll failed:", (e as Error).message);
          }
        }
        return json({ ok: true, checked: open?.length ?? 0, updated });
      },
    },
  },
});
