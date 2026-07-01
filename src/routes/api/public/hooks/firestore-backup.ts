/**
 * Scheduled Firestore backup trigger.
 *
 * POST /api/public/hooks/firestore-backup
 *   Body: {} (empty) or { collectionIds?: string[] }
 *   Auth: Supabase `apikey` header (anon/publishable) — this is a pg_cron target.
 *         Optionally accepts `x-cron-secret` matching CLEANUP_SECRET as a
 *         second-factor for manual curl runs.
 *
 * Also polls any RUNNING backup rows in `firestore_backups` and flips their
 * status to DONE/FAILED. Idempotent — running it more often than the schedule
 * is fine; a second same-second trigger is deduped by the `run_id` UNIQUE key.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  triggerFirestoreExport,
  getExportOperation,
  getConfiguredBackupBase,
} from "@/lib/server/firestore-backup";

const Body = z
  .object({
    collectionIds: z.array(z.string().min(1).max(200)).max(50).optional(),
  })
  .partial();

function json(v: unknown, status = 200): Response {
  return new Response(JSON.stringify(v), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function verifyCaller(request: Request): { ok: true } | { ok: false; status: number; msg: string } {
  // Supabase pg_cron sends `apikey: <anon>`. Any non-empty apikey passes here —
  // the route lives under /api/public so there's no edge auth, and we don't
  // want to hard-code the anon key server-side. `x-cron-secret` (matching
  // CLEANUP_SECRET) is accepted as an alternative for manual curl calls.
  const apikey = request.headers.get("apikey");
  if (apikey && apikey.length > 20) return { ok: true };
  const secret = request.headers.get("x-cron-secret");
  const expected = process.env.CLEANUP_SECRET;
  if (expected && secret === expected) return { ok: true };
  return { ok: false, status: 401, msg: "unauthorized" };
}

export const Route = createFileRoute("/api/public/hooks/firestore-backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = verifyCaller(request);
        if (!auth.ok) return json({ error: auth.msg }, auth.status);

        let body: z.infer<typeof Body> = {};
        try {
          const text = await request.text();
          body = text ? Body.parse(JSON.parse(text)) : {};
        } catch (e) {
          return json({ error: "invalid_body", detail: String((e as Error).message) }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1. Poll open backups first (cheap; keeps the log honest even if the
        //    dedicated poll didn't run).
        const polled = await pollRunningBackups(supabaseAdmin);

        // 2. Kick off today's backup.
        let trigger: Awaited<ReturnType<typeof triggerFirestoreExport>>;
        try {
          trigger = await triggerFirestoreExport({ collectionIds: body.collectionIds });
        } catch (e) {
          const msg = (e as Error).message;
          await supabaseAdmin.from("firestore_backups").insert({
            operation_name: null,
            run_id: `failed_${Date.now()}`,
            output_uri_prefix: getConfiguredBackupBase(),
            collection_ids: body.collectionIds ?? [],
            status: "FAILED",
            triggered_by: "cron",
            error: msg,
          });
          return json({ error: "trigger_failed", detail: msg, polled }, 502);
        }

        const { error: insertErr } = await supabaseAdmin.from("firestore_backups").insert({
          operation_name: trigger.operationName,
          run_id: trigger.runId,
          output_uri_prefix: trigger.outputUriPrefix,
          collection_ids: trigger.collectionIds,
          status: "RUNNING",
          triggered_by: "cron",
        });
        if (insertErr && (insertErr as { code?: string }).code !== "23505") {
          // Log-only — the export itself is already running in Google.
          console.warn("[firestore-backup] log insert failed:", insertErr.message);
        }

        return json({ ok: true, trigger, polled });
      },
    },
  },
});

async function pollRunningBackups(
  supabaseAdmin: import("@supabase/supabase-js").SupabaseClient,
): Promise<{ checked: number; updated: number }> {
  const { data: open } = await supabaseAdmin
    .from("firestore_backups")
    .select("id, operation_name")
    .eq("status", "RUNNING")
    .not("operation_name", "is", null)
    .limit(20);
  if (!open || open.length === 0) return { checked: 0, updated: 0 };

  let updated = 0;
  for (const row of open) {
    try {
      const op = await getExportOperation(row.operation_name as string);
      if (op.status === "RUNNING") continue;
      await supabaseAdmin
        .from("firestore_backups")
        .update({
          status: op.status,
          error: op.error ?? null,
          completed_at: op.endTime ? new Date(op.endTime).toISOString() : new Date().toISOString(),
          metadata: op.raw as never,
        })
        .eq("id", row.id);
      updated += 1;
    } catch (e) {
      console.warn("[firestore-backup] poll failed:", (e as Error).message);
    }
  }
  return { checked: open.length, updated };
}
