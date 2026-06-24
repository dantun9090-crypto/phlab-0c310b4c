#!/usr/bin/env bun
/**
 * Structural / schema validation for our CycloneDX SBOM **before** it is
 * signed and **before** any local verification accepts it.
 *
 * No remote schema fetch — we encode the subset of CycloneDX 1.4–1.6 we
 * care about so this runs offline in CI, in release workflows and on a
 * reviewer's laptop. If any required section is missing or malformed we
 * fail with a clear, line-prefixed error so the bad file never gets
 * signed (and therefore never gets attested).
 *
 * Usage:
 *   bun scripts/validate-sbom.ts [path]
 *   bun scripts/validate-sbom.ts dist/sbom.cdx.json
 *
 * Exit code 0 = valid. Non-zero = invalid (do not sign).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SUPPORTED_SPECS = new Set(["1.4", "1.5", "1.6"]);
const REQUIRED_COMPONENT_FIELDS = ["type", "name", "version", "purl"] as const;
const ALLOWED_COMPONENT_TYPES = new Set([
  "application",
  "framework",
  "library",
  "container",
  "operating-system",
  "device",
  "firmware",
  "file",
]);

const path = resolve(process.argv[2] ?? "dist/sbom.cdx.json");
const errors: string[] = [];
const fail = (msg: string) => errors.push(`✗ ${msg}`);

if (!existsSync(path)) {
  console.error(`✗ SBOM not found: ${path}`);
  process.exit(2);
}

let sbom: Record<string, unknown>;
try {
  sbom = JSON.parse(readFileSync(path, "utf8"));
} catch (e) {
  console.error(`✗ SBOM is not valid JSON: ${(e as Error).message}`);
  process.exit(2);
}

// Top-level CycloneDX envelope
if (sbom.bomFormat !== "CycloneDX") fail(`bomFormat must be "CycloneDX" (got ${JSON.stringify(sbom.bomFormat)})`);
if (typeof sbom.specVersion !== "string" || !SUPPORTED_SPECS.has(sbom.specVersion)) {
  fail(`specVersion must be one of ${[...SUPPORTED_SPECS].join(", ")} (got ${JSON.stringify(sbom.specVersion)})`);
}
if (typeof sbom.serialNumber !== "string" || !/^urn:uuid:[0-9a-f-]{36}$/i.test(sbom.serialNumber)) {
  fail(`serialNumber must be "urn:uuid:<uuid>" (got ${JSON.stringify(sbom.serialNumber)})`);
}
if (typeof sbom.version !== "number" || sbom.version < 1) {
  fail(`version must be a positive integer`);
}

// metadata block
const meta = sbom.metadata as Record<string, unknown> | undefined;
if (!meta || typeof meta !== "object") fail(`metadata: missing`);
else {
  if (typeof meta.timestamp !== "string" || Number.isNaN(Date.parse(meta.timestamp))) {
    fail(`metadata.timestamp: missing or not ISO-8601`);
  }
  const c = meta.component as Record<string, unknown> | undefined;
  if (!c) fail(`metadata.component: missing root application descriptor`);
  else {
    if (c.type !== "application") fail(`metadata.component.type must be "application"`);
    if (typeof c.name !== "string" || !c.name) fail(`metadata.component.name: missing`);
    if (typeof c.version !== "string" || !c.version) fail(`metadata.component.version: missing (BUILD_ID)`);
  }
  const props = (meta.properties ?? []) as Array<{ name?: string; value?: string }>;
  for (const required of ["phlabs:buildId", "phlabs:domain", "phlabs:componentCount"]) {
    if (!props.some((p) => p?.name === required)) {
      fail(`metadata.properties: missing required property "${required}"`);
    }
  }
}

// components array
const comps = sbom.components;
if (!Array.isArray(comps) || comps.length === 0) {
  fail(`components: must be a non-empty array`);
} else {
  const seen = new Set<string>();
  comps.forEach((raw, i) => {
    const c = raw as Record<string, unknown>;
    for (const f of REQUIRED_COMPONENT_FIELDS) {
      if (typeof c[f] !== "string" || !c[f]) fail(`components[${i}].${f}: missing`);
    }
    if (typeof c.type === "string" && !ALLOWED_COMPONENT_TYPES.has(c.type)) {
      fail(`components[${i}].type: "${c.type}" is not a CycloneDX component type`);
    }
    if (typeof c.purl === "string" && !c.purl.startsWith("pkg:")) {
      fail(`components[${i}].purl: must begin with "pkg:" (got ${c.purl})`);
    }
    const key = `${c.name}@${c.version}`;
    if (seen.has(key)) fail(`components[${i}]: duplicate ${key}`);
    seen.add(key);
  });

  // Cross-check declared componentCount matches
  const declared = (meta?.properties as Array<{ name?: string; value?: string }> | undefined)?.find(
    (p) => p?.name === "phlabs:componentCount",
  )?.value;
  if (declared && Number(declared) !== comps.length) {
    fail(`metadata.properties[phlabs:componentCount]=${declared} does not match components.length=${comps.length}`);
  }
}

if (errors.length > 0) {
  console.error(`✗ CycloneDX SBOM validation FAILED for ${path}`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

console.log(
  `✔ CycloneDX SBOM valid: ${path} (spec=${sbom.specVersion}, components=${(comps as unknown[]).length})`,
);
