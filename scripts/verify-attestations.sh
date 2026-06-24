#!/usr/bin/env bash
#
# Verifies the SBOM signature + SLSA Provenance attestation + CycloneDX
# attestation produced by one of our signing workflows.
#
# Output goes to:
#   - stdout: human-readable log (sanitised — Rekor UUIDs, log indices,
#     cert serial numbers, internal repo/owner IDs are redacted before
#     they reach the Check page so the only things rendered are the
#     pass/fail verdict and the workflow identity that signed)
#   - $GITHUB_STEP_SUMMARY: sanitised Markdown table that becomes the
#     GitHub Check page
#   - workflow annotations (::error / ::notice): so failures surface as
#     red Check items with a clear cause
#
# Designed to be the sole step of a dedicated "Attestation verify" job
# so the job name itself becomes the GitHub required-check label that
# branch protection can require for merge.
#
# Usage:
#   scripts/verify-attestations.sh <dir-with-artifact> <workflow-name>
#
#   <dir-with-artifact>  directory holding sbom.cdx.json + .sig + .pem
#                        + .provenance.intoto.jsonl + .cyclonedx.intoto.jsonl
#   <workflow-name>      ci | security-scan | post-deploy-scan | release
#
# Exit code: 0 on full pass, 1 on any verification failure.

set -uo pipefail

DIR="${1:-dist}"
WORKFLOW="${2:-ci}"
SBOM="$DIR/sbom.cdx.json"
SIG="$SBOM.sig"
CERT="$SBOM.pem"
PROV="$SBOM.provenance.intoto.jsonl"
CYDX="$SBOM.cyclonedx.intoto.jsonl"

REPO="${GITHUB_REPOSITORY:-}"
IDENTITY_REGEX="^https://github\.com/${REPO}/\.github/workflows/${WORKFLOW}\.yml@"
ISSUER="https://token.actions.githubusercontent.com"

SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/stderr}"
LOG="$(mktemp)"
PASS=0
FAIL=0

# Mask internal GitHub IDs in the live log so they never appear in
# workflow annotations or the Check summary. They are not "secret" but
# they are noise that leaks org topology — drop them at the source.
if [ -n "${GITHUB_REPOSITORY_ID:-}" ]; then echo "::add-mask::${GITHUB_REPOSITORY_ID}"; fi
if [ -n "${GITHUB_REPOSITORY_OWNER_ID:-}" ]; then echo "::add-mask::${GITHUB_REPOSITORY_OWNER_ID}"; fi
if [ -n "${GITHUB_ACTOR_ID:-}" ]; then echo "::add-mask::${GITHUB_ACTOR_ID}"; fi
if [ -n "${GITHUB_TRIGGERING_ACTOR:-}" ]; then echo "::add-mask::${GITHUB_TRIGGERING_ACTOR}"; fi

# Strip noisy / leaky tokens out of cosign output before it enters the
# summary or annotations:
#   - Rekor UUIDs (64-hex)
#   - Rekor log indices (Index: 12345678)
#   - tlog entry UUIDs
#   - any sha256:<64hex> not anchored to a recognised label
#   - certificate serial numbers (Serial: <decimal>)
#   - bearer-style tokens that should never be there but get masked
#     anyway as a defence in depth
sanitise() {
  sed -E \
    -e 's/[0-9a-f]{64}/[redacted-hash]/g' \
    -e 's/(Index|index):[[:space:]]*[0-9]+/\1: [redacted]/g' \
    -e 's/(uuid|UUID):[[:space:]]*[0-9a-fA-F-]+/\1: [redacted]/g' \
    -e 's/(Serial|serial):[[:space:]]*[0-9]+/\1: [redacted]/g' \
    -e 's/Bearer[[:space:]]+[A-Za-z0-9._-]+/Bearer [redacted]/g' \
    -e 's/(ghp|github_pat|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}/[redacted-token]/g'
}

emit_check() {
  local name="$1" status="$2" detail="$3"
  detail="$(printf '%s' "$detail" | sanitise)"
  if [ "$status" = "pass" ]; then
    PASS=$((PASS + 1))
    echo "::notice title=$name::PASS — $detail"
    echo "| ✅ \`$name\` | PASS | $detail |" >> "$SUMMARY"
  else
    FAIL=$((FAIL + 1))
    echo "::error title=$name::FAIL — $detail"
    echo "| ❌ \`$name\` | FAIL | $detail |" >> "$SUMMARY"
  fi
}

run_check() {
  local name="$1"; shift
  : > "$LOG"
  if "$@" > "$LOG" 2>&1; then
    emit_check "$name" pass "$(tail -n 1 "$LOG" | tr -d '\r' | head -c 240)"
    return 0
  fi
  local tail_log
  tail_log="$(tail -n 6 "$LOG" | tr '\n' ' ' | tr -d '\r' | head -c 320)"
  emit_check "$name" fail "${tail_log:-cosign returned non-zero}"
  return 1
}

{
  echo "## SBOM attestation verification"
  echo
  echo "- Workflow: \`${WORKFLOW}.yml\`"
  echo "- Repo: \`${REPO}\`"
  echo "- Commit: \`${GITHUB_SHA:-local}\`"
  echo "- Identity regex: \`${IDENTITY_REGEX}\`"
  echo "- OIDC issuer: ${ISSUER}"
  echo
  echo "| Result | Check | Detail |"
  echo "| --- | --- | --- |"
} >> "$SUMMARY"

for f in "$SBOM" "$SIG" "$CERT" "$PROV" "$CYDX"; do
  if [ ! -f "$f" ]; then
    emit_check "artifact:${f##*/}" fail "missing artifact file: ${f##*/}"
  fi
done

if [ "$FAIL" -eq 0 ]; then
  if ! command -v cosign >/dev/null 2>&1; then
    emit_check "cosign:install" fail "cosign binary not found in PATH"
  else
    run_check "cosign verify-blob (detached signature)" \
      cosign verify-blob \
        --certificate "$CERT" \
        --signature "$SIG" \
        --certificate-identity-regexp "$IDENTITY_REGEX" \
        --certificate-oidc-issuer "$ISSUER" \
        "$SBOM"

    run_check "cosign verify-blob-attestation (SLSA Provenance v1)" \
      cosign verify-blob-attestation \
        --signature "$PROV" \
        --type slsaprovenance1 \
        --certificate-identity-regexp "$IDENTITY_REGEX" \
        --certificate-oidc-issuer "$ISSUER" \
        "$SBOM"

    run_check "cosign verify-blob-attestation (CycloneDX SBOM)" \
      cosign verify-blob-attestation \
        --signature "$CYDX" \
        --type cyclonedx \
        --certificate-identity-regexp "$IDENTITY_REGEX" \
        --certificate-oidc-issuer "$ISSUER" \
        "$SBOM"
  fi
fi

{
  echo
  echo "**Totals:** ✅ $PASS passed · ❌ $FAIL failed"
} >> "$SUMMARY"

echo
echo "Result: $PASS pass / $FAIL fail"

# Also drop a sanitised copy of every cosign invocation to a debug file
# in the same directory, so the CI job can upload it as a failure
# artifact without leaking Rekor UUIDs or internal IDs.
if [ -d "$DIR" ]; then
  {
    echo "# verify-attestations.sh log (sanitised)"
    echo "# workflow=$WORKFLOW repo=$REPO sha=${GITHUB_SHA:-local}"
    echo "# pass=$PASS fail=$FAIL"
    sanitise < "$LOG" 2>/dev/null || true
  } > "$DIR/verify-attestations.log" 2>/dev/null || true
fi

rm -f "$LOG"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
