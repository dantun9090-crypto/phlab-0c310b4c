/**
 * POST /api/admin/customer-delete — permanently remove a customer.
 *
 * Two modes:
 *   - "full"      : delete the Firebase Auth account, delete the
 *                   `customers/{uid}` document, delete newsletter
 *                   subscriptions, and scrub PII from past orders.
 *   - "anonymise" : keep the account row but scrub all personal data
 *                   (used when the admin only wants a GDPR redaction).
 *
 * Order ROWS are never deleted — HMRC requires invoice records for 6 years —
 * but every personal-data field on them is redacted.
 *
 * Security: caller must present a Firebase ID token belonging to an
 * `isAdmin` customer. Service-account credentials bypass Firestore rules.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";
import {
  addDocAdmin,
  deleteDocAdmin,
  getDocAdmin,
  listDocsAdmin,
  updateDocAdmin,
} from "@/lib/server/firestore-admin";
import { deleteAuthUserAdmin } from "@/lib/server/firebase-auth-delete";

const BodySchema = z.object({
  idToken: z.string().min(10).max(4096),
  uid: z.string().min(3).max(128).regex(/^[A-Za-z0-9_-]+$/),
  mode: z.enum(["full", "anonymise"]).default("full"),
  reason: z.string().max(500).optional(),
});

const REDACTED = "[REMOVED]";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/admin/customer-delete")({
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

        if (admin.uid === body.uid) {
          return json({ error: "cannot_remove_self" }, 400);
        }

        const customer = await getDocAdmin("customers", body.uid);
        if (!customer) return json({ error: "not_found" }, 404);

        // Refuse to remove another admin — demote them first.
        if (customer.isAdmin === true || customer.role === "admin") {
          return json({ error: "cannot_remove_admin" }, 400);
        }

        const email =
          typeof customer.email === "string" ? customer.email.toLowerCase() : "";

        const summary = {
          authDeleted: false,
          authMissing: false,
          customerDeleted: false,
          customerAnonymised: false,
          orders: 0,
          emailSubscribers: 0,
        };

        const now = new Date();

        try {
          // 1. Scrub PII from historical orders (rows retained for HMRC).
          const byUid = await listDocsAdmin("orders", {
            where: { field: "userId", value: body.uid },
            limit: 500,
          });
          const byEmail = email
            ? await listDocsAdmin("orders", {
                where: { field: "customerEmail", value: email },
                limit: 500,
              })
            : [];
          const orderIds = new Set([...byUid, ...byEmail].map((o) => o.id));
          for (const id of orderIds) {
            await updateDocAdmin("orders", id, {
              customerEmail: REDACTED,
              customerName: REDACTED,
              customerPhone: REDACTED,
              phone: REDACTED,
              shippingAddress: REDACTED,
              billingAddress: REDACTED,
              anonymisedAt: now,
              gdprErased: true,
            });
            summary.orders++;
          }

          // 2. Remove newsletter subscriptions.
          if (email) {
            const subs = await listDocsAdmin("emailSubscribers", {
              where: { field: "email", value: email },
              limit: 100,
            });
            for (const sub of subs) {
              await deleteDocAdmin("emailSubscribers", sub.id);
              summary.emailSubscribers++;
            }
          }

          // 3. Auth account + customer document.
          if (body.mode === "full") {
            const authResult = await deleteAuthUserAdmin(body.uid);
            summary.authDeleted = authResult.deleted;
            summary.authMissing = authResult.missing;

            await deleteDocAdmin("customers", body.uid);
            summary.customerDeleted = true;
          } else {
            await updateDocAdmin("customers", body.uid, {
              email: REDACTED,
              displayName: REDACTED,
              firstName: REDACTED,
              lastName: REDACTED,
              phone: REDACTED,
              shippingAddress: REDACTED,
              billingAddress: REDACTED,
              marketingOptIn: false,
              isActive: false,
              gdprErased: true,
              anonymisedAt: now,
            });
            summary.customerAnonymised = true;
          }

          // 4. Append-only audit trail (server-written, admin-read only).
          await addDocAdmin("auditLogs", {
            adminUid: admin.uid,
            adminEmail: admin.email ?? null,
            action: body.mode === "full" ? "customer.delete" : "customer.anonymise",
            target: `customers/${body.uid}`,
            before: { email: email || null },
            after: summary,
            meta: { reason: body.reason ?? null, source: "admin.customers" },
            timestamp: now,
          });

          return json({ ok: true, mode: body.mode, summary });
        } catch (err) {
          console.error("[customer-delete] failed", { uid: body.uid, err });
          return json({ error: "deletion_failed", summary }, 500);
        }
      },
    },
  },
});
