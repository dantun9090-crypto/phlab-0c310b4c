#!/usr/bin/env bash
#
# Verifies the SBOM signature + SLSA Provenance attestation + CycloneDX
# attestation produced by one of our signing workflows, and emits a
# structured result to:
#
#   - stdout (human readable log)
#   - $GITHUB_STEP_SUMMARY (Markdown table that becomes the Check page)
#   - GitHub workflow annotations (::error / ::notice), so failures
#     surface as red Check items with a clear cause
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

emit_check() {
  local name="$1" status="$2" detail="$3"
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
    emit_check "artifact:${f##*/}" fail "missing artifact file: $f"
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
rm -f "$LOG"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
