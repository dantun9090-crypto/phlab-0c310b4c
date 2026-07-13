#!/usr/bin/env bash
# Homepage cache-control regression guard.
#
# Fails hard if `/` ever comes back with a `s-maxage=N` (N>0) or
# `stale-while-revalidate` directive on either the browser Cache-Control
# header or the CDN tier (Cloudflare-CDN-Cache-Control / CDN-Cache-Control
# / Surrogate-Control). Those directives were the exact root cause of the
# "endless stale HTML shell" incidents — reintroducing them is a hard
# regression, so CI must block the deploy.
#
# Also asserts that `no-store` is present on both tiers so a partial
# rollback (dropping no-store without adding s-maxage) still fails.
#
# Env:
#   BASE_URL       — origin under test (default https://phlabs.co.uk)
#   ATTEMPTS       — number of cache-busted probes (default 5)
#   RETRY_DELAY    — seconds between probes (default 2)
#
# Exit codes:
#   0  — every probe passed
#   1  — one or more probes tripped the guard

set -uo pipefail

BASE_URL="${BASE_URL:-https://phlabs.co.uk}"
ATTEMPTS="${ATTEMPTS:-5}"
RETRY_DELAY="${RETRY_DELAY:-2}"

# s-maxage=0 is fine (it means "do not share-cache"). Only positive values
# reintroduce shared caching. stale-while-revalidate at ANY value is a
# regression — that's the directive that lets Cloudflare serve stale HTML
# while revalidating in the background, which is the failure mode we hit.
BAD_SMAXAGE_RE='(^|[,; ])s-maxage=[1-9][0-9]*'
BAD_SWR_RE='stale-while-revalidate'

fail=0

echo "=== Homepage cache-control guard ==="
echo "base_url = $BASE_URL"
echo "attempts = $ATTEMPTS"
echo

for i in $(seq 1 "$ATTEMPTS"); do
  cb="$(date +%s%N)-$i-$RANDOM"
  url="${BASE_URL}/?__cache_guard=${cb}"
  headers=$(curl -sSI --max-time 15 \
    -A 'phlabs-cache-guard/1.0' \
    -H 'cache-control: no-cache' \
    -H 'pragma: no-cache' \
    "$url")
  curl_rc=$?

  if [ $curl_rc -ne 0 ]; then
    echo "::error::attempt $i — curl failed rc=$curl_rc for $url"
    fail=1
    sleep "$RETRY_DELAY"
    continue
  fi

  cc=$(echo "$headers"    | grep -i '^cache-control:'                | tail -n1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//' | tr '[:upper:]' '[:lower:]')
  cdn=$(echo "$headers"   | grep -i '^cdn-cache-control:'            | tail -n1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//' | tr '[:upper:]' '[:lower:]')
  cf=$(echo "$headers"    | grep -i '^cloudflare-cdn-cache-control:' | tail -n1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//' | tr '[:upper:]' '[:lower:]')
  surr=$(echo "$headers"  | grep -i '^surrogate-control:'            | tail -n1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//' | tr '[:upper:]' '[:lower:]')

  echo "--- attempt $i"
  echo "  cache-control:                   ${cc:-<missing>}"
  echo "  cdn-cache-control:               ${cdn:-<missing>}"
  echo "  cloudflare-cdn-cache-control:    ${cf:-<missing>}"
  echo "  surrogate-control:               ${surr:-<missing>}"

  if [ -z "$cc" ]; then
    echo "::error::attempt $i — missing Cache-Control header on /"
    fail=1
    continue
  fi

  # Positive s-maxage regression, any tier.
  for h in "$cc" "$cdn" "$cf" "$surr"; do
    [ -z "$h" ] && continue
    if [[ "$h" =~ $BAD_SMAXAGE_RE ]]; then
      echo "::error::attempt $i — forbidden 's-maxage=N' (N>0) on /: \"$h\""
      fail=1
    fi
    if echo "$h" | grep -q "$BAD_SWR_RE"; then
      echo "::error::attempt $i — forbidden 'stale-while-revalidate' on /: \"$h\""
      fail=1
    fi
  done

  # Browser tier must include no-store.
  if ! echo "$cc" | grep -q 'no-store'; then
    echo "::error::attempt $i — browser Cache-Control missing 'no-store': \"$cc\""
    fail=1
  fi

  # CDN tier must include no-store on at least one CDN header.
  cdn_any="${cdn}${cf}${surr}"
  if [ -z "$cdn_any" ] || ! echo "$cdn_any" | grep -q 'no-store'; then
    echo "::error::attempt $i — CDN tier missing 'no-store' (cdn=\"$cdn\" cf=\"$cf\" surrogate=\"$surr\")"
    fail=1
  fi

  [ "$i" -lt "$ATTEMPTS" ] && sleep "$RETRY_DELAY"
done

echo
if [ "$fail" -ne 0 ]; then
  echo "::error::Homepage cache-control guard FAILED — s-maxage / stale-while-revalidate regression on /"
  exit 1
fi

echo "All $ATTEMPTS probes clean — no s-maxage / stale-while-revalidate on /. ✅"
exit 0
