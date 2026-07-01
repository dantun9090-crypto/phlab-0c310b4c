/**
 * Runtime feature flags (public read).
 *
 * A tiny, aggressively cacheable JSON endpoint the browser polls
 * lazily to check kill-switches for client-side behavior:
 *
 *   {
 *     chunkReloadEnabled: boolean,   // false = disable automatic
 *                                     //         chunk-reload fallback
 *     updatedAt: string | null,
 *     source: "firestore" | "default"
 *   }
 *
 * Backing store: Firestore doc `runtime_flags/chunk_reload` with the shape
 *   { enabled: boolean, updatedAt: ISO string, reason?: string }
 * Admins can toggle it live from the "Cache Recovery" admin tab. The
 * default (no doc) is `enabled: true` — recovery keeps working out of the
 * box. A rollout-blocking regression is one Firestore write away from
 * being silenced across every client.
 *
 * Cache: 60s (edge) + `stale-while-revalidate` on the client. This
 * matches the acceptable lag between flipping the flag and clients
 * seeing it (well below one deploy cycle, above one page load).
 */
import { createFileRoute } from "@tanstack/react-router";
import { getDocAdmin } from "@/lib/server/firestore-admin";

interface Flag {
  chunkReloadEnabled: boolean;
  updatedAt: string | null;
  reason: string | null;
  source: "firestore" | "default";
}

async function readFlag(): Promise<Flag> {
  try {
    const doc = (await getDocAdmin("runtime_flags", "chunk_reload")) as
      | { enabled?: boolean; updatedAt?: string; reason?: string }
      | null;
    if (!doc) {
      return { chunkReloadEnabled: true, updatedAt: null, reason: null, source: "default" };
    }
    return {
      chunkReloadEnabled: doc.enabled !== false,
      updatedAt: typeof doc.updatedAt === "string" ? doc.updatedAt : null,
      reason: typeof doc.reason === "string" ? doc.reason : null,
      source: "firestore",
    };
  } catch {
    return { chunkReloadEnabled: true, updatedAt: null, reason: null, source: "default" };
  }
}

export const Route = createFileRoute("/api/public/runtime-flags")({
  server: {
    handlers: {
      GET: async () => {
        const flag = await readFlag();
        return new Response(JSON.stringify(flag), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
            "x-robots-tag": "noindex",
          },
        });
      },
    },
  },
});
