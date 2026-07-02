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
            const err = new Error(
              "Sentry test error @ " + new Date().toISOString()
            );
            // 1) Explicit capture — guaranteed delivery even if globals miss it.
            try {
              const eventId = Sentry.captureException(err, {
                tags: { source: "sentry-test-button" },
              });
              Sentry.captureMessage("Sentry test button clicked", "info");
              // eslint-disable-next-line no-console
              console.info("[sentry-test] captured", eventId);
            } catch (e) {
              console.error("[sentry-test] captureException failed", e);
            }
            // 2) Also throw async so Sentry's window.onerror handler fires
            //    (throws inside React synthetic onClick are swallowed).
            setTimeout(() => {
              throw err;
            }, 0);
            alert("Sent to Sentry. Check your dashboard in ~10 seconds.");
          }}
          className="px-6 py-3 rounded-lg bg-red-600 hover:bg-red-700 font-medium"
        >
          Break the world
        </button>
      </div>
    </div>
  );
}
