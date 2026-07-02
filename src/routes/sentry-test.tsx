import { createFileRoute } from "@tanstack/react-router";
import * as Sentry from "@sentry/react";

export const Route = createFileRoute("/sentry-test")({
  head: () => ({
    meta: [
      { title: "Sentry test" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SentryTestPage,
});

function SentryTestPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-4 text-center">
        <h1 className="text-2xl font-bold">Sentry test page</h1>
        <p className="text-slate-400 text-sm">
          Click the button to throw a test error and verify it lands in
          Sentry. Noindex — never crawled.
        </p>
        <button
          onClick={() => {
            // Log + metric first so the event shows breadcrumbs.
            try {
              (Sentry as unknown as { logger?: { info: (m: string, d?: unknown) => void } })
                .logger?.info?.("User triggered test error", {
                  action: "test_error_button_click",
                });
              (Sentry as unknown as { metrics?: { count: (n: string, v: number) => void } })
                .metrics?.count?.("test_counter", 1);
            } catch {
              /* ignore — old SDK versions */
            }
            throw new Error("This is your first error!");
          }}
          className="px-6 py-3 rounded-lg bg-red-600 hover:bg-red-700 font-medium"
        >
          Break the world
        </button>
      </div>
    </div>
  );
}
