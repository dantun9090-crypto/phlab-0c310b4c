// Append one row per profile (desktop, mobile) to lighthouse-history.csv
// so /compound performance is tracked across main commits.
//
// Usage: node scripts/lighthouse-history.mjs <artifacts-dir> <csv-path> <sha>

import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const [artifactsDir, csvPath, sha] = process.argv.slice(2);
const HEADER = "date,sha,profile,url,perf,seo,lcp_ms,fcp_ms,tbt_ms,cls,si_ms\n";

if (!existsSync(csvPath)) writeFileSync(csvPath, HEADER);

const date = new Date().toISOString();
const rows = [];

for (const file of readdirSync(artifactsDir)) {
  if (!file.startsWith("lh-") || !file.endsWith(".json")) continue;
  try {
    const data = JSON.parse(readFileSync(join(artifactsDir, file), "utf8"));
    const profile = data.profile ?? "unknown";
    for (const r of data.runs ?? []) {
      rows.push(
        [
          date,
          sha,
          profile,
          r.url,
          r.perf,
          r.seo,
          r.lcp,
          r.fcp,
          r.tbt,
          r.cls,
          r.si,
        ].join(","),
      );
    }
  } catch {
    /* skip */
  }
}

if (rows.length) {
  const existing = readFileSync(csvPath, "utf8");
  writeFileSync(csvPath, existing + rows.join("\n") + "\n");
  console.log(`Appended ${rows.length} row(s) to ${csvPath}`);
} else {
  console.log("No rows to append.");
}
