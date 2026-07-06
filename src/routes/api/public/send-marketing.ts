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

import { addDocAdmin, getDocAdmin, listDocsAdmin, updateDocAdmin } from "@/lib/server/firestore-admin";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";
import { enqueueMailOnce } from "@/lib/server/enqueue-mail";
import { wrapCampaignHtml, wrapCampaignText } from "@/lib/email-templates/wrap-campaign";
import { DEFAULT_EMAIL_BRAND, withDefaults, type EmailBrandConfig } from "@/lib/email-templates/brand-config";

const Recipient = z.object({
  email: z.string().email().max(320),
  name: z.string().max(200).optional(),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
});

const SendBody = z.object({
  idToken: z.string().min(10).max(4096),
  subject: z.string().trim().min(1).max(200),
  html: z.string().trim().min(1).max(200000),
  recipients: z.array(Recipient).min(1).max(1000),
  campaignId: z.string().max(120).optional(),
  // dryRun: only analyse placeholders + fallback usage, do NOT enqueue.
  dryRun: z.boolean().optional(),
  // strict: refuse to send when unknown placeholders remain unresolved.
  strict: z.boolean().optional(),
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

function personalise(
  template: string,
  vars: { firstName: string; lastName: string; fullName: string; email: string },
): string {
  // Replace [First Name], {{firstName}}, {first_name}, etc. — case-insensitive,
  // tolerant of spaces/underscores/hyphens inside the placeholder.
  const map: Record<string, string> = {
    firstname: vars.firstName,
    first: vars.firstName,
    name: vars.firstName || vars.fullName,
    fullname: vars.fullName,
    lastname: vars.lastName,
    last: vars.lastName,
    email: vars.email,
  };
  const key = (raw: string) => raw.toLowerCase().replace(/[\s_-]+/g, "");
  return template
    .replace(/\[([a-zA-Z][a-zA-Z\s_-]{0,30})\]/g, (m, k) => {
      const v = map[key(k)];
      return v != null && v !== "" ? v : m;
    })
    .replace(/\{\{\s*([a-zA-Z][a-zA-Z\s_-]{0,30})\s*\}\}/g, (m, k) => {
      const v = map[key(k)];
      return v != null && v !== "" ? v : m;
    });
}

/** Keys the personalise() map above understands. Keep in sync. */
const KNOWN_PLACEHOLDER_KEYS = new Set([
  "firstname", "first", "name", "fullname", "lastname", "last", "email",
]);
const normaliseKey = (raw: string) => raw.toLowerCase().replace(/[\s_-]+/g, "");

/**
 * Scan subject+body for placeholder syntax ([X] or {{X}}) and classify each
 * occurrence as known (personalise() will substitute it) or unknown
 * (will ship to the recipient as literal text — almost always a bug).
 * Returns counts so we can warn the admin before we enqueue N thousand emails.
 */
function analysePlaceholders(subject: string, body: string): {
  known: string[];
  unknown: string[];
  hasPersonalisation: boolean;
} {
  const known = new Set<string>();
  const unknown = new Set<string>();
  const scan = (text: string) => {
    const rx = /\[([a-zA-Z][a-zA-Z\s_-]{0,30})\]|\{\{\s*([a-zA-Z][a-zA-Z\s_-]{0,30})\s*\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text)) !== null) {
      const raw = (m[1] ?? m[2]) || "";
      const key = normaliseKey(raw);
      const display = m[0];
      if (KNOWN_PLACEHOLDER_KEYS.has(key)) known.add(display);
      else unknown.add(display);
    }
  };
  scan(subject);
  scan(body);
  return {
    known: [...known],
    unknown: [...unknown],
    hasPersonalisation: known.size > 0,
  };
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

        const { subject, html: rawHtml, recipients, dryRun, strict } = parsed.data;
        const campaignId = parsed.data.campaignId || `campaign_${Date.now()}`;
        const { html, text } = normaliseHtml(rawHtml);

        // Placeholder validation — surfaces unresolved / unknown tokens before we
        // enqueue thousands of emails, and counts how many recipients will fall
        // back to "there" because they have no firstName in Firestore.
        const analysis = analysePlaceholders(subject, html);
        let fallbackFirstNameCount = 0;
        let fallbackFullNameCount = 0;
        const fallbackEmailsSample: string[] = [];
        for (const r of recipients) {
          const fullName = (r.name || `${r.firstName || ""} ${r.lastName || ""}`).trim();
          const firstName = (r.firstName || fullName.split(/\s+/)[0] || "").trim();
          if (!firstName) {
            fallbackFirstNameCount++;
            if (fallbackEmailsSample.length < 20) fallbackEmailsSample.push(r.email);
          }
          if (!fullName && !firstName) fallbackFullNameCount++;
        }

        const validation = {
          knownPlaceholders: analysis.known,
          unknownPlaceholders: analysis.unknown,
          hasPersonalisation: analysis.hasPersonalisation,
          recipientCount: recipients.length,
          fallbackFirstNameCount,
          fallbackFullNameCount,
          fallbackAffectsPct: recipients.length > 0
            ? Math.round((fallbackFirstNameCount / recipients.length) * 100)
            : 0,
          fallbackEmailsSample,
        };

        if (dryRun) {
          return json({ ok: true, dryRun: true, validation });
        }

        if (strict && analysis.unknown.length > 0) {
          return json({
            ok: false,
            error: "unknown_placeholders",
            detail: `Unknown placeholders will ship as literal text: ${analysis.unknown.join(", ")}`,
            validation,
          }, 400);
        }

        const now = new Date();
        let enqueued = 0;
        let duplicates = 0;
        const failures: Array<{ email: string; error: string }> = [];

        // Load branded layout config once per request. Falls back to defaults
        // if the Firestore doc is missing so campaigns never send unstyled.
        let brand: EmailBrandConfig = DEFAULT_EMAIL_BRAND;
        try {
          const brandDoc = await getDocAdmin("emailBrandConfig", "default");
          brand = withDefaults(brandDoc as Partial<EmailBrandConfig> | null);
        } catch (err) {
          console.warn("[send-marketing] brand load failed, using defaults", err);
        }

        for (const r of recipients) {
          try {
            const fullName = (r.name || `${r.firstName || ""} ${r.lastName || ""}`).trim();
            const firstName = (r.firstName || fullName.split(/\s+/)[0] || "").trim();
            const lastName = (r.lastName || fullName.split(/\s+/).slice(1).join(" ") || "").trim();
            const vars = {
              firstName: firstName || "there",
              lastName,
              fullName: fullName || firstName || "there",
              email: r.email,
            };
            const personalSubject = personalise(subject, vars);
            const personalInnerHtml = personalise(html, vars);
            const personalInnerText = personalise(text, vars);
            // Wrap the user-authored body in the branded layout (header + logo +
            // card + footer) so every campaign matches the EmailBranding tab.
            const brandedHtml = wrapCampaignHtml({
              brand,
              subject: personalSubject,
              body: personalInnerHtml,
            });
            const brandedText = wrapCampaignText({
              brand,
              subject: personalSubject,
              body: personalInnerText,
            });
            const result = await enqueueMarketingMail({
              to: r.email,
              subject: personalSubject,
              html: brandedHtml,
              text: brandedText,
              campaignId,
            });
            if (result.duplicate) duplicates++;
            else enqueued++;
            await addDocAdmin("emailQueue", {
              to: r.email,
              recipientName: fullName || r.email,
              subject: personalSubject,
              body: brandedHtml,
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



        return json({
          ok: true,
          enqueued,
          duplicates,
          failed: failures.length,
          campaignId,
          failures: failures.slice(0, 10),
          validation,
        });
      },
    },
  },
});
