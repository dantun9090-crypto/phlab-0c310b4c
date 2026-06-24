#!/usr/bin/env bash
#
# End-to-end local verification of an SBOM bundle published to a GitHub
# Release — runs **with no access to the CI runs**.
#
# Two modes:
#
#   1. ONLINE (default): downloads sbom.cdx.json* assets from a release.
#      Requires: cosign v2+, gh CLI (authenticated), jq, sha256sum.
#
#   2. OFFLINE (--offline <dir>): only inspects an already-downloaded
#      directory of release assets. Requires: cosign v2+, jq, sha256sum.
#      No network calls to GitHub.
#
# Both modes:
#   - Run CycloneDX SBOM structural validation before trusting it.
#   - Verify SHA-256, detached signature, SLSA Provenance v1 attestation
#     and CycloneDX SBOM attestation.
#   - STRICTLY pin issuer + builder identity + workflow path (phlab).
#   - Emit a JSON verification report:
#       sbom-verification-report.json
#     containing subject digest, SLSA fields, CycloneDX attestation
#     digest and pass/fail per check.
#   - When run under GitHub Actions, append a summary table to
#     $GITHUB_STEP_SUMMARY.
#
# Usage:
#   scripts/verify-release-sbom.sh <tag> [<owner/repo>]
#   scripts/verify-release-sbom.sh --offline <dir> [<owner/repo>] [<tag>]
#
# Examples:
#   scripts/verify-release-sbom.sh v1.2.3
#   scripts/verify-release-sbom.sh --offline ./downloaded-sbom phlabs-uk/phlabs v1.2.3

set -uo pipefail

# ---------- arg parsing ----------
MODE="online"
OFFLINE_DIR=""
TAG=""
REPO=""

if [ "${1:-}" = "--offline" ]; then
  MODE="offline"
  OFFLINE_DIR="${2:-}"
  REPO="${3:-${GH_REPO:-phlabs-uk/phlabs}}"
  TAG="${4:-offline-bundle}"
  if [ -z "$OFFLINE_DIR" ] || [ ! -d "$OFFLINE_DIR" ]; then
    echo "Usage: $0 --offline <dir-with-release-assets> [<owner/repo>] [<tag>]" >&2
    exit 2
  fi
else
  TAG="${1:-}"
  REPO="${2:-${GH_REPO:-phlabs-uk/phlabs}}"
  if [ -z "$TAG" ]; then
    echo "Usage: $0 <release-tag> [<owner/repo>]"          >&2
    echo "       $0 --offline <dir> [<owner/repo>] [<tag>]" >&2
    exit 2
  fi
fi

# ---------- required tools ----------
REQUIRED=(cosign jq sha256sum)
[ "$MODE" = "online" ] && REQUIRED+=(gh)
for bin in "${REQUIRED[@]}"; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "✗ Missing required tool: $bin" >&2
    exit 1
  fi
done

# ---------- expected identity (phlab) ----------
# These are the ONLY signers we trust. Anything else => reject, even if
# cosign would otherwise accept the regex.
ALLOWED_WORKFLOWS_RE='(ci|security-scan|post-deploy-scan|release)'
IDENTITY_REGEX="^https://github\.com/${REPO}/\.github/workflows/${ALLOWED_WORKFLOWS_RE}\.yml@"
ISSUER="https://token.actions.githubusercontent.com"
EXPECTED_REPO_URL="https://github.com/${REPO}"
EXPECTED_BUILDER_PREFIX="https://github.com/${REPO}/actions/runs/"

# ---------- prepare work dir ----------
if [ "$MODE" = "offline" ]; then
  WORK="$(cd "$OFFLINE_DIR" && pwd)"
  echo "→ OFFLINE mode — verifying bundle in: $WORK"
else
  WORK="$(mktemp -d -t sbom-verify-XXXXXX)"
  trap 'rm -rf "$WORK"' EXIT
  echo "→ ONLINE mode — downloading SBOM bundle for $REPO @ $TAG"
  gh release download "$TAG" --repo "$REPO" \
    --pattern 'sbom.cdx.json*' \
    --dir "$WORK"
fi

cd "$WORK"
echo
echo "→ Files present:"
ls -la

# ---------- per-check tracking ----------
declare -A RESULTS
declare -A DETAILS
PASS=0
FAIL=0
record() {
  local name="$1" status="$2" detail="${3:-}"
  RESULTS["$name"]="$status"
  DETAILS["$name"]="$detail"
  if [ "$status" = "pass" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); fi
}

# ---------- [0/6] required artefacts ----------
echo
echo "→ [0/6] Checking required artefacts present"
MISSING=()
for f in sbom.cdx.json sbom.cdx.json.sha256 sbom.cdx.json.sig sbom.cdx.json.pem \
         sbom.cdx.json.provenance.intoto.jsonl sbom.cdx.json.provenance.pem \
         sbom.cdx.json.cyclonedx.intoto.jsonl sbom.cdx.json.cyclonedx.pem; do
  [ -f "$f" ] || MISSING+=("$f")
done
if [ "${#MISSING[@]}" -gt 0 ]; then
  record "artefacts-present" fail "missing: ${MISSING[*]}"
  echo "✗ Missing artefacts: ${MISSING[*]}" >&2
else
  record "artefacts-present" pass "all 8 release assets present"
fi

# ---------- [1/6] CycloneDX structural validation ----------
echo
echo "→ [1/6] Validating CycloneDX SBOM structure"
VALIDATOR="${SBOM_VALIDATOR:-}"
if [ -z "$VALIDATOR" ]; then
  # find repo-root validator relative to this script
  HERE="$(cd "$(dirname "$0")" && pwd)" 2>/dev/null || HERE="."
  if [ -f "$HERE/validate-sbom.ts" ]; then VALIDATOR="$HERE/validate-sbom.ts"; fi
fi
if [ -n "$VALIDATOR" ] && command -v bun >/dev/null 2>&1; then
  if bun "$VALIDATOR" sbom.cdx.json >/tmp/sbom-validate.log 2>&1; then
    record "sbom-schema-valid" pass "$(tail -n1 /tmp/sbom-validate.log)"
  else
    record "sbom-schema-valid" fail "$(tail -n3 /tmp/sbom-validate.log | tr '\n' ' ')"
  fi
else
  # Minimal inline check if bun/validator missing on reviewer machine
  if jq -e '.bomFormat=="CycloneDX" and (.specVersion|IN("1.4","1.5","1.6")) and (.components|length>0)' \
       sbom.cdx.json >/dev/null 2>&1; then
    record "sbom-schema-valid" pass "inline CycloneDX check (bun/validator unavailable)"
  else
    record "sbom-schema-valid" fail "SBOM failed minimal CycloneDX structural checks"
  fi
fi

# ---------- [2/6] SHA-256 ----------
echo
echo "→ [2/6] Verifying SHA-256 manifest"
if sha256sum -c sbom.cdx.json.sha256 >/tmp/sha.log 2>&1; then
  record "sha256" pass "$(cat /tmp/sha.log | tr -d '\n')"
else
  record "sha256" fail "$(cat /tmp/sha.log | tr -d '\n')"
fi
ACTUAL_HASH="$(sha256sum sbom.cdx.json | awk '{print $1}')"

# ---------- [3/6] cosign detached signature ----------
echo
echo "→ [3/6] Verifying cosign detached signature"
if cosign verify-blob \
    --certificate sbom.cdx.json.pem \
    --signature   sbom.cdx.json.sig \
    --certificate-identity-regexp "$IDENTITY_REGEX" \
    --certificate-oidc-issuer "$ISSUER" \
    sbom.cdx.json >/tmp/cosign-sig.log 2>&1; then
  record "cosign-signature" pass "Verified OK"
else
  record "cosign-signature" fail "$(tail -n3 /tmp/cosign-sig.log | tr '\n' ' ')"
fi

# ---------- [4/6] SLSA Provenance attestation ----------
echo
echo "→ [4/6] Verifying SLSA Provenance v1 attestation"
if cosign verify-blob-attestation \
    --signature sbom.cdx.json.provenance.intoto.jsonl \
    --type slsaprovenance1 \
    --certificate-identity-regexp "$IDENTITY_REGEX" \
    --certificate-oidc-issuer "$ISSUER" \
    sbom.cdx.json >/tmp/cosign-prov.log 2>&1; then
  record "cosign-provenance" pass "Verified OK"
else
  record "cosign-provenance" fail "$(tail -n3 /tmp/cosign-prov.log | tr '\n' ' ')"
fi

# ---------- [5/6] CycloneDX attestation ----------
echo
echo "→ [5/6] Verifying CycloneDX SBOM attestation"
if cosign verify-blob-attestation \
    --signature sbom.cdx.json.cyclonedx.intoto.jsonl \
    --type cyclonedx \
    --certificate-identity-regexp "$IDENTITY_REGEX" \
    --certificate-oidc-issuer "$ISSUER" \
    sbom.cdx.json >/tmp/cosign-cdx.log 2>&1; then
  record "cosign-cyclonedx" pass "Verified OK"
else
  record "cosign-cyclonedx" fail "$(tail -n3 /tmp/cosign-cdx.log | tr '\n' ' ')"
fi

# ---------- decode payloads + STRICT identity pinning ----------
PROV_PAYLOAD="$(head -n1 sbom.cdx.json.provenance.intoto.jsonl 2>/dev/null | jq -r '.payload // empty' | base64 -d 2>/dev/null || echo '{}')"
CDX_PAYLOAD="$(head -n1 sbom.cdx.json.cyclonedx.intoto.jsonl 2>/dev/null | jq -r '.payload // empty' | base64 -d 2>/dev/null || echo '{}')"

SUBJECT_HASH="$(printf '%s' "$PROV_PAYLOAD" | jq -r '.subject[0].digest.sha256 // ""')"
CDX_SUBJECT_HASH="$(printf '%s' "$CDX_PAYLOAD"  | jq -r '.subject[0].digest.sha256 // ""')"
PROV_REPO="$(printf '%s'    "$PROV_PAYLOAD" | jq -r '.predicate.buildDefinition.externalParameters.workflow.repository // ""')"
PROV_REF="$(printf '%s'     "$PROV_PAYLOAD" | jq -r '.predicate.buildDefinition.externalParameters.workflow.ref // ""')"
PROV_PATH="$(printf '%s'    "$PROV_PAYLOAD" | jq -r '.predicate.buildDefinition.externalParameters.workflow.path // ""')"
PROV_BUILDER="$(printf '%s' "$PROV_PAYLOAD" | jq -r '.predicate.runDetails.builder.id // ""')"
PROV_COMMIT="$(printf '%s'  "$PROV_PAYLOAD" | jq -r '.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit // ""')"
PROV_EVENT="$(printf '%s'   "$PROV_PAYLOAD" | jq -r '.predicate.buildDefinition.internalParameters.github.event_name // ""')"
PROV_BUILDID="$(printf '%s' "$PROV_PAYLOAD" | jq -r '.predicate.runDetails.byproducts[0].annotations.buildId // ""')"

# Subject digest matches the SBOM we hold
echo
echo "→ Subject digest binding"
echo "  attested:  $SUBJECT_HASH"
echo "  actual:    $ACTUAL_HASH"
if [ -n "$SUBJECT_HASH" ] && [ "$SUBJECT_HASH" = "$ACTUAL_HASH" ]; then
  record "subject-digest-match" pass "SLSA subject == sha256(sbom.cdx.json)"
else
  record "subject-digest-match" fail "SLSA subject ($SUBJECT_HASH) != actual ($ACTUAL_HASH)"
fi
if [ -n "$CDX_SUBJECT_HASH" ] && [ "$CDX_SUBJECT_HASH" = "$ACTUAL_HASH" ]; then
  record "cyclonedx-subject-digest-match" pass "CycloneDX attest subject == sha256(sbom.cdx.json)"
else
  record "cyclonedx-subject-digest-match" fail "CycloneDX subject ($CDX_SUBJECT_HASH) != actual ($ACTUAL_HASH)"
fi

# STRICT phlab identity checks
echo
echo "→ Strict identity checks (phlab)"
[ "$PROV_REPO" = "$EXPECTED_REPO_URL" ] \
  && record "provenance-repo" pass "$PROV_REPO" \
  || record "provenance-repo" fail "expected $EXPECTED_REPO_URL, got '$PROV_REPO'"

# workflow path must be one of our 4 signing workflows
if [[ "$PROV_PATH" =~ ^\.github/workflows/${ALLOWED_WORKFLOWS_RE}\.yml$ ]]; then
  record "provenance-workflow" pass "$PROV_PATH"
else
  record "provenance-workflow" fail "expected .github/workflows/${ALLOWED_WORKFLOWS_RE}.yml, got '$PROV_PATH'"
fi

# builder must point to a run inside this repo
if [[ "$PROV_BUILDER" == ${EXPECTED_BUILDER_PREFIX}* ]]; then
  record "provenance-builder" pass "$PROV_BUILDER"
else
  record "provenance-builder" fail "expected prefix $EXPECTED_BUILDER_PREFIX, got '$PROV_BUILDER'"
fi

# commit SHA must look like a real git sha
if [[ "$PROV_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  record "provenance-commit-sha" pass "$PROV_COMMIT"
else
  record "provenance-commit-sha" fail "missing or malformed commit SHA: '$PROV_COMMIT'"
fi

# ---------- JSON report ----------
REPORT="sbom-verification-report.json"
{
  printf '{\n'
  printf '  "tag": %s,\n'        "$(jq -Rn --arg v "$TAG"   '$v')"
  printf '  "repo": %s,\n'       "$(jq -Rn --arg v "$REPO"  '$v')"
  printf '  "mode": %s,\n'       "$(jq -Rn --arg v "$MODE"  '$v')"
  printf '  "verifiedAt": %s,\n' "$(jq -Rn --arg v "$(date -u +%FT%TZ)" '$v')"
  printf '  "summary": { "pass": %d, "fail": %d, "status": %s },\n' \
    "$PASS" "$FAIL" "$([ "$FAIL" -eq 0 ] && echo '"green"' || echo '"red"')"
  printf '  "subjectDigest": %s,\n'        "$(jq -Rn --arg v "$ACTUAL_HASH" '$v')"
  printf '  "attestedSubjectDigest": %s,\n' "$(jq -Rn --arg v "$SUBJECT_HASH" '$v')"
  printf '  "cyclonedxSubjectDigest": %s,\n' "$(jq -Rn --arg v "$CDX_SUBJECT_HASH" '$v')"
  printf '  "slsaProvenance": {\n'
  printf '    "repository": %s,\n' "$(jq -Rn --arg v "$PROV_REPO"     '$v')"
  printf '    "ref": %s,\n'        "$(jq -Rn --arg v "$PROV_REF"      '$v')"
  printf '    "workflow": %s,\n'   "$(jq -Rn --arg v "$PROV_PATH"     '$v')"
  printf '    "builder": %s,\n'    "$(jq -Rn --arg v "$PROV_BUILDER"  '$v')"
  printf '    "commitSha": %s,\n'  "$(jq -Rn --arg v "$PROV_COMMIT"   '$v')"
  printf '    "event": %s,\n'      "$(jq -Rn --arg v "$PROV_EVENT"    '$v')"
  printf '    "buildId": %s\n'     "$(jq -Rn --arg v "$PROV_BUILDID"  '$v')"
  printf '  },\n'
  printf '  "checks": {\n'
  FIRST=1
  for k in "${!RESULTS[@]}"; do
    [ $FIRST -eq 1 ] || printf ',\n'
    FIRST=0
    printf '    %s: { "status": %s, "detail": %s }' \
      "$(jq -Rn --arg v "$k" '$v')" \
      "$(jq -Rn --arg v "${RESULTS[$k]}" '$v')" \
      "$(jq -Rn --arg v "${DETAILS[$k]}" '$v')"
  done
  printf '\n  }\n'
  printf '}\n'
} > "$REPORT"

# Pretty-print + validate the report itself
if jq . "$REPORT" > "${REPORT}.tmp" 2>/dev/null; then
  mv "${REPORT}.tmp" "$REPORT"
fi

echo
echo "→ JSON report written: $WORK/$REPORT"

# ---------- GitHub Step Summary (when running in Actions) ----------
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  STATUS_EMOJI="✅"
  STATUS_TEXT="green"
  [ "$FAIL" -eq 0 ] || { STATUS_EMOJI="❌"; STATUS_TEXT="red"; }
  {
    echo "## SBOM release verification — \`$TAG\` ($STATUS_EMOJI $STATUS_TEXT)"
    echo
    echo "- Repo: \`$REPO\`"
    echo "- Mode: \`$MODE\`"
    echo "- Subject digest: \`$ACTUAL_HASH\`"
    echo "- Provenance commit: \`$PROV_COMMIT\`"
    echo "- Provenance workflow: \`$PROV_PATH\`"
    echo "- Builder: $PROV_BUILDER"
    echo
    echo "| Check | Status | Detail |"
    echo "| --- | --- | --- |"
    for k in "${!RESULTS[@]}"; do
      icon="✅"; [ "${RESULTS[$k]}" = "pass" ] || icon="❌"
      printf '| `%s` | %s %s | %s |\n' "$k" "$icon" "${RESULTS[$k]}" "${DETAILS[$k]}"
    done
    echo
    echo "**Totals:** ✅ $PASS · ❌ $FAIL"
    echo
    echo "<details><summary>Full JSON report</summary>"
    echo
    echo '```json'
    cat "$REPORT"
    echo '```'
    echo
    echo "</details>"
  } >> "$GITHUB_STEP_SUMMARY"
fi

echo
echo "→ Result: $PASS pass / $FAIL fail"
if [ "$FAIL" -gt 0 ]; then
  echo "✗ Verification FAILED for $REPO @ $TAG"
  exit 1
fi
echo "✔ All verifications passed for $REPO @ $TAG"
exit 0
