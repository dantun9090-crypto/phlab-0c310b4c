#!/usr/bin/env bash
# Warm the Cloudflare edge HTML cache on the phlabs-prerender Worker so the
# first real customer after a deploy/rollback lands on a HIT instead of a
# cold prerender fill.
#
# Post-incident (2026-07-17) hardening:
#   1. Wait for the NEW app's assets. Fetch the origin (ORIGIN_URL) shell,
#      extract its /assets/index-<hash>.js filename, then poll that asset
#      until it returns HTTP 200 (up to 120s). Warming BEFORE the new
#      assets are live is what caused the last incident (prerender.io got
#      a mid-deploy origin, we cached the wrong content, every visitor
#      landed on a dead site).
#   2. Double-hit each URL through the worker. Assert:
#        - HTTP 200 on both hits
#        - 2nd hit's X-PHL-Via contains 'edge-html-hit'
#        - 2nd hit's body passes the same content sanity guard the worker
#          uses (>=10KB, has <div id="root"> with markup, has the new
#          /assets/index-*.js filename, no watchdog-only marker).
#   3. If ANY URL fails => purge the HTML cache via CF API and exit 1.
#      The workflow will then treat this as a failed deploy and roll back.
set -uo pipefail

BASE="${BASE:-https://phlabs.co.uk}"
ORIGIN_URL="${ORIGIN_URL:-https://phlabs-prod.web.app}"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
MAX_ASSET_WAIT_S="${MAX_ASSET_WAIT_S:-120}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

URLS=(
  "/"
  "/products"
  "/products/retatrutide"
  "/products/bpc-157"
  "/products/tirzepatide"
  "/quality-control"
)
# Feed excluded from HTML warm-up — different code path, no HTML edge cache.

# ── 1. Wait for the new app's entry asset ────────────────────────────────
echo "==> Fetching origin shell to discover new entry asset: $ORIGIN_URL/"
ORIGIN_HTML="$TMP/origin.html"
extract_entry() {
  grep -oE '/assets/index-[A-Za-z0-9._-]+\.js' "$1" | head -1 || true
}
curl -sS -A "$UA" --max-time 20 -o "$ORIGIN_HTML" "$ORIGIN_URL/" || true
ENTRY_PATH=$(extract_entry "$ORIGIN_HTML")
if [ -z "$ENTRY_PATH" ]; then
  echo "::warning::origin shell fetch failed or no entry match — retrying via ${BASE}/ (worker fallback)"
  echo "--- first 200 bytes of origin ($ORIGIN_URL/) response ---"
  head -c 200 "$ORIGIN_HTML" 2>/dev/null || true
  echo
  echo "--- end origin ---"
  curl -sS -A "$UA" --max-time 20 -o "$ORIGIN_HTML" "${BASE}/" || true
  ENTRY_PATH=$(extract_entry "$ORIGIN_HTML")
fi
if [ -z "$ENTRY_PATH" ]; then
  echo "::warning::could not extract /assets/index-*.js from origin shell (both origin and worker fallback) — skipping warm-up (Playwright smoke is the real gate)"
  echo "--- first 200 bytes of worker fallback (${BASE}/) response ---"
  head -c 200 "$ORIGIN_HTML" 2>/dev/null || true
  echo
  echo "--- end worker fallback ---"
  exit 0
fi
echo "New entry asset: $ENTRY_PATH"

ASSET_URL="${BASE}${ENTRY_PATH}"
echo "==> Polling $ASSET_URL until 200 (max ${MAX_ASSET_WAIT_S}s)"
deadline=$(( $(date +%s) + MAX_ASSET_WAIT_S ))
asset_ok=0
while [ "$(date +%s)" -lt "$deadline" ]; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 -A "$UA" "$ASSET_URL" || echo "000")
  if [ "$code" = "200" ]; then asset_ok=1; break; fi
  echo "  asset not ready yet (HTTP $code) — retrying"
  sleep 3
done
if [ "$asset_ok" != "1" ]; then
  echo "::error::new entry asset never returned 200 within ${MAX_ASSET_WAIT_S}s: $ASSET_URL"
  exit 1
fi
echo "Entry asset is live."

# ── 2. Content sanity guard (mirrors worker isSaneRenderedHtml) ──────────
sanity_check() {
  local body_file="$1"
  local expected_entry="$2"
  local size
  size=$(wc -c < "$body_file")
  if [ "$size" -lt 10000 ]; then
    echo "sanity_fail:too_small:$size"; return 1
  fi
  if grep -q "Taking longer than usual" "$body_file"; then
    echo "sanity_fail:watchdog_marker"; return 1
  fi
  # Non-trivial root: look for <div id="root"> followed by real markup
  # within 8KB (accept either double or single quotes on id attr).
  if ! grep -qE '<div[^>]*id=("|'"'"')root("|'"'"')[^>]*>' "$body_file"; then
    echo "sanity_fail:no_root_div"; return 1
  fi
  # Extract text after the first root open and before the next </div> — cheap.
  root_inner=$(awk 'BEGIN{RS="\n"} /<div[^>]*id=("|'"'"')root("|'"'"')/{found=1} found{print}' "$body_file" \
    | head -c 8192)
  # Require at least one child tag AND >=200 chars before the first </div>.
  first_close=$(echo "$root_inner" | grep -boE '</div>' | head -1 | cut -d: -f1 || true)
  if [ -n "$first_close" ] && [ "$first_close" -lt 200 ]; then
    echo "sanity_fail:empty_root"; return 1
  fi
  if ! grep -qE '/assets/index-[A-Za-z0-9._-]+\.js' "$body_file"; then
    echo "sanity_fail:no_entry_script"; return 1
  fi
  if ! grep -qF "$expected_entry" "$body_file"; then
    body_entry=$(grep -oE '/assets/index-[A-Za-z0-9._-]+\.js' "$body_file" | head -1)
    echo "sanity_fail:entry_mismatch:${body_entry}!=${expected_entry}"; return 1
  fi
  return 0
}

# ── 3. Double-hit each URL, assert 2nd hit is HIT and passes sanity ──────
fail_count=0
for path in "${URLS[@]}"; do
  url="${BASE}${path}"
  printf '  %-40s ' "$path"
  # Pass 1: populate cache
  code1=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 25 -A "$UA" \
    -H "Accept: text/html,application/xhtml+xml" "$url" || echo "000")
  sleep 1
  # Pass 2: expect HIT + sane body
  body2="$TMP/pass2$(echo "$path" | tr '/' '_').html"
  hdr2="$TMP/hdr2$(echo "$path" | tr '/' '_').txt"
  code2=$(curl -sS -o "$body2" -D "$hdr2" -w "%{http_code}" --max-time 25 -A "$UA" \
    -H "Accept: text/html,application/xhtml+xml" "$url" || echo "000")
  via2=$(awk -F': ' 'tolower($1)=="x-phl-via"{print $2; exit}' "$hdr2" | tr -d '\r')

  status="ok"
  if [ "$code1" != "200" ] || [ "$code2" != "200" ]; then
    status="http_fail(p1=$code1,p2=$code2)"
  elif ! echo "$via2" | grep -q "edge-html-hit"; then
    status="not_hit(via=${via2:-<none>})"
  else
    if ! reason=$(sanity_check "$body2" "$ENTRY_PATH"); then
      status="$reason"
    fi
  fi
  echo "p1=$code1 p2=$code2 via=${via2:-<none>} → $status"
  if [ "$status" != "ok" ]; then
    fail_count=$((fail_count + 1))
  fi
done

if [ "$fail_count" -gt 0 ]; then
  echo "::error::Edge warm-up: $fail_count URL(s) failed sanity — purging HTML cache and failing the deploy."
  if [ -n "${CF_API_TOKEN:-}" ] && [ -n "${CF_ZONE_ID:-}" ]; then
    curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache" \
      -H "Authorization: Bearer $CF_API_TOKEN" \
      -H "Content-Type: application/json" \
      --data '{"files":["https://phlabs.co.uk/","https://phlabs.co.uk/products","https://phlabs.co.uk/products/retatrutide","https://phlabs.co.uk/products/bpc-157","https://phlabs.co.uk/products/tirzepatide","https://phlabs.co.uk/quality-control"]}' \
      | head -c 500
    echo
  else
    echo "::warning::CF_API_TOKEN/CF_ZONE_ID not exported to warm-edge — cache not purged automatically."
  fi
  exit 1
fi
echo "Edge warm-up complete: all URLs HIT + sane."
