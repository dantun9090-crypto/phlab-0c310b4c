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

import { addDocAdmin } from "@/lib/server/firestore-admin";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";

const Recipient = z.object({
  email: z.string().email().max(320),
  name: z.string().max(200).optional(),
});

const Body = z.object({
  idToken: z.string().min(10).max(4096),
  subject: z.string().trim().min(1).max(200),
  html: z.string().trim().min(1).max(200000),
  recipients: z.array(Recipient).min(1).max(1000),
  campaignId: z.string().max(120).optional(),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
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
        const { idToken, subject, html, recipients } = parsed.data;
        const campaignId = parsed.data.campaignId || `campaign_${Date.now()}`;

        try {
          await requireFirebaseAdmin(idToken);
        } catch (err) {
          return json({ error: "unauthorized", detail: err instanceof Error ? err.message : "auth_failed" }, 401);
        }

        const text = html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        const now = new Date();
        let enqueued = 0;
        const failures: Array<{ email: string; error: string }> = [];

        for (const r of recipients) {
          try {
            await addDocAdmin("mail", {
              to: r.email,
              message: { subject, html, text },
              createdAt: now,
              source: "admin:marketing",
              campaignId,
            });
            await addDocAdmin("emailQueue", {
              to: r.email,
              recipientName: r.name || r.email,
              subject,
              body: html,
              status: "queued",
              createdAt: now,
              campaignId,
              recipientCount: recipients.length,
              source: "admin:marketing",
            });
            enqueued++;
          } catch (err) {
            failures.push({ email: r.email, error: err instanceof Error ? err.message : "unknown" });
          }
        }

        return json({ ok: true, enqueued, failed: failures.length, campaignId, failures: failures.slice(0, 10) });
      },
    },
  },
});
