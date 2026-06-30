/**
 * Lightweight liveness/readiness endpoint.
 *
 * GET /api/public/health → 200 { status: "healthy", buildId, ts }
 *
 * No DB calls, no auth — used by smoke tests and uptime monitors to
 * confirm the Worker is serving traffic before deeper checks run.
 */
import { createFileRoute } from "@tanstack/react-router";

declare const __BUILD_ID__: string | undefined;

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const buildId =
          typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";
        return new Response(
          JSON.stringify({
            status: "healthy",
            buildId,
            ts: new Date().toISOString(),
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
              "x-build-id": buildId,
            },
          },
        );
      },
      HEAD: async () => new Response(null, { status: 200 }),
    },
  },
});
