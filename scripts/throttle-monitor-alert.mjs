#!/usr/bin/env node
/**
 * Alert throttling for the HEAD vs GET monitor.
 *
 * Uses `monitor_head_get_log` as the source of truth: a host must have
 * failed at least MIN_FAILURES times within the last WINDOW_MIN minutes
 * before an alert fires. Each host also has a cooldown of COOLDOWN_MIN
 * minutes after the previous alert (tracked in `monitor_alert_state` via
 * the `record_monitor_alert` RPC).
 *
 * If throttling suppresses every host, the notifier is skipped entirely.
 * Otherwise, we tag the log with which hosts qualified and invoke the
 * existing scripts/notify-monitor-alert.mjs so Slack + email still send.
 *
 * Env (all optional except the Supabase pair):
 *   SUPABASE_URL                   (default: project URL)
 *   SUPABASE_SERVICE_ROLE_KEY      required for cooldown + record RPC.
 *                                  Without it we fall back to no throttle
 *                                  (behaves like the previous version).
 *   MONITOR_ALERT_MIN_FAILURES     default 2
 *   MONITOR_ALERT_WINDOW_MIN       default 30
 *   MONITOR_ALERT_COOLDOWN_MIN     default 60
 *   MONITOR_ALERT_HOSTS            comma-separated hosts to consider
 *                                  (default: distinct hosts seen in the
 *                                   last WINDOW_MIN minutes)
 *   ALERT_LOG_PATH                 monitor log path (default /tmp/monitor.log)
 *
 * All other env vars needed by scripts/notify-monitor-alert.mjs (Slack
 * webhook, Resend, ALERT_RUN_URL, ALERT_TITLE) are inherited unchanged.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SUPA_URL =
  process.env.SUPABASE_URL || "https://vvqotfbqmwmukwcmuycg.supabase.co";
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const MIN_FAILURES = Math.max(1, Number(process.env.MONITOR_ALERT_MIN_FAILURES || 2));
const WINDOW_MIN = Math.max(1, Number(process.env.MONITOR_ALERT_WINDOW_MIN || 30));
const COOLDOWN_MIN = Math.max(0, Number(process.env.MONITOR_ALERT_COOLDOWN_MIN || 60));
const LOG_PATH = process.env.ALERT_LOG_PATH || "/tmp/monitor.log";

function log(line) {
  console.log(`[throttle] ${line}`);
  try { appendFileSync(LOG_PATH, `\n[throttle] ${line}\n`); } catch { /* noop */ }
}

async function supaGet(path) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPA_KEY,
      authorization: `Bearer ${SUPA_KEY}`,
      accept: "application/json",
    },
  });
  if (!r.ok) throw new Error(`GET ${path} -> HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

async function supaRpc(fn, args) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPA_KEY,
      authorization: `Bearer ${SUPA_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`RPC ${fn} -> HTTP ${r.status}: ${await r.text()}`);
}

function runNotifier(extraEnv) {
  const here = dirname(fileURLToPath(import.meta.url));
  const notifier = join(here, "notify-monitor-alert.mjs");
  const res = spawnSync(process.execPath, [notifier], {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });
  return res.status ?? 1;
}

async function main() {
  if (!SUPA_KEY) {
    log("SUPABASE_SERVICE_ROLE_KEY missing — throttle disabled, forwarding to notifier.");
    process.exit(runNotifier({}));
  }

  const sinceIso = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();

  // Recent failures in the window, grouped by host.
  const rows = await supaGet(
    `monitor_head_get_log?select=host,created_at,had_alert&had_alert=eq.true&created_at=gte.${encodeURIComponent(sinceIso)}&order=created_at.desc&limit=500`,
  );

  const failuresByHost = new Map();
  for (const r of rows) {
    if (!r.host) continue;
    failuresByHost.set(r.host, (failuresByHost.get(r.host) || 0) + 1);
  }

  const hostFilter = (process.env.MONITOR_ALERT_HOSTS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const candidates = [...failuresByHost.entries()]
    .filter(([h]) => hostFilter.length === 0 || hostFilter.includes(h));

  if (candidates.length === 0) {
    log(`No failing hosts in last ${WINDOW_MIN}m — no alert.`);
    process.exit(0);
  }

  // Load cooldown state for candidate hosts.
  const hostList = candidates.map(([h]) => `"${h}"`).join(",");
  const state = await supaGet(
    `monitor_alert_state?select=host,last_alert_at,alerts_sent&host=in.(${encodeURIComponent(hostList)})`,
  );
  const stateByHost = new Map(state.map((s) => [s.host, s]));
  const cooldownMs = COOLDOWN_MIN * 60_000;
  const now = Date.now();

  const qualifying = [];
  const suppressed = [];

  for (const [host, fails] of candidates) {
    if (fails < MIN_FAILURES) {
      suppressed.push({ host, fails, reason: `below threshold (${fails}/${MIN_FAILURES})` });
      continue;
    }
    const s = stateByHost.get(host);
    if (s?.last_alert_at) {
      const age = now - new Date(s.last_alert_at).getTime();
      if (age < cooldownMs) {
        const mins = Math.round((cooldownMs - age) / 60_000);
        suppressed.push({ host, fails, reason: `cooldown (${mins}m remaining, ${s.alerts_sent} prior)` });
        continue;
      }
    }
    qualifying.push({ host, fails });
  }

  for (const s of suppressed) {
    log(`suppressed ${s.host} — ${s.fails} fails/${WINDOW_MIN}m, ${s.reason}`);
  }

  if (qualifying.length === 0) {
    log("All failing hosts suppressed by threshold or cooldown — no notification sent.");
    process.exit(0);
  }

  const summary = qualifying
    .map((q) => `${q.host} (${q.fails} fails in ${WINDOW_MIN}m)`)
    .join(", ");
  log(`ALERT firing for: ${summary}`);

  // Record each alert so cooldown starts now (best-effort).
  for (const q of qualifying) {
    try {
      await supaRpc("record_monitor_alert", {
        _host: q.host,
        _reason: `${q.fails} fails in ${WINDOW_MIN}m`,
      });
    } catch (e) {
      log(`record_monitor_alert failed for ${q.host}: ${e.message}`);
    }
  }

  const title =
    process.env.ALERT_TITLE ||
    `HEAD vs GET Monitor FAILED — ${qualifying.map((q) => q.host).join(", ")}`;

  const code = runNotifier({
    ALERT_TITLE: title,
    ALERT_THROTTLE_SUMMARY: `Hosts alerting: ${summary}. Threshold: ${MIN_FAILURES}/${WINDOW_MIN}m, cooldown ${COOLDOWN_MIN}m.`,
  });
  process.exit(code);
}

main().catch((e) => {
  log(`FATAL ${e.message} — falling back to unthrottled notifier`);
  process.exit(runNotifier({}));
});
