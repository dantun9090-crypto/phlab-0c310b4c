/**
 * Scheduled PageSpeed Insights (PSI) audit — runs on a cron schedule.
 *
 * For each configured URL we call Google's public PSI API (which runs a
 * real Lighthouse audit in Google's lab) and persist the headline metrics
 * to the Firestore `psi_runs` collection. The admin "Web Vitals" tab can
 * then chart these alongside RUM samples from `web_vitals`.
 *
 * Robustness:
 *   • Handles HTTP 429 with `Retry-After` (honours the header up to 60s).
 *   • Up to 3 attempts per URL with exponential backoff.
 *   • Records BOTH mobile and desktop strategies (Google CrUX targets).
 *   • Auth via reused `x-watchdog-secret` / CLEANUP_SECRET (same as the
 *     other public cron hooks — keeps pg_cron config simple).
 *
 * Cron suggestion (pg_cron, every 6h):
 *   SELECT cron.schedule('psi-homepage', '0 *\/6 * * *', $$
 *     SELECT net.http_post(
 *       url := 'https://phlabs.co.uk/api/public/hooks/lighthouse-psi',
 *       headers := jsonb_build_object('x-watchdog-secret', '<CLEANUP_SECRET>')
 *     );
 *   $$);
 */
import { createFileRoute } from "@tanstack/react-router";

import { timingSafeEqualStr } from "@/lib/timing-safe-equal";
import { enforceRateLimit } from "@/lib/rate-limit";
import { addDocAdmin } from "@/lib/server/firestore-admin";

const ENDPOINT = "/api/public/hooks/lighthouse-psi";

const TARGETS: Array<{ url: string; label: string }> = [
  { url: "https://phlabs.co.uk/", label: "home" },
  { url: "https://phlabs.co.uk/compound", label: "compound" },
  { url: "https://phlabs.co.uk/products", label: "products" },
];

const STRATEGIES = ["mobile", "desktop"] as const;
type Strategy = (typeof STRATEGIES)[number];

interface PsiSample {
  url: string;
  label: string;
  strategy: Strategy;
  ok: boolean;
  status: number;
  attempts: number;
  performance: number | null;     // 0..100
  lcp: number | null;             // ms
  cls: number | null;             // unitless
  inp: number | null;             // ms (interaction-to-next-paint)
  tbt: number | null;             // ms
  fcp: number | null;             // ms
  ttfb: number | null;            // ms
  speedIndex: number | null;      // ms
  error?: string;
}

function parseRetryAfter(header: string | null): number {
  if (!header) return 0;
  const n = Number(header);
  if (Number.isFinite(n)) return Math.min(Math.max(n, 1), 60);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return Math.min(Math.max(Math.ceil((date - Date.now()) / 1000), 1), 60);
  }
  return 0;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runPsi(url: string, label: string, strategy: Strategy): Promise<PsiSample> {
  const key = process.env.PAGESPEED_API_KEY || process.env.GOOGLE_PSI_API_KEY || "";
  const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", strategy);
  endpoint.searchParams.append("category", "performance");
  if (key) endpoint.searchParams.set("key", key);

  const MAX_ATTEMPTS = 3;
  let lastErr = "";
  let lastStatus = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(endpoint.toString(), {
        signal: AbortSignal.timeout(90_000),
      });
      lastStatus = res.status;

      if (res.status === 429) {
        // Honour Retry-After (cap 60s so cron never hangs).
        const wait = parseRetryAfter(res.headers.get("retry-after")) || Math.min(2 ** attempt, 30);
        if (attempt < MAX_ATTEMPTS) {
          await sleep(wait * 1000);
          continue;
        }
        lastErr = `rate_limited (retry-after=${wait}s)`;
        break;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        lastErr = `http_${res.status}: ${body.slice(0, 200)}`;
        // Backoff on transient 5xx; bail on 4xx other than 429.
        if (res.status >= 500 && attempt < MAX_ATTEMPTS) {
          await sleep(Math.min(2 ** attempt, 8) * 1000);
          continue;
        }
        break;
      }

      const data = (await res.json()) as any;
      const lhr = data?.lighthouseResult;
      const audits = lhr?.audits ?? {};
      const perf = lhr?.categories?.performance?.score;

      return {
        url,
        label,
        strategy,
        ok: true,
        status: res.status,
        attempts: attempt,
        performance: typeof perf === "number" ? Math.round(perf * 100) : null,
        lcp: audits["largest-contentful-paint"]?.numericValue ?? null,
        cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
        // PSI/lab Lighthouse exposes INP as "interactive" proxy; field data is
        // experimental. We persist `experimental-interaction-to-next-paint`
        // when available and fall back to TBT.
        inp:
          audits["experimental-interaction-to-next-paint"]?.numericValue ??
          audits["interaction-to-next-paint"]?.numericValue ??
          null,
        tbt: audits["total-blocking-time"]?.numericValue ?? null,
        fcp: audits["first-contentful-paint"]?.numericValue ?? null,
        ttfb: audits["server-response-time"]?.numericValue ?? null,
        speedIndex: audits["speed-index"]?.numericValue ?? null,
      };
    } catch (e: any) {
      lastErr = e?.message || String(e);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(Math.min(2 ** attempt, 8) * 1000);
      }
    }
  }

  return {
    url,
    label,
    strategy,
    ok: false,
    status: lastStatus,
    attempts: MAX_ATTEMPTS,
    performance: null,
    lcp: null,
    cls: null,
    inp: null,
    tbt: null,
    fcp: null,
    ttfb: null,
    speedIndex: null,
    error: lastErr,
  };
}

export const Route = createFileRoute("/api/public/hooks/lighthouse-psi")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = await enforceRateLimit(request, ENDPOINT, {
          limit: 4,
          windowMs: 60_000,
          retryAfterSec: 60,
        });
        if (limited) return limited;

        const expected = process.env.CLEANUP_SECRET;
        const provided =
          request.headers.get("x-watchdog-secret") ||
          request.headers.get("x-cleanup-secret");
        if (!expected || !provided || !timingSafeEqualStr(provided, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const startedAt = new Date().toISOString();
        const samples: PsiSample[] = [];

        // Run sequentially to avoid burning the PSI quota in parallel —
        // also makes Retry-After honoring meaningful.
        for (const t of TARGETS) {
          for (const s of STRATEGIES) {
            const sample = await runPsi(t.url, t.label, s);
            samples.push(sample);
            try {
              await addDocAdmin("psi_runs", {
                ...sample,
                createdAt: new Date().toISOString(),
                runStartedAt: startedAt,
              });
            } catch (err) {
              console.error("[psi] failed to persist sample", err);
            }
          }
        }

        const ok = samples.filter((s) => s.ok).length;
        return Response.json(
          {
            ok: ok === samples.length,
            startedAt,
            finishedAt: new Date().toISOString(),
            collected: ok,
            failed: samples.length - ok,
            samples: samples.map((s) => ({
              label: s.label,
              strategy: s.strategy,
              perf: s.performance,
              lcp: s.lcp,
              cls: s.cls,
              attempts: s.attempts,
              ok: s.ok,
              error: s.error,
            })),
          },
          { status: 200, headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
