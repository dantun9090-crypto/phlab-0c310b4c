/**
 * .csv-suffixed alias of /api/public/hooks/offline-conversions.
 *
 * The NEW Google Ads Data Manager connection flow ("Set up import" on an
 * offline conversion action) validates the file format from the URL
 * extension and refuses extension-less URLs:
 *   "Unable to read file format. Make sure you select a CSV or TSV file
 *    with '.csv' or '.tsv' extension."
 * Its form also REQUIRES the username/password fields, so use this clean
 * URL (no ?key= query) there together with HTTP Basic (any username,
 * password = CRON_SECRET) — the legacy Uploads → Schedules fetch keeps
 * using the ?key= variant. Both routes serve the identical CSV.
 */
import { createFileRoute } from "@tanstack/react-router";
import { NO_STORE_HEADERS } from "@/lib/no-store-headers";
import { getOfflineConversionsCsv } from "./offline-conversions";

export const Route = createFileRoute("/api/public/hooks/offline-conversions.csv")({
  server: {
    handlers: {
      POST: async () =>
        new Response("Method Not Allowed", { status: 405, headers: NO_STORE_HEADERS }),
      GET: async ({ request }) => getOfflineConversionsCsv(request),
    },
  },
});
