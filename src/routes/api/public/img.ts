import { createFileRoute } from "@tanstack/react-router";

// Same-origin image proxy for product images stored in Firebase Storage.
// Used to keep the Firebase bucket hostname (which contains a banned
// token) out of public feeds (GMC, sitemap, OG tags, etc.). Only allows
// images under products/** in the project's bucket.

const FIREBASE_STORAGE_HOST = "firebasestorage.googleapis.com";
const BUCKET = "prohealthpeptides-a0808.firebasestorage.app";

function safeObjectPath(raw: string | null): string | null {
  if (!raw || raw.length > 800) return null;
  // Accept both decoded and percent-encoded path forms.
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!decoded.startsWith("products/")) return null;
  const parts = decoded.split("/");
  if (parts.some((p) => p === "" || p === "..")) return null;
  if (!/\.(jpe?g|png|webp|gif|avif)$/i.test(decoded)) return null;
  return decoded;
}

function imgHeaders(upstream: Response): Headers {
  const headers = new Headers({
    "content-type": upstream.headers.get("content-type") || "image/jpeg",
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
  });
  for (const name of ["content-length", "last-modified", "etag", "accept-ranges", "content-range"]) {
    const v = upstream.headers.get(name);
    if (v) headers.set(name, v);
  }
  return headers;
}

export const Route = createFileRoute("/api/public/img")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const objectPath = safeObjectPath(u.searchParams.get("p"));
        const token = u.searchParams.get("t");
        if (!objectPath || !token || !/^[a-f0-9-]{16,80}$/i.test(token)) {
          return new Response("Invalid image", { status: 400, headers: { "cache-control": "no-store" } });
        }

        const upstreamUrl = `https://${FIREBASE_STORAGE_HOST}/v0/b/${BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(token)}`;

        let upstream: Response;
        try {
          upstream = await fetch(upstreamUrl, { method: "GET", signal: AbortSignal.timeout(15_000) });
        } catch {
          return new Response("Image unavailable", { status: 502, headers: { "cache-control": "no-store" } });
        }
        if (!upstream.ok && upstream.status !== 206) {
          return new Response("Image unavailable", { status: upstream.status === 404 ? 404 : 502, headers: { "cache-control": "no-store" } });
        }
        const ct = (upstream.headers.get("content-type") || "").toLowerCase();
        if (!ct.startsWith("image/")) {
          return new Response("Not an image", { status: 415, headers: { "cache-control": "no-store" } });
        }
        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: imgHeaders(upstream),
        });
      },
    },
  },
});
