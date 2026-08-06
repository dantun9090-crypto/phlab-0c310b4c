/**
 * AfterShip webhook — pushes courier checkpoints to us in real time.
 *
 * Configure in AfterShip → Settings → Webhooks:
 *   https://phlabs.co.uk/api/public/hooks/aftership
 *
 * Security: AfterShip signs the raw body with HMAC-SHA256 using the API key
 * and sends it as `aftership-hmac-sha256` (base64). We verify with a
 * timing-safe compare before touching any data. No PII is ever returned.
 *
 * On `delivered` the order is marked delivered (status + deliveredAt),
 * the customer gets the "Delivered" email and the referral reward fires —
 * identical to the Royal Mail cron path, which stays as a fallback.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { findDocByFieldAdmin, updateDocAdmin } from "@/lib/server/firestore-admin";
import { isDeliveredTag, type AftershipCheckpoint } from "@/lib/server/aftership.server";
import { markOrderDelivered, type DeliverableOrder } from "@/lib/server/mark-delivered.server";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function verifySignature(raw: string, provided: string | null): boolean {
  const key = (process.env.AFTERSHIP_API_KEY || "").trim();
  if (!key || !provided) return false;
  const expected = createHmac("sha256", key).update(raw, "utf8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(provided.trim());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface WebhookBody {
  msg?: {
    tracking_number?: string;
    slug?: string;
    tag?: string;
    subtag_message?: string;
    order_id?: string;
    checkpoints?: AftershipCheckpoint[];
  };
}

export const Route = createFileRoute("/api/public/hooks/aftership")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        if (!verifySignature(raw, request.headers.get("aftership-hmac-sha256"))) {
          return json({ ok: false, error: "invalid_signature" }, 401);
        }

        let body: WebhookBody;
        try {
          body = JSON.parse(raw) as WebhookBody;
        } catch {
          return json({ ok: false, error: "invalid_json" }, 400);
        }

        const msg = body.msg || {};
        const tracking = String(msg.tracking_number || "").trim();
        if (!tracking) return json({ ok: false, error: "missing_tracking_number" }, 400);

        // Prefer the order id we registered with the tracker, fall back to
        // a lookup by tracking number.
        let order: DeliverableOrder | null = null;
        const doc = await findDocByFieldAdmin("orders", "trackingNumber", tracking).catch(
          () => null,
        );
        if (doc) {
          order = {
            id: String(doc.__id || msg.order_id || ""),
            status: typeof doc.status === "string" ? doc.status : undefined,
            trackingNumber: tracking,
            trackingUrl: typeof doc.trackingUrl === "string" ? doc.trackingUrl : undefined,
            userEmail: typeof doc.userEmail === "string" ? doc.userEmail : undefined,
            userName: typeof doc.userName === "string" ? doc.userName : undefined,
            userId: typeof doc.userId === "string" ? doc.userId : undefined,
            courier: typeof doc.courier === "string" ? doc.courier : undefined,
          };
        }
        if (!order || !order.id) {
          // Unknown parcel — acknowledge so AfterShip stops retrying.
          return json({ ok: true, matched: false });
        }

        const checkpoints = Array.isArray(msg.checkpoints) ? msg.checkpoints.slice(-25) : [];
        const statusText = msg.subtag_message || msg.tag || "";

        try {
          await updateDocAdmin("orders", order.id, {
            deliveryStatusText: statusText || "in transit",
            trackingTag: String(msg.tag || ""),
            trackingCarrierSlug: String(msg.slug || ""),
            trackingUpdatedAt: new Date(),
            trackingEvents: checkpoints.map((c) => ({
              time: String(c.checkpoint_time || ""),
              message: String(c.subtag_message || c.message || ""),
              location: String(c.location || ""),
              tag: String(c.tag || ""),
            })),
          });
        } catch (err) {
          console.error("[aftership] timeline update failed:", err);
        }

        let delivered = false;
        if (isDeliveredTag(msg.tag)) {
          try {
            delivered = await markOrderDelivered(order, {
              statusText: statusText || "delivered",
              source: "AfterShip webhook",
              courierName: "Royal Mail",
            });
          } catch (err) {
            console.error("[aftership] mark delivered failed:", err);
            return json({ ok: false, error: "update_failed" }, 500);
          }
        }

        return json({ ok: true, matched: true, delivered });
      },
    },
  },
});
