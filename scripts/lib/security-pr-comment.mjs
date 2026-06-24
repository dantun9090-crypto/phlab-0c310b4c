/**
 * Pure builder for the "Security scan" PR / Job-Summary comment body.
 *
 * Extracted from .github/workflows/security-scan.yml so the markdown
 * generation is unit-testable (see tests/security-pr-comment.test.ts).
 * The workflow imports this module via `require()` inside actions/github-script.
 *
 * Input: parsed dist/security-audit.json + run/artifact context.
 * Output: { body, marker } — body is the full markdown to post.
 */

export const MARKER = "<!-- security-scan-summary -->";

const SEV_RANK = { critical: 4, high: 3, moderate: 2, medium: 2, low: 1, info: 0 };

function rankOf(sev) {
  return SEV_RANK[sev] ?? 0;
}

/**
 * Derive a human-readable advisory source label from the advisory URL so
 * each per-advisory link in the PR comment names the database the
 * reviewer is being sent to (OSV, GitHub, Snyk, NVD, npm, ...).
 */
export function sourceLabelFor(url) {
  if (!url) return "advisory";
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("osv.dev")) return "OSV";
    if (host.includes("github.com")) return "GitHub";
    if (host.includes("snyk.io")) return "Snyk";
    if (host.includes("nvd.nist.gov")) return "NVD";
    if (host.includes("npmjs.com")) return "npm";
    return host;
  } catch {
    return "advisory";
  }
}

/**
 * @param {object} opts
 * @param {object|null} opts.report     Parsed security-audit.json, or null if missing.
 * @param {string} opts.runUrl          Link to the workflow run.
 * @param {string} opts.artifactUrl     One-click artifact download URL.
 * @param {string} opts.sha             Commit SHA.
 * @param {string} opts.exitCode        Scanner exit code, as a string.
 * @param {string} opts.inputOverride   workflow_dispatch min_severity input (empty if none).
 */
export function buildSecurityComment(opts) {
  const { report, runUrl, artifactUrl, sha, exitCode, inputOverride } = opts;

  if (!report) {
    return {
      marker: MARKER,
      body: `${MARKER}\n### 🔐 Security scan\n\nReport file missing — the scan likely crashed before writing JSON. Check the [workflow logs](${runUrl}).`,
    };
  }

  const r = report;
  const t = r.totals;
  const sev = (s) => `\`${s}\``;
  const gateColor = r.blocking.length === 0 ? "brightgreen" : "red";
  const gateBadge = `![min severity gate](https://img.shields.io/badge/min%20severity-${encodeURIComponent(
    r.minSeverity,
  )}-${gateColor}?logo=npm)`;
  const status =
    r.blocking.length === 0
      ? `✅ **No ${r.minSeverity}+ vulnerabilities** — safe to merge.`
      : `❌ **${r.blocking.length} blocking ${r.minSeverity}+ vulnerabilities** — merge gate failed.`;

  const overrideNote = inputOverride
    ? " (overridden for this run via `workflow_dispatch` input)"
    : " (from `.security-config.json`)";

  // Group blocking findings by package, picking the worst severity and
  // exposing the worst advisory ID first so reviewers see what triggered
  // the gate at a glance.
  const byPkg = new Map();
  for (const b of r.blocking) {
    const key = `${b.pkg}@${b.version}`;
    const prev =
      byPkg.get(key) ||
      { pkg: b.pkg, version: b.version, worst: b.severity, worstId: b.id, worstUrl: b.url, count: 0, advisories: [] };
    prev.count += 1;
    prev.advisories.push({ id: b.id, url: b.url, severity: b.severity });
    if (rankOf(b.severity) > rankOf(prev.worst)) {
      prev.worst = b.severity;
      prev.worstId = b.id;
      prev.worstUrl = b.url;
    }
    byPkg.set(key, prev);
  }
  // Sort each package's advisories worst-first so the rendered list leads
  // with the most severe ID.
  for (const p of byPkg.values()) {
    p.advisories.sort((a, b) => rankOf(b.severity) - rankOf(a.severity));
  }
  const topPkgs = [...byPkg.values()]
    .sort((a, b) => rankOf(b.worst) - rankOf(a.worst) || b.count - a.count)
    .slice(0, 10);

  const topPkgsTable = topPkgs.length
    ? [
        "",
        "**Top vulnerable packages**",
        "",
        "| # | Package | Version | Worst severity | Worst advisory | All advisories |",
        "|---:|---|---|---|---|---|",
        ...topPkgs.map((p, i) => {
          const idsList = p.advisories
            .slice(0, 3)
            .map((a) => `[${a.id}](${a.url}) (${a.severity}, [${sourceLabelFor(a.url)} details](${a.url}))`)
            .join(", ");
          const moreIds = p.advisories.length > 3 ? `, +${p.advisories.length - 3}` : "";
          const worstSrc = sourceLabelFor(p.worstUrl);
          return `| ${i + 1} | \`${p.pkg}\` | \`${p.version}\` | **${p.worst.toUpperCase()}** | [${p.worstId}](${p.worstUrl}) · [${worstSrc} details](${p.worstUrl}) | ${p.count} — ${idsList}${moreIds} |`;
        }),
      ].join("\n")
    : "";

  const top = r.blocking
    .slice(0, 10)
    .map(
      (b) =>
        `- [${b.severity.toUpperCase()}] \`${b.pkg}@${b.version}\` — [${b.id}](${b.url}) · [${sourceLabelFor(b.url)} advisory details](${b.url})  \n  ${b.summary}`,
    )
    .join("\n");
  const more =
    r.blocking.length > 10
      ? `\n\n_…and ${r.blocking.length - 10} more — see the [\`security-audit-${sha}\`](${artifactUrl}) artifact._`
      : "";

  const body = [
    MARKER,
    `### 🔐 Security scan — gate: ${sev(r.minSeverity)}+`,
    "",
    gateBadge,
    "",
    status,
    "",
    `**Active \`minSeverity\` gate:** ${sev(r.minSeverity)}${overrideNote}.`,
    `**JSON report:** ⬇️ [Download \`security-audit-${sha}.zip\`](${artifactUrl}) (contains \`dist/security-audit.json\` + \`dist/security-audit.log\`).`,
    "",
    `| Blocking | Sub-threshold | Suppressed | Packages | Advisories |`,
    `|---:|---:|---:|---:|---:|`,
    `| ${t.blocking} | ${t.informational} | ${t.ignored} | ${t.packagesScanned} | ${t.uniqueAdvisories} |`,
    topPkgsTable,
    "",
    r.blocking.length > 0
      ? `<details><summary>Blocking findings (raw advisory list)</summary>\n\n${top}${more}\n\n</details>`
      : "",
    "",
    `_Artifact: [⬇️ download](${artifactUrl}) · [Workflow run](${runUrl}) · Scan exit: \`${exitCode}\` · Commit: \`${sha}\`_`,
  ].join("\n");

  return { marker: MARKER, body };
}
