/**
 * Cross-gateway dispatcher.
 *
 * `createPaymentLinkForOrder` resolves the primary enabled gateway and calls
 * only that adapter. Failed primary payments must surface clearly to checkout
 * instead of silently sending customers to a different provider.
 * Always stores `paymentProvider` + provider-specific ids on the order so
 * webhooks and the customer success page know which adapter to consult.
 *
 * Server-only.
 */
import { getDocAdmin, updateDocAdmin } from "@/lib/server/firestore-admin";
import { fenaCreateAndProcess } from "@/lib/fena.server";
import { createHash, timingSafeEqual } from "crypto";
import { truelayerCreatePayment } from "./truelayer.server";

import {
  getGatewayConfig,
  recordGatewayTest,
  resolveActiveGateways,
} from "./gateway-config.server";
import type { GatewayId } from "./types";

const SITE_ORIGIN = "https://phlabs.co.uk";

export interface DispatchResult {
  gateway: GatewayId;
  hppUrl: string;
  externalPaymentId: string;
  sandbox: boolean;
}

interface OrderCtx {
  orderId: string;
  amountGbp: number;
  reference: string;
  customerName: string;
  customerEmail: string;
  customerUid: string;
}

function sanitizeRef(raw: string, max: number): string {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max) || raw.slice(0, max)
  );
}

function verifyPaymentToken(rawToken: string | null | undefined, storedHash: unknown): boolean {
  if (!rawToken || typeof storedHash !== "string" || !storedHash) return false;
  const candidate = createHash("sha256").update(rawToken).digest("hex");
  const a = Buffer.from(candidate, "utf8");
  const b = Buffer.from(storedHash, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function runAdapter(gateway: GatewayId, ctx: OrderCtx, sandbox: boolean): Promise<DispatchResult> {
  if (gateway === "fena") {
    const reference = sanitizeRef(ctx.reference, 12);
    const result = await fenaCreateAndProcess({
      reference,
      amount: ctx.amountGbp,
      customerName: ctx.customerName || undefined,
      customerEmail: ctx.customerEmail || undefined,
      description: `PH Labs order ${reference}`,
      customRedirectUrl: `${SITE_ORIGIN}/payment/success?orderId=${encodeURIComponent(ctx.orderId)}`,
    });
    await updateDocAdmin("orders", ctx.orderId, {
      paymentProvider: "fena",
      fenaPaymentId: result.id,
      fenaReference: reference,
      fenaStatus: result.status,
      fenaCreatedAt: new Date(),
    });
    return { gateway: "fena", hppUrl: result.link, externalPaymentId: result.id, sandbox };
  }

  if (gateway === "truelayer") {
    const reference = sanitizeRef(ctx.reference, 18);
    const result = await truelayerCreatePayment({
      amountMinor: Math.round(ctx.amountGbp * 100),
      reference,
      userId: ctx.customerUid || ctx.orderId,
      userName: ctx.customerName || "PH Labs Customer",
      userEmail: ctx.customerEmail || undefined,
      returnUri: `${SITE_ORIGIN}/payment/success`,
      state: ctx.orderId,
      sandbox,
    });
    await updateDocAdmin("orders", ctx.orderId, {
      paymentProvider: "truelayer",
      truelayerPaymentId: result.id,
      truelayerReference: reference,
      truelayerStatus: result.status,
      truelayerSandbox: sandbox,
      truelayerCreatedAt: new Date(),
    });
    return {
      gateway: "truelayer",
      hppUrl: result.hppUrl,
      externalPaymentId: result.id,
      sandbox,
    };
  }


  throw new Error(`Unknown gateway: ${gateway}`);
}

export async function createPaymentLinkForOrder(ctx: OrderCtx): Promise<DispatchResult> {
  const { primary } = await resolveActiveGateways();
  if (!primary) {
    throw new Error("No payment gateways enabled");
  }

  try {
    const result = await runAdapter(primary.id, ctx, primary.sandbox);
    await recordGatewayTest(primary.id, { ok: true }).catch(() => undefined);
    return result;
  } catch (err) {
    await recordGatewayTest(primary.id, {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    }).catch(() => undefined);
    throw err;
  }
}

/** Verify the order exists, is unsettled, and return a normalised ctx. */
export async function buildOrderCtxForPayment(
  orderId: string,
  userUid: string | null,
  userEmail: string | null,
  paymentToken?: string | null,
): Promise<OrderCtx> {
  const order = await getDocAdmin("orders", orderId);
  if (!order) throw new Error("Order not found");
  const tokenMatches = verifyPaymentToken(paymentToken, order.paymentTokenHash);
  if (order.userId && (!userUid || order.userId !== userUid) && !tokenMatches) {
    throw new Error("Forbidden: order belongs to another account");
  }
  if (!order.userId && order.paymentTokenHash && !tokenMatches) {
    throw new Error("Forbidden: payment token required");
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
    throw new Error("Only GBP orders are supported");
  }
  const amount = Math.round(rawAmount * 100) / 100;
  const reference = String(order.orderNumber ?? orderId);
  const customerName =
    String(
      order.customerName ?? `${order.firstName ?? ""} ${order.lastName ?? ""}`.trim() ?? "",
    ).slice(0, 100) || "";
  const customerEmail = String(order.customerEmail ?? order.email ?? userEmail ?? "").slice(0, 254);
  return {
    orderId,
    amountGbp: amount,
    reference,
    customerName,
    customerEmail,
    customerUid: userUid || String(order.userId ?? orderId),
  };
}

export async function gatewayHealthSummary(): Promise<{
  hasPrimary: boolean;
  hasAnyBackup: boolean;
  manualFallbackOnly: boolean;
}> {
  const { primary, backups } = await resolveActiveGateways();
  return {
    hasPrimary: Boolean(primary),
    hasAnyBackup: backups.length > 0,
    manualFallbackOnly: !primary && backups.length === 0,
  };
}

// Re-export so callers don't need both files.
export { getGatewayConfig };
