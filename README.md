# PH Labs — phlabs.co.uk

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

#### One-shot helper

`scripts/verify-attestations.sh` runs the signature check **and** both
attestation checks, writing a Markdown report and emitting GitHub
annotations on failure:

```bash
bash scripts/verify-attestations.sh ./sbom ci
# or release | security-scan | post-deploy-scan, depending on origin
```

Exit code `0` = all three checks passed. Non-zero = the script tells
you exactly which check failed and why.

### Required PR checks

The CI pipeline runs a dedicated **`Attestation verify (SLSA +
CycloneDX)`** job that downloads the freshly-built SBOM and re-runs all
three cosign verifications. Branch protection on `main` requires this
check to pass before any PR can merge, so a broken signing chain blocks
merge with the failing cosign output surfaced as a red check.

To enable on a new branch protection ruleset:
*Settings → Rules → Branch protection → Require status checks → add*
`Attestation verify (SLSA + CycloneDX)`.
