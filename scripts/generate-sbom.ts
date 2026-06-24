#!/usr/bin/env bun
/**
 * Generates a CycloneDX 1.5 SBOM (Software Bill of Materials) at
 * dist/sbom.cdx.json from the installed dependency tree.
 *
 * - Runs as part of the production build (postbuild) and in CI.
 * - Captures name, version, package URL (purl) and license for every
 *   resolved npm package under node_modules/, including transitives.
 * - Ships into the deployed artifact so we have an immutable audit
 *   trail of exactly what code is running in production.
 *
 * Output is committed-free; CI uploads it as a build artifact.
 */
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";

const ROOT = process.cwd();
const NM = join(ROOT, "node_modules");
const OUT_DIR = join(ROOT, "dist");
const OUT = join(OUT_DIR, "sbom.cdx.json");

type Pkg = {
  name: string;
  version: string;
  license?: string | { type?: string };
  licenses?: Array<{ license?: { type?: string } } | { type?: string }>;
  description?: string;
  homepage?: string;
  repository?: string | { url?: string };
};

function* walk(dir: string): Generator<string> {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    if (e === ".bin" || e === ".cache" || e === ".vite") continue;
    const full = join(dir, e);
    if (e.startsWith("@")) {
      yield* walk(full);
      continue;
    }
    const pkgJson = join(full, "package.json");
    if (existsSync(pkgJson)) {
      yield pkgJson;
    }
    const nested = join(full, "node_modules");
    if (existsSync(nested)) yield* walk(nested);
  }
}

function normaliseLicense(p: Pkg): string {
  if (typeof p.license === "string") return p.license;
  if (p.license && typeof p.license === "object" && "type" in p.license) {
    return (p.license as { type?: string }).type ?? "UNKNOWN";
  }
  if (Array.isArray(p.licenses) && p.licenses.length > 0) {
    const first = p.licenses[0] as { license?: { type?: string }; type?: string };
    return first.license?.type ?? first.type ?? "UNKNOWN";
  }
  return "UNKNOWN";
}

function purl(name: string, version: string): string {
  const [scope, bare] = name.startsWith("@") ? name.slice(1).split("/") : [null, name];
  const encScope = scope ? `@${encodeURIComponent(scope)}/` : "";
  return `pkg:npm/${encScope}${encodeURIComponent(bare)}@${encodeURIComponent(version)}`;
}

function repoUrl(p: Pkg): string | undefined {
  if (!p.repository) return undefined;
  return typeof p.repository === "string" ? p.repository : p.repository.url;
}

const components = new Map<string, Record<string, unknown>>();

for (const pkgJsonPath of walk(NM)) {
  let pkg: Pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as Pkg;
  } catch {
    continue;
  }
  if (!pkg.name || !pkg.version) continue;
  const key = `${pkg.name}@${pkg.version}`;
  if (components.has(key)) continue;

  const license = normaliseLicense(pkg);
  const ref = purl(pkg.name, pkg.version);
  components.set(key, {
    type: "library",
    "bom-ref": ref,
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    purl: ref,
    licenses: license === "UNKNOWN" ? undefined : [{ license: { id: license } }],
    externalReferences: [
      pkg.homepage ? { type: "website", url: pkg.homepage } : undefined,
      repoUrl(pkg) ? { type: "vcs", url: repoUrl(pkg) } : undefined,
    ].filter(Boolean),
  });
}

const root = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as Pkg;
const buildId = process.env.BUILD_ID ?? process.env.GITHUB_SHA ?? new Date().toISOString();
const componentList = [...components.values()].sort((a, b) =>
  String(a.name).localeCompare(String(b.name)),
);

const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  serialNumber: `urn:uuid:${randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: [{ vendor: "phlabs", name: "generate-sbom", version: "1.0.0" }],
    component: {
      type: "application",
      "bom-ref": `pkg:app/${root.name}@${buildId}`,
      name: root.name,
      version: buildId,
    },
    properties: [
      { name: "phlabs:buildId", value: buildId },
      { name: "phlabs:domain", value: "phlabs.co.uk" },
      { name: "phlabs:componentCount", value: String(componentList.length) },
    ],
  },
  components: componentList,
};

mkdirSync(OUT_DIR, { recursive: true });
const json = JSON.stringify(sbom, null, 2);
writeFileSync(OUT, json);
const hash = createHash("sha256").update(json).digest("hex");
writeFileSync(`${OUT}.sha256`, `${hash}  sbom.cdx.json\n`);

console.log(
  `✔ SBOM written: ${OUT} (${componentList.length} components, sha256=${hash.slice(0, 12)}…)`,
);

// Self-validate the SBOM we just wrote. If it doesn't match the
// CycloneDX schema we expect, refuse — a broken SBOM must never be
// signed, attested or shipped.
import("node:child_process").then(({ spawnSync }) => {
  const here = new URL(".", import.meta.url).pathname;
  const r = spawnSync("bun", [join(here, "validate-sbom.ts"), OUT], {
    stdio: "inherit",
  });
  if (r.status !== 0) {
    console.error("✗ SBOM failed CycloneDX validation — refusing to ship.");
    process.exit(r.status ?? 1);
  }
});
