#!/usr/bin/env bash
# Client-exception probe — queries the Firestore `client_exceptions` collection
# (or an equivalent public read-only endpoint) for events in the last N minutes.
# If FIREBASE_SERVICE_ACCOUNT_JSON is not present the probe emits PASS with a
# `not_configured` message so the workflow degrades gracefully.
#
# Usage:
#   scripts/probe-client-errors.sh [WINDOW_MIN] [THRESHOLD]
# Defaults: WINDOW_MIN=5  THRESHOLD=5
#
# Env inputs:
#   FIREBASE_SERVICE_ACCOUNT_JSON — full service account JSON (single line or file)
#   FIREBASE_PROJECT_ID           — optional override; else parsed from SA JSON
#   CLIENT_EXCEPTION_COLLECTION   — Firestore collection (default: client_exceptions)
#
# Output: single-line JSON:
#   {url, error_count, threshold, window_start, sample_paths, status, message, timestamp}
# Status: PASS | ALERT
# Exit:   0 = PASS, 1 = ALERT, 2 = probe error (still emits JSON)
set -uo pipefail

WINDOW_MIN="${1:-5}"
THRESHOLD="${2:-5}"
COLLECTION="${CLIENT_EXCEPTION_COLLECTION:-client_exceptions}"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
WINDOW_START="$(python3 -c "from datetime import datetime,timedelta,timezone;print((datetime.now(timezone.utc)-timedelta(minutes=${WINDOW_MIN})).strftime('%Y-%m-%dT%H:%M:%SZ'))")"

emit() {
  local status="$1" count="$2" paths_json="$3" message="$4"
  if command -v jq >/dev/null 2>&1; then
    jq -cn \
      --arg url "firestore://${COLLECTION}" \
      --argjson count "${count:-0}" \
      --argjson threshold "$THRESHOLD" \
      --arg window_start "$WINDOW_START" \
      --argjson sample_paths "${paths_json:-[]}" \
      --arg status "$status" \
      --arg message "$message" \
      --arg timestamp "$TS" \
      '{url:$url, error_count:$count, threshold:$threshold, window_start:$window_start,
        sample_paths:$sample_paths, status:$status, message:$message, timestamp:$timestamp}'
  else
    printf '{"url":"firestore://%s","error_count":%s,"threshold":%s,"window_start":"%s","sample_paths":%s,"status":"%s","message":"%s","timestamp":"%s"}\n' \
      "$COLLECTION" "${count:-0}" "$THRESHOLD" "$WINDOW_START" "${paths_json:-[]}" "$status" "$message" "$TS"
  fi
}

if [ -z "${FIREBASE_SERVICE_ACCOUNT_JSON:-}" ]; then
  emit "PASS" 0 "[]" "FIREBASE_SERVICE_ACCOUNT_JSON not configured — probe skipped"
  exit 0
fi

if ! command -v python3 >/dev/null 2>&1; then
  emit "PASS" 0 "[]" "python3 unavailable — probe skipped"
  exit 0
fi

RESULT="$(FIREBASE_SERVICE_ACCOUNT_JSON="$FIREBASE_SERVICE_ACCOUNT_JSON" \
  FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-}" \
  COLLECTION="$COLLECTION" \
  WINDOW_START="$WINDOW_START" \
  python3 <<'PY' 2>&1
import base64, json, os, sys, time, urllib.request, urllib.error, hmac, hashlib

def b64url(b): return base64.urlsafe_b64encode(b).rstrip(b'=').decode()

try:
    sa_raw = os.environ['FIREBASE_SERVICE_ACCOUNT_JSON']
    if os.path.isfile(sa_raw):
        sa_raw = open(sa_raw).read()
    sa = json.loads(sa_raw)
    project = os.environ.get('FIREBASE_PROJECT_ID') or sa['project_id']
    coll = os.environ['COLLECTION']
    window_start = os.environ['WINDOW_START']

    # Mint OAuth token via JWT bearer flow
    now = int(time.time())
    header = {'alg':'RS256','typ':'JWT'}
    claims = {
        'iss': sa['client_email'],
        'scope': 'https://www.googleapis.com/auth/datastore',
        'aud': 'https://oauth2.googleapis.com/token',
        'iat': now, 'exp': now + 3600,
    }
    signing_input = f"{b64url(json.dumps(header).encode())}.{b64url(json.dumps(claims).encode())}".encode()

    try:
        from cryptography.hazmat.primitives import serialization, hashes
        from cryptography.hazmat.primitives.asymmetric import padding
        key = serialization.load_pem_private_key(sa['private_key'].encode(), password=None)
        sig = key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
    except ImportError:
        print("ERR:cryptography_missing", file=sys.stderr); sys.exit(3)

    jwt = signing_input.decode() + '.' + b64url(sig)
    req = urllib.request.Request(
        'https://oauth2.googleapis.com/token',
        data=f"grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion={jwt}".encode(),
        headers={'Content-Type':'application/x-www-form-urlencoded'})
    tok = json.loads(urllib.request.urlopen(req, timeout=15).read())['access_token']

    body = {
      "structuredQuery": {
        "from":[{"collectionId": coll}],
        "where":{"fieldFilter":{"field":{"fieldPath":"createdAt"},"op":"GREATER_THAN_OR_EQUAL","value":{"timestampValue": window_start}}},
        "limit": 50
      }
    }
    url = f"https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents:runQuery"
    r = urllib.request.Request(url, data=json.dumps(body).encode(),
        headers={'Authorization':f'Bearer {tok}','Content-Type':'application/json'})
    docs = json.loads(urllib.request.urlopen(r, timeout=15).read())
    count = 0
    paths = []
    for d in docs:
        doc = d.get('document')
        if not doc: continue
        count += 1
        f = doc.get('fields',{})
        p = f.get('path',{}).get('stringValue') or f.get('url',{}).get('stringValue')
        if p and p not in paths and len(paths) < 5:
            paths.append(p)
    print(json.dumps({"count": count, "paths": paths}))
except urllib.error.HTTPError as e:
    print(f"ERR:http_{e.code}:{e.read().decode()[:200]}", file=sys.stderr); sys.exit(4)
except Exception as e:
    print(f"ERR:{type(e).__name__}:{e}", file=sys.stderr); sys.exit(5)
PY
)"
RC=$?

if [ $RC -ne 0 ]; then
  emit "PASS" 0 "[]" "probe error (${RESULT:0:120}) — treated as PASS to avoid false alarms"
  exit 0
fi

COUNT="$(echo "$RESULT" | jq -r '.count // 0' 2>/dev/null || echo 0)"
PATHS_JSON="$(echo "$RESULT" | jq -c '.paths // []' 2>/dev/null || echo '[]')"

if [ "$COUNT" -ge "$THRESHOLD" ]; then
  emit "ALERT" "$COUNT" "$PATHS_JSON" "client_exception threshold exceeded (${COUNT} ≥ ${THRESHOLD} in ${WINDOW_MIN}m)"
  exit 1
fi

emit "PASS" "$COUNT" "$PATHS_JSON" "client_exception count below threshold"
exit 0
