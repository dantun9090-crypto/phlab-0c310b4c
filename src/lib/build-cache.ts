const BUILD_CACHE_VERSION_KEY = 'php_build_cache_version';

const STORE_CACHE_KEY_PATTERNS = [
  /^php_products_cache/i,
  /^php_store_cache/i,
  /^phlabs_products_cache/i,
  /^phlabs_store_cache/i,
];

export function getBuildCacheVersion(): string {
  try {
    return typeof __BUILD_ID__ === 'string' && __BUILD_ID__ ? __BUILD_ID__ : 'dev';
  } catch {
    return 'dev';
  }
}

export function clearStoreCachesForNewBuild(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  const current = getBuildCacheVersion();
  try {
    const previous = window.localStorage.getItem(BUILD_CACHE_VERSION_KEY);
    if (previous === current) return false;

    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (STORE_CACHE_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
        window.localStorage.removeItem(key);
      }
    }
    window.localStorage.setItem(BUILD_CACHE_VERSION_KEY, current);
    return true;
  } catch {
    return false;
  }
}

export function getFirestoreCacheBustParam(): string {
  return encodeURIComponent(getBuildCacheVersion());
}