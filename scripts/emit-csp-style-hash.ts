/**
 * Emits the SHA-256 base64 hash of the inline critical CSS to
 * `dist/csp-style-hashes.txt` (and stdout) so it can be added to the
 * CSP `style-src` directive when we tighten the policy away from
 * `'unsafe-inline'`.
 *
 * Today `style-src` still allows `'unsafe-inline'` in both origin
 * (`src/server.ts`) and Worker (`cloudflare/phlabs-prerender.mjs`),
 * so the inline block already renders CSP-clean. The hash lets us
 * pre-flight the tighter policy without a code change.
 *
 * Run automatically from `build:post` after every `bun run build`.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CRITICAL_CSS } from "../src/lib/critical-css";

const hash = createHash("sha256").update(CRITICAL_CSS, "utf8").digest("base64");
const directiveValue = `'sha256-${hash}'`;
const bytes = Buffer.byteLength(CRITICAL_CSS, "utf8");

const outDir = resolve(process.cwd(), "dist");
try { mkdirSync(outDir, { recursive: true }); } catch { /* dist may already exist */ }

const contents = [
  "# PH Labs — CSP hashes for inline <style> in <head>",
  "# Regenerated on every build from src/lib/critical-css.ts.",
  "# Add to CSP style-src / style-src-elem when removing 'unsafe-inline'.",
  "#",
  `# critical-css bytes: ${bytes}`,
  "",
  `style-src-elem ${directiveValue}`,
  `style-src ${directiveValue}`,
  "",
].join("\n");

writeFileSync(resolve(outDir, "csp-style-hashes.txt"), contents, "utf8");

// Log so CI + local builds surface the value without opening the file.
console.log(`[csp-style-hash] critical-css sha256 → ${directiveValue} (${bytes} bytes)`);
console.log(`[csp-style-hash] wrote dist/csp-style-hashes.txt`);
