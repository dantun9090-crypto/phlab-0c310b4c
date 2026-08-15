/**
 * Google Ads OFFLINE CONVERSION feed (click conversions / gclid import).
 *
 * URL: GET https://phlabs.co.uk/api/public/hooks/offline-conversions?key=<CRON_SECRET>
 *
 * Google Ads → Goals → Conversions → Uploads → Schedules fetches this URL
 * daily (source type HTTPS) and matches each `gclid` back to the original
 * ad click. This recovers conversions the browser tag could NOT record:
 * consent declined, ad-blocker, or a bank-app redirect that lost the tab.
 *
 * Which orders are exported:
 *   - paid (any post-payment status), paymentProvider wallid/peptidepay
 *     (bank_transfer fires client-side at checkout by design and is excluded
 *     to avoid double counting),
 *   - has a captured adClickIds.gclid (see src/lib/gclid-capture.ts),
 *   - NO adsClientConversionAt marker — i.e. the success page never
 *     confirmed a consented browser-side Ads conversion (see
 *     src/routes/api/payments/status.ts). This is the dedup key against the
 *     live tag. Google additionally ignores exact re-uploads (same gclid +
 *     conversion name + timestamp), so re-fetching the same row is safe.
 *   - paidAt within the last 90 days (Google's click-conversion lookback
 *     limit — older clicks can never match).
 *
 * Auth: reuses CRON_SECRET (constant-time compare). Accepted either as the
 * `key` query param or as the HTTP Basic password (the Ads scheduled-upload
 * UI offers username/password fields; any username works).
 *
 * CSV format follows Google's "Upload conversions from clicks" template:
 *   Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency
 * Conversion Name must EXACTLY match the conversion action name in Google
 * Ads — override via ADS_IMPORT_CONVERSION_NAME if the action is renamed.
 * The default points at the IMPORT-type action "Purchase (offline import)":
 * Google rejects offline uploads into WEBSITE (tag) conversion actions
 * ("isn't set up for uploading conversions") — imports require an action
 * created via Goals → Conversions → New conversion action → Import.
 */
import { createFileRoute } from "@tanstack/react-router";
import { NO_STORE_HEADERS } from "@/lib/no-store-headers";

const CONVERSION_NAME =
  (process.env.ADS_IMPORT_CONVERSION_NAME || "").trim() || "Purchase (offline import)";
const LOOKBACK_MS = 90 * 24 * 60 * 60_000;

const PAID_STATUSES = new Set([
  "paid",
  "processing",
  "shipped",
  "delivered",
  "completed",
]);

function constantTimeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function extractProvidedSecret(request: Request): string {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (key) return key;
  // HTTP Basic: any username, password = secret.
  const auth = request.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = atob(auth.slice(6).trim());
      const idx = decoded.indexOf(":");
      return idx >= 0 ? decoded.slice(idx + 1) : decoded;
    } catch {
      return "";
    }
  }
  return "";
}

/** Firestore admin reads may surface dates as Date, ISO string, or a raw
 * protobuf-ish {_seconds}/{seconds} object depending on the code path. */
function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof value === "object") {
    const v = value as { _seconds?: unknown; seconds?: unknown; toDate?: unknown };
    if (typeof v.toDate === "function") {
      try {
        const d = (v.toDate as () => Date)();
        return Number.isFinite(d.getTime()) ? d : null;
      } catch { /* fall through */ }
    }
    const secs = typeof v._seconds === "number" ? v._seconds
      : typeof v.seconds === "number" ? v.seconds
      : null;
    if (secs !== null) return new Date(secs * 1000);
  }
  return null;
}

/** Google's accepted timestamp format, e.g. "08/13/2026 09:14:32 PM +0100".
 * Rendered in Europe/London with the GMT offset appended to EVERY row —
 * Google's click-conversion import rejects rows whose Conversion Time has
 * no timezone ("requires a timezone to be specified in the parameter row
 * or the date field"). The offset is computed per conversion date: +0100
 * during BST, +0000 in GMT months — a static Parameters:TimeZone row would
 * be wrong for half the year. */
function formatAdsTime(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/London",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const londonMs = Date.parse(d.toLocaleString("en-US", { timeZone: "Europe/London" }));
  const utcMs = Date.parse(d.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMin = Math.round((londonMs - utcMs) / 60_000);
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}${String(abs % 60).padStart(2, "0")}`;
  return `${get("month")}/${get("day")}/${get("year")} ${get("hour")}:${get("minute")}:${get("second")} ${get("dayPeriod")} ${offset}`;
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export const Route = createFileRoute("/api/public/hooks/offline-conversions")({
  server: {
    handlers: {
      POST: async () =>
        new Response("Method Not Allowed", { status: 405, headers: NO_STORE_HEADERS }),
      GET: async ({ request }) => {
        // ---- auth ---------------------------------------------------
        const expected = process.env.CRON_SECRET || "";
        const provided = extractProvidedSecret(request);
        if (!expected || !constantTimeEqual(provided, expected)) {
          return new Response("forbidden", { status: 403, headers: NO_STORE_HEADERS });
        }

        const rows: string[] = [
          "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency",
        ];

        try {
          const { listDocsAdmin } = await import("@/lib/server/firestore-admin");
          const since = new Date(Date.now() - LOOKBACK_MS);
          const orders = await listDocsAdmin("orders", {
            orderBy: "paidAt",
            direction: "DESCENDING",
            limit: 500,
            rangeFilter: { field: "paidAt", gte: since },
          });

          for (const order of orders) {
            if (!PAID_STATUSES.has(String(order.status ?? "").toLowerCase())) continue;
            const provider = String(
              (order as { paymentProvider?: unknown }).paymentProvider ?? "",
            ).toLowerCase();
            if (provider !== "wallid" && provider !== "peptidepay") continue;
            // Skip orders whose browser Ads conversion was confirmed —
            // importing those would double count.
            if ((order as { adsClientConversionAt?: unknown }).adsClientConversionAt) continue;

            const clickIds = (order as { adClickIds?: unknown }).adClickIds as
              | { gclid?: unknown }
              | undefined;
            const gclid = typeof clickIds?.gclid === "string" ? clickIds.gclid : "";
            if (!gclid) continue;

            const paidAt =
              toDate((order as { paidAt?: unknown }).paidAt) ??
              toDate((order as { createdAt?: unknown }).createdAt);
            if (!paidAt) continue;

            const value = Number(
              (order as { totalAmount?: unknown }).totalAmount ??
                (order as { total?: unknown }).total ??
                0,
            );
            if (!Number.isFinite(value) || value <= 0) continue;

            rows.push(
              [
                csvCell(gclid),
                csvCell(CONVERSION_NAME),
                csvCell(formatAdsTime(paidAt)),
                value.toFixed(2),
                "GBP",
              ].join(","),
            );
          }
        } catch (e) {
          console.error(
            "[offline-conversions] export failed:",
            e instanceof Error ? e.message : e,
          );
          // Still return a valid (header-only) CSV so a transient Firestore
          // error doesn't fail the scheduled upload in the Ads UI — the next
          // daily fetch retries automatically.
        }

        return new Response(rows.join("\n") + "\n", {
          status: 200,
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": 'attachment; filename="offline-conversions.csv"',
            ...NO_STORE_HEADERS,
          },
        });
      },
    },
  },
});
