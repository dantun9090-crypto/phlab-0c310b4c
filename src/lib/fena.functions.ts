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
import {
  addDocAdmin,
  findDocByFieldAdmin,
  getDocAdmin,
  listDocsAdmin,
  updateDocAdmin,
} from "@/lib/server/firestore-admin";
import { requireFirebaseAdmin, verifyFirebaseIdToken } from "@/lib/server/firebase-auth-admin";
import {
  fenaCreateAndProcess,
  fenaGetPayment,
  fenaListBankAccounts,
  FENA_ENV_LABEL,
  type FenaBankAccount,
} from "@/lib/fena.server";

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
  resolved?: boolean;
  resolvedAt?: string;
  resolvedOrderId?: string;
}

function coerceOrphan(row: Record<string, unknown> & { id: string }): FenaOrphanPaymentRow {
  return {
    id: row.id,
    fenaPaymentId: typeof row.fenaPaymentId === "string" ? row.fenaPaymentId : undefined,
    reference: typeof row.reference === "string" ? row.reference : undefined,
    amount: typeof row.amount === "string" ? row.amount : undefined,
    fenaStatus: typeof row.fenaStatus === "string" ? row.fenaStatus : undefined,
    completedAt: typeof row.completedAt === "string" ? row.completedAt : null,
    receivedAt: typeof row.receivedAt === "string" ? row.receivedAt : undefined,
    reason: typeof row.reason === "string" ? row.reason : undefined,
    lastSeenAt: typeof row.lastSeenAt === "string" ? row.lastSeenAt : undefined,
    resolved: row.resolved === true,
    resolvedAt: typeof row.resolvedAt === "string" ? row.resolvedAt : undefined,
    resolvedOrderId: typeof row.resolvedOrderId === "string" ? row.resolvedOrderId : undefined,
  };
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
    return rows.map(coerceOrphan).filter((r) => !r.resolved);
  });

export interface FenaReconcileResult {
  scanned: number;
  resolved: number;
  unresolved: number;
  details: Array<{
    fenaPaymentId: string;
    outcome: "resolved" | "no_match" | "error";
    orderId?: string;
    newStatus?: string;
    message?: string;
  }>;
}

/**
 * Walk every unresolved orphan and try to attach it to an existing order
 * by `fenaPaymentId`, then by `orderNumber == reference`. When matched,
 * apply the same status transition the webhook would have, and stamp the
 * orphan record as resolved so it stops appearing in the admin list.
 */
export const reconcileFenaOrphans = createServerFn({ method: "POST" })
  .inputValidator((d) => AdminEventsInput.parse(d))
  .handler(async ({ data }): Promise<FenaReconcileResult> => {
    await requireFirebaseAdmin(data.idToken);
    const orphans = await listDocsAdmin("fena_orphan_payments", {
      orderBy: "lastSeenAt",
      direction: "DESCENDING",
      limit: 100,
    });
    const result: FenaReconcileResult = {
      scanned: 0,
      resolved: 0,
      unresolved: 0,
      details: [],
    };

    for (const raw of orphans) {
      if (raw.resolved === true) continue;
      const fenaPaymentId =
        typeof raw.fenaPaymentId === "string" ? raw.fenaPaymentId : raw.id;
      if (!fenaPaymentId) continue;
      result.scanned += 1;

      try {
        // 1) match by fenaPaymentId on the order doc
        let orderRow = await findDocByFieldAdmin(
          "orders",
          "fenaPaymentId",
          fenaPaymentId,
        );
        // 2) fall back to matching by orderNumber == reference
        const reference = typeof raw.reference === "string" ? raw.reference : "";
        if (!orderRow && reference) {
          orderRow = await findDocByFieldAdmin("orders", "orderNumber", reference);
        }
        if (!orderRow) {
          result.unresolved += 1;
          result.details.push({
            fenaPaymentId,
            outcome: "no_match",
            message: reference
              ? `no order with fenaPaymentId or orderNumber=${reference}`
              : "no order match and no reference",
          });
          continue;
        }

        const orderId = typeof orderRow.__id === "string" ? orderRow.__id : "";
        if (!orderId) {
          result.unresolved += 1;
          result.details.push({
            fenaPaymentId,
            outcome: "error",
            message: "matched order has no id",
          });
          continue;
        }

        // Re-fetch the authoritative payment from Fena so we don't trust
        // anything the orphan record cached.
        const authoritative = await fenaGetPayment(fenaPaymentId);
        const fenaStatus = String(authoritative.status ?? "").toLowerCase();
        const currentStatus = String(orderRow.status ?? "pending").toLowerCase();
        const isPaid = fenaStatus === "paid";
        const isCancelled = fenaStatus === "cancelled" || fenaStatus === "expired";

        const updates: Record<string, unknown> = {
          fenaStatus,
          fenaPaymentId,
          fenaReconciledAt: new Date(),
          paymentProvider: "fena",
        };
        if (isPaid && currentStatus !== "paid") {
          updates.status = "paid";
          updates.paidAt = new Date();
        } else if (isCancelled && currentStatus === "pending") {
          updates.status = "cancelled";
        }

        await updateDocAdmin("orders", orderId, updates);

        // Confirmation mail on first paid transition during reconciliation.
        if (isPaid && currentStatus !== "paid") {
          const to = String(orderRow.customerEmail ?? orderRow.email ?? "");
          if (to && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
            try {
              await addDocAdmin("mail", {
                to,
                message: {
                  subject: `PH Labs — payment received for ${reference || orderId}`,
                  html: `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:24px;color:#0f172a">
                    <h2 style="color:#10b981">Payment received</h2>
                    <p>Thank you — we've received your payment for order
                    <strong>${reference || orderId}</strong>.</p>
                  </body></html>`,
                  text: `Payment received for order ${reference || orderId}. Thank you.`,
                },
                createdAt: new Date(),
                source: "fena:reconcile",
              });
            } catch {
              // mail failure shouldn't abort reconcile
            }
          }
        }

        await updateDocAdmin("fena_orphan_payments", String(raw.id), {
          resolved: true,
          resolvedAt: new Date(),
          resolvedOrderId: orderId,
          resolvedStatus: updates.status ?? currentStatus,
        });

        // Sanity: make sure the order doc actually exists post-update.
        await getDocAdmin("orders", orderId);

        result.resolved += 1;
        result.details.push({
          fenaPaymentId,
          outcome: "resolved",
          orderId,
          newStatus: String(updates.status ?? currentStatus),
        });
      } catch (err) {
        result.unresolved += 1;
        result.details.push({
          fenaPaymentId,
          outcome: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return result;
  });


import { fenaListBankAccounts, FENA_ENV_LABEL, type FenaBankAccount } from "@/lib/fena.server";

export interface FenaBankAccountRow {
  id: string;
  name?: string;
  status?: string;
  isDefault?: boolean;
  bank?: string;
  iban?: string;
  accountNumber?: string;
  sortCode?: string;
  currency?: string;
}

export const listFenaBankAccountsAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => AdminEventsInput.parse(d))
  .handler(async ({ data }): Promise<{ env: string; accounts: FenaBankAccountRow[] }> => {
    await requireFirebaseAdmin(data.idToken);
    const accs: FenaBankAccount[] = await fenaListBankAccounts();
    return {
      env: FENA_ENV_LABEL,
      accounts: accs.map((a) => ({
        id: a.id,
        name: a.name,
        status: a.status,
        isDefault: a.isDefault,
        bank: a.bank,
        iban: a.iban,
        accountNumber: a.accountNumber,
        sortCode: a.sortCode,
        currency: a.currency,
      })),
    };
  });
