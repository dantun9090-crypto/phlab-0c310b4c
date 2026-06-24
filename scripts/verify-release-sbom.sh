#!/usr/bin/env bash
#
# End-to-end local verification of an SBOM bundle attached to a GitHub
# Release, with **no access to the CI runs required**.
#
# What it does:
#   1. Downloads every sbom.cdx.json* asset from the given release tag.
#   2. Re-computes SHA-256 of the SBOM and checks it against the
#      published .sha256 manifest.
#   3. Verifies the cosign detached signature.
#   4. Verifies the SLSA Provenance v1 attestation.
#   5. Verifies the CycloneDX SBOM attestation.
#   6. Prints the SLSA Provenance fields (repo, commit SHA, ref,
#      workflow, run ID, build ID) so you can confirm the SBOM came
#      from the build you expect.
#
# Requirements: cosign v2+, gh CLI (authenticated), jq.
#
# Usage:
#   scripts/verify-release-sbom.sh <tag> [<repo>]
#
#   <tag>   GitHub Release tag, e.g. v1.2.3
#   <repo>  optional owner/name, defaults to $GH_REPO or "phlabs-uk/phlabs"
#
# Example:
#   scripts/verify-release-sbom.sh v1.2.3
#   scripts/verify-release-sbom.sh v1.2.3 phlabs-uk/phlabs

set -euo pipefail

TAG="${1:-}"
REPO="${2:-${GH_REPO:-phlabs-uk/phlabs}}"

if [ -z "$TAG" ]; then
  echo "Usage: $0 <release-tag> [<owner/repo>]" >&2
  exit 2
fi

for bin in cosign gh jq sha256sum; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "✗ Missing required tool: $bin" >&2
    exit 1
  fi
done

WORK="$(mktemp -d -t sbom-verify-XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

echo "→ Downloading SBOM bundle for $REPO release $TAG into $WORK"
gh release download "$TAG" --repo "$REPO" \
  --pattern 'sbom.cdx.json*' \
  --dir "$WORK"

cd "$WORK"

echo
echo "→ Files downloaded:"
ls -la

echo
echo "→ [1/4] Verifying SHA-256"
sha256sum -c sbom.cdx.json.sha256

# Identity regex: any of our signing workflows in this repo, signed via
# GitHub Actions OIDC.
IDENTITY_REGEX="^https://github\.com/${REPO}/\.github/workflows/(ci|security-scan|post-deploy-scan|release)\.yml@"
ISSUER="https://token.actions.githubusercontent.com"

echo
echo "→ [2/4] Verifying cosign detached signature"
cosign verify-blob \
  --certificate sbom.cdx.json.pem \
  --signature   sbom.cdx.json.sig \
  --certificate-identity-regexp "$IDENTITY_REGEX" \
  --certificate-oidc-issuer "$ISSUER" \
  sbom.cdx.json

echo
echo "→ [3/4] Verifying SLSA Provenance v1 attestation"
cosign verify-blob-attestation \
  --signature sbom.cdx.json.provenance.intoto.jsonl \
  --type slsaprovenance1 \
  --certificate-identity-regexp "$IDENTITY_REGEX" \
  --certificate-oidc-issuer "$ISSUER" \
  sbom.cdx.json

echo
echo "→ [4/4] Verifying CycloneDX SBOM attestation"
cosign verify-blob-attestation \
  --signature sbom.cdx.json.cyclonedx.intoto.jsonl \
  --type cyclonedx \
  --certificate-identity-regexp "$IDENTITY_REGEX" \
  --certificate-oidc-issuer "$ISSUER" \
  sbom.cdx.json

echo
echo "→ SLSA Provenance — bound build metadata"
# Each line of the .intoto.jsonl is a DSSE envelope; the payload field
# is base64-encoded JSON containing the in-toto statement.
PROV_PAYLOAD="$(head -n1 sbom.cdx.json.provenance.intoto.jsonl | jq -r '.payload' | base64 -d)"

SUBJECT_HASH="$(printf '%s' "$PROV_PAYLOAD" | jq -r '.subject[0].digest.sha256')"
ACTUAL_HASH="$(sha256sum sbom.cdx.json | awk '{print $1}')"

printf '  %-22s %s\n' 'subject sha256:' "$SUBJECT_HASH"
printf '  %-22s %s\n' 'actual SBOM sha256:' "$ACTUAL_HASH"
if [ "$SUBJECT_HASH" != "$ACTUAL_HASH" ]; then
  echo "✗ Subject digest in attestation does NOT match the SBOM you downloaded." >&2
  exit 1
fi

printf '%s' "$PROV_PAYLOAD" | jq -r '
  .predicate as $p
  | [
      ["builder",     $p.runDetails.builder.id // "?"],
      ["invocation",  $p.runDetails.metadata.invocationId // "?"],
      ["repository",  $p.buildDefinition.externalParameters.workflow.repository // "?"],
      ["ref",         $p.buildDefinition.externalParameters.workflow.ref // "?"],
      ["workflow",    $p.buildDefinition.externalParameters.workflow.path // "?"],
      ["commit SHA",  ($p.buildDefinition.resolvedDependencies[0].digest.gitCommit // "?")],
      ["event",       $p.buildDefinition.internalParameters.github.event_name // "?"],
      ["buildId",     ($p.runDetails.byproducts[0].annotations.buildId // "?")]
    ]
  | .[] | "  \(.[0] | . + ":" | . + (" " * (22 - length)))\(.[1])"
'

echo
echo "✔ All verifications passed for $REPO @ $TAG"
echo "  SBOM, signature, SLSA Provenance, and CycloneDX attestations all"
echo "  bind to the workflow run + commit shown above."
