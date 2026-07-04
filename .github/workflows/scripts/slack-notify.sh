#!/usr/bin/env bash
# Slack notifier with graceful degradation.
# Usage: slack-notify.sh '<payload-json>' '<event-label>'
# If SLACK_WEBHOOK_URL is unset OR request fails, the payload is printed to
# stdout so it can be reviewed in the workflow logs — the script never fails.
set -uo pipefail

PAYLOAD="${1:-}"
LABEL="${2:-notice}"

if [ -z "$PAYLOAD" ]; then
  echo "slack-notify: empty payload for ${LABEL}, skipping"
  exit 0
fi

if [ -z "${SLACK_WEBHOOK_URL:-}" ]; then
  echo "::notice::SLACK_WEBHOOK_URL not configured — logging payload for '${LABEL}' instead."
  echo "----- SLACK PAYLOAD (${LABEL}) -----"
  echo "$PAYLOAD"
  echo "----- END SLACK PAYLOAD -----"
  exit 0
fi

http="$(curl -sS -o /tmp/slack.out -w '%{http_code}' \
  -X POST -H 'Content-Type: application/json' \
  --data "$PAYLOAD" "$SLACK_WEBHOOK_URL" || echo "000")"

if [ "$http" != "200" ]; then
  echo "::warning::Slack notify '${LABEL}' failed (HTTP ${http}). Payload below:"
  echo "$PAYLOAD"
  cat /tmp/slack.out 2>/dev/null || true
fi
exit 0
