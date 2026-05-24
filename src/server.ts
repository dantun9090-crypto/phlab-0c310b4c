import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
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

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
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
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
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

