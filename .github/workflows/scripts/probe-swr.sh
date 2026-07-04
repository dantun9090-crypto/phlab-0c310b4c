#!/usr/bin/env bash
# Probe live edge for Cloudflare-CDN-Cache-Control: stale-while-revalidate=$EXPECTED_SWR
# on the apex and www hosts. Exits non-zero on mismatch. Writes a summary block
# to $GITHUB_STEP_SUMMARY when available.
#
# Env inputs (with defaults):
#   EXPECTED_SWR   — required target value (default: 60)
#   MAX_ATTEMPTS   — retries per host (default: 6)
#   SLEEP_BETWEEN  — seconds between retries (default: 15)

set -euo pipefail

EXPECTED_SWR="${EXPECTED_SWR:-60}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-6}"
SLEEP_BETWEEN="${SLEEP_BETWEEN:-15}"

HOSTS=(
  "https://phlabs.co.uk/"
  "https://www.phlabs.co.uk/"
)

fail=0
summary=""

for url in "${HOSTS[@]}"; do
  attempt=0
  got=""
  header=""
  while [ $attempt -lt "$MAX_ATTEMPTS" ]; do
    attempt=$((attempt+1))
    header=$(curl -sSIL --max-time 15 \
      -H "cache-control: no-cache" \
      -A "phlabs-edge-swr-guard/1.0" \
      "$url" \
      | tr -d '\r' \
      | grep -i '^cloudflare-cdn-cache-control:' \
      | tail -n1 || true)
    got=$(printf '%s' "$header" \
      | grep -oiE 'stale-while-revalidate=[0-9]+' \
      | tail -n1 \
      | cut -d= -f2 || true)
    if [ "$got" = "$EXPECTED_SWR" ]; then
      break
    fi
    echo "::warning::[$url] attempt $attempt: got '${header:-<missing header>}' (swr='${got:-none}'), retrying in ${SLEEP_BETWEEN}s"
    sleep "$SLEEP_BETWEEN"
  done

  if [ "$got" = "$EXPECTED_SWR" ]; then
    line="✅ $url — $header"
    echo "$line"
  else
    line="❌ $url — expected stale-while-revalidate=$EXPECTED_SWR, got '${header:-<missing header>}'"
    echo "::error::$line"
    fail=1
  fi
  summary="${summary}${line}"$'\n'
done

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## Edge SWR guard"
    echo ""
    echo "Expected: \`Cloudflare-CDN-Cache-Control: ...stale-while-revalidate=$EXPECTED_SWR\`"
    echo ""
    echo '```'
    printf '%s' "$summary"
    echo '```'
  } >> "$GITHUB_STEP_SUMMARY"
fi

if [ $fail -ne 0 ]; then
  echo "::error::Edge SWR guard failed — Cloudflare Worker (phlabs-prerender) likely needs redeploy. See cloudflare/phlabs-prerender.mjs."
  exit 1
fi
