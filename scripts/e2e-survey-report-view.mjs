#!/usr/bin/env node
/**
 * Human-readable viewer for the latest e2e-survey-http report.
 *
 * Usage:
 *   node scripts/e2e-survey-report-view.mjs                 # text summary
 *   node scripts/e2e-survey-report-view.mjs --html out.html # write HTML
 *   E2E_REPORT_DIR=/path/to/dir node scripts/e2e-survey-report-view.mjs
 *
 * Reads `${E2E_REPORT_DIR or /tmp/e2e-survey-report}/report.json` produced
 * by `scripts/e2e-survey-http.py` and renders:
 *   1. Per-phase pass/fail summary
 *   2. Top N failing cases grouped by category
 *   3. For each failure: request payload, HTTP status, response body, and
 *      a key-wise DB diff (pre → post).
 */
import fs from "node:fs";
import path from "node:path";

const REPORT_DIR = process.env.E2E_REPORT_DIR || "/tmp/e2e-survey-report";
const REPORT_PATH = path.join(REPORT_DIR, "report.json");
const TOP_N = Number(process.env.TOP_N || 20);

if (!fs.existsSync(REPORT_PATH)) {
  console.error(`No report found at ${REPORT_PATH}. Run scripts/e2e-survey-http.py first.`);
  process.exit(2);
}

const report = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
const htmlIdx = process.argv.indexOf("--html");
const htmlOut = htmlIdx >= 0 ? process.argv[htmlIdx + 1] : null;

function fmtSummary(s) {
  return Object.entries(s)
    .filter(([k]) => k !== "total_fail")
    .map(([k, v]) => `  ${k.padEnd(14)} ${JSON.stringify(v)}`)
    .join("\n");
}

function groupBy(arr, key) {
  return arr.reduce((acc, x) => ((acc[x[key]] ||= []).push(x), acc), {});
}

function textReport() {
  const lines = [];
  lines.push(`E2E source-survey report`);
  lines.push(`generated_at: ${report.generated_at}`);
  lines.push(`target:       ${report.base_url}`);
  lines.push(`total_fail:   ${report.summary.total_fail}`);
  lines.push(``);
  lines.push(`-- summary by phase --`);
  lines.push(fmtSummary(report.summary));
  lines.push(``);
  const grouped = groupBy(report.failures || [], "category");
  for (const [cat, items] of Object.entries(grouped)) {
    lines.push(`-- ${cat}: ${items.length} failure(s) --`);
    for (const f of items.slice(0, TOP_N)) {
      lines.push(`  ✗ ${f.name}  [${f.reason}]`);
      lines.push(`      fn=${f.fn ?? "?"} http=${f.http_status} ok=${f.ok}`);
      if (f.request_args) {
        const compact = JSON.stringify(f.request_args, (_k, v) =>
          typeof v === "string" && v.length > 80 ? v.slice(0, 80) + `…(${v.length})` : v
        );
        lines.push(`      payload: ${compact}`);
      }
      if (f.client_msg) lines.push(`      client_msg: ${f.client_msg.slice(0, 200)}`);
      if (f.raw_body)   lines.push(`      raw_body:   ${f.raw_body.slice(0, 200)}`);
      if (f.db_diff && Object.keys(f.db_diff).length) {
        for (const [k, d] of Object.entries(f.db_diff)) {
          lines.push(`      db_diff[${k}]: ${JSON.stringify(d.pre)} -> ${JSON.stringify(d.post)}`);
        }
      }
    }
    if (items.length > TOP_N) lines.push(`  … +${items.length - TOP_N} more`);
    lines.push(``);
  }
  return lines.join("\n");
}

function htmlReport() {
  const esc = (s) =>
    String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const grouped = groupBy(report.failures || [], "category");
  const sections = Object.entries(grouped)
    .map(([cat, items]) => {
      const rows = items
        .map(
          (f) => `
        <details>
          <summary><b>${esc(f.name)}</b> — <code>${esc(f.reason)}</code>
            <span class="meta">fn=${esc(f.fn ?? "?")} · http=${esc(f.http_status)} · ok=${esc(f.ok)}</span>
          </summary>
          <div class="grid">
            <div><h4>Request payload</h4><pre>${esc(JSON.stringify(f.request_args, null, 2))}</pre></div>
            <div><h4>Client / raw body</h4>
              <pre>${esc(f.client_msg || "")}</pre>
              <pre>${esc((f.raw_body || "").slice(0, 4000))}</pre>
            </div>
            <div><h4>DB diff</h4><pre>${esc(JSON.stringify(f.db_diff || {}, null, 2))}</pre></div>
          </div>
        </details>`
        )
        .join("\n");
      return `<section><h2>${esc(cat)} <small>(${items.length})</small></h2>${rows}</section>`;
    })
    .join("\n");
  return `<!doctype html><meta charset="utf-8"><title>E2E survey report</title>
<style>
  body{font:14px/1.5 ui-sans-serif,system-ui,sans-serif;margin:24px;color:#0f172a;background:#f8fafc;}
  h1{margin:0 0 4px}
  pre{background:#0f172a;color:#e2e8f0;padding:8px;border-radius:6px;overflow:auto;font-size:12px;max-height:300px}
  details{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;margin:6px 0}
  summary{cursor:pointer}
  .meta{color:#64748b;margin-left:6px;font-size:12px}
  .grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:8px}
  section{margin:20px 0}
  code{background:#fee2e2;color:#991b1b;padding:1px 6px;border-radius:4px}
</style>
<h1>E2E source-survey report</h1>
<p><b>${esc(report.generated_at)}</b> · target <code>${esc(report.base_url)}</code> · total failures
<code>${esc(report.summary.total_fail)}</code></p>
<pre>${esc(JSON.stringify(report.summary, null, 2))}</pre>
${sections || "<p>✅ No failures.</p>"}`;
}

if (htmlOut) {
  fs.writeFileSync(htmlOut, htmlReport());
  console.error(`wrote ${htmlOut}`);
} else {
  console.log(textReport());
}
