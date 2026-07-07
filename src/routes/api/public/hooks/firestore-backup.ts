/**
 * Scheduled Firestore backup trigger.
 *
 * POST /api/public/hooks/firestore-backup
 *   Body: {} (empty) or { collectionIds?: string[] }
 *   Auth: Supabase `apikey` header EXACT match (pg_cron target) OR
 *         `x-cron-secret` EXACT match against CLEANUP_SECRET (manual curl /
 *         GitHub Actions). Verification lives in `firestore-backup-auth.ts`
 *         and is unit-tested — do not inline a looser check here.
 *
 * Hardening layered on top of the route:
 *  - Per-IP rate limits (default bucket for authorised calls; `bad-auth`
 *    bucket clamps 401 storms so probing traffic can't burn CPU).
 *  - Audit log entry written to Firestore `backup_audit_log` for every
 *    request (accepted OR rejected) — includes IP, UA, auth outcome, and
 *    the resulting HTTP status. Best-effort; never blocks the response.
 *  - Failure-spike detector emits a `securityEvents` row when 3+ failures
 *    land inside a 15 minute window (in-isolate counter — see
 *    `noteBackupFailure`).
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
import {
  verifyBackupCaller,
  noteBackupFailure,
  noteBadAuth,
  checkIpLockout,
  BACKUP_LOCKOUT_CONFIG,
  type VerifyResult,
} from "@/lib/firestore-backup-auth";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";
import { addDocAdmin } from "@/lib/server/firestore-admin";
import { sendBackupAlert } from "@/lib/backup-alerts.server";

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

interface AuditContext {
  ip: string;
  userAgent: string | null;
  method: string;
  path: string;
}

function auditContext(request: Request): AuditContext {
  const url = new URL(request.url);
  return {
    ip: getClientIp(request),
    userAgent: request.headers.get("user-agent"),
    method: request.method,
    path: url.pathname,
  };
}

async function writeAudit(
  ctx: AuditContext,
  outcome: {
    status: number;
    result: "accepted" | "rejected" | "trigger_failed" | "invalid_body" | "ip_locked";
    authMethod?: "apikey" | "cron_secret" | null;
    authReason?: "missing" | "invalid" | null;
    detail?: string | null;
    runId?: string | null;
  },
): Promise<void> {
  try {
    await addDocAdmin("backup_audit_log", {
      endpoint: "firestore-backup",
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      method: ctx.method,
      path: ctx.path,
      status: outcome.status,
      result: outcome.result,
      authMethod: outcome.authMethod ?? null,
      authReason: outcome.authReason ?? null,
      detail: outcome.detail ?? null,
      runId: outcome.runId ?? null,
      // Actor identity is bounded: only pg_cron (apikey) or the CLEANUP_SECRET
      // holder (x-cron-secret) can succeed. There is no per-user actor here.
      actor: outcome.authMethod ?? "unauthenticated",
      createdAt: new Date(),
    });
  } catch {
    /* audit logging must never break the response */
  }
}

async function noteFailureAndMaybeAlert(
  ctx: AuditContext,
  reason: string,
): Promise<void> {
  const { count, spike } = noteBackupFailure();
  if (!spike) return;
  try {
    await addDocAdmin("securityEvents", {
      type: "firestore_backup_failure_spike",
      endpoint: "firestore-backup",
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      recentFailureCount: count,
      windowMinutes: 15,
      lastReason: reason,
      severity: "warn",
      createdAt: new Date(),
    });
    console.error(
      `[firestore-backup] ALERT: ${count} failures in the last 15m (last=${reason})`,
    );
  } catch {
    /* alert logger must never throw */
  }
  // Fire out-of-band notification (Slack → Discord → Email). Never blocks.
  try {
    await sendBackupAlert({
      type: "firestore_backup_failure_spike",
      severity: "critical",
      title: "Firestore backup failure spike",
      summary: `${count} failures in the last 15 minutes on /api/public/hooks/firestore-backup.`,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      count,
      windowMinutes: 15,
      reason,
    });
  } catch { /* alerts must never throw */ }
}

export const Route = createFileRoute("/api/public/hooks/firestore-backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = auditContext(request);

        // 1a. Per-IP temporary lockout — hard 403 for IPs that have already
        //     tripped the bad-auth threshold. Cheaper than the bucket check
        //     and gives the caller a clear `retry-after`.
        const lockout = checkIpLockout(ctx.ip);
        if (lockout.locked) {
          await writeAudit(ctx, {
            status: 403,
            result: "ip_locked",
            detail: `locked_for_${lockout.retryAfterSec}s`,
          });
          return new Response(
            JSON.stringify({ error: "locked", retryAfter: lockout.retryAfterSec }),
            {
              status: 403,
              headers: {
                "content-type": "application/json",
                "retry-after": String(lockout.retryAfterSec),
                "cache-control": "no-store",
              },
            },
          );
        }

        // 1b. Bad-auth throttle — checked BEFORE verifying credentials so a
        //    probing client cannot burn CPU on repeated 401s. Generous ceiling
        //    for legitimate cron: pg_cron and GitHub Actions call at minute
        //    resolution at worst.
        const badAuthLimit = await enforceRateLimit(
          request,
          "firestore-backup",
          { limit: 20, windowMs: 60_000, retryAfterSec: 60, bucketKind: "bad-auth" },
        );
        if (badAuthLimit) {
          await writeAudit(ctx, {
            status: 429,
            result: "rejected",
            detail: "bad_auth_rate_limit",
          });
          return badAuthLimit;
        }

        const auth: VerifyResult = verifyBackupCaller(request, {
          SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
          SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
          VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          CLEANUP_SECRET: process.env.CLEANUP_SECRET,
        });
        if (!auth.ok) {
          const lock = noteBadAuth(ctx.ip);
          await writeAudit(ctx, {
            status: auth.status,
            result: "rejected",
            authReason: auth.reason,
            detail: `bad_auth_count=${lock.recentBadAuth}${lock.justLocked ? ":just_locked" : ""}`,
          });
          await noteFailureAndMaybeAlert(ctx, `unauthorized:${auth.reason}`);
          if (lock.justLocked) {
            // One-shot alert when an IP first crosses the lockout threshold.
            try {
              await addDocAdmin("securityEvents", {
                type: "firestore_backup_ip_lockout",
                endpoint: "firestore-backup",
                ip: ctx.ip,
                userAgent: ctx.userAgent,
                recentBadAuth: lock.recentBadAuth,
                lockoutMinutes: Math.round(BACKUP_LOCKOUT_CONFIG.LOCKOUT_MS / 60_000),
                severity: "critical",
                createdAt: new Date(),
              });
            } catch { /* never throw */ }
            try {
              await sendBackupAlert({
                type: "firestore_backup_ip_lockout",
                severity: "critical",
                title: "Firestore backup IP lockout",
                summary: `IP ${ctx.ip} exceeded ${BACKUP_LOCKOUT_CONFIG.BAD_AUTH_THRESHOLD} bad-auth attempts and is locked for ${Math.round(BACKUP_LOCKOUT_CONFIG.LOCKOUT_MS / 60_000)} minutes.`,
                ip: ctx.ip,
                userAgent: ctx.userAgent,
                count: lock.recentBadAuth,
                windowMinutes: Math.round(BACKUP_LOCKOUT_CONFIG.BAD_AUTH_WINDOW_MS / 60_000),
                reason: `unauthorized:${auth.reason}`,
              });
            } catch { /* never throw */ }
          }
          return json({ error: "unauthorized" }, auth.status);
        }

        // 2. Per-caller throttle for accepted callers — protects downstream
        //    Google Firestore export API against runaway loops.
        const runLimit = await enforceRateLimit(
          request,
          "firestore-backup-run",
          { limit: 6, windowMs: 60_000, retryAfterSec: 60 },
        );
        if (runLimit) {
          await writeAudit(ctx, {
            status: 429,
            result: "rejected",
            authMethod: auth.method,
            detail: "run_rate_limit",
          });
          return runLimit;
        }

        let body: z.infer<typeof Body> = {};
        try {
          const text = await request.text();
          body = text ? Body.parse(JSON.parse(text)) : {};
        } catch (e) {
          const msg = String((e as Error).message);
          await writeAudit(ctx, {
            status: 400,
            result: "invalid_body",
            authMethod: auth.method,
            detail: msg,
          });
          return json({ error: "invalid_body", detail: msg }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 3. Poll open backups first (cheap; keeps the log honest even if the
        //    dedicated poll didn't run).
        const polled = await pollRunningBackups(supabaseAdmin);

        // 4. Kick off today's backup.
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
          await writeAudit(ctx, {
            status: 502,
            result: "trigger_failed",
            authMethod: auth.method,
            detail: msg,
          });
          await noteFailureAndMaybeAlert(ctx, `trigger_failed:${msg.slice(0, 120)}`);
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

        await writeAudit(ctx, {
          status: 200,
          result: "accepted",
          authMethod: auth.method,
          runId: trigger.runId,
        });

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
