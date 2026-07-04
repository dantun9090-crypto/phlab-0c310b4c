#!/usr/bin/env bash
# Edge SWR probe — checks Cloudflare-CDN-Cache-Control: stale-while-revalidate=<expected>
# on a given URL. Emits a single-line JSON object to stdout and exits:
#   0 → PASS
#   1 → MISMATCH or SWR_MISSING
#   2 → NETWORK_ERROR
#
# Usage:
#   scripts/probe-swr.sh [URL] [EXPECTED_SWR]
#
# Defaults: URL=https://phlabs.co.uk/  EXPECTED_SWR=60
set -uo pipefail

URL="${1:-https://phlabs.co.uk/}"
EXPECTED_SWR="${2:-60}"

# jq is required for clean JSON output. Try to install it non-fatally.
if ! command -v jq >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -qq >/dev/null 2>&1 || true
    sudo apt-get install -y -qq jq >/dev/null 2>&1 || true
  fi
fi

TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
CB="cb=$(date +%s%N)"
FETCH_URL="${URL}$([[ "$URL" == *\?* ]] && echo "&$CB" || echo "?$CB")"

TMP_HDR="$(mktemp)"
trap 'rm -f "$TMP_HDR"' EXIT

HTTP_CODE="$(curl -sSIL --max-time 15 \
  -H "cache-control: no-cache" \
  -H "pragma: no-cache" \
  -A "phlabs-edge-swr-guard/2.0" \
  -o "$TMP_HDR" \
  -w '%{http_code}' \
  "$FETCH_URL" 2>/dev/null || echo "000")"

emit_json() {
  local status="$1" swr_value="$2" cdn_cc="$3" cf_cache="$4" age="$5" message="$6"
  if command -v jq >/dev/null 2>&1; then
    jq -cn \
      --arg url "$URL" \
      --arg expected_swr "$EXPECTED_SWR" \
      --arg http_code "$HTTP_CODE" \
      --arg swr_value "$swr_value" \
      --arg cdn_cache_control "$cdn_cc" \
      --arg cf_cache_status "$cf_cache" \
      --arg age "$age" \
      --arg status "$status" \
      --arg message "$message" \
      --arg timestamp "$TS" \
      '{url:$url, expected_swr:($expected_swr|tonumber),
        http_code:($http_code|tonumber? // 0),
        swr_value:(if $swr_value=="" then null else ($swr_value|tonumber? // null) end),
        cdn_cache_control:$cdn_cache_control,
        cf_cache_status:$cf_cache_status,
        age:(if $age=="" then null else ($age|tonumber? // null) end),
        status:$status, message:$message, timestamp:$timestamp}'
  else
    printf '{"url":"%s","expected_swr":%s,"http_code":%s,"swr_value":%s,"cdn_cache_control":"%s","cf_cache_status":"%s","age":%s,"status":"%s","message":"%s","timestamp":"%s"}\n' \
      "$URL" "$EXPECTED_SWR" "${HTTP_CODE:-0}" "${swr_value:-null}" "$cdn_cc" "$cf_cache" "${age:-null}" "$status" "$message" "$TS"
  fi
}

if [ "$HTTP_CODE" = "000" ] || [ -z "$HTTP_CODE" ]; then
  emit_json "NETWORK_ERROR" "" "" "" "" "curl failed or timed out"
  exit 2
fi

CLEAN_HDR="$(tr -d '\r' < "$TMP_HDR")"
CDN_CC="$(printf '%s\n' "$CLEAN_HDR" | grep -i '^cloudflare-cdn-cache-control:' | tail -n1 | sed 's/^[^:]*:[[:space:]]*//' || true)"
CF_CACHE="$(printf '%s\n' "$CLEAN_HDR" | grep -i '^cf-cache-status:' | tail -n1 | sed 's/^[^:]*:[[:space:]]*//' || true)"
AGE="$(printf '%s\n' "$CLEAN_HDR" | grep -i '^age:' | tail -n1 | sed 's/^[^:]*:[[:space:]]*//' | tr -dc '0-9' || true)"
SWR_VALUE="$(printf '%s' "$CDN_CC" | grep -oiE 'stale-while-revalidate=[0-9]+' | tail -n1 | cut -d= -f2 || true)"

if [ -z "$CDN_CC" ]; then
  emit_json "SWR_MISSING" "" "" "$CF_CACHE" "$AGE" "Cloudflare-CDN-Cache-Control header not present"
  exit 1
fi

if [ -z "$SWR_VALUE" ]; then
  emit_json "SWR_MISSING" "" "$CDN_CC" "$CF_CACHE" "$AGE" "stale-while-revalidate directive not found"
  exit 1
fi

if [ "$SWR_VALUE" = "$EXPECTED_SWR" ]; then
  emit_json "PASS" "$SWR_VALUE" "$CDN_CC" "$CF_CACHE" "$AGE" "SWR matches expected value"
  exit 0
fi

emit_json "MISMATCH" "$SWR_VALUE" "$CDN_CC" "$CF_CACHE" "$AGE" "expected stale-while-revalidate=$EXPECTED_SWR, got $SWR_VALUE"
exit 1
