/**
 * Read/write the `payment_gateways/{id}` collection via the Firebase
 * service account. Auto-seeds defaults on first read so the admin panel
 * always has Fena/TrueLayer/NOWPayments rows to manage.
 *
 * Credentials are NEVER stored here — they live in process.env secrets.
 * This collection only holds enabled / priority / sandbox / health.
 *
 * Server-only. NEVER import from client code.
 */
import { addDocAdmin, getDocAdmin, listDocsAdmin, updateDocAdmin } from "@/lib/server/firestore-admin";
import type { GatewayId, GatewayPriority, NowpaymentsFlow, PaymentGatewayConfig } from "./types";
import { GATEWAY_DISPLAY } from "./types";

const SITE_ORIGIN = "https://phlabs.co.uk";
const COLLECTION = "payment_gateways";

let cached: { rows: PaymentGatewayConfig[]; expiresAt: number } | null = null;
const CACHE_MS = 15_000;

function webhookUrlFor(id: GatewayId): string {
  return `${SITE_ORIGIN}/api/public/hooks/${id}`;
}

function maskKey(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const tail = trimmed.slice(-4);
  return `••••${tail}`;
}

export function gatewayCredentialsStatus(id: GatewayId): {
  configured: boolean;
  masked: string | null;
} {
  switch (id) {
    case "fena": {
      const k = process.env.FENA_TERMINAL_ID;
      return { configured: Boolean(k && process.env.FENA_TERMINAL_SECRET), masked: maskKey(k) };
    }
    case "truelayer": {
      const k = process.env.TRUELAYER_CLIENT_ID;
      return {
        configured: Boolean(
          k && process.env.TRUELAYER_CLIENT_SECRET && process.env.TRUELAYER_MERCHANT_ACCOUNT_ID,
        ),
        masked: maskKey(k),
      };
    }
    case "nowpayments": {
      const k = process.env.NOWPAYMENTS_API_KEY;
      // The IPN secret is required alongside the API key: without it the
      // webhook cannot verify signatures, so the gateway stays off.
      return {
        configured: Boolean(k && process.env.NOWPAYMENTS_IPN_SECRET),
        masked: maskKey(k),
      };
    }
  }
}

interface RawGatewayDoc {
  enabled?: boolean;
  priority?: GatewayPriority;
  sandbox?: boolean;
  lastTestedAt?: string;
  testStatus?: "ok" | "fail";
  errorMessage?: string;
  errorCount?: number;
  /** NOWPayments-only: "invoice" (hosted page) or "payment" (deposit address). */
  flow?: NowpaymentsFlow;
}

function defaultConfig(id: GatewayId): PaymentGatewayConfig {
  const creds = gatewayCredentialsStatus(id);
  // Wallid is the only active gateway; Fena and TrueLayer are disabled.
  const enabled = false;
  const priority: GatewayPriority = "disabled";
  return {
    id,
    name: GATEWAY_DISPLAY[id].name,
    enabled,
    priority,
    sandbox: String(process.env[`${id.toUpperCase()}_ENV`] ?? "").toLowerCase() === "sandbox",
    status: enabled ? "enabled" : "disabled",
    lastTestedAt: null,
    testStatus: null,
    errorMessage: null,
    errorCount: 0,
    apiKeyMasked: creds.masked,
    webhookUrl: webhookUrlFor(id),
    credentialsConfigured: creds.configured,
    ...(id === "nowpayments" ? { flow: "invoice" as NowpaymentsFlow } : {}),
  };
}

function mergeRow(id: GatewayId, raw: RawGatewayDoc | null): PaymentGatewayConfig {
  const def = defaultConfig(id);
  if (!raw) return def;
  const enabled = typeof raw.enabled === "boolean" ? raw.enabled : def.enabled;
  const priority = (raw.priority ?? def.priority) as GatewayPriority;
  const sandbox = typeof raw.sandbox === "boolean" ? raw.sandbox : def.sandbox;
  const status: PaymentGatewayConfig["status"] = enabled ? "enabled" : "disabled";
  return {
    ...def,
    enabled,
    priority,
    sandbox,
    status,
    lastTestedAt: raw.lastTestedAt ?? null,
    testStatus: raw.testStatus ?? null,
    errorMessage: raw.errorMessage ?? null,
    errorCount: typeof raw.errorCount === "number" ? raw.errorCount : 0,
    ...(id === "nowpayments"
      ? { flow: (raw.flow === "payment" ? "payment" : "invoice") as NowpaymentsFlow }
      : {}),
  };
}

const ALL_IDS: GatewayId[] = ["fena", "truelayer", "nowpayments"];

async function ensureRow(id: GatewayId): Promise<void> {
  const existing = await getDocAdmin(COLLECTION, id);
  if (existing) return;
  const def = defaultConfig(id);
  await addDocAdmin(
    COLLECTION,
    {
      enabled: def.enabled,
      priority: def.priority,
      sandbox: def.sandbox,
      ...(id === "nowpayments" ? { flow: "invoice" } : {}),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    id,
  );
}

export async function listGatewayConfigs(force = false): Promise<PaymentGatewayConfig[]> {
  const now = Date.now();
  if (!force && cached && cached.expiresAt > now) return cached.rows;
  // Seed missing rows so the admin tab always shows 3 entries.
  await Promise.all(ALL_IDS.map((id) => ensureRow(id).catch(() => undefined)));
  const docs = await listDocsAdmin(COLLECTION, { orderBy: "priority", direction: "ASCENDING", limit: 10 });
  const byId = new Map<string, RawGatewayDoc>();
  for (const d of docs) {
    byId.set(d.id, d as RawGatewayDoc);
  }
  const rows = ALL_IDS.map((id) => mergeRow(id, (byId.get(id) ?? null) as RawGatewayDoc | null));
  cached = { rows, expiresAt: now + CACHE_MS };
  return rows;
}

export function invalidateGatewayCache(): void {
  cached = null;
}

export async function getGatewayConfig(id: GatewayId): Promise<PaymentGatewayConfig> {
  const rows = await listGatewayConfigs();
  const row = rows.find((r) => r.id === id);
  return row ?? defaultConfig(id);
}

/**
 * Resolve the active payment gateway ordering.
 * - The first enabled gateway with priority "primary" wins.
 * - All other enabled gateways become backups (priority order).
 */
export async function resolveActiveGateways(): Promise<{
  primary: PaymentGatewayConfig | null;
  backups: PaymentGatewayConfig[];
}> {
  const rows = await listGatewayConfigs();
  const enabled = rows.filter((r) => r.enabled && r.status !== "pending" && r.credentialsConfigured);
  const primary = enabled.find((r) => r.priority === "primary") ?? null;
  const backups = enabled.filter((r) => r.id !== primary?.id);
  return { primary, backups };
}

export async function setGatewayEnabled(id: GatewayId, enabled: boolean): Promise<void> {
  const creds = gatewayCredentialsStatus(id);
  if (enabled && !creds.configured) {
    throw new Error(`${id} credentials are not configured`);
  }
  await updateDocAdmin(COLLECTION, id, { enabled, updatedAt: new Date() });
  invalidateGatewayCache();
}

export async function setGatewayPriority(
  id: GatewayId,
  priority: GatewayPriority,
): Promise<void> {
  const creds = gatewayCredentialsStatus(id);
  if (priority !== "disabled" && !creds.configured) {
    throw new Error(`${id} credentials are not configured`);
  }
  // Enforce "only one primary": demote any existing primary to backup.
  if (priority === "primary") {
    const rows = await listGatewayConfigs(true);
    await Promise.all(
      rows
        .filter((r) => r.id !== id && r.priority === "primary")
        .map((r) =>
          updateDocAdmin(COLLECTION, r.id, { priority: "backup", updatedAt: new Date() }),
        ),
    );
  }
  await updateDocAdmin(COLLECTION, id, { priority, updatedAt: new Date() });
  invalidateGatewayCache();
}

export async function setGatewaySandbox(id: GatewayId, sandbox: boolean): Promise<void> {
  await updateDocAdmin(COLLECTION, id, { sandbox, updatedAt: new Date() });
  invalidateGatewayCache();
}

/**
 * Switch the NOWPayments creation flow ("invoice" hosted page vs. "payment"
 * deposit-address). Only NOWPayments supports this setting.
 */
export async function setGatewayFlow(id: GatewayId, flow: NowpaymentsFlow): Promise<void> {
  if (id !== "nowpayments") {
    throw new Error(`Gateway ${id} does not support flow selection`);
  }
  if (flow !== "invoice" && flow !== "payment") {
    throw new Error(`Unknown NOWPayments flow: ${flow}`);
  }
  await updateDocAdmin(COLLECTION, id, { flow, updatedAt: new Date() });
  invalidateGatewayCache();
}

export async function recordGatewayTest(
  id: GatewayId,
  result: { ok: boolean; message?: string },
): Promise<void> {
  const patch: Record<string, unknown> = {
    lastTestedAt: new Date().toISOString(),
    testStatus: result.ok ? "ok" : "fail",
    errorMessage: result.ok ? null : result.message ?? "Unknown error",
    updatedAt: new Date(),
  };
  if (!result.ok) {
    const existing = await getDocAdmin(COLLECTION, id);
    const prevCount =
      existing && typeof existing.errorCount === "number" ? (existing.errorCount as number) : 0;
    patch.errorCount = prevCount + 1;
  } else {
    patch.errorCount = 0;
  }
  await updateDocAdmin(COLLECTION, id, patch);
  invalidateGatewayCache();
}
