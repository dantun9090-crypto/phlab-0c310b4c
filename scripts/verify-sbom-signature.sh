#!/usr/bin/env bash
#
# Verify a cosign-signed SBOM artifact downloaded from a GitHub Actions
# build (CI / security-scan / post-deploy-scan workflows).
#
# Usage:
#   scripts/verify-sbom-signature.sh <dir-with-artifact>
#
# Expects these files in <dir>:
#   sbom.cdx.json
#   sbom.cdx.json.sig    (detached signature, produced by cosign sign-blob)
#   sbom.cdx.json.pem    (ephemeral Fulcio cert, bound to the workflow's
#                         GitHub OIDC identity; logged in Rekor)
#
# Requires: cosign v2+  (https://github.com/sigstore/cosign)
#
# Exit codes:
#   0  signature valid, cert issued by GitHub Actions OIDC, in Rekor
#   1  verification failed (tampered SBOM, wrong issuer, or missing files)

set -euo pipefail

DIR="${1:-dist}"
SBOM="$DIR/sbom.cdx.json"
SIG="$SBOM.sig"
CERT="$SBOM.pem"

for f in "$SBOM" "$SIG" "$CERT"; do
  if [ ! -f "$f" ]; then
    echo "✗ Missing: $f" >&2
    exit 1
  fi
done

if ! command -v cosign >/dev/null 2>&1; then
  echo "✗ cosign not installed. See https://docs.sigstore.dev/cosign/installation/" >&2
  exit 1
fi

# Default identity regex matches any of our three signing workflows.
# Override with COSIGN_IDENTITY_REGEX for a stricter check.
IDENTITY_REGEX="${COSIGN_IDENTITY_REGEX:-^https://github\.com/.*/\.github/workflows/(ci|security-scan|post-deploy-scan)\.yml@}"

cosign verify-blob \
  --certificate "$CERT" \
  --signature "$SIG" \
  --certificate-identity-regexp "$IDENTITY_REGEX" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  "$SBOM"

echo "✔ SBOM signature valid (cosign keyless, Rekor-logged)"
