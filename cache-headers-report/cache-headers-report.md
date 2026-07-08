# Cache headers scan

- Base: `https://phlabs.co.uk`
- Probed: **18** paths
- Violations: **9**
- Generated: 2026-07-08T17:35:52.391Z

## html-shell paths

| Path | Status | cache-control | cdn-cache-control | surrogate-control | cf-cache-status | OK |
|---|---|---|---|---|---|---|
| `/` | 200 | `public, max-age=0, must-revalidate` | `public, max-age=60, stale-while-revalidate=60` | `no-store` | `DYNAMIC` | ❌ |
| `/products` | 200 | `public, max-age=0, must-revalidate` | `public, max-age=60, stale-while-revalidate=60` | `no-store` | `DYNAMIC` | ❌ |
| `/compound` | 200 | `public, max-age=0, must-revalidate` | `public, max-age=60, stale-while-revalidate=60` | `no-store` | `DYNAMIC` | ❌ |
| `/research` | 200 | `public, max-age=0, must-revalidate` | `public, max-age=60, stale-while-revalidate=60` | `no-store` | `DYNAMIC` | ❌ |
| `/landing/phlabs` | 200 | `public, max-age=0, must-revalidate` | `public, max-age=60, stale-while-revalidate=60` | `no-store` | `DYNAMIC` | ❌ |
| `/about` | 200 | `public, max-age=0, must-revalidate` | `public, max-age=60, stale-while-revalidate=60` | `no-store` | `DYNAMIC` | ❌ |
| `/contact` | 200 | `public, max-age=0, must-revalidate` | `public, max-age=60, stale-while-revalidate=60` | `no-store` | `DYNAMIC` | ❌ |
| `/resources` | 200 | `public, max-age=0, must-revalidate` | `public, max-age=60, stale-while-revalidate=60` | `no-store` | `DYNAMIC` | ❌ |
| `/peptide-calculator` | 200 | `public, max-age=0, must-revalidate` | `public, max-age=60, stale-while-revalidate=60` | `no-store` | `DYNAMIC` | ❌ |

## sensitive paths

| Path | Status | cache-control | cdn-cache-control | surrogate-control | cf-cache-status | OK |
|---|---|---|---|---|---|---|
| `/admin` | 200 | `no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0` | `no-store` | `no-store` | `DYNAMIC` | ✅ |
| `/cart` | 200 | `no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0` | `no-store` | `no-store` | `DYNAMIC` | ✅ |
| `/checkout` | 200 | `no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0` | `no-store` | `no-store` | `DYNAMIC` | ✅ |
| `/account` | 200 | `no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0` | `no-store` | `no-store` | `DYNAMIC` | ✅ |
| `/login` | 200 | `no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0` | `no-store` | `no-store` | `DYNAMIC` | ✅ |
| `/register` | 200 | `no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0` | `no-store` | `no-store` | `DYNAMIC` | ✅ |
| `/payment` | 200 | `no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0` | `no-store` | `no-store` | `DYNAMIC` | ✅ |
| `/vip` | 200 | `no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0` | `no-store` | `no-store` | `DYNAMIC` | ✅ |
| `/api/public/cache-config` | 200 | `no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0` | `no-store` | `no-store` | `DYNAMIC` | ✅ |

## Violations

### ❌ `/` (html-shell)
- cdn-cache-control must be "no-store" on HTML shell (got "public, max-age=60, stale-while-revalidate=60")

### ❌ `/products` (html-shell)
- cdn-cache-control must be "no-store" on HTML shell (got "public, max-age=60, stale-while-revalidate=60")

### ❌ `/compound` (html-shell)
- cdn-cache-control must be "no-store" on HTML shell (got "public, max-age=60, stale-while-revalidate=60")

### ❌ `/research` (html-shell)
- cdn-cache-control must be "no-store" on HTML shell (got "public, max-age=60, stale-while-revalidate=60")

### ❌ `/landing/phlabs` (html-shell)
- cdn-cache-control must be "no-store" on HTML shell (got "public, max-age=60, stale-while-revalidate=60")

### ❌ `/about` (html-shell)
- cdn-cache-control must be "no-store" on HTML shell (got "public, max-age=60, stale-while-revalidate=60")

### ❌ `/contact` (html-shell)
- cdn-cache-control must be "no-store" on HTML shell (got "public, max-age=60, stale-while-revalidate=60")

### ❌ `/resources` (html-shell)
- cdn-cache-control must be "no-store" on HTML shell (got "public, max-age=60, stale-while-revalidate=60")

### ❌ `/peptide-calculator` (html-shell)
- cdn-cache-control must be "no-store" on HTML shell (got "public, max-age=60, stale-while-revalidate=60")
