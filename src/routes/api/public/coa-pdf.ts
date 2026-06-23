import { createFileRoute } from "@tanstack/react-router";

const FIREBASE_STORAGE_HOST = "firebasestorage.googleapis.com";
const ALLOWED_BUCKETS = new Set([
  "prohealthpeptides-a0808.firebasestorage.app",
  "prohealthpeptides-a0808.appspot.com",
]);

function sanitizeFilename(value: string | null): string {
  const cleaned = (value || "certificate-of-analysis.pdf")
    .replace(/[\r\n\x00]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[._-]+/, "")
    .slice(0, 120);
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned || "certificate-of-analysis"}.pdf`;
}

function getAllowedCoaSource(raw: string | null): URL | null {
  if (!raw || raw.length > 2500) return null;

  let source: URL;
  try {
    source = new URL(raw);
  } catch {
    return null;
  }

  if (source.protocol !== "https:" || source.hostname.toLowerCase() !== FIREBASE_STORAGE_HOST) {
    return null;
  }

  const parts = source.pathname.split("/");
  if (parts[1] !== "v0" || parts[2] !== "b" || parts[4] !== "o") {
    return null;
  }

  const bucket = decodeURIComponent(parts[3] || "");
  if (!ALLOWED_BUCKETS.has(bucket)) return null;

  const objectName = decodeURIComponent(parts.slice(5).join("/"));
  const objectParts = objectName.split("/");
  if (
    objectParts.some((part) => part === "" || part === "..") ||
    !objectName.startsWith("products/") ||
    !objectName.includes("/coa/") ||
    !objectName.toLowerCase().endsWith(".pdf")
  ) {
    return null;
  }

  source.searchParams.set("alt", "media");
  return source;
}

function pdfHeaders(upstream: Response, filename: string, download: boolean): Headers {
  const headers = new Headers({
    "content-type": "application/pdf",
    "content-disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    "pragma": "no-cache",
    "expires": "0",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow",
  });

  for (const name of ["accept-ranges", "content-range", "content-length", "last-modified", "etag"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return headers;
}

export const Route = createFileRoute("/api/public/coa-pdf")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestUrl = new URL(request.url);
        const source = getAllowedCoaSource(requestUrl.searchParams.get("url"));
        if (!source) {
          return new Response("Invalid certificate URL", {
            status: 400,
            headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
          });
        }

        const upstreamHeaders = new Headers({ accept: "application/pdf" });
        const range = request.headers.get("range");
        if (range) upstreamHeaders.set("range", range);

        let upstream: Response;
        try {
          upstream = await fetch(source.toString(), {
            method: "GET",
            headers: upstreamHeaders,
            signal: AbortSignal.timeout(20_000),
          });
        } catch {
          return new Response("Certificate temporarily unavailable", {
            status: 502,
            headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
          });
        }

        if (!upstream.ok && upstream.status !== 206) {
          return new Response("Certificate unavailable", {
            status: upstream.status === 404 ? 404 : 502,
            headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
          });
        }

        const contentType = (upstream.headers.get("content-type") || "").toLowerCase();
        if (contentType && !contentType.includes("application/pdf") && !contentType.includes("application/octet-stream")) {
          return new Response("Certificate is not a PDF", {
            status: 415,
            headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
          });
        }

        const filename = sanitizeFilename(requestUrl.searchParams.get("filename"));
        const download = requestUrl.searchParams.get("download") === "1";
        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: pdfHeaders(upstream, filename, download),
        });
      },
    },
  },
});