#!/usr/bin/env bash
# Install cosign from the pinned GitHub release with retry + checksum
# verification. Replaces sigstore/cosign-installer: its download step
# intermittently dies with curl exit 35 (TLS handshake reset from the
# release CDN), which cascaded into exit 127 ("cosign: command not found")
# in every signing/attestation step and failed the whole security scan
# on what was a pure network flake.
set -euo pipefail

COSIGN_VERSION="${COSIGN_VERSION:-v2.6.0}"
COSIGN_BIN="cosign-linux-amd64"
# Pinned SHA-256 of cosign-linux-amd64 from the release's
# cosign_checksums.txt (verified locally before this commit). We check the
# downloaded binary against this constant AND cross-check that the
# release's own checksums file agrees, so a tampered or truncated
# download is always caught.
COSIGN_LINUX_AMD64_SHA256="ea5c65f99425d6cfbb5c4b5de5dac035f14d09131c1a0ea7c7fc32eab39364f9"
BASE="https://github.com/sigstore/cosign/releases/download/${COSIGN_VERSION}"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fetch() { # fetch <url> <out> — up to 5 attempts, linear backoff
  local url="$1" out="$2" attempt
  for attempt in 1 2 3 4 5; do
    if curl -fsSL \
         --connect-timeout 15 \
         --retry 3 --retry-delay 2 --retry-all-errors \
         -o "$out" "$url"; then
      return 0
    fi
    echo "download failed (attempt ${attempt}/5): $url" >&2
    sleep $((attempt * 3))
  done
  echo "giving up on $url" >&2
  return 1
}

fetch "${BASE}/${COSIGN_BIN}" "${tmp}/${COSIGN_BIN}"
fetch "${BASE}/cosign_checksums.txt" "${tmp}/cosign_checksums.txt"

echo "${COSIGN_LINUX_AMD64_SHA256}  ${tmp}/${COSIGN_BIN}" | sha256sum -c -
grep -F "${COSIGN_LINUX_AMD64_SHA256}  ${COSIGN_BIN}" "${tmp}/cosign_checksums.txt" >/dev/null

sudo install -m 0755 "${tmp}/${COSIGN_BIN}" /usr/local/bin/cosign
cosign version
