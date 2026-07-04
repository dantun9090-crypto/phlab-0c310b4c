/**
 * Admin-only marketing enqueue endpoint.
 *
 * Client (EmailMarketingTab) POSTs { idToken, subject, html, recipients:[{email,name?}] }.
 * We verify admin, then write each recipient into BOTH `mail` (Trigger Email
 * extension picks it up) and `emailQueue` (audit trail) via the service
 * account, bypassing security rules. This avoids the "Missing or insufficient
 * permissions" client-side failure entirely.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { addDocAdmin, listDocsAdmin, updateDocAdmin } from "@/lib/server/firestore-admin";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";
import { enqueueMailOnce } from "@/lib/server/enqueue-mail";

const Recipient = z.object({
  email: z.string().email().max(320),
  name: z.string().max(200).optional(),
});

const SendBody = z.object({
  idToken: z.string().min(10).max(4096),
  subject: z.string().trim().min(1).max(200),
  html: z.string().trim().min(1).max(200000),
  recipients: z.array(Recipient).min(1).max(1000),
  campaignId: z.string().max(120).optional(),
});

const RequeueBody = z.object({
  idToken: z.string().min(10).max(4096),
  requeuePending: z.literal(true),
  campaignId: z.string().max(120).optional(),
  subject: z.string().trim().min(1).max(200).optional(),
  sinceHours: z.number().int().min(1).max(168).default(72),
  limit: z.number().int().min(1).max(1000).default(500),
}).refine((v) => Boolean(v.campaignId || v.subject), {
  message: "campaignId_or_subject_required",
});

const Body = z.union([SendBody, RequeueBody]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlToText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normaliseHtml(input: string): { html: string; text: string } {
  const trimmed = input.trim();
  const hasTags = /<\/?[a-z][\s\S]*>/i.test(trimmed);
  const text = hasTags ? htmlToText(trimmed) : trimmed.replace(/\r\n/g, "\n");
  const html = hasTags
    ? trimmed
    : `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;white-space:normal">${escapeHtml(trimmed).replace(/\n/g, "<br>")}</body></html>`;
  return { html, text };
}

function safeMailId(campaignId: string, email: string): string {
  return `marketing:${campaignId}:${email.toLowerCase()}`
    .replace(/[^A-Za-z0-9_:@.-]/g, "_")
    .slice(0, 1400);
}

async function enqueueMarketingMail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  campaignId: string;
}) {
  return enqueueMailOnce(safeMailId(input.campaignId, input.to), {
    to: input.to,
    message: { subject: input.subject, html: input.html, text: input.text },
    source: "admin:marketing",
    campaignId: input.campaignId,
  });
}

export const Route = createFileRoute("/api/public/send-marketing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400);
        }
        const parsed = Body.safeParse(raw);
        if (!parsed.success) {
          return json({ error: "invalid_input", details: parsed.error.flatten() }, 400);
        }
        const { idToken } = parsed.data;

        try {
          await requireFirebaseAdmin(idToken);
        } catch (err) {
          return json({ error: "unauthorized", detail: err instanceof Error ? err.message : "auth_failed" }, 401);
        }

        if ("requeuePending" in parsed.data) {
          const since = new Date(Date.now() - parsed.data.sinceHours * 3600_000);
          const pendingRows = await listDocsAdmin("emailQueue", {
            orderBy: "createdAt",
            direction: "DESCENDING",
            limit: parsed.data.limit,
          });
          const rows = pendingRows.filter((row) => {
            const created = row.createdAt ? new Date(String(row.createdAt)) : null;
            const status = String(row.status ?? "pending").toLowerCase();
            if (created && created < since) return false;
            if (!["pending", "queued", "processing"].includes(status)) return false;
            if (parsed.data.campaignId && row.campaignId !== parsed.data.campaignId) return false;
            if (parsed.data.subject && row.subject !== parsed.data.subject) return false;
            return typeof row.to === "string" && typeof row.subject === "string" && typeof row.body === "string";
          });

          let enqueued = 0;
          let duplicates = 0;
          const failures: Array<{ email: string; error: string }> = [];

          for (const row of rows) {
            const email = String(row.to);
            const campaignId = String(row.campaignId || `requeue_${row.id}`);
            const { html, text } = normaliseHtml(String(row.body));
            try {
              const result = await enqueueMarketingMail({
                to: email,
                subject: String(row.subject),
                html,
                text,
                campaignId,
              });
              if (result.duplicate) duplicates++;
              else enqueued++;
              await updateDocAdmin("emailQueue", row.id, {
                status: "queued",
                mailDocId: safeMailId(campaignId, email),
                requeuedAt: new Date(),
              });
            } catch (err) {
              failures.push({ email, error: err instanceof Error ? err.message : "unknown" });
              await updateDocAdmin("emailQueue", row.id, {
                status: "failed",
                error: err instanceof Error ? err.message : "unknown",
                failedAt: new Date(),
              }).catch(() => undefined);
            }
          }

          return json({ ok: true, requeued: enqueued, duplicates, matched: rows.length, failed: failures.length, failures: failures.slice(0, 10) });
        }

        const { subject, html: rawHtml, recipients } = parsed.data;
        const campaignId = parsed.data.campaignId || `campaign_${Date.now()}`;
        const { html, text } = normaliseHtml(rawHtml);
        const now = new Date();
        let enqueued = 0;
        let duplicates = 0;
        const failures: Array<{ email: string; error: string }> = [];

        for (const r of recipients) {
          try {
            const result = await enqueueMarketingMail({ to: r.email, subject, html, text, campaignId });
            if (result.duplicate) duplicates++;
            else enqueued++;
            await addDocAdmin("emailQueue", {
              to: r.email,
              recipientName: r.name || r.email,
              subject,
              body: rawHtml,
              status: "queued",
              createdAt: now,
              campaignId,
              recipientCount: recipients.length,
              source: "admin:marketing",
              mailDocId: safeMailId(campaignId, r.email),
            });
          } catch (err) {
            failures.push({ email: r.email, error: err instanceof Error ? err.message : "unknown" });
          }
        }

        return json({ ok: true, enqueued, duplicates, failed: failures.length, campaignId, failures: failures.slice(0, 10) });
      },
    },
  },
});
