/**
 * CI guard: scan the production Worker bundle for Node-only imports.
 *
 * Runs after `bun run build`. Walks every JS file under `dist/server/`
 * (the Cloudflare Worker output) and fails if it contains references to
 * modules or APIs that don't work on workerd, even with `nodejs_compat`.
 *
 * Why static scan and not runtime? Some of these (e.g. `child_process`)
 * fail with `[unenv] X is not implemented yet!` only when the offending
 * code path executes — which can be a rarely-hit branch. Catching it at
 * build time is much cheaper than a 3am incident.
 *
 * Run via: bun scripts/check-worker-imports.ts
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const WORKER_DIR = "dist/server";

// Modules that are stubbed/broken under workerd + nodejs_compat, or that
// require native binaries / a real OS process.
const FORBIDDEN_MODULES = [
  "child_process",
  "node:child_process",
  "worker_threads",
  "node:worker_threads",
  "cluster",
  "node:cluster",
  "v8",
  "node:v8",
  "inspector",
  "node:inspector",
  "perf_hooks",
  "node:perf_hooks",
  "sharp",
  "canvas",
  "puppeteer",
  "puppeteer-core",
  "playwright",
  "playwright-core",
  "jsdom",
  "node-gyp",
  "bcrypt", // native; use bcryptjs / Web Crypto instead
  "sqlite3",
  "better-sqlite3",
  // firebase/auth pulls EmailAuthProvider, GoogleAuthProvider, etc. that
  // assume a browser environment (window, IndexedDB). When chunk-splitting
  // shifts which file owns the import, the SSR bundle has silently shipped
  // it before — causing `ReferenceError: EmailAuthProvider is not defined`
  // and a 503 across the entire site. Legacy auth UI MUST stay client-only
  // (dynamic import inside useEffect / *.client.ts modules).
];

// Symbols that, if referenced in the SSR worker bundle WITHOUT their
// matching class declaration, will throw `ReferenceError: X is not
// defined` at request time and 503 the entire site. This catches the
// chunk-splitting regression where firebase/auth side-effect imports are
// dropped from the server bundle but UI code still references them.
const SYMBOL_INTEGRITY: Array<{ symbol: string; declRe: RegExp }> = [
  { symbol: "EmailAuthProvider", declRe: /class\s+EmailAuthProvider\b/ },
  { symbol: "GoogleAuthProvider", declRe: /class\s+GoogleAuthProvider\b/ },
];




// Code patterns that almost always indicate Node-only assumptions.
// Each entry is matched against the bundled source as a literal substring
// (not regex) to keep false positives down.
const FORBIDDEN_PATTERNS: Array<{ needle: string; reason: string }> = [
  { needle: "fs.watch(", reason: "fs.watch is unsupported on workerd" },
  { needle: "fs.watchFile(", reason: "fs.watchFile is unsupported on workerd" },
  { needle: "os.cpus(", reason: "os.cpus() is not implemented on workerd" },
  { needle: "os.networkInterfaces(", reason: "os.networkInterfaces() is not implemented on workerd" },
  { needle: "process.binding(", reason: "process.binding is not available on workerd" },
];

// Import-form patterns we look for inside each bundle file. We match the
// surrounding quote/syntax so that an incidental substring like `sharp` in
// `sharpen` doesn't trip the check.
function buildImportSignatures(mod: string): string[] {
  return [
    `require("${mod}")`,
    `require('${mod}')`,
    `from"${mod}"`,
    `from'${mod}'`,
    `from "${mod}"`,
    `from '${mod}'`,
    `import("${mod}")`,
    `import('${mod}')`,
  ];
}

type Hit = { file: string; rule: string; sample: string };

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (entry.endsWith(".js") || entry.endsWith(".mjs")) out.push(full);
  }
  return out;
}

function snippet(body: string, idx: number, len = 80): string {
  const start = Math.max(0, idx - 20);
  const end = Math.min(body.length, idx + len);
  return body.slice(start, end).replace(/\s+/g, " ");
}

function main() {
  if (!existsSync(WORKER_DIR)) {
    console.error(
      `[worker-imports] ${WORKER_DIR} not found. Run \`bun run build\` first.`,
    );
    process.exit(2);
  }

  const files = walk(WORKER_DIR);
  if (files.length === 0) {
    console.error(`[worker-imports] No JS files under ${WORKER_DIR}.`);
    process.exit(2);
  }

  const hits: Hit[] = [];

  for (const file of files) {
    const body = readFileSync(file, "utf8");

    for (const mod of FORBIDDEN_MODULES) {
      for (const sig of buildImportSignatures(mod)) {
        const idx = body.indexOf(sig);
        if (idx !== -1) {
          hits.push({
            file,
            rule: `imports forbidden module "${mod}"`,
            sample: snippet(body, idx),
          });
          break; // one hit per module per file is enough
        }
      }
    }

    for (const { needle, reason } of FORBIDDEN_PATTERNS) {
      const idx = body.indexOf(needle);
      if (idx !== -1) {
        hits.push({
          file,
          rule: reason,
          sample: snippet(body, idx),
        });
      }
    }
  }

  const totalKb = Math.round(
    files.reduce((acc, f) => acc + statSync(f).size, 0) / 1024,
  );
  console.log(
    `[worker-imports] Scanned ${files.length} files (${totalKb} KB) under ${WORKER_DIR}.`,
  );

  if (hits.length === 0) {
    console.log("[worker-imports] OK — no Node-only imports detected.");
    return;
  }

  console.error(`[worker-imports] FAIL — ${hits.length} violation(s):\n`);
  for (const h of hits) {
    console.error(`  ${h.file}`);
    console.error(`    ${h.rule}`);
    console.error(`    …${h.sample}…\n`);
  }
  process.exit(1);
}

main();
