import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { resolveLegacyRedirect } from "./lib/legacy-redirects";
import { extractClientIp, log, truncate } from "./lib/worker-log";


type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

// Canonical host: phlabs.co.uk is primary; legacy brand domain 301-redirects here.  check-domains-allow-line
const CANONICAL_HOST = "www.phlabs.co.uk";
// Hosts that should 301 to the canonical host (apex + legacy brand domains).
// Lovable preview/published hosts (*.lovable.app, *.lovableproject.com) are
// intentionally excluded so previews keep working.
const REDIRECT_HOSTS = new Set<string>([
  "phlabs.co.uk",
  // check-domains-allow-next-line: legacy host, musi tu zostać żeby zadziałał 301 do www.phlabs.co.uk
  "prohealthpeptides.co.uk",
  // check-domains-allow-next-line: legacy host, musi tu zostać żeby zadziałał 301 do www.phlabs.co.uk
  "www.prohealthpeptides.co.uk",
]);

const SECURITY_HEADERS: Record<string, string> = {
  "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  "x-xss-protection": "0",
};

function applySecurityHeaders(response: Response): Response {
  const contentType = response.headers.get("content-type") ?? "";
  // Only decorate HTML — leaving JSON/XML/asset responses untouched avoids
  // breaking sitemap, JSON-LD endpoints, and prerender.io content sniffing.
  if (!contentType.includes("text/html")) return response;

  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function brandedErrorResponse(): Response {
  return applySecurityHeaders(
    new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
  );
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const start = Date.now();
    const url = new URL(request.url);
    const ip = extractClientIp(request);
    const ray = request.headers.get("cf-ray");
    const country = request.headers.get("cf-ipcountry");
    const ua = truncate(request.headers.get("user-agent"));
    const referer = truncate(request.headers.get("referer"));
    const baseFields = {
      method: request.method,
      path: url.pathname,
      query: url.search || undefined,
      ip,
      country,
      ua,
      referer,
      cfRay: ray,
    };

    try {
      // 1) Canonical host redirect (apex + legacy brand domains → www.phlabs.co.uk).
      const reqHost = url.hostname.toLowerCase();
      if (REDIRECT_HOSTS.has(reqHost)) {
        const dest = new URL(url.toString());
        dest.hostname = CANONICAL_HOST;
        dest.protocol = "https:";
        dest.port = "";
        log.info({ event: "worker.redirect", status: 301, reason: "canonical-host", to: dest.toString(), ...baseFields });
        return Response.redirect(dest.toString(), 301);
      }

      // 2) 301 redirect legacy (Wegic) URLs before SSR runs.
      const legacy = resolveLegacyRedirect(url.pathname);
      if (legacy && legacy !== url.pathname) {
        const dest = new URL(legacy, url);
        dest.search = url.search;
        log.info({ event: "worker.redirect", status: 301, to: dest.pathname, ...baseFields });
        return Response.redirect(dest.toString(), 301);
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = applySecurityHeaders(await normalizeCatastrophicSsrResponse(response));
      const ms = Date.now() - start;
      log.info({
        event: "worker.request",
        status: normalized.status,
        ms,
        ...baseFields,
      });
      return normalized;
    } catch (error) {
      const ms = Date.now() - start;
      log.error({
        event: "worker.request.error",
        status: 500,
        ms,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        ...baseFields,
      });
      console.error(error);
      return brandedErrorResponse();
    }
  },
};

