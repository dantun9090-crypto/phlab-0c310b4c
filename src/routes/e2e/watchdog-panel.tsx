/**
 * Internal e2e harness for the BlankWatchdogDiagnosticsPanel.
 *
 * Renders the panel + a button that forces the real watchdog fallback so
 * Playwright can verify the panel exposes the last upload method (sendBeacon
 * vs fetch fallback) and retry/attempt count after a large DOM snapshot is
 * captured and shipped.
 *
 * Safety: 404s on production hosts (apex + www) — preview / localhost only.
 */
import { createFileRoute, notFound } from "@tanstack/react-router";
import { BlankWatchdogDiagnosticsPanel } from "@/components/admin/BlankWatchdogDiagnosticsPanel";

const LEGACY_APEX = ["prohealthpeptides", "co", "uk"].join(".");
const PROD_HOSTS = new Set([
  "phlabs.co.uk",
  "www.phlabs.co.uk",
  LEGACY_APEX,
  `www.${LEGACY_APEX}`,
]);
function isAllowedHost(host: string): boolean {
  if (!host) return false;
  return !PROD_HOSTS.has(host.toLowerCase());
}

export const Route = createFileRoute("/e2e/watchdog-panel")({
  head: () => ({
    meta: [
      { title: "E2E Harness — Blank Watchdog Panel" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  beforeLoad: () => {
    const host = typeof window !== "undefined" ? window.location.host : "";
    if (host && !isAllowedHost(host)) throw notFound();
  },
  component: WatchdogPanelHarness,
});

function WatchdogPanelHarness() {
  return (
    <main className="min-h-dvh bg-[#060f1e] p-6 text-white">
      <h1 className="mb-4 text-xl font-bold">E2E: Blank Watchdog Panel</h1>
      {/* Large DOM so the captured htmlSnapshot exceeds the 32KB cap. */}
      <section aria-hidden="true" data-testid="bulk-dom" className="opacity-20">
        {Array.from({ length: 800 }).map((_, i) => (
          <p key={i} className="text-xs">
            Filler block #{i} — pad the DOM with enough markup to force the
            watchdog htmlSnapshot above the 32KB truncation threshold so the
            panel surfaces the htmlTruncated flag and original length.
          </p>
        ))}
      </section>
      <BlankWatchdogDiagnosticsPanel />
    </main>
  );
}
