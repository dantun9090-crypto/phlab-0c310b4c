/**
 * Server functions for the multi-gateway payments admin panel and the
 * checkout flow.
 *
 * Admin functions require `requireFirebaseAdmin`; checkout functions only
 * require a verified Firebase ID token (the order ownership check is done
 * inside `buildOrderCtxForPayment`).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  requireFirebaseAdmin,
  verifyFirebaseIdToken,
} from "@/lib/server/firebase-auth-admin";
import {
  buildOrderCtxForPayment,
  createPaymentLinkForOrder,
} from "@/lib/payments/dispatch.server";
import {
  listGatewayConfigs,
  setGatewayEnabled,
  setGatewayPriority,
  setGatewaySandbox,
  recordGatewayTest,
  resolveActiveGateways,
} from "@/lib/payments/gateway-config.server";
import { truelayerTestConnection } from "@/lib/payments/truelayer.server";
import { fenaListBankAccounts } from "@/lib/fena.server";
import { yapilyConfigured } from "@/lib/payments/yapily.server";
import type { CheckoutPaymentOptions, GatewayId, PaymentGatewayConfig } from "@/lib/payments/types";
import { GATEWAY_DISPLAY } from "@/lib/payments/types";

const TokenInput = z.object({ idToken: z.string().min(10).max(4096) });
const GatewayIdSchema = z.enum(["fena", "truelayer", "yapily"]);

export const listPaymentGateways = createServerFn({ method: "POST" })
  .inputValidator((d) => TokenInput.parse(d))
  .handler(async ({ data }): Promise<PaymentGatewayConfig[]> => {
    await requireFirebaseAdmin(data.idToken);
    return listGatewayConfigs(true);
  });

const ToggleInput = z.object({
  idToken: z.string().min(10).max(4096),
  gateway: GatewayIdSchema,
  enabled: z.boolean(),
});

export const togglePaymentGateway = createServerFn({ method: "POST" })
  .inputValidator((d) => ToggleInput.parse(d))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    await setGatewayEnabled(data.gateway, data.enabled);
    return { success: true, gateways: await listGatewayConfigs(true) };
  });

const PriorityInput = z.object({
  idToken: z.string().min(10).max(4096),
  gateway: GatewayIdSchema,
  priority: z.enum(["primary", "backup", "disabled"]),
});

export const setPaymentGatewayPriority = createServerFn({ method: "POST" })
  .inputValidator((d) => PriorityInput.parse(d))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    await setGatewayPriority(data.gateway, data.priority);
    return { success: true, gateways: await listGatewayConfigs(true) };
  });

const SandboxInput = z.object({
  idToken: z.string().min(10).max(4096),
  gateway: GatewayIdSchema,
  sandbox: z.boolean(),
});

export const setPaymentGatewaySandbox = createServerFn({ method: "POST" })
  .inputValidator((d) => SandboxInput.parse(d))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    await setGatewaySandbox(data.gateway, data.sandbox);
    return { success: true, gateways: await listGatewayConfigs(true) };
  });

const TestInput = z.object({
  idToken: z.string().min(10).max(4096),
  gateway: GatewayIdSchema,
});

export const testPaymentGateway = createServerFn({ method: "POST" })
  .inputValidator((d) => TestInput.parse(d))
  .handler(
    async ({
      data,
    }): Promise<{ ok: boolean; durationMs: number; message: string }> => {
      await requireFirebaseAdmin(data.idToken);
      const t0 = Date.now();
      try {
        if (data.gateway === "fena") {
          const accounts = await fenaListBankAccounts();
          await recordGatewayTest("fena", { ok: true });
          return {
            ok: true,
            durationMs: Date.now() - t0,
            message: `OK — ${accounts.length} bank accounts visible`,
          };
        }
        if (data.gateway === "truelayer") {
          const rows = await listGatewayConfigs(true);
          const cfg = rows.find((r) => r.id === "truelayer");
          await truelayerTestConnection(cfg?.sandbox ?? false);
          await recordGatewayTest("truelayer", { ok: true });
          return {
            ok: true,
            durationMs: Date.now() - t0,
            message: `OK — TrueLayer ${cfg?.sandbox ? "sandbox" : "live"} auth handshake successful`,
          };
        }
        if (data.gateway === "yapily") {
          if (!yapilyConfigured()) {
            const msg = "Yapily credentials not configured (YAPILY_APPLICATION_ID / SECRET).";
            await recordGatewayTest("yapily", { ok: false, message: msg });
            return { ok: false, durationMs: Date.now() - t0, message: msg };
          }
          // No live endpoint wired yet; report configured-but-not-implemented.
          const msg = "Credentials present but Yapily adapter is not implemented yet.";
          await recordGatewayTest("yapily", { ok: false, message: msg });
          return { ok: false, durationMs: Date.now() - t0, message: msg };
        }
        return { ok: false, durationMs: Date.now() - t0, message: "Unknown gateway" };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await recordGatewayTest(data.gateway, { ok: false, message });
        return { ok: false, durationMs: Date.now() - t0, message };
      }
    },
  );

// ---------- Checkout-facing ----------

export const getCheckoutPaymentOptions = createServerFn({ method: "GET" })
  .handler(async (): Promise<CheckoutPaymentOptions> => {
    const { primary, backups } = await resolveActiveGateways();
    const mapOpt = (cfg: PaymentGatewayConfig) => ({
      id: cfg.id,
      name: GATEWAY_DISPLAY[cfg.id].name,
      label: GATEWAY_DISPLAY[cfg.id].label,
      description: GATEWAY_DISPLAY[cfg.id].description,
      sandbox: cfg.sandbox,
    });
    return {
      primary: primary ? mapOpt(primary) : null,
      backups: backups.map(mapOpt),
      manualFallback: true,
    };
  });

const CreateLinkInput = z.object({
  idToken: z.string().min(10).max(4096),
  orderId: z.string().min(6).max(128).regex(/^[A-Za-z0-9_-]+$/),
});

/**
 * Generic gateway-agnostic create-payment-link entry point. Replaces
 * direct calls to `createFenaPaymentLink` from the checkout/payment pages.
 */
export const createGatewayPaymentLink = createServerFn({ method: "POST" })
  .inputValidator((d) => CreateLinkInput.parse(d))
  .handler(
    async ({
      data,
    }): Promise<{ hppUrl: string; gateway: GatewayId; externalPaymentId: string; sandbox: boolean }> => {
      const user = await verifyFirebaseIdToken(data.idToken);
      const ctx = await buildOrderCtxForPayment(data.orderId, user.uid, user.email);
      const result = await createPaymentLinkForOrder(ctx);
      return {
        hppUrl: result.hppUrl,
        gateway: result.gateway,
        externalPaymentId: result.externalPaymentId,
        sandbox: result.sandbox,
      };
    },
  );
