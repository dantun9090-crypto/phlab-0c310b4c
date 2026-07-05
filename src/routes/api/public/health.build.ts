/**
 * Build-version probe.
 *
 *   GET /api/public/health/build
 *     → 200 { version, deployedAt, buildId }
 *
 * Same BUILD_ID that gets injected into the `<meta name="build-version">`
 * shell tag and the `x-build-id` response header. Used by the admin
 * PublishStatus tab and external monitors to confirm what version is live
 * without scraping HTML.
 */
import { createFileRoute } from "@tanstack/react-router";

declare const __BUILD_ID__: string | undefined;

const startedAt = new Date().toISOString();

export const Route = createFileRoute("/api/public/health/build")({
  server: {
    handlers: {
      GET: async () => {
        const buildId =
          typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";
        return new Response(
          JSON.stringify({
            version: buildId,
            buildId,
            deployedAt: startedAt,
            ts: new Date().toISOString(),
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
              "x-build-id": buildId,
              "x-robots-tag": "noindex",
            },
          },
        );
      },
      HEAD: async () => new Response(null, { status: 200 }),
    },
  },
});
