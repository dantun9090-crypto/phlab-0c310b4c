/**
 * Server-only helper to read the `wallid_enabled` flag from app_config.
 *
 * Cached in-memory for 60 seconds per Worker isolate so checkout / create
 * endpoints don't hit the DB on every request. Defaults to FALSE on any
 * lookup failure — fail-safe behaviour for a payment kill switch.
 *
 * Access restricted to service_role only (Supabase RLS deny-all).
 */

const TTL_MS = 60_000;
let cached: { value: boolean; expires: number } | null = null;

export async function readWallidEnabled(): Promise<boolean> {
  const now = Date.now();
  if (cached && cached.expires > now) return cached.value;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("app_config")
      .select("value")
      .eq("key", "wallid_enabled")
      .maybeSingle();
    if (error) throw error;
    const enabled = data?.value === "true";
    cached = { value: enabled, expires: now + TTL_MS };
    return enabled;
  } catch (err) {
    console.error("[wallid-config] read failed, defaulting to disabled:", err);
    cached = { value: false, expires: now + 10_000 };
    return false;
  }
}

export function invalidateWallidEnabledCache(): void {
  cached = null;
}
