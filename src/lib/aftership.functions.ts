/**
 * Admin-only server functions for AfterShip live tracking.
 *
 * - registerTracker: registers one parcel with AfterShip so we get real-time
 *   "delivered" webhooks (and a checkpoint timeline on the order).
 * - aftershipStatus: reads current tracking state for the admin panel.
 * - bulkRegisterTrackers: registers every shipped order that has a tracking
 *   number but no AfterShip tracker yet.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAdmin } from "./server/firebase-auth-admin";

const RegisterInput = z.object({
  idToken: z.string().min(10).max(4096),
  orderId: z.string().min(1).max(120),
  trackingNumber: z.string().min(4).max(60),
  slug: z.string().min(2).max(60).optional(),
  email: z.string().email().max(320).optional(),
  postcode: z.string().max(20).optional(),
});

export const registerTracker = createServerFn({ method: "POST" })
  .validator((d) => RegisterInput.parse(d))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const { registerAftershipTracking, aftershipConfigured } = await import(
      "./server/aftership.server"
    );
    if (!aftershipConfigured()) return { ok: false, error: "aftership_api_key_missing" };
    const res = await registerAftershipTracking({
      trackingNumber: data.trackingNumber.trim(),
      ...(data.slug ? { slug: data.slug } : {}),
      orderId: data.orderId,
      email: data.email,
      postcode: data.postcode,
      title: `PH Labs order ${data.orderId}`,
    });
    if (res.ok) {
      const { updateDocAdmin } = await import("./server/firestore-admin");
      await updateDocAdmin("orders", data.orderId, {
        aftershipRegistered: true,
        aftershipSlug: data.slug || "auto",
        aftershipRegisteredAt: new Date(),
      }).catch(() => undefined);
    }
    return res;
  });

const StatusInput = z.object({
  idToken: z.string().min(10).max(4096),
  trackingNumber: z.string().min(4).max(60),
  slug: z.string().min(2).max(60).optional(),
});

export const aftershipStatus = createServerFn({ method: "POST" })
  .validator((d) => StatusInput.parse(d))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const { getAftershipTracking } = await import("./server/aftership.server");
    const res = await getAftershipTracking(data.trackingNumber.trim(), data.slug);
    if (!res.ok) return { ok: false as const, error: res.error };
    const t = res.tracking;
    return {
      ok: true as const,
      tag: t?.tag ?? null,
      statusText: t?.subtag_message ?? null,
      events: (t?.checkpoints || []).slice(-25).map((c) => ({
        time: c.checkpoint_time ?? "",
        message: c.subtag_message || c.message || "",
        location: c.location ?? "",
        tag: c.tag ?? "",
      })),
    };
  });

const BulkInput = z.object({
  idToken: z.string().min(10).max(4096),
  slug: z.string().min(2).max(60).optional(),
});

export const bulkRegisterTrackers = createServerFn({ method: "POST" })
  .validator((d) => BulkInput.parse(d))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const { registerAftershipTracking, aftershipConfigured } = await import(
      "./server/aftership.server"
    );
    if (!aftershipConfigured()) return { ok: false, error: "aftership_api_key_missing" };

    const { listDocsAdmin, updateDocAdmin } = await import("./server/firestore-admin");
    const shipped = (await listDocsAdmin("orders", {
      where: { field: "status", value: "shipped" },
      limit: 200,
    }).catch(() => [])) as Array<Record<string, unknown> & { id: string }>;

    const summary = { registered: [] as string[], skipped: 0, errors: [] as string[] };
    for (const o of shipped) {
      const tracking = String(o.trackingNumber || "").trim();
      if (!tracking || o.aftershipRegistered === true) {
        summary.skipped++;
        continue;
      }
      const customer = (o.customer || {}) as Record<string, unknown>;
      const postcode =
        typeof customer.postcode === "string"
          ? customer.postcode.replace(/\s+/g, "").toUpperCase()
          : undefined;
      const res = await registerAftershipTracking({
        trackingNumber: tracking,
        ...(data.slug ? { slug: data.slug } : {}),
        orderId: o.id,
        email: typeof o.userEmail === "string" ? o.userEmail : undefined,
        postcode,
        title: `PH Labs order ${o.id}`,
      });
      if (res.ok) {
        await updateDocAdmin("orders", o.id, {
          aftershipRegistered: true,
          aftershipSlug: data.slug || "auto",
          aftershipRegisteredAt: new Date(),
        }).catch(() => undefined);
        summary.registered.push(o.id);
      } else {
        summary.errors.push(`${o.id}: ${res.error || "failed"}`);
      }
    }
    return { ok: true, ...summary };
  });

/**
 * Bulk delivery check: asks AfterShip for the live status of every shipped
 * order that has a tracking number, and marks the delivered ones as
 * `delivered` (status + deliveredAt, activity log, customer email, referral
 * reward) — same side-effects as the Royal Mail cron.
 */
export const bulkCheckDeliveries = createServerFn({ method: "POST" })
  .validator((d) => BulkInput.parse(d))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const { getAftershipTracking, isDeliveredTag, aftershipConfigured } = await import(
      "./server/aftership.server"
    );
    if (!aftershipConfigured()) return { ok: false as const, error: "aftership_api_key_missing" };

    const { listDocsAdmin } = await import("./server/firestore-admin");
    const { markOrderDelivered } = await import("./server/mark-delivered.server");

    const shipped = (await listDocsAdmin("orders", {
      where: { field: "status", value: "shipped" },
      limit: 200,
    }).catch(() => [])) as Array<Record<string, unknown> & { id: string }>;

    const summary = {
      checked: 0,
      delivered: [] as string[],
      inTransit: [] as string[],
      errors: [] as string[],
    };

    for (const o of shipped) {
      const tracking = String(o.trackingNumber || "").trim();
      if (!tracking) continue;
      summary.checked++;
      const rawSlug = String(o.aftershipSlug || data.slug || "");
      const slug = rawSlug && rawSlug !== "auto" ? rawSlug : undefined;
      const res = await getAftershipTracking(tracking, slug);
      if (!res.ok) {
        summary.errors.push(`${o.id}: ${res.error || "lookup failed"}`);
        continue;
      }
      const tag = res.tracking?.tag ?? null;
      if (!isDeliveredTag(tag)) {
        summary.inTransit.push(`${o.id} (${res.tracking?.subtag_message || tag || "pending"})`);
        continue;
      }
      try {
        await markOrderDelivered(
          {
            id: o.id,
            status: String(o.status || ""),
            trackingNumber: tracking,
            trackingUrl: typeof o.trackingUrl === "string" ? o.trackingUrl : undefined,
            userEmail: typeof o.userEmail === "string" ? o.userEmail : undefined,
            userName: typeof o.userName === "string" ? o.userName : undefined,
            userId: typeof o.userId === "string" ? o.userId : undefined,
            courier: typeof o.courier === "string" ? o.courier : undefined,
          },
          {
            statusText: res.tracking?.subtag_message || "delivered",
            source: "AfterShip bulk check",
          },
        );
        summary.delivered.push(o.id);
      } catch (err) {
        summary.errors.push(`${o.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { ok: true as const, ...summary };
  });
