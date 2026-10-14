/**
 * POST /api/admin/customer-verify-email — admin marks a customer's email as
 * confirmed (used when their emailed confirmation link has expired).
 * Caller must present a Firebase ID token of an admin. Logged to auditLogs.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";
import { addDocAdmin, getDocAdmin } from "@/lib/server/firestore-admin";
import { markAuthUserEmailVerified } from "@/lib/server/firebase-auth-password";

const BodySchema = z.object({
  idToken: z.string().min(10).max(4096),
  uid: z.string().min(3).max(128).regex(/^[A-Za-z0-9_-]+$/),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/admin/customer-verify-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof BodySchema>;
        try {
          body = BodySchema.parse(await request.json());
        } catch {
          return json({ error: "invalid_body" }, 400);
        }
        let admin;
        try {
          admin = await requireFirebaseAdmin(body.idToken);
        } catch (e) {
          const msg = (e as Error).message;
          return json(
            { error: msg === "not_admin" ? "forbidden" : "unauthorized" },
            msg === "not_admin" ? 403 : 401,
          );
        }
        const customer = await getDocAdmin("customers", body.uid);
        if (!customer) return json({ error: "not_found" }, 404);
        try {
          await markAuthUserEmailVerified(body.uid);
          await addDocAdmin("auditLogs", {
            adminUid: admin.uid,
            adminEmail: admin.email ?? null,
            action: "customer.email.mark_verified",
            target: `customers/${body.uid}`,
            before: null,
            after: { emailVerified: true },
            meta: { source: "admin.customers" },
            timestamp: new Date().toISOString(),
          });
          return json({ ok: true });
        } catch (err) {
          const msg = (err as Error).message;
          return json({ error: msg === "auth_user_not_found" ? msg : "verify_email_failed" }, 500);
        }
      },
    },
  },
});
