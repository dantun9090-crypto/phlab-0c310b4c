/**
 * Manual Bank Transfer kill-switch admin functions.
 *
 * Reads/writes the `manual_transfer_enabled` row in `public.app_config`. Only
 * admins (verified via Firebase ID token) can call these. Access to
 * `app_config` itself is locked to `service_role` by RLS — the table is reached
 * through `supabaseAdmin`, loaded inside the handler.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";

const TokenInput = z.object({ idToken: z.string().min(10).max(4096) });
const SetInput = TokenInput.extend({ enabled: z.boolean() });

export const getManualTransferEnabledAdmin = createServerFn({ method: "POST" })
  .validator((d) => TokenInput.parse(d))
  .handler(async ({ data }): Promise<{ enabled: boolean }> => {
    await requireFirebaseAdmin(data.idToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("app_config")
      .select("value")
      .eq("key", "manual_transfer_enabled")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { enabled: row ? row.value === "true" : true };
  });

export const setManualTransferEnabledAdmin = createServerFn({ method: "POST" })
  .validator((d) => SetInput.parse(d))
  .handler(async ({ data }): Promise<{ enabled: boolean }> => {
    await requireFirebaseAdmin(data.idToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("app_config").upsert(
      {
        key: "manual_transfer_enabled",
        value: data.enabled ? "true" : "false",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
    return { enabled: data.enabled };
  });
