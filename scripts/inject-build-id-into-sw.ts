/**
 * Post-build: rewrite the kill-switch service workers in `dist/` so their
 * internal BUILD_ID matches the app BUILD_ID from vite.config.ts.
 *
 * We don't run a live runtime SW — public/sw.js + public/service-worker.js
 * are same-path replacements that unregister old Workbox/app-shell SWs and
 * evict their caches. Keying the constant to the current build makes the
 * cache-name check (`isStaleAppShellCache`) treat every previous build's
 * caches as stale, so a new deploy invalidates them exactly once.
 *
 * Runs from `build:post`. No-ops if the files don't exist.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Match the runtime BUILD_ID format used by vite.config.ts (define →
// __BUILD_ID__). CI overrides via env; fall back to a fresh timestamp so
// local builds also rotate.
const BUILD_ID =
  process.env.PHLABS_BUILD_ID ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const targets = ["dist/sw.js", "dist/service-worker.js"];
let patched = 0;

for (const rel of targets) {
  const abs = resolve(process.cwd(), rel);
  if (!existsSync(abs)) continue;
  const src = readFileSync(abs, "utf8");
  // Both files declare a `const BUILD_ID = 'phlabs-...-v3';` on their first
  // few lines. Swap the literal for the current build. We intentionally
  // preserve the `phlabs-` prefix so `isAppShellCache()` regex keeps matching.
  const next = src.replace(
    /const\s+BUILD_ID\s*=\s*['"]([^'"]+)['"];/,
    `const BUILD_ID = 'phlabs-${BUILD_ID}';`,
  );
  if (next !== src) {
    writeFileSync(abs, next, "utf8");
    patched++;
    console.log(`[sw-build-id] patched ${rel} → phlabs-${BUILD_ID}`);
  } else {
    console.warn(`[sw-build-id] no BUILD_ID literal found in ${rel}`);
  }
}

console.log(`[sw-build-id] ${patched} file(s) patched.`);
