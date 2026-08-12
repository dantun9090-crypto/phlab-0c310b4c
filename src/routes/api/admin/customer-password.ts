/**
 * POST /api/admin/customer-password — admin-assisted password recovery.
 *
 * Two modes:
 *   - "reset-link" : Firebase emails the customer a password-reset link.
 *   - "set"        : the admin sets a password directly (either supplied or
 *                    an auto-generated easy one) and every existing session
 *                    for that account is revoked.
 *
 * Security: caller must present a Firebase ID token belonging to an
 * `isAdmin` customer. Admin accounts cannot have their password set by
 * another admin through this route (use the normal reset flow) to limit
 * lateral privilege takeover. Passwords are never written to logs or to
 * Firestore — only the fact that the action happened.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";
import { addDocAdmin, getDocAdmin } from "@/lib/server/firestore-admin";
import {
  generateReadablePassword,
  sendPasswordResetLink,
  setAuthUserPassword,
} from "@/lib/server/firebase-auth-password";

const BodySchema = z.object({
  idToken: z.string().min(10).max(4096),
  uid: z.string().min(3).max(128).regex(/^[A-Za-z0-9_-]+$/),
  mode: z.enum(["reset-link", "set"]),
  /** Only for mode "set". Omit to auto-generate a readable password. */
  password: z.string().min(6).max(128).optional(),
  reason: z.string().max(500).optional(),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/admin/customer-password")({
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

        const email = typeof customer.email === "string" ? customer.email.toLowerCase() : "";
        const isTargetAdmin = customer.isAdmin === true || customer.role === "admin";

        if (body.mode === "set" && isTargetAdmin && admin.uid !== body.uid) {
          return json({ error: "cannot_set_admin_password" }, 400);
        }

        try {
          if (body.mode === "reset-link") {
            if (!email) return json({ error: "no_email" }, 400);
            await sendPasswordResetLink(email);

            await addDocAdmin("auditLogs", {
              adminUid: admin.uid,
              adminEmail: admin.email ?? null,
              action: "customer.password.reset_link",
              target: `customers/${body.uid}`,
              before: null,
              after: { emailSent: true },
              meta: { reason: body.reason ?? null, source: "admin.customers" },
              timestamp: new Date().toISOString(),
            });

            return json({ ok: true, mode: body.mode, emailSent: true });
          }

          const password = body.password ?? generateReadablePassword();
          const generated = !body.password;
          await setAuthUserPassword(body.uid, password);

          await addDocAdmin("auditLogs", {
            adminUid: admin.uid,
            adminEmail: admin.email ?? null,
            action: "customer.password.set",
            target: `customers/${body.uid}`,
            before: null,
            // Never store or echo the password value into the audit trail.
            after: { generated, sessionsRevoked: true },
            meta: { reason: body.reason ?? null, source: "admin.customers" },
            timestamp: new Date().toISOString(),
          });

          return json({
            ok: true,
            mode: body.mode,
            generated,
            // Returned once so the admin can pass it to the customer.
            password,
            sessionsRevoked: true,
          });
        } catch (err) {
          const msg = (err as Error).message;
          const known = new Set([
            "auth_user_not_found",
            "weak_password",
            "reset_link_failed",
            "password_update_failed",
          ]);
          if (!known.has(msg)) {
            console.error("[customer-password] failed", { uid: body.uid, mode: body.mode });
          }
          return json({ error: known.has(msg) ? msg : "password_action_failed" }, 500);
        }
      },
    },
  },
});
