#!/usr/bin/env bash
# Warm the Cloudflare edge HTML cache on the phlabs-prerender Worker so the
# first real customer after a deploy/rollback lands on a HIT instead of a
# cold prerender fill. Called from .github/workflows/deploy-worker.yml.
#
# Strategy: hit each URL twice.
#   pass 1 → populates the Worker's caches.default (MISS)
#   pass 2 → should show X-PHL-Via: edge-html-hit
# Requests run 3-at-a-time (small parallel batches) with a realistic
# browser UA so the Worker takes the browser branch (not the bot branch).
set -uo pipefail

BASE="${BASE:-https://phlabs.co.uk}"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
CONCURRENCY="${CONCURRENCY:-3}"

# Top URLs — homepage, listing, top-selling product detail pages,
# compliance page, and the merchant feed (bot-cached separately but cheap).
URLS=(
  "/"
  "/products"
  "/products/retatrutide"
  "/products/bpc-157"
  "/products/tirzepatide"
  "/quality-control"
  "/google-merchant-feed.xml"
)

warm_one() {
  local path="$1"
  local url="${BASE}${path}"
  local http1 http2 via2
  # Pass 1: populate
  http1=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 -A "$UA" -H "Accept: text/html,application/xhtml+xml,application/xml" "$url" || echo "000")
  # Small delay to let ctx.waitUntil(cache.put(...)) settle before the 2nd hit
  sleep 1
  # Pass 2: expect HIT
  local hdrs
  hdrs=$(curl -sSI --max-time 20 -A "$UA" -H "Accept: text/html,application/xhtml+xml,application/xml" "$url" || true)
  http2=$(printf '%s\n' "$hdrs" | awk 'toupper($1) ~ /^HTTP/ {code=$2} END{print code+0}')
  via2=$(printf '%s\n' "$hdrs" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-phl-via"{print $2; exit}')
  printf '  %-40s pass1=%s pass2=%s via=%s\n' "$path" "$http1" "$http2" "${via2:-<none>}"
  # Fail hard on any non-200.
  if [ "$http1" != "200" ] || [ "$http2" != "200" ]; then
    echo "::error::warm-up failed for $path (pass1=$http1 pass2=$http2)"
    return 1
  fi
  # Feed and product-detail pages that fell through to origin passthrough
  # legitimately won't show edge-html-hit — warn but don't fail.
  case "$via2" in
    edge-html-hit*) : ;;
    *) echo "::warning::$path 2nd hit did not report edge-html-hit (via=${via2:-<none>})" ;;
  esac
  return 0
}

echo "Warming ${#URLS[@]} URLs on $BASE (concurrency=$CONCURRENCY)"

fail=0
pids=()
running=0
for path in "${URLS[@]}"; do
  warm_one "$path" &
  pids+=($!)
  running=$((running + 1))
  if [ "$running" -ge "$CONCURRENCY" ]; then
    for pid in "${pids[@]}"; do
      wait "$pid" || fail=$((fail + 1))
    done
    pids=()
    running=0
  fi
done
for pid in "${pids[@]}"; do
  wait "$pid" || fail=$((fail + 1))
done

if [ "$fail" -gt 0 ]; then
  echo "::error::Edge warm-up: $fail URL(s) failed"
  exit 1
fi
echo "Edge warm-up complete."
