#!/usr/bin/env bash
# End-to-end edge cache verification.
#
# Purpose: after a deploy + purge, confirm Cloudflare is serving fresh HTML
# from the new Worker version — not stale HTML that references evicted
# hashed chunks (which is what causes "blank page until Dev Mode" issues).
#
# For each route we:
#   1. GET the URL with a cache-buster query so CF cannot serve a HIT of a
#      previously-cached response.
#   2. Assert cf-cache-status ∈ { MISS, BYPASS, DYNAMIC, EXPIRED, REVALIDATED }.
#      HIT or STALE with a fresh cache-buster means the purge didn't land or
#      the old Worker version is still serving — a real regression.
#   3. Assert HTTP 200.
#   4. Assert response body contains the expected build id marker (if
#      EXPECTED_BUILD_ID is set) — proves the NEW Worker version served it.
#
# Env:
#   BASE_URL           — origin under test (default https://phlabs.co.uk)
#   ROUTES             — space-separated paths (default "/ /products /compound /about")
#   EXPECTED_BUILD_ID  — optional; if set, response must contain this string
#   MAX_RETRIES        — per-route retry count on transient failure (default 3)
#   RETRY_DELAY_SEC    — sleep between retries (default 10)
#
# Exit codes:
#   0  — every route verified fresh
#   1  — one or more routes returned HIT/STALE, non-200, or wrong build id

set -uo pipefail

BASE_URL="${BASE_URL:-https://phlabs.co.uk}"
ROUTES="${ROUTES:-/ /products /compound /about}"
EXPECTED_BUILD_ID="${EXPECTED_BUILD_ID:-}"
MAX_RETRIES="${MAX_RETRIES:-3}"
RETRY_DELAY_SEC="${RETRY_DELAY_SEC:-10}"
# NDJSON log path — one JSON object per line, one line per probe attempt +
# summary. Consumed by post-deploy-purge workflow and uploaded as an artifact
# so we can trace which Worker version served which route on which publish.
LOG_JSON="${LOG_JSON:-./edge-cache-verify.ndjson}"

# Run id ties every log line in this invocation together (workflow run,
# manual invocation, etc.). GITHUB_RUN_ID is set inside GitHub Actions.
RUN_ID="${GITHUB_RUN_ID:-local-$(date +%s)}"

# cf-cache-status values that mean "fresh from origin / new Worker".
FRESH_RE='^(MISS|BYPASS|DYNAMIC|EXPIRED|REVALIDATED|NONE\/UNKNOWN)$'
# Values that mean "old cached object served" — a regression when we just
# purged and used a cache-buster.
STALE_RE='^(HIT|STALE)$'

# Reset log file at start.
: > "$LOG_JSON"

json_escape() {
  # Minimal JSON string escape for values we control (headers, paths, ids).
  # Not for arbitrary bytes — bash-level escaping only.
  local s="${1-}"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

emit_log() {
  # Args: stage path attempt status cf age swr build expected_build ok reason
  local stage="$1" path="$2" attempt="$3" status="$4" cf="$5" age="$6" swr="$7" build="$8" expected_build="$9" ok="${10}" reason="${11-}"
  local ts
  ts=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)
  printf '{"ts":"%s","kind":"edge_cache_verify","runId":"%s","stage":"%s","path":"%s","attempt":%s,"status":%s,"cfCacheStatus":"%s","age":"%s","swr":"%s","servedBuildId":"%s","expectedBuildId":"%s","expectedBuildMatch":"%s","ok":%s,"reason":"%s","baseUrl":"%s"}\n' \
    "$ts" \
    "$(json_escape "$RUN_ID")" \
    "$(json_escape "$stage")" \
    "$(json_escape "$path")" \
    "${attempt:-0}" \
    "${status:-0}" \
    "$(json_escape "$cf")" \
    "$(json_escape "$age")" \
    "$(json_escape "$swr")" \
    "$(json_escape "$build")" \
    "$(json_escape "$EXPECTED_BUILD_ID")" \
    "$(json_escape "$expected_build")" \
    "${ok:-false}" \
    "$(json_escape "$reason")" \
    "$(json_escape "$BASE_URL")" \
    >> "$LOG_JSON"
}

fail_count=0
pass_count=0
report=()


probe_route() {
  local path="$1"
  local attempt="$2"
  local cb
  cb=$(date +%s%N)
  local url="${BASE_URL}${path}?__cache_verify=${cb}"

  # -D writes headers to stdout, -o writes body to a tempfile so we can grep it.
  local body_file
  body_file=$(mktemp)
  local head
  head=$(curl -sS -L --max-time 20 \
    -A 'phlabs-edge-cache-verify/1.0' \
    -H 'cache-control: no-cache' \
    -H 'pragma: no-cache' \
    -D - \
    -o "$body_file" \
    "$url")
  local curl_rc=$?

  if [ $curl_rc -ne 0 ]; then
    rm -f "$body_file"
    echo "curl_error rc=$curl_rc"
    return 2
  fi

  local status
  status=$(echo "$head" | grep -iE '^HTTP/' | tail -n1 | awk '{print $2}' | tr -d '\r')
  local cf
  cf=$(echo "$head" | grep -i '^cf-cache-status:' | tail -n1 | awk '{print $2}' | tr -d '\r' | tr '[:lower:]' '[:upper:]')
  local swr
  swr=$(echo "$head" | grep -i '^cloudflare-cdn-cache-control:' | tail -n1 | cut -d: -f2- | sed 's/^ *//' | tr -d '\r')
  local build
  build=$(echo "$head" | grep -i '^x-build-id:' | tail -n1 | cut -d: -f2- | sed 's/^ *//' | tr -d '\r')
  local age
  age=$(echo "$head" | grep -i '^age:' | tail -n1 | awk '{print $2}' | tr -d '\r')

  local build_ok="skip"
  if [ -n "$EXPECTED_BUILD_ID" ]; then
    if grep -q -F "$EXPECTED_BUILD_ID" "$body_file"; then
      build_ok="ok"
    else
      build_ok="MISMATCH"
    fi
  fi
  rm -f "$body_file"

  # Decide pass/fail + reason string BEFORE returning so we can emit a
  # single structured log line per attempt.
  local ok="false"
  local reason=""
  if [ "$status" != "200" ]; then
    reason="http_${status:-0}"
  elif [[ "$cf" =~ $STALE_RE ]]; then
    reason="stale_cf_${cf}"
  elif [ "$build_ok" = "MISMATCH" ]; then
    reason="build_mismatch_${build}_vs_${EXPECTED_BUILD_ID}"
  else
    ok="true"
    if ! [[ "$cf" =~ $FRESH_RE ]] && [ -n "$cf" ]; then
      reason="unrecognized_cf_${cf}_accepted"
    fi
  fi

  emit_log "probe" "$path" "$attempt" "${status:-0}" "${cf:-}" "${age:-0}" "${swr:-}" "${build:-}" "${build_ok}" "$ok" "$reason"
  echo "attempt=${attempt} status=${status:-?} cf=${cf:-?} age=${age:-0} swr=${swr:-?} build=${build:-?} expected_build=${build_ok} ok=${ok} reason=${reason:-none}"

  [ "$ok" = "true" ] && return 0 || return 1
}

echo "=== Edge cache verification ==="
echo "base_url        = $BASE_URL"
echo "routes          = $ROUTES"
echo "expected_build  = ${EXPECTED_BUILD_ID:-<not set>}"
echo "max_retries     = $MAX_RETRIES"
echo "run_id          = $RUN_ID"
echo "log_json        = $LOG_JSON"
echo

emit_log "start" "*" 0 0 "" "" "" "" "skip" "true" "$(printf 'routes=%s' "$ROUTES")"

for path in $ROUTES; do
  echo "--- ${path}"
  ok=false
  last_output=""
  for attempt in $(seq 1 "$MAX_RETRIES"); do
    if last_output=$(probe_route "$path" "$attempt"); then
      echo "$last_output"
      ok=true
      break
    fi
    echo "$last_output"
    if [ "$attempt" -lt "$MAX_RETRIES" ]; then
      echo "  retrying in ${RETRY_DELAY_SEC}s..."
      sleep "$RETRY_DELAY_SEC"
    fi
  done
  if $ok; then
    pass_count=$((pass_count + 1))
    report+=("PASS ${path}")
    emit_log "route.done" "$path" 0 0 "" "" "" "" "skip" "true" "passed"
  else
    fail_count=$((fail_count + 1))
    report+=("FAIL ${path} — ${last_output}")
    emit_log "route.done" "$path" 0 0 "" "" "" "" "skip" "false" "$(printf 'exhausted_retries: %s' "$last_output")"
  fi
  echo
done

echo "=== Summary ==="
for line in "${report[@]}"; do
  echo "  $line"
done
echo "passed=${pass_count} failed=${fail_count}"
echo "structured logs: ${LOG_JSON}"

if [ "$fail_count" -gt 0 ]; then
  emit_log "summary" "*" 0 0 "" "" "" "" "skip" "false" "$(printf 'passed=%s failed=%s' "$pass_count" "$fail_count")"
  echo "::error::Edge cache verification FAILED for ${fail_count} route(s) — Cloudflare is serving stale HTML or the new Worker version is not live"
  exit 1
fi

emit_log "summary" "*" 0 0 "" "" "" "" "skip" "true" "$(printf 'passed=%s failed=%s' "$pass_count" "$fail_count")"
echo "All routes serving fresh from new Worker version."
exit 0

