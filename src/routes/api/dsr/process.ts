/**
 * POST /api/dsr/process — admin-only DSR fulfilment endpoint.
 *
 * Actions:
 *   - "export": gather all personal data linked to the request email
 *     (customer + orders + emailSubscribers + dsrRequests), return as JSON,
 *     mark the request `completed` (fulfils Art. 15 access / Art. 20 portability).
 *   - "delete": anonymise the matching customer doc + remove email-list entries
 *     + scrub PII from past orders (HMRC requires order *records* for 6 years,
 *     but personal data may be redacted). Marks `completed`. (Art. 17 erasure.)
 *   - "reject": mark `rejected` with an admin-supplied reason.
 *   - "note":   append a note + custom status (in_progress / waiting_user / …)
 *               without performing the irreversible work.
 *
 * Security:
 *   - Caller must present a Firebase ID token belonging to an `isAdmin` user.
 *   - Service-account credentials bypass Firestore rules.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";
import {
  findDocByFieldAdmin,
  getDocAdmin,
  updateDocAdmin,
  listDocsAdmin,
} from "@/lib/server/firestore-admin";

const BodySchema = z.object({
  idToken: z.string().min(10).max(4096),
  requestId: z.string().min(3).max(128).regex(/^[A-Za-z0-9_-]+$/),
  action: z.enum(["export", "delete", "reject", "note"]),
  status: z.string().max(32).optional(),
  notes: z.string().max(2000).optional(),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

const REDACTED = "[ERASED-GDPR]";

async function gatherPersonalData(email: string) {
  const lower = email.toLowerCase();

  const [customer, orders, subscribers, dsrHistory] = await Promise.all([
    findDocByFieldAdmin("customers", "email", lower),
    listDocsAdmin("orders", { where: { field: "customerEmail", value: lower }, limit: 200 }),
    listDocsAdmin("emailSubscribers", { where: { field: "email", value: lower }, limit: 50 }),
    listDocsAdmin("dsrRequests", { where: { field: "email", value: lower }, limit: 50 }),
  ]);

  return { customer, orders, emailSubscribers: subscribers, dsrRequests: dsrHistory };
}

async function anonymisePersonalData(email: string) {
  const lower = email.toLowerCase();
  const summary: Record<string, number> = { customers: 0, orders: 0, emailSubscribers: 0 };

  const customer = await findDocByFieldAdmin("customers", "email", lower);
  if (customer && typeof customer.__id === "string") {
    await updateDocAdmin("customers", customer.__id, {
      email: REDACTED,
      displayName: REDACTED,
      firstName: REDACTED,
      lastName: REDACTED,
      phone: REDACTED,
      shippingAddress: REDACTED,
      billingAddress: REDACTED,
      marketingOptIn: false,
      anonymisedAt: new Date(),
      gdprErased: true,
    });
    summary.customers = 1;
  }

  const subscribers = await listDocsAdmin("emailSubscribers", {
    where: { field: "email", value: lower }, limit: 100,
  });
  for (const sub of subscribers) {
    await updateDocAdmin("emailSubscribers", sub.id, {
      email: REDACTED,
      unsubscribed: true,
      anonymisedAt: new Date(),
    });
    summary.emailSubscribers++;
  }

  // HMRC requires invoice records for 6 years — keep the order rows but
  // strip personal data fields. We never delete order rows outright.
  const orders = await listDocsAdmin("orders", {
    where: { field: "customerEmail", value: lower }, limit: 500,
  });
  for (const ord of orders) {
    await updateDocAdmin("orders", ord.id, {
      customerEmail: REDACTED,
      customerName: REDACTED,
      shippingAddress: REDACTED,
      billingAddress: REDACTED,
      phone: REDACTED,
      anonymisedAt: new Date(),
      gdprErased: true,
    });
    summary.orders++;
  }

  return summary;
}

export const Route = createFileRoute("/api/dsr/process")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof BodySchema>;
        try {
          body = BodySchema.parse(await request.json());
        } catch (e) {
          return json({ error: "invalid_body", detail: String((e as Error).message) }, 400);
        }

        // Admin gate
        let admin;
        try {
          admin = await requireFirebaseAdmin(body.idToken);
        } catch (e) {
          const msg = (e as Error).message;
          return json({ error: msg === "not_admin" ? "forbidden" : "unauthorized" },
            msg === "not_admin" ? 403 : 401);
        }

        const dsr = await getDocAdmin("dsrRequests", body.requestId);
        if (!dsr) return json({ error: "not_found" }, 404);

        const email = typeof dsr.email === "string" ? dsr.email : "";
        if (!email) return json({ error: "request_has_no_email" }, 400);

        const now = new Date();
        const baseUpdate: Record<string, unknown> = {
          updatedAt: now,
          handledBy: admin.email ?? admin.uid,
          handledByUid: admin.uid,
        };
        if (body.notes) baseUpdate.notes = body.notes;

        try {
          if (body.action === "export") {
            const data = await gatherPersonalData(email);
            await updateDocAdmin("dsrRequests", body.requestId, {
              ...baseUpdate,
              status: "completed",
              fulfilledAt: now,
              fulfilledAction: "export",
            });
            return json({
              ok: true,
              action: "export",
              email,
              exportedAt: now.toISOString(),
              data,
            });
          }

          if (body.action === "delete") {
            const summary = await anonymisePersonalData(email);
            await updateDocAdmin("dsrRequests", body.requestId, {
              ...baseUpdate,
              status: "completed",
              fulfilledAt: now,
              fulfilledAction: "delete",
              erasureSummary: summary,
            });
            return json({ ok: true, action: "delete", email, summary });
          }

          if (body.action === "reject") {
            await updateDocAdmin("dsrRequests", body.requestId, {
              ...baseUpdate,
              status: "rejected",
              fulfilledAt: now,
            });
            return json({ ok: true, action: "reject" });
          }

          // note / status update only
          await updateDocAdmin("dsrRequests", body.requestId, {
            ...baseUpdate,
            status: body.status ?? "in_progress",
          });
          return json({ ok: true, action: "note", status: body.status ?? "in_progress" });
        } catch (err) {
          console.error("[dsr/process] failed", { requestId: body.requestId, err });
          return json({ error: "processing_failed", detail: String((err as Error).message) }, 500);
        }
      },
    },
  },
});
