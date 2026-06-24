# PH Labs — phlabs.co.uk

<!-- security-scan-status:start -->
[![Security scan](https://github.com/phlabs-uk/phlabs/actions/workflows/security-scan.yml/badge.svg?branch=main)](https://github.com/phlabs-uk/phlabs/actions/workflows/security-scan.yml?query=branch%3Amain)

Live pass/fail of the `Security scan (deps)` workflow on `main` —
dependency audit (configurable `minSeverity` gate via
`.security-config.json`), CycloneDX SBOM, cosign keyless signing,
and SLSA v1.0 Provenance + CycloneDX attestations.
<!-- security-scan-status:end -->

> **Branch protection (required):** the
> `Dependency vulnerability scan` job from `security-scan.yml` MUST
> be listed as a required status check on the `main` branch so PRs
> can't merge when the audit gate fails. Apply once with `gh`:
>
> ```bash
> gh api -X PUT repos/phlabs-uk/phlabs/branches/main/protection \
>   --input scripts/branch-protection.json
> ```
>
> The ruleset is checked in at `scripts/branch-protection.json` and
> already requires `Dependency vulnerability scan` +
> `Attestation verify (SLSA + CycloneDX)`.

<!-- sbom-status:start -->
![sbom: pending](https://img.shields.io/badge/SBOM-pending%20first%20verified%20release-lightgrey?logo=sigstore&logoColor=white)

The SBOM status badge above is rewritten on every release by
`scripts/update-release-badge.sh`, driven by the
`Attestation verify (release)` job. Green = signature + SLSA
Provenance + CycloneDX attestation all verified for the latest tag.
<!-- sbom-status:end -->

UK research-use-only peptide e-commerce, built on TanStack Start +
Cloudflare Workers + Firebase. Canonical host: <https://phlabs.co.uk>
(apex, no www).

---



## Supply-chain transparency: SBOM + cosign attestations

Every production build emits a **CycloneDX 1.5 SBOM** of the exact
dependency tree that would ship to phlabs.co.uk, plus three Sigstore
artefacts produced by `cosign` (keyless OIDC → Fulcio → Rekor):

| File | What it proves |
| ---- | -------------- |
| `sbom.cdx.json` | The bill of materials (every npm package + version + license). |
| `sbom.cdx.json.sha256` | Plain SHA-256 of the SBOM file. |
| `sbom.cdx.json.sig` + `.pem` | Detached **signature** binding the SBOM bytes to the workflow run. |
| `sbom.cdx.json.provenance.intoto.jsonl` + `.pem` | **SLSA v1.0 Provenance attestation** — binds the SBOM to repo, commit SHA, ref, workflow path, run ID and BUILD_ID. |
| `sbom.cdx.json.cyclonedx.intoto.jsonl` + `.pem` | **CycloneDX SBOM attestation** — wraps the SBOM itself as the predicate, for tools that consume attested SBOMs. |

All signatures are publicly logged in the [Rekor transparency log](https://search.sigstore.dev/).

### Where to get the artefacts

Two channels — pick the one you have access to:

1. **GitHub Releases (recommended, long-lived).** Every published
   release has the full SBOM bundle attached by the
   [`Release SBOM assets`](.github/workflows/release.yml) workflow.
2. **CI run artifacts (90 / 180 days).** Each run of
   [`CI`](.github/workflows/ci.yml),
   [`Security scan (deps)`](.github/workflows/security-scan.yml) and
   [`Post-deploy security check`](.github/workflows/post-deploy-scan.yml)
   uploads the bundle as a workflow artifact.

### Step-by-step verification

You need [`cosign`](https://docs.sigstore.dev/cosign/installation/) v2+
and the GitHub CLI (`gh`).

#### 1. Download the SBOM bundle

**From a release** (replace `v1.2.3` with your tag):

```bash
mkdir -p sbom
gh release download v1.2.3 \
  --repo phlabs-uk/phlabs \
  --pattern 'sbom.cdx.json*' \
  --dir ./sbom
```

**From a CI run** (replace `<run-id>` with the Actions run ID, visible
in the URL of any workflow run):

```bash
mkdir -p sbom
gh run download <run-id> \
  --repo phlabs-uk/phlabs \
  --name "sbom-$(gh run view <run-id> --json headSha -q .headSha)" \
  --dir ./sbom
```

You should end up with these files in `./sbom/`:

```
sbom.cdx.json
sbom.cdx.json.sha256
sbom.cdx.json.sig
sbom.cdx.json.pem
sbom.cdx.json.provenance.json
sbom.cdx.json.provenance.intoto.jsonl
sbom.cdx.json.provenance.pem
sbom.cdx.json.cyclonedx.intoto.jsonl
sbom.cdx.json.cyclonedx.pem
```

#### 2. Confirm the SHA-256 matches

```bash
cd sbom && sha256sum -c sbom.cdx.json.sha256
```

#### 3. Verify the detached signature

The certificate identity must come from one of our signing workflows
(`ci`, `security-scan`, `post-deploy-scan`, or `release`) running in
this repo, and the issuer must be GitHub Actions OIDC:

```bash
cosign verify-blob \
  --certificate sbom.cdx.json.pem \
  --signature   sbom.cdx.json.sig \
  --certificate-identity-regexp '^https://github\.com/phlabs-uk/phlabs/\.github/workflows/(ci|security-scan|post-deploy-scan|release)\.yml@' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  sbom.cdx.json
```

Expected: `Verified OK`.

#### 4. Verify the SLSA Provenance attestation

Proves the SBOM came from a specific repo + commit + workflow run:

```bash
cosign verify-blob-attestation \
  --signature sbom.cdx.json.provenance.intoto.jsonl \
  --type slsaprovenance1 \
  --certificate-identity-regexp '^https://github\.com/phlabs-uk/phlabs/\.github/workflows/(ci|security-scan|post-deploy-scan|release)\.yml@' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  sbom.cdx.json
```

Expected: `Verified OK`.

To inspect the bound build metadata (commit SHA, workflow ref, run ID,
build ID):

```bash
jq -r '.payload' sbom.cdx.json.provenance.intoto.jsonl \
  | base64 -d \
  | jq '.predicate.runDetails.builder, .predicate.buildDefinition.resolvedDependencies'
```

#### 5. Verify the CycloneDX SBOM attestation

Same identity check, different predicate type:

```bash
cosign verify-blob-attestation \
  --signature sbom.cdx.json.cyclonedx.intoto.jsonl \
  --type cyclonedx \
  --certificate-identity-regexp '^https://github\.com/phlabs-uk/phlabs/\.github/workflows/(ci|security-scan|post-deploy-scan|release)\.yml@' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  sbom.cdx.json
```

Expected: `Verified OK`.

#### One-shot helper (already-downloaded bundle)

`scripts/verify-attestations.sh` runs the signature check **and** both
attestation checks against a directory of files you already have, writing
a Markdown report and emitting GitHub annotations on failure:

```bash
bash scripts/verify-attestations.sh ./sbom ci
# or release | security-scan | post-deploy-scan, depending on origin
```

Exit code `0` = all three checks passed. Non-zero = the script tells
you exactly which check failed and why.

#### End-to-end helper (download + verify from a Release, no CI access)

`scripts/verify-release-sbom.sh` is the offline-friendly path: it does
the `gh release download`, SHA-256 check, all three cosign verifications,
**and** prints the SLSA Provenance fields so you can confirm the SBOM
was built by the commit you expect. **You do not need access to the CI
runs** — only to the GitHub Release.

```bash
# Requires: cosign v2+, gh (authenticated), jq, sha256sum
scripts/verify-release-sbom.sh v1.2.3
# or against a different repo:
scripts/verify-release-sbom.sh v1.2.3 phlabs-uk/phlabs
```

#### Fully offline verification (no `gh`, no network to GitHub)

If you already have the release assets on disk (e.g. someone emailed
you a zip, or you mirrored the release), use `--offline <dir>`:

```bash
# Only needs: cosign v2+, jq, sha256sum, bun (for SBOM schema check)
scripts/verify-release-sbom.sh --offline ./downloaded-sbom phlabs-uk/phlabs v1.2.3
```

This path performs zero GitHub API calls — it just inspects the files
in the directory you point it at. Identical checks: CycloneDX schema
validation, SHA-256, cosign signature, SLSA Provenance v1, CycloneDX
attestation, subject-digest binding, **strict phlab identity pinning**
(issuer = GitHub Actions OIDC, builder = `https://github.com/<repo>/actions/runs/…`,
workflow path ∈ `{ci, security-scan, post-deploy-scan, release}.yml`).

#### `sbom-verification-report.json`

Every run of `verify-release-sbom.sh` (online or offline) writes a
machine-readable report next to the bundle:

```json
{
  "tag": "v1.2.3",
  "repo": "phlabs-uk/phlabs",
  "mode": "offline",
  "verifiedAt": "2026-06-24T11:22:33Z",
  "summary": { "pass": 11, "fail": 0, "status": "green" },
  "subjectDigest": "…sha256 of sbom.cdx.json…",
  "attestedSubjectDigest": "…must equal subjectDigest…",
  "cyclonedxSubjectDigest": "…must equal subjectDigest…",
  "slsaProvenance": {
    "repository": "https://github.com/phlabs-uk/phlabs",
    "ref": "refs/tags/v1.2.3",
    "workflow": ".github/workflows/release.yml",
    "builder":  "https://github.com/phlabs-uk/phlabs/actions/runs/…",
    "commitSha": "…40-hex…",
    "event": "release",
    "buildId": "…"
  },
  "checks": { "cosign-signature": { "status": "pass", "detail": "Verified OK" }, "…": {} }
}
```

The release workflow uploads this file as a release asset
(`sbom-verification-report.json`), so a reviewer can confirm the
green/red status without re-running anything. The same file is appended
verbatim to the GitHub Step Summary on the release run.

The script prints something like:


```
→ SLSA Provenance — bound build metadata
  subject sha256:        [the SBOM's hash]
  actual SBOM sha256:    [must match — checked]
  builder:               https://github.com/phlabs-uk/phlabs/actions/runs/12345/attempts/1
  invocation:            https://github.com/phlabs-uk/phlabs/actions/runs/12345/attempts/1
  repository:            https://github.com/phlabs-uk/phlabs
  ref:                   refs/tags/v1.2.3
  workflow:              .github/workflows/release.yml
  commit SHA:            abc1234...
  event:                 release
  buildId:               abc1234...
```

### Inspecting SLSA Provenance fields manually

If you want to read the provenance yourself without running the helper,
each `.provenance.intoto.jsonl` file is a DSSE envelope. The `payload`
field is base64-encoded JSON containing the in-toto statement. Decode
once, then read fields with `jq`:

```bash
PROV=$(jq -r '.payload' sbom.cdx.json.provenance.intoto.jsonl | base64 -d)

# Repo + ref + workflow file that produced this SBOM:
echo "$PROV" | jq '.predicate.buildDefinition.externalParameters.workflow'

# Git commit SHA the build was cut from:
echo "$PROV" | jq -r '.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit'

# Builder identity (full GitHub Actions run URL — repo + run ID + attempt):
echo "$PROV" | jq -r '.predicate.runDetails.builder.id'

# BUILD_ID that the SBOM generator recorded:
echo "$PROV" | jq -r '.predicate.runDetails.byproducts[0].annotations.buildId'

# Subject hash (must equal sha256sum of the SBOM file you have):
echo "$PROV" | jq -r '.subject[0].digest.sha256'
sha256sum sbom.cdx.json
```

What each field tells you:

| Field | Where it lives | What it proves |
| --- | --- | --- |
| `subject[0].digest.sha256` | top of statement | Which exact SBOM file this attestation is for. Must equal `sha256sum sbom.cdx.json`. |
| `predicate.buildDefinition.externalParameters.workflow.repository` | provenance | The GitHub repo that ran the build. |
| `…workflow.ref` | provenance | The git ref (branch or tag) at build time. |
| `…workflow.path` | provenance | The workflow file (`ci.yml`, `release.yml`, etc.). |
| `predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit` | provenance | The commit SHA the build was cut from. |
| `predicate.runDetails.builder.id` | provenance | Full URL of the specific Actions run + attempt that produced the SBOM. Click it to view the run. |
| `predicate.runDetails.byproducts[0].annotations.buildId` | provenance | Our `BUILD_ID` (usually the same commit SHA). |

If any of those don't match the release you think you have, **do not
trust the SBOM** — open a security issue.

### Required PR checks

The CI pipeline runs a dedicated **`Attestation verify (SLSA +
CycloneDX)`** job that downloads the freshly-built SBOM and re-runs all
three cosign verifications. The `release.yml` workflow runs a sibling
**`Attestation verify (release)`** job that re-downloads the bundle
*from the published GitHub Release itself* and re-verifies — so the
release run only goes green if the assets attached to the release are
actually verifiable end-to-end.

Branch protection on `main` requires the PR check to pass before any PR
can merge, so a broken signing chain blocks merge with the failing
cosign output surfaced as a red check. To enable on a new branch
protection ruleset: *Settings → Rules → Branch protection → Require
status checks → add* `Attestation verify (SLSA + CycloneDX)`.

On any verification failure the workflow uploads an
`attestation-debug-<workflow>-<sha>` artifact containing the SBOM
bundle and a sanitised `verify-attestations.log` — Rekor UUIDs, log
indices and internal IDs are redacted — so a reviewer can reproduce
the failure locally without needing access to the workflow run logs.

