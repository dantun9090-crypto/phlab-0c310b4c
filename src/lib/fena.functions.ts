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
  deleteDocAdmin,
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
  fenaRenameBankAccount,
  fenaSetDefaultBankAccount,
  fenaConnectBankAccount,
  getFenaEnvLabel,
  invalidateFenaEnvCache,
  fenaListPayments,
  type FenaBankAccount,
  type FenaListedPayment,
} from "@/lib/fena.server";
import {
  mapTrueLayerStatus,
  truelayerGetPayment,
} from "@/lib/payments/truelayer.server";
import { getGatewayConfig } from "@/lib/payments/gateway-config.server";
import {
  getFenaQuotaSnapshot,
  setFenaDailyLimit,
  type FenaQuotaSnapshot,
} from "@/lib/fena-metrics.server";
import {
  processFenaRetries,
  MAX_RETRY_ATTEMPTS,
  type RetryProcessResult,
} from "@/lib/fena-retry-queue.server";
import { escapeHtml } from "@/templates/emailBase";

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
    // Fena reference spec: 1..12 chars, /^[a-z0-9-]+$/i — sanitize aggressively
    // or the create-and-process call is rejected with a 400.
    const rawRef = String(order.orderNumber ?? data.orderId);
    const reference =
      rawRef
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 12) || data.orderId.slice(0, 12);
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
  orderId: z.string().min(6).max(128).regex(/^[A-Za-z0-9_-]+$/).optional(),
  paymentId: z.string().min(6).max(128).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).refine((d) => d.orderId || d.paymentId, { message: "orderId or paymentId is required" });

export const getOrderPaymentStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => StatusInput.parse(d))
  .handler(async ({ data }) => {
    const user = await verifyFirebaseIdToken(data.idToken);
    const orderIdFromPayment = data.paymentId
      ? await findDocByFieldAdmin("orders", "truelayerPaymentId", data.paymentId)
      : null;
    const orderId = data.orderId || (typeof orderIdFromPayment?.__id === "string" ? orderIdFromPayment.__id : "");
    const order = orderIdFromPayment || (orderId ? await getDocAdmin("orders", orderId) : null);
    if (!order) throw new Error("Order not found");
    if (!orderId) throw new Error("Order id could not be resolved");
    if (order.userId && order.userId !== user.uid) {
      throw new Error("Forbidden");
    }
    let status = String(order.status ?? "pending").toLowerCase();
    let fenaStatus = (order.fenaStatus as string | null) ?? null;

    // Self-heal: if the webhook hasn't landed yet, ask Fena directly using
    // the stored payment id and apply the same transition the webhook would.
    const settled = ["paid", "completed", "shipped", "fulfilled", "cancelled", "refunded"];
    const fenaPaymentId = typeof order.fenaPaymentId === "string" ? order.fenaPaymentId : "";
    if (fenaPaymentId && !settled.includes(status)) {
      try {
        const live = await fenaGetPayment(fenaPaymentId);
        const liveStatus = String(live.status ?? "").toLowerCase();
        if (liveStatus) fenaStatus = liveStatus;
        if (liveStatus === "paid" && status !== "paid") {
          // ATOMIC: poller races the Fena webhook. Only one writer flips
          // the order to paid; the loser keeps the existing paid doc.
          const { transitionDocStatusAdmin } = await import("@/lib/server/firestore-admin");
          const { transitioned } = await transitionDocStatusAdmin("orders", orderId, {
            allowFrom: ["pending", "pending_payment", "awaiting_payment", "processing_payment", ""],
            updates: {
              status: "paid",
              paidAt: new Date(),
              fenaStatus: liveStatus,
              paymentProvider: "fena",
              fenaSelfHealedAt: new Date(),
            },
          });
          if (transitioned) status = "paid";
        } else if ((liveStatus === "cancelled" || liveStatus === "expired") && status === "pending") {
          const { transitionDocStatusAdmin } = await import("@/lib/server/firestore-admin");
          const { transitioned } = await transitionDocStatusAdmin("orders", orderId, {
            allowFrom: ["pending", "pending_payment", "awaiting_payment", "processing_payment", ""],
            updates: { status: "cancelled", fenaStatus: liveStatus },
          });
          if (transitioned) status = "cancelled";
        } else if (liveStatus && liveStatus !== order.fenaStatus) {
          await updateDocAdmin("orders", orderId, { fenaStatus: liveStatus });
        }
      } catch {
        // Don't fail the poll if Fena is briefly unreachable.
      }
    }

    const truelayerPaymentId = typeof order.truelayerPaymentId === "string" ? order.truelayerPaymentId : data.paymentId || "";
    if (truelayerPaymentId && !settled.includes(status)) {
      try {
        const cfg = await getGatewayConfig("truelayer");
        const live = await truelayerGetPayment(truelayerPaymentId, cfg.sandbox);
        const liveStatus = String(live.status ?? "").toLowerCase();
        const mapped = mapTrueLayerStatus(liveStatus);
        if (mapped === "paid" && status !== "paid") {
          const { transitionDocStatusAdmin } = await import("@/lib/server/firestore-admin");
          const { transitioned } = await transitionDocStatusAdmin("orders", orderId, {
            allowFrom: ["pending", "pending_payment", "awaiting_payment", "processing_payment", ""],
            updates: {
              status: "paid",
              paidAt: new Date(),
              truelayerStatus: liveStatus,
              paymentProvider: "truelayer",
              truelayerSelfHealedAt: new Date(),
            },
          });
          if (transitioned) status = "paid";
        } else if (mapped === "cancelled" && status === "pending") {
          const { transitionDocStatusAdmin } = await import("@/lib/server/firestore-admin");
          const { transitioned } = await transitionDocStatusAdmin("orders", orderId, {
            allowFrom: ["pending", "pending_payment", "awaiting_payment", "processing_payment", ""],
            updates: { status: "cancelled", truelayerStatus: liveStatus },
          });
          if (transitioned) status = "cancelled";
        } else if (liveStatus && liveStatus !== order.truelayerStatus) {
          await updateDocAdmin("orders", orderId, { truelayerStatus: liveStatus });
        }
      } catch {
        // Don't fail the poll if TrueLayer is briefly unreachable.
      }
    }

    return {
      orderId,
      status,
      paid: ["paid", "completed", "shipped", "fulfilled"].includes(status),
      fenaStatus,
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
  /** Convenience fields extracted from `ctx` for the admin UI. */
  orderId?: string;
  fenaPaymentId?: string;
  fenaStatus?: string;
  newStatus?: string;
  reason?: string;
  matchOutcome: "matched" | "orphan" | "duplicate" | "bank_account" | "error" | "info";
}

function pickStr(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" && v.trim() ? v : undefined;
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
    return rows.map((row) => {
      const ctxObj =
        row.ctx && typeof row.ctx === "object" && !Array.isArray(row.ctx)
          ? (row.ctx as Record<string, unknown>)
          : {};
      const message = typeof row.message === "string" ? row.message : "";
      const level = typeof row.level === "string" ? row.level : "";
      const orderId = pickStr(ctxObj, "orderId");
      const reason = pickStr(ctxObj, "reason");
      const matchOutcome: FenaWebhookEventRow["matchOutcome"] = /^ORPHAN/i.test(message)
        ? "orphan"
        : /^bank-accounts:/i.test(message)
          ? "bank_account"
          : /^duplicate event/i.test(message)
            ? "duplicate"
            : /^processed$/i.test(message) && orderId
              ? "matched"
              : level === "error"
                ? "error"
                : "info";
      return {
        id: row.id,
        level: level || undefined,
        message: message || undefined,
        ctx: Object.keys(ctxObj).length ? JSON.stringify(ctxObj, null, 2) : undefined,
        createdAt: typeof row.createdAt === "string" ? row.createdAt : undefined,
        orderId,
        fenaPaymentId: pickStr(ctxObj, "fenaPaymentId"),
        fenaStatus: pickStr(ctxObj, "fenaStatus"),
        newStatus: pickStr(ctxObj, "newStatus"),
        reason,
        matchOutcome,
      };
    });
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

        // Always-safe trail fields (idempotent to overwrite).
        const trailUpdates: Record<string, unknown> = {
          fenaStatus,
          fenaPaymentId,
          fenaReconciledAt: new Date(),
          paymentProvider: "fena",
        };
        await updateDocAdmin("orders", orderId, trailUpdates);

        // Status mutation goes through an atomic transition so a
        // simultaneous webhook delivery can't double-confirm.
        let didTransitionToPaid = false;
        if (isPaid && currentStatus !== "paid") {
          const { transitionDocStatusAdmin } = await import("@/lib/server/firestore-admin");
          const { transitioned } = await transitionDocStatusAdmin("orders", orderId, {
            allowFrom: ["pending", "pending_payment", "awaiting_payment", "processing_payment", ""],
            updates: { status: "paid", paidAt: new Date() },
          });
          didTransitionToPaid = transitioned;
        } else if (isCancelled && currentStatus === "pending") {
          const { transitionDocStatusAdmin } = await import("@/lib/server/firestore-admin");
          await transitionDocStatusAdmin("orders", orderId, {
            allowFrom: ["pending"],
            updates: { status: "cancelled" },
          });
        }

        // Confirmation mail ONLY when we won the paid-transition race.
        if (didTransitionToPaid) {
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
                    <strong>${escapeHtml(reference || orderId)}</strong>.</p>
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
          resolvedStatus: didTransitionToPaid ? "paid" : (isCancelled && currentStatus === "pending" ? "cancelled" : currentStatus),
        });

        // Sanity: make sure the order doc actually exists post-update.
        await getDocAdmin("orders", orderId);

        result.resolved += 1;
        result.details.push({
          fenaPaymentId,
          outcome: "resolved",
          orderId,
          newStatus: didTransitionToPaid ? "paid" : (isCancelled && currentStatus === "pending" ? "cancelled" : currentStatus),
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




export interface FenaBankAccountRow {
  id: string;
  name?: string;
  status?: string;
  isDefault?: boolean;
  provider?: string;
  creationType?: string;
  accountNumber?: string;
  sortCode?: string;
  bankConsentExpired?: string;
  createdAt?: string;
  // legacy/optional fields (kept for forward compat with other Fena responses)
  bank?: string;
  iban?: string;
  currency?: string;
}

export const listFenaBankAccountsAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => AdminEventsInput.parse(d))
  .handler(async ({ data }): Promise<{ env: string; accounts: FenaBankAccountRow[] }> => {
    await requireFirebaseAdmin(data.idToken);
    const accs: FenaBankAccount[] = await fenaListBankAccounts();
    const s = (v: unknown) => (typeof v === "string" ? v : undefined);
    const b = (v: unknown) => (typeof v === "boolean" ? v : undefined);
    return {
      env: await getFenaEnvLabel(),
      accounts: accs.map((a) => ({
        id: a.id,
        name: s(a.name),
        status: s(a.status),
        isDefault: b(a.isDefault),
        provider: s((a as Record<string, unknown>).provider),
        creationType: s((a as Record<string, unknown>).creationType),
        accountNumber: s(a.accountNumber),
        sortCode: s(a.sortCode),
        bankConsentExpired: s((a as Record<string, unknown>).bankConsentExpired),
        createdAt: s(a.createdAt),
        bank: s(a.bank),
        iban: s(a.iban),
        currency: s(a.currency),
      })),
    };
  });


// ---------- Environment toggle (sandbox / production) ----------

const SetEnvInput = z.object({
  idToken: z.string().min(10).max(4096),
  env: z.enum(["sandbox", "production"]),
});

export const getFenaIntegrationSettings = createServerFn({ method: "POST" })
  .inputValidator((d) => AdminEventsInput.parse(d))
  .handler(async ({ data }): Promise<{
    env: "sandbox" | "production";
    source: "settings" | "secret" | "default";
    hasCredentials: boolean;
  }> => {
    await requireFirebaseAdmin(data.idToken);
    const doc = await getDocAdmin("settings", "fena");
    const fromDoc = doc && typeof doc.env === "string" ? doc.env.toLowerCase() : "";
    const fromSecret = String(process.env.FENA_ENV ?? "").toLowerCase();
    const source: "settings" | "secret" | "default" =
      fromDoc === "sandbox" || fromDoc === "production"
        ? "settings"
        : fromSecret === "sandbox" || fromSecret === "production"
          ? "secret"
          : "default";
    return {
      env: await getFenaEnvLabel(),
      source,
      hasCredentials: Boolean(process.env.FENA_TERMINAL_ID && process.env.FENA_TERMINAL_SECRET),
    };
  });

export const setFenaIntegrationEnv = createServerFn({ method: "POST" })
  .inputValidator((d) => SetEnvInput.parse(d))
  .handler(async ({ data }): Promise<{ env: "sandbox" | "production" }> => {
    await requireFirebaseAdmin(data.idToken);
    await updateDocAdmin("settings", "fena", {
      env: data.env,
      updatedAt: new Date(),
    });
    invalidateFenaEnvCache();
    return { env: data.env };
  });

// ---------- Dry-run connectivity check ----------

export interface FenaDryRunResult {
  ok: boolean;
  env: "sandbox" | "production";
  accountCount: number;
  defaultAccount?: { id: string; name?: string; status?: string; currency?: string } | null;
  error?: string;
  durationMs: number;
}

export const dryRunFenaConnection = createServerFn({ method: "POST" })
  .inputValidator((d) => AdminEventsInput.parse(d))
  .handler(async ({ data }): Promise<FenaDryRunResult> => {
    await requireFirebaseAdmin(data.idToken);
    const env = await getFenaEnvLabel();
    const started = Date.now();
    try {
      const accs = await fenaListBankAccounts();
      const def =
        accs.find((a) => a.isDefault) ?? accs[0] ?? null;
      return {
        ok: true,
        env,
        accountCount: accs.length,
        defaultAccount: def
          ? { id: def.id, name: def.name, status: def.status, currency: def.currency }
          : null,
        durationMs: Date.now() - started,
      };
    } catch (err) {
      return {
        ok: false,
        env,
        accountCount: 0,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - started,
      };
    }
  });


// ---------- Transactions list (live from Fena) ----------

export interface FenaTransactionRow {
  id: string;
  status: string;
  amount: string;
  currency?: string;
  reference?: string;
  customerEmail?: string;
  customerName?: string;
  description?: string;
  paymentMethod?: string;
  isSandbox?: boolean;
  transaction?: string;
  createdAt?: string;
  completedAt?: string;
  orderId?: string | null;
  orderStatus?: string | null;
  orderNumber?: string | null;
}

export const listFenaTransactionsAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => AdminEventsInput.parse(d))
  .handler(async ({ data }): Promise<{
    env: "sandbox" | "production";
    transactions: FenaTransactionRow[];
    totalFetched: number;
    filteredOut: number;
  }> => {
    await requireFirebaseAdmin(data.idToken);
    const env = await getFenaEnvLabel();
    const payments: FenaListedPayment[] = await fenaListPayments(50);

    // Filter to match the currently selected Fena environment.
    const matching = payments.filter((p) => {
      const isSandbox = p.isSandbox === true;
      return env === "sandbox" ? isSandbox : !isSandbox;
    });

    // Best-effort link each payment to the matching order in Firestore.
    const rows = await Promise.all(
      matching.map(async (p): Promise<FenaTransactionRow> => {
        let orderId: string | null = null;
        let orderStatus: string | null = null;
        let orderNumber: string | null = null;
        try {
          const match = await findDocByFieldAdmin("orders", "fenaPaymentId", p.id);
          if (match) {
            orderId = typeof match.__id === "string" ? match.__id : null;
            orderStatus = typeof match.status === "string" ? match.status : null;
            orderNumber = typeof match.orderNumber === "string" ? match.orderNumber : null;
          }
        } catch {/* ignore link failures */}
        return {
          id: p.id,
          status: String(p.status ?? ""),
          amount: String(p.amount ?? ""),
          currency: typeof p.currency === "string" ? p.currency : undefined,
          reference: typeof p.reference === "string" ? p.reference : undefined,
          customerEmail: typeof p.customerEmail === "string" ? p.customerEmail : undefined,
          customerName: typeof p.customerName === "string" ? p.customerName : undefined,
          description: typeof p.description === "string" ? p.description : undefined,
          paymentMethod: typeof p.paymentMethod === "string" ? p.paymentMethod : undefined,
          isSandbox: typeof p.isSandbox === "boolean" ? p.isSandbox : undefined,
          transaction: typeof p.transaction === "string" ? p.transaction : undefined,
          createdAt: typeof p.createdAt === "string" ? p.createdAt : undefined,
          completedAt: typeof p.completedAt === "string" ? p.completedAt : undefined,
          orderId,
          orderStatus,
          orderNumber,
        };
      }),
    );

    return {
      env,
      transactions: rows,
      totalFetched: payments.length,
      filteredOut: payments.length - rows.length,
    };
  });


// ---------- Bank account actions (rename / set-default / connect) ----------

const RenameInput = z.object({
  idToken: z.string().min(10).max(4096),
  id: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().min(1).max(100),
});

export const renameFenaBankAccount = createServerFn({ method: "POST" })
  .inputValidator((d) => RenameInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await requireFirebaseAdmin(data.idToken);
    await fenaRenameBankAccount(data.id, data.name);
    return { ok: true };
  });

const IdOnlyInput = z.object({
  idToken: z.string().min(10).max(4096),
  id: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
});

export const setDefaultFenaBankAccount = createServerFn({ method: "POST" })
  .inputValidator((d) => IdOnlyInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await requireFirebaseAdmin(data.idToken);
    await fenaSetDefaultBankAccount(data.id);
    return { ok: true };
  });

const PROVIDERS = [
  "ob-natwest","ob-lloyds-personal","ob-rbs","ob-tsb","ob-halifax-personal","ob-mettle",
  "ob-bos-personal","ob-hsbc-personal","ob-barclays-business","ob-barclays-corporate",
  "ob-danske-private","ob-danske-business","ob-revolut","ob-starling","ob-bos-business",
  "ob-first-direct","ob-nationwide","ob-monzo","ob-lloyds-business","ob-santander",
  "ob-virgin-money","ob-hsbc-business","ob-barclays-personal","ob-tide","ob-ulster",
  "ob-chase","ob-aibni-retail","ob-aibni-corporate","ob-aibgb-retail","ob-aibgb-corporate",
  "ob-boi-uk-b365","ob-boi-uk-bol","ob-zempler","ob-coutts","ob-wise",
] as const;
export const FENA_BANK_PROVIDERS: readonly string[] = PROVIDERS;

const ConnectInput = z.object({
  idToken: z.string().min(10).max(4096),
  provider: z.enum(PROVIDERS),
});

export const connectFenaBankAccount = createServerFn({ method: "POST" })
  .inputValidator((d) => ConnectInput.parse(d))
  .handler(async ({ data }): Promise<{ authUri: string }> => {
    await requireFirebaseAdmin(data.idToken);
    const authUri = await fenaConnectBankAccount(data.provider);
    return { authUri };
  });


// ---------- Integration status (used by the admin panel header) ----------

export interface FenaIntegrationStatus {
  env: "sandbox" | "production";
  hasCredentials: boolean;
  connection: { ok: boolean; checkedAt: string; durationMs: number; error?: string };
  /** Last Fena-attributed paid order (status=paid AND paymentProvider=fena). */
  lastSuccessfulPayment: {
    orderId: string;
    orderNumber?: string;
    amount?: number;
    currency?: string;
    paidAt?: string;
    customerEmail?: string;
  } | null;
  /** Most recent webhook event. */
  lastWebhook: {
    id: string;
    level?: string;
    message?: string;
    createdAt?: string;
  } | null;
  /** Counters over the last ~50 events / alerts (the doc cap we read). */
  counters: {
    events24h: number;
    errors24h: number;
    duplicates24h: number;
    orphans24h: number;
    alertsOpen: number;
  };
  /** Most recent unacknowledged alerts. */
  recentAlerts: Array<{
    id: string;
    code: string;
    severity: string;
    createdAt?: string;
    ctxSummary?: string;
  }>;
  /**
   * Fena does not expose API quota / rate-limit headers, so this is a
   * derived signal — our own count of outbound calls + webhook events in
   * the last 24h, useful for spotting unusual spikes.
   */
  approxRequestVolume24h: number;
}

export const getFenaIntegrationStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => AdminEventsInput.parse(d))
  .handler(async ({ data }): Promise<FenaIntegrationStatus> => {
    await requireFirebaseAdmin(data.idToken);
    const env = await getFenaEnvLabel();
    const hasCredentials = Boolean(
      process.env.FENA_TERMINAL_ID && process.env.FENA_TERMINAL_SECRET,
    );

    // Connection check — light call to bank-accounts/list.
    const started = Date.now();
    let connection: FenaIntegrationStatus["connection"];
    try {
      await fenaListBankAccounts();
      connection = {
        ok: true,
        checkedAt: new Date().toISOString(),
        durationMs: Date.now() - started,
      };
    } catch (err) {
      connection = {
        ok: false,
        checkedAt: new Date().toISOString(),
        durationMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // Recent webhook events for counters + last webhook timestamp.
    const events = await listDocsAdmin("fena_webhook_events", {
      orderBy: "createdAt",
      direction: "DESCENDING",
      limit: 100,
    }).catch(() => [] as Array<Record<string, unknown> & { id: string }>);

    const cutoff = Date.now() - 24 * 3600 * 1000;
    const within24h = (row: Record<string, unknown>) => {
      const ts = typeof row.createdAt === "string" ? Date.parse(row.createdAt) : 0;
      return ts && ts >= cutoff;
    };

    const events24 = events.filter(within24h);
    const errors24 = events24.filter((r) => r.level === "error").length;
    const duplicates24 = events24.filter(
      (r) => typeof r.message === "string" && /^duplicate event/i.test(r.message),
    ).length;
    const orphans24 = events24.filter(
      (r) => typeof r.message === "string" && /^ORPHAN/i.test(r.message),
    ).length;

    const lastEvt = events[0];
    const lastWebhook = lastEvt
      ? {
          id: lastEvt.id,
          level: typeof lastEvt.level === "string" ? lastEvt.level : undefined,
          message: typeof lastEvt.message === "string" ? lastEvt.message : undefined,
          createdAt:
            typeof lastEvt.createdAt === "string" ? lastEvt.createdAt : undefined,
        }
      : null;

    // Recent alerts (cap 10, only show unacknowledged).
    const alerts = await listDocsAdmin("fena_alerts", {
      orderBy: "createdAt",
      direction: "DESCENDING",
      limit: 25,
    }).catch(() => [] as Array<Record<string, unknown> & { id: string }>);
    const openAlerts = alerts.filter((a) => a.acknowledged !== true);
    const recentAlerts = openAlerts.slice(0, 10).map((a) => {
      const ctxObj =
        a.ctx && typeof a.ctx === "object" && !Array.isArray(a.ctx)
          ? (a.ctx as Record<string, unknown>)
          : {};
      const parts: string[] = [];
      for (const k of ["orderId", "fenaPaymentId", "error", "accountId"]) {
        const v = ctxObj[k];
        if (typeof v === "string" && v) parts.push(`${k}=${v.slice(0, 64)}`);
      }
      return {
        id: a.id,
        code: typeof a.code === "string" ? a.code : "unknown",
        severity: typeof a.severity === "string" ? a.severity : "warn",
        createdAt:
          typeof a.createdAtIso === "string"
            ? a.createdAtIso
            : typeof a.createdAt === "string"
              ? a.createdAt
              : undefined,
        ctxSummary: parts.join(" · ") || undefined,
      };
    });

    // Last successful Fena payment (paid order via fena).
    let lastSuccessfulPayment: FenaIntegrationStatus["lastSuccessfulPayment"] = null;
    try {
      const paidOrders = await listDocsAdmin("orders", {
        orderBy: "paidAt",
        direction: "DESCENDING",
        limit: 25,
      });
      const fenaPaid = paidOrders.find(
        (o) =>
          (o.paymentProvider === "fena" ||
            (typeof o.fenaPaymentId === "string" && o.fenaPaymentId.length > 0)) &&
          String(o.status ?? "").toLowerCase() === "paid",
      );
      if (fenaPaid) {
        const amt = Number(fenaPaid.totalAmount ?? fenaPaid.total ?? 0);
        lastSuccessfulPayment = {
          orderId: fenaPaid.id,
          orderNumber:
            typeof fenaPaid.orderNumber === "string" ? fenaPaid.orderNumber : undefined,
          amount: Number.isFinite(amt) ? amt : undefined,
          currency:
            typeof fenaPaid.currency === "string" ? fenaPaid.currency : undefined,
          paidAt: typeof fenaPaid.paidAt === "string" ? fenaPaid.paidAt : undefined,
          customerEmail:
            typeof fenaPaid.customerEmail === "string"
              ? fenaPaid.customerEmail
              : undefined,
        };
      }
    } catch {/* ignore — status fn must not 5xx for one missing source */}

    return {
      env,
      hasCredentials,
      connection,
      lastSuccessfulPayment,
      lastWebhook,
      counters: {
        events24h: events24.length,
        errors24h: errors24,
        duplicates24h: duplicates24,
        orphans24h: orphans24,
        alertsOpen: openAlerts.length,
      },
      recentAlerts,
      approxRequestVolume24h: events24.length,
    };
  });


// ---------- Paginated / filterable webhook events ----------

const WebhookListInput = z.object({
  idToken: z.string().min(10).max(4096),
  pageSize: z.number().int().min(1).max(100).optional(),
  /** ISO timestamp of the last row from the previous page. */
  cursorCreatedAt: z.string().min(1).max(40).optional(),
  level: z.enum(["info", "warn", "error"]).optional(),
  outcome: z
    .enum(["matched", "orphan", "duplicate", "bank_account", "error", "info"])
    .optional(),
  /** Case-insensitive substring search over message, orderId, fenaPaymentId. */
  search: z.string().max(200).optional(),
});

export interface FenaWebhookEventsPage {
  rows: FenaWebhookEventRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const listFenaWebhookEventsPaged = createServerFn({ method: "POST" })
  .inputValidator((d) => WebhookListInput.parse(d))
  .handler(async ({ data }): Promise<FenaWebhookEventsPage> => {
    await requireFirebaseAdmin(data.idToken);
    // When a search/outcome filter is active, broaden the server-side fetch
    // so post-filtering can still fill a full page.
    const wantFilter = Boolean(data.search || data.outcome);
    const pageSize = data.pageSize ?? 25;
    const fetchSize = wantFilter ? 200 : Math.min(pageSize + 1, 100);
    const rawRows = await listDocsAdmin("fena_webhook_events", {
      orderBy: "createdAt",
      direction: "DESCENDING",
      limit: fetchSize,
      startAfter: data.cursorCreatedAt,
      where: data.level ? { field: "level", value: data.level } : undefined,
    });
    const search = data.search?.trim().toLowerCase() ?? "";
    const mapped = rawRows.map((row): FenaWebhookEventRow => {
      const ctxObj =
        row.ctx && typeof row.ctx === "object" && !Array.isArray(row.ctx)
          ? (row.ctx as Record<string, unknown>)
          : {};
      const message = typeof row.message === "string" ? row.message : "";
      const level = typeof row.level === "string" ? row.level : "";
      const orderId = pickStr(ctxObj, "orderId");
      const reason = pickStr(ctxObj, "reason");
      const matchOutcome: FenaWebhookEventRow["matchOutcome"] = /^ORPHAN/i.test(message)
        ? "orphan"
        : /^bank-accounts:/i.test(message)
          ? "bank_account"
          : /^duplicate event/i.test(message)
            ? "duplicate"
            : /^processed$/i.test(message) && orderId
              ? "matched"
              : level === "error"
                ? "error"
                : "info";
      return {
        id: row.id,
        level: level || undefined,
        message: message || undefined,
        ctx: Object.keys(ctxObj).length ? JSON.stringify(ctxObj, null, 2) : undefined,
        createdAt: typeof row.createdAt === "string" ? row.createdAt : undefined,
        orderId,
        fenaPaymentId: pickStr(ctxObj, "fenaPaymentId"),
        fenaStatus: pickStr(ctxObj, "fenaStatus"),
        newStatus: pickStr(ctxObj, "newStatus"),
        reason,
        matchOutcome,
      };
    });
    const filtered = mapped.filter((r) => {
      if (data.outcome && r.matchOutcome !== data.outcome) return false;
      if (search) {
        const hay = `${r.message ?? ""} ${r.orderId ?? ""} ${r.fenaPaymentId ?? ""}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });
    const page = filtered.slice(0, pageSize);
    const hasMore = filtered.length > pageSize || (!wantFilter && rawRows.length === fetchSize);
    const last = page[page.length - 1];
    return {
      rows: page,
      nextCursor: hasMore && last?.createdAt ? last.createdAt : null,
      hasMore,
    };
  });


// ---------- Quota / metering ----------

export type FenaQuotaStatus = FenaQuotaSnapshot;

export const getFenaQuotaStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => AdminEventsInput.parse(d))
  .handler(async ({ data }): Promise<FenaQuotaStatus> => {
    await requireFirebaseAdmin(data.idToken);
    return getFenaQuotaSnapshot();
  });

const SetLimitInput = z.object({
  idToken: z.string().min(10).max(4096),
  dailyLimit: z.number().int().min(10).max(1_000_000),
});

export const setFenaQuotaDailyLimit = createServerFn({ method: "POST" })
  .inputValidator((d) => SetLimitInput.parse(d))
  .handler(async ({ data }): Promise<{ dailyLimit: number }> => {
    await requireFirebaseAdmin(data.idToken);
    const dailyLimit = await setFenaDailyLimit(data.dailyLimit);
    return { dailyLimit };
  });


// ---------- Retry queue ----------

export interface FenaRetryRow {
  id: string;
  orderId: string;
  fenaPaymentId: string;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt?: string;
  enqueuedAt?: string;
  lastEnqueuedAt?: string;
  lastError?: string;
  source?: string;
  exhausted: boolean;
  exhaustedAt?: string;
}

function coerceRetryRow(row: Record<string, unknown> & { id: string }): FenaRetryRow {
  return {
    id: row.id,
    orderId: typeof row.orderId === "string" ? row.orderId : "",
    fenaPaymentId: typeof row.fenaPaymentId === "string" ? row.fenaPaymentId : "",
    attempts: Number(row.attempts ?? 0),
    maxAttempts: MAX_RETRY_ATTEMPTS,
    nextAttemptAt: typeof row.nextAttemptAt === "string" ? row.nextAttemptAt : undefined,
    enqueuedAt: typeof row.enqueuedAt === "string" ? row.enqueuedAt : undefined,
    lastEnqueuedAt: typeof row.lastEnqueuedAt === "string" ? row.lastEnqueuedAt : undefined,
    lastError: typeof row.lastError === "string" ? row.lastError : undefined,
    source: typeof row.source === "string" ? row.source : undefined,
    exhausted: row.exhausted === true,
    exhaustedAt: typeof row.exhaustedAt === "string" ? row.exhaustedAt : undefined,
  };
}

export const listFenaRetryQueue = createServerFn({ method: "POST" })
  .inputValidator((d) => AdminEventsInput.parse(d))
  .handler(async ({ data }): Promise<FenaRetryRow[]> => {
    await requireFirebaseAdmin(data.idToken);
    const rows = await listDocsAdmin("fena_retry_queue", {
      orderBy: "lastEnqueuedAt",
      direction: "DESCENDING",
      limit: 50,
    });
    return rows.map(coerceRetryRow);
  });

export const processFenaRetriesAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => AdminEventsInput.parse(d))
  .handler(async ({ data }): Promise<RetryProcessResult> => {
    await requireFirebaseAdmin(data.idToken);
    return processFenaRetries(async (orderId, updates) => {
      await updateDocAdmin("orders", orderId, updates);
    });
  });

const DeleteRetryInput = z.object({
  idToken: z.string().min(10).max(4096),
  id: z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/),
});

export const deleteFenaRetryRow = createServerFn({ method: "POST" })
  .inputValidator((d) => DeleteRetryInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await requireFirebaseAdmin(data.idToken);
    await deleteDocAdmin("fena_retry_queue", data.id);
    return { ok: true };
  });
