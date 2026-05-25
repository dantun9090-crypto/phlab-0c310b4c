/**
 * Analytics helper — writes to Supabase `analytics_events`.
 *
 * RLS allows anon + authenticated to INSERT as long as the payload
 * passes the size checks (event_type 1–100 chars, path ≤ 2048,
 * user_agent ≤ 1024, metadata ≤ 4 KB). Reads are admin-only.
 *
 * Usage:
 *   import { trackEvent, trackPageView } from "@/lib/analytics";
 *
 *   // On route change:
 *   trackPageView();
 *
 *   // Custom event:
 *   trackEvent("add_to_cart", { productId: "bpc-157", qty: 1 });
 */
import { supabase } from "@/integrations/supabase/client";

type Json = Record<string, unknown> | null | undefined;

const EVENT_TYPE_MAX = 100;
const PATH_MAX = 2048;
const UA_MAX = 1024;
const METADATA_MAX_BYTES = 4096;

function clamp(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}

function safeMetadata(meta: Json): Json {
  if (!meta) return null;
  try {
    const json = JSON.stringify(meta);
    // Rough byte estimate; UTF-8 ASCII = 1 byte/char, safe upper bound.
    if (new Blob([json]).size > METADATA_MAX_BYTES) {
      if (import.meta.env.DEV) {
        console.warn("[analytics] metadata exceeds 4KB, dropping payload");
      }
      return null;
    }
    return meta;
  } catch {
    return null;
  }
}

/**
 * Record a single analytics event. Fire-and-forget — never throws,
 * never blocks the UI. Failures are logged in dev only.
 */
export async function trackEvent(
  eventType: string,
  metadata?: Json,
  options?: { path?: string },
): Promise<void> {
  if (typeof window === "undefined") return; // SSR guard
  if (!eventType || eventType.length === 0) return;

  const type = clamp(eventType, EVENT_TYPE_MAX)!;
  const path =
    clamp(options?.path ?? window.location.pathname + window.location.search, PATH_MAX);
  const userAgent = clamp(navigator.userAgent, UA_MAX);
  const meta = safeMetadata(metadata);

  try {
    const { error } = await supabase.from("analytics_events").insert({
      event_type: type,
      path,
      user_agent: userAgent,
      metadata: meta as never,
    });
    if (error && import.meta.env.DEV) {
      console.warn("[analytics] insert failed:", error.message);
    }
  } catch (err) {
    if (import.meta.env.DEV) console.warn("[analytics] threw:", err);
  }
}

/**
 * Record a page view. Call on initial mount and after every route change.
 */
export function trackPageView(metadata?: Json): void {
  void trackEvent("page_view", metadata);
}
