/**
 * Reproduces the deploy-stale-chunk scenario and confirms the recovery
 * path (Try-again hard reload) fully evicts the app-owned worker + caches
 * and navigates to a cache-busted URL — WITHOUT touching unrelated caches
 * (e.g. firebase-messaging-*) or third-party service workers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearClientCaches,
  findCachedLastKnownUrl,
  hardReload,
  HARD_RELOAD_FLAG,
  isAppOwnedCache,
  isAppOwnedRegistration,
  isStaleChunkError,
} from "./recovery";

// ---------- shared fakes ----------

type FakeCache = {
  _entries: Map<string, Response>;
  keys: () => Promise<Request[]>;
  match: (req: Request | string) => Promise<Response | undefined>;
  delete: (req: Request | string) => Promise<boolean>;
  put: (req: Request | string, res: Response) => Promise<void>;
};

function makeFakeCache(entries: Record<string, Response> = {}): FakeCache {
  const map = new Map<string, Response>();
  for (const [k, v] of Object.entries(entries)) map.set(k, v);
  return {
    _entries: map,
    keys: async () => Array.from(map.keys()).map((u) => new Request(u)),
    match: async (req) => {
      const url = typeof req === "string" ? req : req.url;
      return map.get(url);
    },
    delete: async (req) => {
      const url = typeof req === "string" ? req : req.url;
      return map.delete(url);
    },
    put: async (req, res) => {
      const url = typeof req === "string" ? req : req.url;
      map.set(url, res);
    },
  };
}

function installFakeCaches(buckets: Record<string, FakeCache>) {
  const cs = {
    keys: vi.fn(async () => Object.keys(buckets)),
    open: vi.fn(async (name: string) => {
      if (!buckets[name]) buckets[name] = makeFakeCache();
      return buckets[name] as unknown as Cache;
    }),
    delete: vi.fn(async (name: string) => {
      const existed = name in buckets;
      delete buckets[name];
      return existed;
    }),
    match: vi.fn(),
    has: vi.fn(),
  };
  (globalThis as { caches?: unknown }).caches = cs;
  return cs;
}

function installFakeSW(regs: Array<{ scriptURL: string; unregister: () => Promise<boolean> }>) {
  const built = regs.map((r) => ({
    active: { scriptURL: r.scriptURL },
    installing: null,
    waiting: null,
    unregister: r.unregister,
  })) as unknown as ServiceWorkerRegistration[];
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistrations: vi.fn(async () => built),
    },
  });
  return built;
}

// ---------- tests ----------

describe("isStaleChunkError", () => {
  it("matches the Vite/Rollup hashed-chunk error families", () => {
    const samples = [
      "Failed to fetch dynamically imported module: https://phlabs.co.uk/assets/Home-abc123.js",
      "Importing a module script failed.",
      "Loading chunk 42 failed.",
      "ChunkLoadError: Loading chunk vendor failed",
      "error loading dynamically imported module",
      "Unable to preload CSS for /assets/index-xyz.css",
      "Unable to preload module /assets/Home-abc123.js",
    ];
    for (const m of samples) {
      expect(isStaleChunkError(new Error(m))).toBe(true);
    }
  });

  it("does NOT match unrelated runtime errors", () => {
    expect(isStaleChunkError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isStaleChunkError(new Error("Firebase: permission denied"))).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
  });
});

describe("scoped eviction", () => {
  it("isAppOwnedCache only matches our prefixes", () => {
    expect(isAppOwnedCache("phlabs-offline-v1")).toBe(true);
    expect(isAppOwnedCache("phlabs-lkg-v1")).toBe(true);
    expect(isAppOwnedCache("workbox-precache-v2-https://phlabs.co.uk/")).toBe(true);
    expect(isAppOwnedCache("runtime-something")).toBe(true);

    // Critical: we must NOT match the FCM messaging cache.
    expect(isAppOwnedCache("firebase-messaging-default")).toBe(false);
    expect(isAppOwnedCache("firebase-messaging-store")).toBe(false);
    expect(isAppOwnedCache("onesignal-cache")).toBe(false);
    expect(isAppOwnedCache("some-other-app")).toBe(false);
  });

  it("isAppOwnedRegistration accepts /sw.js, rejects firebase-messaging-sw.js", () => {
    const ours = {
      active: { scriptURL: `${window.location.origin}/sw.js` },
    } as unknown as ServiceWorkerRegistration;
    expect(isAppOwnedRegistration(ours)).toBe(true);

    const fcm = {
      active: { scriptURL: `${window.location.origin}/firebase-messaging-sw.js` },
    } as unknown as ServiceWorkerRegistration;
    expect(isAppOwnedRegistration(fcm)).toBe(false);

    const crossOrigin = {
      active: { scriptURL: `https://evil.example.com/sw.js` },
    } as unknown as ServiceWorkerRegistration;
    expect(isAppOwnedRegistration(crossOrigin)).toBe(false);
  });
});

describe("clearClientCaches", () => {
  let origCaches: unknown;
  let origSW: PropertyDescriptor | undefined;

  beforeEach(() => {
    origCaches = (globalThis as { caches?: unknown }).caches;
    origSW = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
    try { sessionStorage.clear(); } catch { /* ignore */ }
  });

  afterEach(() => {
    if (origCaches === undefined) delete (globalThis as { caches?: unknown }).caches;
    else (globalThis as { caches?: unknown }).caches = origCaches;
    if (origSW) Object.defineProperty(navigator, "serviceWorker", origSW);
    vi.restoreAllMocks();
  });

  it("deletes ONLY app-owned cache buckets and leaves FCM caches intact", async () => {
    const buckets: Record<string, FakeCache> = {
      "phlabs-offline-v1": makeFakeCache(),
      "phlabs-lkg-v1": makeFakeCache(),
      "workbox-precache-v2-x": makeFakeCache(),
      "firebase-messaging-default": makeFakeCache(),
      "onesignal-cache": makeFakeCache(),
    };
    installFakeCaches(buckets);

    await clearClientCaches(200);

    // App-owned: gone.
    expect("phlabs-offline-v1" in buckets).toBe(false);
    expect("phlabs-lkg-v1" in buckets).toBe(false);
    expect("workbox-precache-v2-x" in buckets).toBe(false);
    // Third-party: preserved.
    expect("firebase-messaging-default" in buckets).toBe(true);
    expect("onesignal-cache" in buckets).toBe(true);
  });

  it("unregisters ONLY our /sw.js and leaves firebase-messaging-sw.js running", async () => {
    const unregAppSw = vi.fn(async () => true);
    const unregFcmSw = vi.fn(async () => true);
    installFakeSW([
      { scriptURL: `${window.location.origin}/sw.js`, unregister: unregAppSw },
      { scriptURL: `${window.location.origin}/firebase-messaging-sw.js`, unregister: unregFcmSw },
    ]);

    await clearClientCaches(200);

    expect(unregAppSw).toHaveBeenCalledTimes(1);
    expect(unregFcmSw).not.toHaveBeenCalled();
  });

  it("never hangs past its timeout when caches.keys() stalls forever", async () => {
    // @ts-expect-error — partial CacheStorage stub
    globalThis.caches = {
      keys: () => new Promise<string[]>(() => { /* never resolves */ }),
    };
    const start = Date.now();
    await clearClientCaches(100);
    expect(Date.now() - start).toBeLessThan(500);
  });
});

describe("hardReload", () => {
  let origCaches: unknown;
  let origLoc: PropertyDescriptor | undefined;
  let replace: ReturnType<typeof vi.fn>;
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    origCaches = (globalThis as { caches?: unknown }).caches;
    installFakeCaches({}); // empty
    origLoc = Object.getOwnPropertyDescriptor(window, "location");
    replace = vi.fn();
    reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        href: "https://phlabs.co.uk/products?foo=bar",
        origin: "https://phlabs.co.uk",
        pathname: "/products",
        search: "?foo=bar",
        hostname: "phlabs.co.uk",
        replace,
        reload,
      },
    });
    sessionStorage.clear();
  });

  afterEach(() => {
    if (origCaches === undefined) delete (globalThis as { caches?: unknown }).caches;
    else (globalThis as { caches?: unknown }).caches = origCaches;
    if (origLoc) Object.defineProperty(window, "location", origLoc);
  });

  it("reproduces the stale-chunk recovery flow: evicts app caches and navigates with cache-buster", async () => {
    // Simulate a tab open across a deploy: the old chunk reference is dead.
    const chunkErr = new Error(
      "Failed to fetch dynamically imported module: https://phlabs.co.uk/assets/Home-OLDHASH.js",
    );
    expect(isStaleChunkError(chunkErr)).toBe(true);

    // The app's caches still hold stale entries from the previous deploy.
    const lkg = makeFakeCache({
      "https://phlabs.co.uk/": new Response("<html>old</html>", {
        headers: { "content-type": "text/html" },
      }),
    });
    installFakeCaches({
      "phlabs-lkg-v1": lkg,
      "firebase-messaging-default": makeFakeCache(),
    });
    // And the old service worker is still registered.
    const unregister = vi.fn(async () => true);
    installFakeSW([
      { scriptURL: `${window.location.origin}/sw.js`, unregister },
    ]);

    // User clicks "Try again" → hardReload runs.
    await hardReload();

    // Old SW unregistered, stale LKG bucket gone, FCM bucket untouched.
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledTimes(1);

    // Navigation went to the same URL with a fresh _r= buster.
    const target = new URL(replace.mock.calls[0][0] as string);
    expect(target.pathname).toBe("/products");
    expect(target.searchParams.get("foo")).toBe("bar");
    expect(target.searchParams.get("_r")).toMatch(/^\d+$/);
  });

  it("is re-entrant: a second concurrent call is a no-op", async () => {
    installFakeCaches({});
    installFakeSW([]);
    await Promise.all([hardReload(), hardReload(), hardReload()]);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(HARD_RELOAD_FLAG)).toBe("1");
  });
});

describe("findCachedLastKnownUrl", () => {
  let origCaches: unknown;
  beforeEach(() => { origCaches = (globalThis as { caches?: unknown }).caches; });
  afterEach(() => {
    if (origCaches === undefined) delete (globalThis as { caches?: unknown }).caches;
    else (globalThis as { caches?: unknown }).caches = origCaches;
  });

  it("returns the cached HTML pathname when the LKG cache has one", async () => {
    const lkg = makeFakeCache({
      [`${window.location.origin}/products`]: new Response("<html>products</html>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
      [`${window.location.origin}/assets/x.js`]: new Response("//js", {
        headers: { "content-type": "application/javascript" },
      }),
    });
    installFakeCaches({ "phlabs-lkg-v1": lkg });

    const url = await findCachedLastKnownUrl();
    expect(url).toBe("/products");
  });

  it("ignores caches that are not app-owned (e.g. firebase-messaging)", async () => {
    const fcm = makeFakeCache({
      [`${window.location.origin}/notify`]: new Response("<html>fcm</html>", {
        headers: { "content-type": "text/html" },
      }),
    });
    installFakeCaches({ "firebase-messaging-default": fcm });
    const url = await findCachedLastKnownUrl();
    expect(url).toBeNull();
  });
});
