/**
 * Server functions for the Fena Open Banking checkout flow.
 *
 *  - createFenaPaymentLink(orderId, idToken) → returns hpp URL
 *      Looks up the order in Firestore using service-account creds,
 *      validates the caller owns it, then creates a Fena payment using
 *      the server-side `totalAmount` (the client cannot tamper).
 *
 *  - getOrderPaymentStatus(orderId, idToken) → { status, paid }
 *      Cheap status poll used by the /payment/success page.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDocAdmin, listDocsAdmin, updateDocAdmin } from "@/lib/server/firestore-admin";
import { requireFirebaseAdmin, verifyFirebaseIdToken } from "@/lib/server/firebase-auth-admin";
import { fenaCreateAndProcess } from "@/lib/fena.server";

const SITE_ORIGIN = "https://phlabs.co.uk";

const CreateInput = z.object({
  idToken: z.string().min(10).max(4096),
  orderId: z.string().min(6).max(128).regex(/^[A-Za-z0-9_-]+$/),
});

export const createFenaPaymentLink = createServerFn({ method: "POST" })
  .inputValidator((d) => CreateInput.parse(d))
  .handler(async ({ data }) => {
    const user = await verifyFirebaseIdToken(data.idToken);
    const order = await getDocAdmin("orders", data.orderId);
    if (!order) throw new Error("Order not found");
    if (order.userId && order.userId !== user.uid) {
      throw new Error("Forbidden: order belongs to another account");
    }
    const status = String(order.status ?? "").toLowerCase();
    if (["paid", "completed", "shipped", "fulfilled", "cancelled", "refunded"].includes(status)) {
      throw new Error("Order already settled");
    }

    const rawAmount = Number(order.totalAmount ?? order.total ?? 0);
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      throw new Error("Order has no payable amount");
    }
    if (String(order.currency ?? "GBP").toUpperCase() !== "GBP") {
      throw new Error("Only GBP orders are supported by Fena");
    }
    const amount = Math.round(rawAmount * 100) / 100;
    const reference = String(order.orderNumber ?? data.orderId).slice(0, 35);
    const customerName = String(
      order.customerName ??
        `${order.firstName ?? ""} ${order.lastName ?? ""}`.trim() ??
        "",
    ).slice(0, 100) || undefined;
    const customerEmail = String(order.customerEmail ?? order.email ?? user.email ?? "").slice(0, 254) || undefined;

    const result = await fenaCreateAndProcess({
      reference,
      amount,
      customerName,
      customerEmail,
      description: `PH Labs order ${reference}`,
      customRedirectUrl: `${SITE_ORIGIN}/payment/success?orderId=${encodeURIComponent(data.orderId)}`,
    });

    await updateDocAdmin("orders", data.orderId, {
      fenaPaymentId: result.id,
      fenaReference: reference,
      fenaStatus: result.status,
      fenaCreatedAt: new Date(),
      paymentProvider: "fena",
    });

    return { hppUrl: result.link, fenaPaymentId: result.id };
  });

const StatusInput = z.object({
  idToken: z.string().min(10).max(4096),
  orderId: z.string().min(6).max(128).regex(/^[A-Za-z0-9_-]+$/),
});

export const getOrderPaymentStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => StatusInput.parse(d))
  .handler(async ({ data }) => {
    const user = await verifyFirebaseIdToken(data.idToken);
    const order = await getDocAdmin("orders", data.orderId);
    if (!order) throw new Error("Order not found");
    if (order.userId && order.userId !== user.uid) {
      throw new Error("Forbidden");
    }
    const status = String(order.status ?? "pending").toLowerCase();
    return {
      status,
      paid: ["paid", "completed", "shipped", "fulfilled"].includes(status),
      fenaStatus: order.fenaStatus ?? null,
    };
  });

const AdminEventsInput = z.object({
  idToken: z.string().min(10).max(4096),
});

export interface FenaWebhookEventRow {
  id: string;
  level?: string;
  message?: string;
  ctx?: string;
  createdAt?: string;
}

export const listFenaWebhookEvents = createServerFn({ method: "POST" })
  .inputValidator((d) => AdminEventsInput.parse(d))
  .handler(async ({ data }): Promise<FenaWebhookEventRow[]> => {
    await requireFirebaseAdmin(data.idToken);
    const rows = await listDocsAdmin("fena_webhook_events", {
      orderBy: "createdAt",
      direction: "DESCENDING",
      limit: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      level: typeof row.level === "string" ? row.level : undefined,
      message: typeof row.message === "string" ? row.message : undefined,
      ctx: row.ctx && typeof row.ctx === "object" ? JSON.stringify(row.ctx, null, 2) : undefined,
      createdAt: typeof row.createdAt === "string" ? row.createdAt : undefined,
    }));
  });

export interface FenaOrphanPaymentRow {
  id: string;
  fenaPaymentId?: string;
  reference?: string;
  amount?: string;
  fenaStatus?: string;
  completedAt?: string | null;
  receivedAt?: string;
  reason?: string;
  lastSeenAt?: string;
}

export const listFenaOrphanPayments = createServerFn({ method: "POST" })
  .inputValidator((d) => AdminEventsInput.parse(d))
  .handler(async ({ data }): Promise<FenaOrphanPaymentRow[]> => {
    await requireFirebaseAdmin(data.idToken);
    const rows = await listDocsAdmin("fena_orphan_payments", {
      orderBy: "lastSeenAt",
      direction: "DESCENDING",
      limit: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      fenaPaymentId: typeof row.fenaPaymentId === "string" ? row.fenaPaymentId : undefined,
      reference: typeof row.reference === "string" ? row.reference : undefined,
      amount: typeof row.amount === "string" ? row.amount : undefined,
      fenaStatus: typeof row.fenaStatus === "string" ? row.fenaStatus : undefined,
      completedAt: typeof row.completedAt === "string" ? row.completedAt : null,
      receivedAt: typeof row.receivedAt === "string" ? row.receivedAt : undefined,
      reason: typeof row.reason === "string" ? row.reason : undefined,
      lastSeenAt: typeof row.lastSeenAt === "string" ? row.lastSeenAt : undefined,
    }));
  });
