import { createFileRoute } from "@tanstack/react-router";

import cataloguePdfUrl from "@/assets/downloads/PH-Labs-Research-Catalogue.pdf?url";
import protocolLibraryPdfUrl from "@/assets/downloads/protocol-library.pdf?url";

const DOWNLOAD_NO_STORE_CACHE_CONTROL =
  "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0";

const DOWNLOADS: Record<string, { url: string; filename: string }> = {
  "PH-Labs-Research-Catalogue.pdf": {
    url: cataloguePdfUrl,
    filename: "PH-Labs-Research-Catalogue.pdf",
  },
  "protocol-library.pdf": {
    url: protocolLibraryPdfUrl,
    filename: "protocol-library.pdf",
  },
};

function downloadHeaders(contentLength?: string | null): Headers {
  const headers = new Headers({
    "content-type": "application/pdf",
    "cache-control": DOWNLOAD_NO_STORE_CACHE_CONTROL,
    "cdn-cache-control": "no-store",
    "cloudflare-cdn-cache-control": "no-store",
    "surrogate-control": "no-store",
    pragma: "no-cache",
    expires: "0",
    "x-content-type-options": "nosniff",
  });
  if (contentLength) headers.set("content-length", contentLength);
  return headers;
}

async function serveDownload(request: Request, file: string, headOnly = false): Promise<Response> {
  const download = DOWNLOADS[file];
  if (!download) {
    return new Response("Not Found", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": DOWNLOAD_NO_STORE_CACHE_CONTROL,
        "cdn-cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  }

  const assetUrl = new URL(download.url, request.url);
  const assetResponse = await fetch(assetUrl, { method: headOnly ? "HEAD" : "GET" });
  if (!assetResponse.ok) {
    return new Response("Not Found", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": DOWNLOAD_NO_STORE_CACHE_CONTROL,
        "cdn-cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  }

  const headers = downloadHeaders(assetResponse.headers.get("content-length"));
  headers.set("content-disposition", `inline; filename="${download.filename}"`);
  return new Response(headOnly ? null : assetResponse.body, {
    status: 200,
    headers,
  });
}

export const Route = createFileRoute("/downloads/$file")({
  server: {
    handlers: {
      GET: async ({ request, params }) => serveDownload(request, params.file),
      HEAD: async ({ request, params }) => serveDownload(request, params.file, true),
    },
  },
});