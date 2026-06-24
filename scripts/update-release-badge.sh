#!/usr/bin/env bash
#
# Updates the SBOM-attestation status badge in README.md (and optionally
# patches the corresponding GitHub Release notes) based on the result
# of scripts/verify-release-sbom.sh.
#
# It consumes sbom-verification-report.json produced by that script.
#
# Usage:
#   scripts/update-release-badge.sh <report-json> <tag> [--update-release-notes <owner/repo>]
#
# README is patched between markers:
#   <!-- sbom-status:start -->
#   ... badge + tag + verifiedAt ...
#   <!-- sbom-status:end -->
#
# The markers are inserted automatically the first time this script runs.

set -uo pipefail

REPORT="${1:-}"
TAG="${2:-}"
EXTRA="${3:-}"
REPO="${4:-${GH_REPO:-phlabs-uk/phlabs}}"

if [ -z "$REPORT" ] || [ -z "$TAG" ] || [ ! -f "$REPORT" ]; then
  echo "Usage: $0 <report-json> <tag> [--update-release-notes <owner/repo>]" >&2
  exit 2
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "✗ jq required" >&2; exit 1
fi

STATUS="$(jq -r '.summary.status' "$REPORT")"
PASS="$(jq -r '.summary.pass' "$REPORT")"
FAIL="$(jq -r '.summary.fail' "$REPORT")"
WHEN="$(jq -r '.verifiedAt' "$REPORT")"
COMMIT="$(jq -r '.slsaProvenance.commitSha' "$REPORT")"

if [ "$STATUS" = "green" ]; then
  BADGE="![sbom: verified](https://img.shields.io/badge/SBOM%20%40%20${TAG}-verified-2ea44f?logo=sigstore&logoColor=white)"
  HUMAN="✅ SBOM attestations verified for \`$TAG\` ($PASS checks passed, $FAIL failed) at $WHEN."
else
  BADGE="![sbom: failed](https://img.shields.io/badge/SBOM%20%40%20${TAG}-failed-d73a49?logo=sigstore&logoColor=white)"
  HUMAN="❌ SBOM attestation verification FAILED for \`$TAG\` ($PASS passed, $FAIL failed) at $WHEN. Do **not** trust this release."
fi

BLOCK=$(cat <<EOF
<!-- sbom-status:start -->
$BADGE

$HUMAN

- Tag: \`$TAG\`
- Commit: \`$COMMIT\`
- Report: \`sbom-verification-report.json\` (attached to the GitHub Release)
<!-- sbom-status:end -->
EOF
)

README="README.md"
if [ ! -f "$README" ]; then
  echo "✗ $README not found" >&2; exit 1
fi

if grep -q '<!-- sbom-status:start -->' "$README"; then
  # Replace block in place using awk (portable, no GNU-only sed flags)
  TMP="$(mktemp)"
  awk -v block="$BLOCK" '
    BEGIN { inblk=0 }
    /<!-- sbom-status:start -->/ { print block; inblk=1; next }
    /<!-- sbom-status:end -->/   { inblk=0; next }
    inblk==0 { print }
  ' "$README" > "$TMP"
  mv "$TMP" "$README"
  echo "✔ Updated SBOM status block in $README"
else
  # First run: prepend block after the H1
  TMP="$(mktemp)"
  awk -v block="$BLOCK" '
    NR==1 { print; print ""; print block; print ""; next }
    { print }
  ' "$README" > "$TMP"
  mv "$TMP" "$README"
  echo "✔ Inserted SBOM status block into $README"
fi

# Optionally patch GitHub Release notes
if [ "$EXTRA" = "--update-release-notes" ]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "⚠ gh CLI not available; skipping release-notes update" >&2
    exit 0
  fi
  CURRENT="$(gh release view "$TAG" --repo "$REPO" --json body --jq '.body' 2>/dev/null || true)"
  STRIPPED="$(printf '%s' "$CURRENT" | awk '
    BEGIN { skip=0 }
    /<!-- sbom-status:start -->/ { skip=1; next }
    /<!-- sbom-status:end -->/   { skip=0; next }
    skip==0 { print }
  ')"
  NOTES_FILE="$(mktemp)"
  {
    printf '%s\n\n' "$BLOCK"
    printf '%s\n' "$STRIPPED"
  } > "$NOTES_FILE"
  gh release edit "$TAG" --repo "$REPO" --notes-file "$NOTES_FILE" >/dev/null
  rm -f "$NOTES_FILE"
  echo "✔ Updated GitHub Release notes for $TAG with SBOM status"
fi
