#!/usr/bin/env bash
# Post-deploy cache-header audit for phlabs.co.uk.
#
# Verifies that public HTML shells (/ and /products) are NEVER cached at the
# edge or in the browser. Prints a Markdown-friendly report to stdout and to
# $GITHUB_STEP_SUMMARY when running under GitHub Actions.
#
# Exit codes:
#   0 = all routes pass
#   1 = at least one route failed the cache-header contract
#   2 = network / usage error

set -uo pipefail

BASE_URL="${BASE_URL:-https://phlabs.co.uk}"
ROUTES=("/" "/products")
UA="PHLabs-CacheAudit/1.0 (+github-actions)"

# Expected header contract for public HTML shells.
# All must be present (case-insensitive substring match).
declare -a REQUIRED_CACHE_CONTROL=("no-store")
declare -a REQUIRED_CDN_CACHE_CONTROL=("no-store")
# cf-cache-status must be one of these (never HIT, never REVALIDATED, never STALE).
declare -a ALLOWED_CF_STATUS=("DYNAMIC" "BYPASS" "MISS" "EXPIRED")

pass=0
fail=0
declare -a rows=()

lower() { tr '[:upper:]' '[:lower:]'; }

header_value() {
  # $1=headers blob, $2=header name (lowercase)
  echo "$1" | awk -v k="$2" '
    BEGIN{IGNORECASE=1}
    /^\r?$/ {next}
    {
      line=$0
      pos=index(line,":")
      if (pos==0) next
      name=tolower(substr(line,1,pos-1))
      gsub(/^[ \t]+|[ \t\r]+$/,"",name)
      if (name==k) {
        val=substr(line,pos+1)
        gsub(/^[ \t]+|[ \t\r]+$/,"",val)
        print val
        exit
      }
    }'
}

check_contains() {
  # $1=value (may be empty), $2=needle
  echo "$1" | lower | grep -q -- "$(echo "$2" | lower)"
}

check_in_list() {
  # $1=value, $2..=allowed list
  local v="$1"; shift
  local low; low=$(echo "$v" | lower)
  for a in "$@"; do
    if [ "$low" = "$(echo "$a" | lower)" ]; then return 0; fi
  done
  return 1
}

audit_route() {
  local path="$1"
  local url="${BASE_URL}${path}"
  local tmp; tmp=$(mktemp)
  local http_code
  http_code=$(curl -sS -o /dev/null -D "$tmp" -w "%{http_code}" \
    -H "User-Agent: $UA" \
    -H "Accept: text/html" \
    --max-time 15 \
    "$url") || {
      rows+=("| \`$path\` | ❌ | network error | — | — | — |")
      fail=$((fail+1))
      rm -f "$tmp"
      return
    }
  local headers; headers=$(cat "$tmp"); rm -f "$tmp"

  local cc cdncc cf xbuild
  cc=$(header_value "$headers" "cache-control")
  cdncc=$(header_value "$headers" "cdn-cache-control")
  cf=$(header_value "$headers" "cf-cache-status")
  xbuild=$(header_value "$headers" "x-build-id")

  local problems=()

  if [ "$http_code" != "200" ]; then
    problems+=("status=$http_code")
  fi
  if ! check_contains "$cc" "no-store"; then
    problems+=("cache-control missing no-store (got: '${cc:-<none>}')")
  fi
  if ! check_contains "$cdncc" "no-store"; then
    problems+=("cdn-cache-control missing no-store (got: '${cdncc:-<none>}')")
  fi
  if [ -n "$cf" ] && ! check_in_list "$cf" "${ALLOWED_CF_STATUS[@]}"; then
    problems+=("cf-cache-status='$cf' not in {${ALLOWED_CF_STATUS[*]}}")
  fi

  local status_icon detail
  if [ "${#problems[@]}" -eq 0 ]; then
    status_icon="✅"
    detail="ok"
    pass=$((pass+1))
  else
    status_icon="❌"
    detail=$(IFS='; '; echo "${problems[*]}")
    fail=$((fail+1))
  fi

  rows+=("| \`$path\` | $status_icon $http_code | \`${cc:-—}\` | \`${cdncc:-—}\` | \`${cf:-—}\` | ${xbuild:-—} |")
  if [ "$status_icon" = "❌" ]; then
    rows+=("| | | ${detail} | | | |")
  fi
}

for r in "${ROUTES[@]}"; do audit_route "$r"; done

{
  echo "## 🧊 Post-Deploy Cache Header Audit"
  echo ""
  echo "**Base:** \`${BASE_URL}\`  |  **UA:** \`${UA}\`  |  **Passed:** ${pass}  |  **Failed:** ${fail}"
  echo ""
  echo "Contract for public HTML shells: \`cache-control: no-store\` **and** \`cdn-cache-control: no-store\`; \`cf-cache-status\` must be one of DYNAMIC / BYPASS / MISS / EXPIRED (never HIT/REVALIDATED/STALE)."
  echo ""
  echo "| Route | HTTP | cache-control | cdn-cache-control | cf-cache-status | build |"
  echo "| --- | --- | --- | --- | --- | --- |"
  for row in "${rows[@]}"; do echo "$row"; done
  echo ""
  if [ "$fail" -gt 0 ]; then
    echo "❌ **${fail} route(s) failed the cache contract.** Investigate Cloudflare cache rules and worker response headers."
  else
    echo "✅ All routes served with \`no-store\` — edge cache contract intact."
  fi
} | tee -a "${GITHUB_STEP_SUMMARY:-/dev/stderr}"

[ "$fail" -eq 0 ] || exit 1
exit 0
