#!/usr/bin/env node
/**
 * Renders prod-routes + canonical JSON reports into a single Markdown
 * block, suitable for $GITHUB_STEP_SUMMARY and a sticky PR comment.
 *
 *   node scripts/render-route-audit-md.mjs \
 *     --routes /tmp/prod-routes-report.json \
 *     --canonicals /tmp/canonicals-report.json \
 *     --title "Production route audit" \
 *     --out /tmp/route-audit.md
 */
import { readFileSync, writeFileSync } from "node:fs";

function arg(name, def = "") {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
}

function loadJson(p) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function table(rows, headers) {
  if (!rows.length) return "_none_";
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows
    .map((r) => `| ${headers.map((h) => String(r[h] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`)
    .join("\n");
  return [head, sep, body].join("\n");
}

const routesPath = arg("routes", "/tmp/prod-routes-report.json");
const canonicalPath = arg("canonicals", "/tmp/canonicals-report.json");
const title = arg("title", "Route audit");
const out = arg("out", "/tmp/route-audit.md");

const routes = loadJson(routesPath);
const canonicals = loadJson(canonicalPath);

const lines = [];
lines.push(`## ${title}`);
lines.push("");

if (routes) {
  const failed = routes.results.filter((r) => r.verdict === "fail");
  lines.push(
    `**Status checks:** ${routes.totals.checked - routes.totals.failed}/${routes.totals.checked} OK against \`${routes.base}\``,
  );
  lines.push("");
  if (failed.length) {
    lines.push("### ❌ Failing URLs");
    lines.push(
      table(
        failed.map((r) => ({
          status: r.status,
          url: r.url,
          reason: r.reason,
        })),
        ["status", "url", "reason"],
      ),
    );
    lines.push("");
  }
  lines.push(
    `<details><summary>All ${routes.results.length} URLs</summary>\n\n` +
      table(
        routes.results.map((r) => ({
          verdict: r.verdict === "ok" ? "✅" : "❌",
          status: r.status,
          url: r.url,
          noindex: /noindex/i.test(`${r.xRobots} ${r.metaRobots}`)
            ? "yes"
            : "",
        })),
        ["verdict", "status", "url", "noindex"],
      ) +
      "\n\n</details>",
  );
  lines.push("");
} else {
  lines.push(`> ⚠️ no routes report at \`${routesPath}\``);
  lines.push("");
}

if (canonicals) {
  const failed = canonicals.results.filter((r) => r.verdict === "fail");
  lines.push(
    `**Canonical checks:** ${canonicals.totals.checked - canonicals.totals.failed}/${canonicals.totals.checked} OK`,
  );
  lines.push("");
  if (failed.length) {
    lines.push("### ❌ Canonical issues");
    lines.push(
      table(
        failed.map((r) => ({ url: r.url, issue: r.reason })),
        ["url", "issue"],
      ),
    );
    lines.push("");
  }
}

writeFileSync(out, lines.join("\n"));
console.log(`Wrote ${out}`);
