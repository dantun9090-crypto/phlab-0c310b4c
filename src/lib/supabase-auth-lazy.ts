import { createMiddleware } from "@tanstack/react-start";

/**
 * Detects whether this browser could hold a Lovable Cloud (Supabase) session
 * WITHOUT loading the Supabase SDK. Shoppers sign in with Firebase, so on the
 * public site this is false for virtually every visitor.
 *
 * - Framed preview: the session is brokered via the editor over postMessage
 *   and cannot be checked synchronously, so assume it may exist.
 * - Otherwise: the SDK persists sessions under `sb-<ref>-auth-token`.
 */
export function mightHaveSupabaseSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.parent && window.parent !== window) return true;
  } catch {
    return true;
  }
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) return true;
    }
  } catch {
    // Storage blocked (Safari private mode etc.) — fall back to the SDK check.
    return true;
  }
  return false;
}

/**
 * Lazy equivalent of the generated `attachSupabaseAuth` middleware.
 *
 * The generated version statically imports the Supabase client, which pulls
 * the whole @supabase/supabase-js stack (~800 KB source) into the eager
 * client chunk of EVERY page. This version only loads the SDK when a session
 * can actually exist, then attaches the same `Authorization: Bearer` header,
 * so server functions guarded by `requireSupabaseAuth` behave identically.
 */
export const attachSupabaseAuthLazy = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    let token: string | undefined;
    if (mightHaveSupabaseSession()) {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase.auth.getSession();
        token = data.session?.access_token;
      } catch {
        token = undefined;
      }
    }
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
