#!/usr/bin/env bun
/**
 * Emits a SLSA v1.0 Provenance predicate JSON for the freshly built
 * SBOM at dist/sbom.cdx.json. The predicate is then wrapped in an
 * in-toto statement and signed (keyless) via `cosign attest-blob`,
 * producing dist/sbom.cdx.json.provenance.intoto.jsonl.
 *
 * The predicate binds:
 *   - subject  → sha256 of the SBOM blob
 *   - builder  → this GitHub Actions workflow run (URI + run ID)
 *   - source   → repo + git commit SHA + ref that produced the build
 *   - metadata → start/finish times, BUILD_ID
 *
 * Spec: https://slsa.dev/spec/v1.0/provenance
 *
 * Output: dist/sbom.cdx.json.provenance.json (predicate only)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const ROOT = process.cwd();
const SBOM = join(ROOT, "dist", "sbom.cdx.json");
const OUT = `${SBOM}.provenance.json`;

const sbomBytes = readFileSync(SBOM);
const sbomDigest = createHash("sha256").update(sbomBytes).digest("hex");

const repo = process.env.GITHUB_REPOSITORY ?? "local/local";
const serverUrl = process.env.GITHUB_SERVER_URL ?? "https://github.com";
const runId = process.env.GITHUB_RUN_ID ?? "0";
const runAttempt = process.env.GITHUB_RUN_ATTEMPT ?? "1";
const workflowRef =
  process.env.GITHUB_WORKFLOW_REF ??
  `${repo}/.github/workflows/local.yml@refs/heads/local`;
const sha = process.env.GITHUB_SHA ?? "0000000000000000000000000000000000000000";
const ref = process.env.GITHUB_REF ?? "refs/heads/local";
const eventName = process.env.GITHUB_EVENT_NAME ?? "local";
const buildId = process.env.BUILD_ID ?? sha;
const now = new Date().toISOString();

const predicate = {
  buildDefinition: {
    buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
    externalParameters: {
      workflow: {
        ref,
        repository: `${serverUrl}/${repo}`,
        path: workflowRef.split("@")[0]?.replace(`${repo}/`, "") ?? "",
      },
    },
    internalParameters: {
      github: {
        event_name: eventName,
        repository_id: process.env.GITHUB_REPOSITORY_ID ?? "",
        repository_owner_id: process.env.GITHUB_REPOSITORY_OWNER_ID ?? "",
      },
    },
    resolvedDependencies: [
      {
        uri: `git+${serverUrl}/${repo}@${ref}`,
        digest: { gitCommit: sha },
      },
    ],
  },
  runDetails: {
    builder: {
      id: `${serverUrl}/${repo}/actions/runs/${runId}/attempts/${runAttempt}`,
    },
    metadata: {
      invocationId: `${serverUrl}/${repo}/actions/runs/${runId}/attempts/${runAttempt}`,
      startedOn: now,
      finishedOn: now,
    },
    byproducts: [
      {
        name: "sbom.cdx.json",
        uri: `${serverUrl}/${repo}/actions/runs/${runId}`,
        digest: { sha256: sbomDigest },
        annotations: { buildId },
      },
    ],
  },
};

writeFileSync(OUT, JSON.stringify(predicate, null, 2));
console.log(
  `✔ SLSA provenance predicate written: ${OUT} (subject sha256=${sbomDigest.slice(0, 12)}…, commit=${sha.slice(0, 7)}, run=${runId})`,
);
