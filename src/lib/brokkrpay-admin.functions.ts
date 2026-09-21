/**
 * Admin-only BrokkrPay control surface (Admin → BrokkrPay tab).
 *
 * Every function requires a verified Firebase ID token belonging to an admin
 * (`requireFirebaseAdmin`). Nothing here is callable anonymously, and the
 * BrokkrPay API key never leaves the server — only a masked preview.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";

const Token = z.object({ idToken: z.string().min(10).max(4096) });
const UUID = z.string().regex(/^[0-9a-fA-F-]{36}$/);

export const WEBHOOK_ENDPOINT = "https://phlabs.co.uk/api/public/brokkrpay-webhook";

export interface BrokkrPayStatusResult {
  credentialsConfigured: boolean;
  mode: "test" | "live" | "unknown";
  apiKeyMasked: string | null;
  webhookEndpoint: string;
  webhookSecretStored: boolean;
  site: {
    storeId: string;
    name: string;
    url: string | null;
    mode: "test" | "live";
    currency: string;
    liveEnabled: boolean;
    checkoutReady: boolean;
    checkoutBlockedReason: string | null;
    chargesTo: "client" | "brokkrpay";
    webhookUrl: string | null;
    portalUrl: string | null;
  } | null;
  siteError: string | null;
}

/** Credentials + live site state. Safe to poll from the admin panel. */
export const getBrokkrPayStatus = createServerFn({ method: "POST" })
  .validator((d) => Token.parse(d))
  .handler(async ({ data }): Promise<BrokkrPayStatusResult> => {
    await requireFirebaseAdmin(data.idToken);
    const mod = await import("@/lib/brokkrpay.server");

    const credentialsConfigured = mod.isBrokkrPayConfigured();
    const secret = credentialsConfigured ? await mod.readBrokkrPayWebhookSecret() : null;

    let site: BrokkrPayStatusResult["site"] = null;
    let siteError: string | null = null;
    if (credentialsConfigured) {
      try {
        site = await mod.getBrokkrPaySite();
      } catch (err) {
        siteError = err instanceof Error ? err.message : String(err);
      }
    }

    return {
      credentialsConfigured,
      mode: mod.brokkrPayMode(),
      apiKeyMasked: mod.maskBrokkrPayKey(),
      webhookEndpoint: WEBHOOK_ENDPOINT,
      webhookSecretStored: Boolean(secret),
      site,
      siteError,
    };
  });

/**
 * One-click webhook registration: points BrokkrPay at our endpoint and stores
 * the returned signing secret server-side (never shown to anyone).
 */
export const registerBrokkrPayWebhookFn = createServerFn({ method: "POST" })
  .validator((d) => Token.extend({ disable: z.boolean().optional() }).parse(d))
  .handler(
    async ({ data }): Promise<{ ok: boolean; message: string; webhookUrl: string | null }> => {
      await requireFirebaseAdmin(data.idToken);
      const { registerBrokkrPayWebhook, BrokkrPayError } = await import("@/lib/brokkrpay.server");
      try {
        const res = await registerBrokkrPayWebhook(data.disable ? null : WEBHOOK_ENDPOINT);
        return {
          ok: true,
          message: data.disable
            ? `Webhook disabled for ${res.mode} mode.`
            : `Webhook registered for ${res.mode} mode${res.secretStored ? " and signing secret stored" : ""}.`,
          webhookUrl: res.webhookUrl,
        };
      } catch (err) {
        const message =
          err instanceof BrokkrPayError ? `${err.userMessage} (${err.status})` : err instanceof Error ? err.message : String(err);
        return { ok: false, message, webhookUrl: null };
      }
    },
  );

/** Which whole-dollar amounts the current environment can actually charge. */
export const checkBrokkrPayAmountFn = createServerFn({ method: "POST" })
  .validator((d) => Token.extend({ amountUsd: z.number().int().min(1).max(100000).optional() }).parse(d))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const { checkBrokkrPayAmount } = await import("@/lib/brokkrpay.server");
    return checkBrokkrPayAmount(data.amountUsd);
  });

/**
 * Create a real hosted checkout link for a small amount so an admin can walk
 * the full flow. In test mode use card 4242 4242 4242 4242; in live mode this
 * moves real money, so the link can simply be abandoned.
 */
export const createBrokkrPayTestLink = createServerFn({ method: "POST" })
  .validator((d) =>
    Token.extend({
      amountUsd: z.number().int().min(1).max(500).optional(),
      customerEmail: z.string().email().max(254).optional().nullable(),
      delivery: z.enum(["direct", "email"]).optional(),
    }).parse(d),
  )
  .handler(
    async ({
      data,
    }): Promise<{
      ok: boolean;
      message: string;
      reference: string | null;
      brokkrOrderId: string | null;
      checkoutUrl: string | null;
      mode: "test" | "live" | null;
      amountUsd: number | null;
      state: string | null;
      expiresAt: string | null;
    }> => {
      const admin = await requireFirebaseAdmin(data.idToken);
      const { createBrokkrPayLink, BrokkrPayError } = await import("@/lib/brokkrpay.server");

      const amountUsd = data.amountUsd ?? 1;
      const reference = `TEST-${Date.now().toString(36).toUpperCase()}`;
      const delivery = data.delivery ?? "direct";
      const email = data.customerEmail || admin.email || null;

      try {
        const link = await createBrokkrPayLink({
          // The client takes GBP pence + rate; for an admin test we pass a rate
          // of 1 and pence equal to whole dollars so `amountUsd` lands exactly.
          amountPence: amountUsd * 100,
          usdRate: 1,
          reference,
          returnUrl: `https://phlabs.co.uk/checkout/success?order_id=${encodeURIComponent(reference)}&test=1`,
          customerEmail: email,
          delivery,
          idempotencyKey: `brokkrpay-test:${reference}`,
        });
        return {
          ok: true,
          message:
            link.delivery === "email"
              ? `Payment link emailed${link.customerEmailSent === false ? " (provider reported no send)" : ""}.`
              : "Test checkout link created.",
          reference,
          brokkrOrderId: link.orderId,
          checkoutUrl: link.checkoutUrl,
          mode: link.mode,
          amountUsd: link.amountUsd,
          state: link.state,
          expiresAt: link.expiresAt,
        };
      } catch (err) {
        return {
          ok: false,
          message:
            err instanceof BrokkrPayError
              ? `${err.userMessage} (${err.status})`
              : err instanceof Error
                ? err.message
                : String(err),
          reference,
          brokkrOrderId: null,
          checkoutUrl: null,
          mode: null,
          amountUsd: null,
          state: null,
          expiresAt: null,
        };
      }
    },
  );

/** Look up a BrokkrPay order by its id or by our own order reference. */
export const lookupBrokkrPayOrder = createServerFn({ method: "POST" })
  .validator((d) =>
    Token.extend({
      brokkrOrderId: UUID.optional(),
      reference: z.string().min(3).max(128).regex(/^[A-Za-z0-9_-]+$/).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const { getBrokkrPayOrder, findBrokkrPayOrdersByReference, BrokkrPayError } = await import(
      "@/lib/brokkrpay.server"
    );
    try {
      if (data.brokkrOrderId) {
        const order = await getBrokkrPayOrder(data.brokkrOrderId);
        return { ok: true, message: order ? "" : "No order with that id on this site.", orders: order ? [order] : [] };
      }
      if (data.reference) {
        const orders = await findBrokkrPayOrdersByReference(data.reference);
        return { ok: true, message: orders.length ? "" : "No orders for that reference.", orders };
      }
      return { ok: false, message: "Provide a BrokkrPay order id or an order reference.", orders: [] };
    } catch (err) {
      return {
        ok: false,
        message:
          err instanceof BrokkrPayError
            ? `${err.userMessage} (${err.status})`
            : err instanceof Error
              ? err.message
              : String(err),
        orders: [],
      };
    }
  });

/** Re-send the hosted payment-link email for an unpaid order. */
export const resendBrokkrPayLinkEmail = createServerFn({ method: "POST" })
  .validator((d) => Token.extend({ brokkrOrderId: UUID, customerEmail: z.string().email().max(254).optional() }).parse(d))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const { resendBrokkrPayEmail, BrokkrPayError } = await import("@/lib/brokkrpay.server");
    try {
      return await resendBrokkrPayEmail(data.brokkrOrderId, data.customerEmail ?? null);
    } catch (err) {
      return {
        ok: false,
        message:
          err instanceof BrokkrPayError
            ? `${err.userMessage} (${err.status})`
            : err instanceof Error
              ? err.message
              : String(err),
      };
    }
  });

/** Cancel a pending BrokkrPay order (only possible before processing starts). */
export const cancelBrokkrPayOrderFn = createServerFn({ method: "POST" })
  .validator((d) => Token.extend({ brokkrOrderId: UUID }).parse(d))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const { cancelBrokkrPayOrder, BrokkrPayError } = await import("@/lib/brokkrpay.server");
    try {
      const res = await cancelBrokkrPayOrder(data.brokkrOrderId);
      return { ok: true, message: `Order is now ${res.state}.`, state: res.state };
    } catch (err) {
      return {
        ok: false,
        message:
          err instanceof BrokkrPayError
            ? `${err.userMessage} (${err.status})`
            : err instanceof Error
              ? err.message
              : String(err),
        state: null,
      };
    }
  });

export interface BrokkrPayWebhookEventRow {
  id: string;
  orderId: string | null;
  brokkrOrderId: string | null;
  state: string | null;
  amountUsd: number | null;
  test: boolean;
  receivedAt: string | null;
}

/** Recent signature-verified webhook deliveries, newest first. */
export const listBrokkrPayWebhookEvents = createServerFn({ method: "POST" })
  .validator((d) => Token.extend({ limit: z.number().int().min(1).max(100).optional() }).parse(d))
  .handler(async ({ data }): Promise<BrokkrPayWebhookEventRow[]> => {
    await requireFirebaseAdmin(data.idToken);
    const { listDocsAdmin } = await import("@/lib/server/firestore-admin");
    try {
      const rows = await listDocsAdmin("brokkrpay_webhook_events", {
        orderBy: "receivedAt",
        direction: "DESCENDING",
        limit: data.limit ?? 25,
      });
      return rows.map((r) => ({
        id: r.id,
        orderId: typeof r.orderId === "string" ? r.orderId : null,
        brokkrOrderId: typeof r.brokkrOrderId === "string" ? r.brokkrOrderId : null,
        state: typeof r.state === "string" ? r.state : null,
        amountUsd: typeof r.amountUsd === "number" ? r.amountUsd : null,
        test: r.test === true,
        receivedAt: typeof r.receivedAt === "string" ? r.receivedAt : null,
      }));
    } catch (err) {
      console.warn("[BrokkrPay] webhook event list failed:", err instanceof Error ? err.message : err);
      return [];
    }
  });
