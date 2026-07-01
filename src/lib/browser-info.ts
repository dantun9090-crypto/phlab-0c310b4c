// Lightweight User-Agent → { name, version, os } parser.
//
// We deliberately DON'T pull in a heavy UA-parser dependency for the client
// bundle — cache-recovery telemetry only needs a coarse browser/version
// bucket (Chrome 149, Firefox 128, Safari 17, Edge 130, …) so we can spot
// regressions by browser family, not ship a fingerprint.

export interface BrowserInfo {
  name: string;      // "Chrome" | "Firefox" | "Safari" | "Edge" | "Opera" | "Samsung" | "Other"
  version: string;   // major version, e.g. "149"
  os: string;        // "Windows" | "macOS" | "iOS" | "Android" | "Linux" | "Other"
  mobile: boolean;
}

export function parseBrowser(uaRaw: string | null | undefined): BrowserInfo {
  const ua = String(uaRaw || "");
  let name = "Other";
  let version = "0";

  // Order matters — Edg/OPR/SamsungBrowser must be checked before Chrome
  // (they all include "Chrome/…" in their UA).
  const patterns: Array<[string, RegExp]> = [
    ["Edge",     /Edg\/(\d+)/],
    ["Opera",    /OPR\/(\d+)/],
    ["Samsung",  /SamsungBrowser\/(\d+)/],
    ["Firefox",  /Firefox\/(\d+)/],
    ["Chrome",   /Chrome\/(\d+)/],
    ["Safari",   /Version\/(\d+).+Safari\//],
  ];
  for (const [n, re] of patterns) {
    const m = ua.match(re);
    if (m) { name = n; version = m[1]; break; }
  }

  let os = "Other";
  if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Mac OS X/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  const mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);

  return { name, version, os, mobile };
}

export function currentBrowser(): BrowserInfo {
  try {
    return parseBrowser(typeof navigator === "undefined" ? "" : navigator.userAgent);
  } catch {
    return { name: "Other", version: "0", os: "Other", mobile: false };
  }
}
