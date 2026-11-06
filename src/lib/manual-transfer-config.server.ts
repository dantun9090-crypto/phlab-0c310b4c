/**
 * Server-only helper to read the `manual_transfer_enabled` flag from app_config.
 *
 * Lets an admin temporarily suspend Manual Bank Transfer at checkout (e.g. while
 * a bank account is under review) without a deploy.
 *
 * Cached in-memory for 60 seconds per Worker isolate. Defaults to TRUE on any
 * lookup failure — manual transfer is the last-resort fallback, so a DB blip
 * must not leave checkout with zero payment methods.
 *
 * Access restricted to service_role only (Supabase RLS deny-all).
 */

const TTL_MS = 60_000;
let cached: { value: boolean; expires: number } | null = null;

export async function readManualTransferEnabled(): Promise<boolean> {
  const now = Date.now();
  if (cached && cached.expires > now) return cached.value;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("app_config")
      .select("value")
      .eq("key", "manual_transfer_enabled")
      .maybeSingle();
    if (error) throw error;
    // Missing row => enabled (default behaviour before the switch existed).
    const enabled = data ? data.value === "true" : true;
    cached = { value: enabled, expires: now + TTL_MS };
    return enabled;
  } catch (err) {
    console.error("[manual-transfer-config] read failed, defaulting to enabled:", err);
    cached = { value: true, expires: now + 10_000 };
    return true;
  }
}

export function invalidateManualTransferEnabledCache(): void {
  cached = null;
}
