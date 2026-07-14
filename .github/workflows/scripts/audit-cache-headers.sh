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
JSON_OUT="${AUDIT_JSON_OUT:-audit-cache-headers.json}"

# Route list is resolved by a Python helper: workflow_dispatch input
# ($AUDIT_ROUTES) > config file ($AUDIT_ROUTES_FILE, default
# .github/cache-audit.routes.json) > built-in defaults. Placeholders like
# ':slug' in the config are expanded against the config's `slugs` map.
RESOLVER="$(dirname "$0")/resolve-audit-routes.py"
mapfile -t ROUTES < <(python3 "$RESOLVER") || {
  echo "::error::Failed to resolve audit routes" >&2
  exit 2
}
if [ "${#ROUTES[@]}" -eq 0 ]; then
  echo "::error::Route list is empty" >&2
  exit 2
fi
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
declare -a json_rows=()

# Directory for verbose per-violation dumps (headers + response snippet).
# Populated only when a route fails the cache contract; uploaded as an
# artifact by the workflow for post-mortem inspection.
VIOLATIONS_DIR="${VIOLATIONS_DIR:-cache-audit-violations}"
mkdir -p "$VIOLATIONS_DIR"

# Headers we deliberately capture in violation dumps because they reveal
# how the request was routed / cached (Cloudflare, our worker, prerender).
DIAG_HEADERS=(
  cache-control cdn-cache-control pragma expires vary age
  cf-cache-status cf-ray cf-request-id cf-worker cf-apo-via cf-edge-cache
  x-build-id x-worker-version x-prerender x-prerender-cache x-prerendered
  x-served-by x-request-id x-vercel-id x-forwarded-host
  content-type content-length last-modified etag server via
)

json_escape() { python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'; }

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

slugify() {
  # Turn "/" -> "root", "/products/foo" -> "products_foo", etc.
  local p="$1"
  [ "$p" = "/" ] && { echo "root"; return; }
  echo "${p#/}" | tr '/' '_' | tr -c 'A-Za-z0-9_.-' '_'
}

audit_route() {
  local path="$1"
  local url="${BASE_URL}${path}"
  local hdr_file body_file curl_meta
  hdr_file=$(mktemp)
  body_file=$(mktemp)
  # -w captures machine-readable metadata (final URL, timings, remote IP)
  # to correlate with Cloudflare cf-ray / cf-request-id in the violation dump.
  local w_fmt='http_code=%{http_code}\nurl_effective=%{url_effective}\nremote_ip=%{remote_ip}\ntime_total=%{time_total}\ntime_namelookup=%{time_namelookup}\ntime_connect=%{time_connect}\ntime_appconnect=%{time_appconnect}\ntime_starttransfer=%{time_starttransfer}\nsize_download=%{size_download}\nnum_redirects=%{num_redirects}\n'
  local http_code=0 network_error=""
  if ! curl_meta=$(curl -sS -o "$body_file" -D "$hdr_file" -w "$w_fmt" \
      -H "User-Agent: $UA" \
      -H "Accept: text/html" \
      --max-time 15 \
      "$url" 2>&1); then
    network_error="$curl_meta"
    curl_meta=""
  else
    http_code=$(printf '%s\n' "$curl_meta" | awk -F= '/^http_code=/{print $2; exit}')
  fi
  local headers=""; [ -f "$hdr_file" ] && headers=$(cat "$hdr_file")

  local cc cdncc cf xbuild cf_ray cf_req_id
  cc=$(header_value "$headers" "cache-control")
  cdncc=$(header_value "$headers" "cdn-cache-control")
  cf=$(header_value "$headers" "cf-cache-status")
  xbuild=$(header_value "$headers" "x-build-id")
  cf_ray=$(header_value "$headers" "cf-ray")
  cf_req_id=$(header_value "$headers" "cf-request-id")

  local problems=()
  if [ -n "$network_error" ]; then
    problems+=("network error: $network_error")
  fi
  if [ -z "$network_error" ] && [ "$http_code" != "200" ]; then
    problems+=("status=$http_code")
  fi
  if [ -z "$network_error" ]; then
    if ! check_contains "$cc" "max-age=0" || ! check_contains "$cc" "must-revalidate"; then
      problems+=("cache-control missing max-age=0 + must-revalidate (got: '${cc:-<none>}')")
    fi
    if ! check_contains "$cdncc" "no-store"; then
      problems+=("cdn-cache-control missing no-store (got: '${cdncc:-<none>}')")
    fi
    if [ -n "$cf" ] && ! check_in_list "$cf" "${ALLOWED_CF_STATUS[@]}"; then
      problems+=("cf-cache-status='$cf' not in {${ALLOWED_CF_STATUS[*]}}")
    fi
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

    # ---- Violation dump: preserved as CI artifact ------------------------
    local slug dump
    slug=$(slugify "$path")
    dump="$VIOLATIONS_DIR/${slug}.md"
    {
      echo "# Cache-audit violation: \`$path\`"
      echo ""
      echo "- **URL:** \`$url\`"
      echo "- **HTTP:** \`$http_code\`"
      echo "- **cf-ray:** \`${cf_ray:-—}\`  |  **cf-request-id:** \`${cf_req_id:-—}\`  |  **x-build-id:** \`${xbuild:-—}\`"
      echo "- **When:** \`$(date -u +%FT%TZ)\`  |  **Commit:** \`${GITHUB_SHA:-local}\`  |  **Run:** \`${GITHUB_RUN_ID:-local}\`"
      echo ""
      echo "## Problems"
      for p in "${problems[@]}"; do echo "- $p"; done
      echo ""
      echo "## curl metadata"
      echo '```'
      printf '%s\n' "${curl_meta:-<network error: $network_error>}"
      echo '```'
      echo ""
      echo "## Diagnostic response headers"
      echo '```http'
      for h in "${DIAG_HEADERS[@]}"; do
        v=$(header_value "$headers" "$h")
        [ -n "$v" ] && printf '%s: %s\n' "$h" "$v"
      done
      echo '```'
      echo ""
      echo "<details><summary>All response headers (raw)</summary>"
      echo ""
      echo '```http'
      printf '%s\n' "${headers:-<no headers captured>}"
      echo '```'
      echo "</details>"
      echo ""
      echo "<details><summary>Response body (first 4 KiB)</summary>"
      echo ""
      echo '```html'
      head -c 4096 "$body_file" 2>/dev/null || true
      echo ""
      echo '```'
      echo "</details>"
    } > "$dump"
    echo "::error file=$dump::Cache-header violation on $path — see artifact $dump"
    # ---------------------------------------------------------------------
  fi

  rm -f "$hdr_file" "$body_file"

  # JSON row (safely escaped via python).
  json_rows+=("$(PATH_="$path" HTTP_="$http_code" CC_="$cc" CDN_="$cdncc" CF_="$cf" BUILD_="$xbuild" RAY_="$cf_ray" REQID_="$cf_req_id" DETAIL_="$detail" OK_="$([ "${#problems[@]}" -eq 0 ] && echo true || echo false)" python3 -c '
import os, json
print(json.dumps({
  "path": os.environ["PATH_"],
  "http": int(os.environ["HTTP_"] or 0),
  "cc": os.environ["CC_"],
  "cdncc": os.environ["CDN_"],
  "cf": os.environ["CF_"],
  "buildId": os.environ["BUILD_"],
  "cfRay": os.environ["RAY_"],
  "cfRequestId": os.environ["REQID_"],
  "detail": os.environ["DETAIL_"],
  "ok": os.environ["OK_"] == "true",
}))'
)")
}

for r in "${ROUTES[@]}"; do audit_route "$r"; done

# Machine-readable JSON artifact (consumed by diff-cache-audit.py).
BASE_URL="$BASE_URL" PASS="$pass" FAIL="$fail" JSON_OUT="$JSON_OUT" \
  python3 -c "
import json, os, sys
rows = [json.loads(x) for x in sys.stdin.read().splitlines() if x.strip()]
out = {
  'schema': 1,
  'ranAt': __import__('datetime').datetime.utcnow().isoformat() + 'Z',
  'baseUrl': os.environ['BASE_URL'],
  'passed': int(os.environ['PASS']),
  'failed': int(os.environ['FAIL']),
  'commit': os.environ.get('GITHUB_SHA', ''),
  'runId': os.environ.get('GITHUB_RUN_ID', ''),
  'routes': rows,
}
open(os.environ['JSON_OUT'], 'w').write(json.dumps(out, indent=2))
" <<< "$(printf '%s\n' "${json_rows[@]}")"

{
  echo "## 🧊 Post-Deploy Cache Header Audit"
  echo ""
  echo "**Base:** \`${BASE_URL}\`  |  **UA:** \`${UA}\`  |  **Passed:** ${pass}  |  **Failed:** ${fail}"
  echo ""
  echo "Contract for public HTML shells: \`cache-control: public, max-age=0, must-revalidate\` **and** \`cdn-cache-control: no-store\`; \`cf-cache-status\` must be one of DYNAMIC / BYPASS / MISS / EXPIRED (never HIT/REVALIDATED/STALE)."
  echo ""
  echo "| Route | HTTP | cache-control | cdn-cache-control | cf-cache-status | build |"
  echo "| --- | --- | --- | --- | --- | --- |"
  for row in "${rows[@]}"; do echo "$row"; done
  echo ""
  if [ "$fail" -gt 0 ]; then
    echo "❌ **${fail} route(s) failed the cache contract.** Investigate Cloudflare cache rules and worker response headers."
  else
    echo "✅ All routes served with browser revalidation + CDN \`no-store\` — edge cache contract intact."
  fi
  echo ""
  echo "_Report JSON: \`${JSON_OUT}\` (uploaded as artifact for cross-deploy diff)._"
  if [ "$fail" -gt 0 ]; then
    echo ""
    echo "### 🔍 Violation dumps"
    echo "Detailed per-route dumps (status, cf-ray, cf-request-id, all response headers, first 4 KiB of body) are attached to this run as artifact \`cache-audit-violations\`:"
    echo ""
    for f in "$VIOLATIONS_DIR"/*.md; do
      [ -f "$f" ] || continue
      echo "- \`$(basename "$f")\`"
    done
  fi
} | tee -a "${GITHUB_STEP_SUMMARY:-/dev/stderr}"

# Write an index file inside the violations dir so the artifact is
# self-describing when downloaded from the Actions UI.
if [ "$fail" -gt 0 ]; then
  {
    echo "# Cache-audit violations — run ${GITHUB_RUN_ID:-local}"
    echo ""
    echo "Base: \`${BASE_URL}\`  |  Commit: \`${GITHUB_SHA:-local}\`  |  When: \`$(date -u +%FT%TZ)\`"
    echo ""
    for f in "$VIOLATIONS_DIR"/*.md; do
      [ -f "$f" ] || continue
      echo "- [\`$(basename "$f")\`](./$(basename "$f"))"
    done
  } > "$VIOLATIONS_DIR/README.md"
else
  # Nothing to dump — leave a placeholder so the upload step doesn't warn.
  echo "No violations in this run." > "$VIOLATIONS_DIR/README.md"
fi

[ "$fail" -eq 0 ] || exit 1
exit 0
