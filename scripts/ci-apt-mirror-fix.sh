#!/usr/bin/env bash
# ci-apt-mirror-fix.sh — guard against azure.archive.ubuntu.com DNS outages.
#
# GitHub-hosted runners are Azure VMs whose apt mirror config points at the
# Azure-internal Ubuntu mirror (azure.archive.ubuntu.com). When that host's
# DNS goes SERVFAIL (observed 2026-11-11, multi-hour global outage), every
# `playwright install --with-deps` step hard-fails and kills the job.
#
# Only when the host is unresolvable, this rewrites apt sources to the
# canonical archive.ubuntu.com (the Azure mirror's upstream, reachable from
# the runners) and refreshes the index. When DNS is healthy it is a no-op
# beyond one getent lookup, so it is safe to run unconditionally before
# Playwright browser installs.
set -euo pipefail

HOST="azure.archive.ubuntu.com"
if getent hosts "$HOST" >/dev/null 2>&1; then
  echo "[ci-apt-mirror-fix] $HOST resolves — apt mirror OK, no change"
  exit 0
fi

echo "[ci-apt-mirror-fix] $HOST does NOT resolve — switching apt sources to archive.ubuntu.com"
sudo sed -i 's|azure\.archive\.ubuntu\.com|archive.ubuntu.com|g' /etc/apt/apt-mirrors.txt 2>/dev/null || true
sudo sed -i 's|azure\.archive\.ubuntu\.com|archive.ubuntu.com|g' /etc/apt/sources.list 2>/dev/null || true
if [ -d /etc/apt/sources.list.d ]; then
  sudo find /etc/apt/sources.list.d -type f \( -name '*.list' -o -name '*.sources' \) \
    -exec sed -i 's|azure\.archive\.ubuntu\.com|archive.ubuntu.com|g' {} + 2>/dev/null || true
fi
echo "[ci-apt-mirror-fix] apt sources switched; playwright's own apt-get update will use archive.ubuntu.com"
