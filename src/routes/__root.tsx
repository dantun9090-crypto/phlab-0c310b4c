import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Component, useEffect, useState, type ReactNode } from "react";

import { PageTransition } from "@/components/PageTransition";
import appCss from "../styles.css?url";
import "@/lib/chunk-reload";
import "@/lib/sw-register";
import {
  clearClientCaches as _clearClientCaches, // re-exported for tests if needed
  clearHydrationError,
  findCachedLastKnownUrl,
  HARD_RELOAD_FLAG,
  hardReload,
  isHydrationMismatchError,
  isOnline,
  markHydrationError,
} from "@/lib/recovery";
import { schedulePrecacheCurrentPage } from "@/lib/lkg-cache";
import { clearStoreCachesForNewBuild } from "@/lib/build-cache";
import { PageviewBeacon } from "@/components/PageviewBeacon";
import DayNightToggle from "@/components/DayNightToggle";
import { initWebVitals } from "@/lib/web-vitals";
import { installErrorMonitor } from "@/lib/error-monitor";
import { installBfcacheMonitor } from "@/lib/bfcache-monitor";
import { installClientErrorReporter } from "@/lib/client-error-reporter";
import { installChunkAutoRecovery } from "@/lib/chunk-auto-recovery";
void _clearClientCaches;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      {/* React 19 hoists these meta tags into <head> during SSR so prerender.io
          sees the 404 signal in the server-rendered HTML, not only after hydration. */}
      <meta name="prerender-status-code" content="404" />
      <meta name="robots" content="noindex, follow" />
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}


// Stale-chunk detection, scoped SW/cache eviction, hard reload, and the
// last-known-good lookup live in src/lib/recovery.ts so they can be unit
// tested (see src/lib/recovery.test.ts).



const AUTO_RELOAD_KEY = "__phl_route_err_reload_at";
const AUTO_RELOAD_COUNT_KEY = "__phl_route_err_reload_count";
const AUTO_RECOVERY_DONE_KEY = "__phl_route_auto_recovery_done";

function OfflineScreen() {
  const [cachedUrl, setCachedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void findCachedLastKnownUrl().then((u) => { if (!cancelled) setCachedUrl(u); });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Check your connection
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You appear to be offline. We'll retry automatically as soon as you're
          back online.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { void hardReload(); }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Retry now
          </button>
          {cachedUrl ? (
            <a
              href={cachedUrl}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Open last cached page
            </a>
          ) : (
            <a
              href="/offline.html"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              View offline page
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function HydrationRecoveryScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Refresh needed
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page did not initialise cleanly. Automatic reloads have been stopped so your browser does not loop.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              clearHydrationError();
              window.location.reload();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Refresh page
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

class RootHydrationBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error?: Error }
> {
  state: { hasError: boolean; error?: Error } = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    if (isHydrationMismatchError(error)) markHydrationError();
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    if (isHydrationMismatchError(error)) markHydrationError();
    console.error("[ROOT HYDRATION BOUNDARY]", error, info?.componentStack || "");
  }

  render() {
    if (this.state.hasError) return <HydrationRecoveryScreen />;
    return this.props.children;
  }
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const [offline, setOffline] = useState<boolean>(() => !isOnline());
  const isHydrationError = isHydrationMismatchError(error);

  useEffect(() => {
    if (isHydrationError) {
      markHydrationError();
    }
  }, [isHydrationError]);

  // Track connectivity in real time so the screen can flip without a reload
  // (e.g. user toggles wifi while staring at the error).
  useEffect(() => {
    const sync = () => setOffline(!isOnline());
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  // Offline path: don't show the generic "didn't load" copy; we know why.
  if (offline) return <OfflineScreen />;

  if (isHydrationError) return <HydrationRecoveryScreen />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Refreshing latest store
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We detected an old browser copy and are clearing it automatically.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              // Manual Try again: always take the hard path in prod so the SW
              // and HTTP cache are evicted. Reset auto-recovery counters so
              // this click is treated as a fresh attempt, not a loop.
              try {
                sessionStorage.removeItem(AUTO_RELOAD_KEY);
                sessionStorage.removeItem(AUTO_RELOAD_COUNT_KEY);
                sessionStorage.removeItem(AUTO_RECOVERY_DONE_KEY);
                sessionStorage.removeItem(HARD_RELOAD_FLAG);
                clearHydrationError();
              } catch { /* ignore */ }
              if (!isOnline()) { setOffline(true); return; }
              if (import.meta.env.PROD) {
                void hardReload({ clean: true, home: true });
              } else {
                router.invalidate();
                reset();
              }
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Reload store
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "google", content: "notranslate" },
      // Do NOT add Cache-Control/Pragma/Expires http-equiv tags here. Real
      // cache policy belongs in response headers; meta no-store conflicted
      // with Cloudflare edge HTML caching and amplified stale-shell recovery
      // after publishes.
      // Build marker — helps confirm which build a stale tab is running.
      { name: "x-build-id", content: typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev" },
      { name: "author", content: "PH Labs UK" },
      { property: "og:site_name", content: "PH Labs UK" },
      { property: "og:locale", content: "en_GB" },
      { httpEquiv: "content-language", content: "en-GB" },
      { name: "language", content: "English" },
      { name: "geo.region", content: "GB-LND" },
      { name: "geo.placename", content: "London" },
      { name: "geo.position", content: "51.5236;-0.0859" },
      { name: "ICBM", content: "51.5236, -0.0859" },
      { name: "distribution", content: "UK" },
      { name: "target_country", content: "GB" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#020617" },
      { name: "apple-mobile-web-app-title", content: "PH Labs" },
      { name: "application-name", content: "PH Labs" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "google-site-verification", content: "tYtU-dRlfAq14D7lyPTYf8noiJH-b0LifcvvrGi8AZw" },
      // Sitewide defaults — Lovable's publish dialog reads these to know the
      // site has proper website info. Leaf routes (index, products,
      // products_.$slug, $) override title/description/og:title/og:description/
      // og:image with their own per-page values; TanStack dedupes head items
      // by name/property, so the leaf entry wins where present.
      { title: "PH Labs UK — HPLC-Verified Research Peptides" },
      { name: "description", content: "UK supplier of HPLC-verified research peptides. Lab-tested purity, transparent COAs, and fast UK dispatch for research professionals. For research use only." },
      { property: "og:title", content: "PH Labs UK — HPLC-Verified Research Peptides" },
      { property: "og:description", content: "UK supplier of HPLC-verified research peptides. Lab-tested purity, transparent COAs, and fast UK dispatch for research professionals. For research use only." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://phlabs.co.uk/" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/94a66073-2fa6-4218-83ac-c6a958544b55" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "PH Labs UK — Research Peptides" },
      { name: "twitter:title", content: "PH Labs UK — HPLC-Verified Research Peptides" },
      { name: "twitter:description", content: "UK supplier of HPLC-verified research peptides. Lab-tested purity, transparent COAs, and fast UK dispatch for research professionals. For research use only." },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/94a66073-2fa6-4218-83ac-c6a958544b55" },
    ],
    scripts: [
      // NOTE: GA4/GTM, Microsoft Clarity, Taboola Pixel and Bing UET are
      // intentionally NOT injected in <head>. They are all loaded after
      // React hydration + requestIdleCallback (or first user interaction)
      // via useEffects in RootComponent — see loadGtagAfterHydration and
      // loadThirdPartyAfterHydration below. Keeps ~30–50 KB of blocking
      // JS off the TBT window on marketing routes like /compound.
      {
        // Plausible Analytics — privacy-friendly, bot-filtered by default.
        // Loaded async in <head>; init() call runs on parse so it registers
        // the first pageview before hydration completes.
        src: "https://plausible.io/js/pa-7Z1K0cwecuaO5JrCx4qN4.js",
        async: true,
      },
      {
        type: "text/javascript",
        children: `window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init();`,
      },
      {


        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": "https://phlabs.co.uk/#organization",
              name: "PH Labs UK",
              url: "https://phlabs.co.uk",
              logo: {
                "@type": "ImageObject",
                url: "https://phlabs.co.uk/og-image.jpg",
              },
              areaServed: "GB",
              description:
                "UK supplier of HPLC-verified research peptides. Lab-tested purity, transparent COAs, and fast UK dispatch for research professionals.",
              contactPoint: {
                "@type": "ContactPoint",
                contactType: "customer support",
                email: "info@phlabs.co.uk",
                areaServed: "GB",
                availableLanguage: ["English"],
              },
              sameAs: [
                "https://www.facebook.com/phlabs",
                "https://www.instagram.com/phlabs",
                "https://x.com/phlabs",
              ],
            },
            // NOTE: LocalBusiness + WebSite (with SearchAction) live on
            // the home route (src/routes/index.tsx) only — they're sitewide
            // identity blocks that don't need to be repeated on every page.
            // Keeping them root-wide bloated product HTML by ~3 KB and
            // diluted entity signals (Google prefers single canonical home).
          ],
        }),
      },
    ],
    links: [
      // Main Tailwind/app stylesheet — deferred to non-blocking via the
      // media=print swap pattern. A small block of critical CSS is inlined
      // in RootShell's <head> so first paint isn't unstyled while this
      // downloads. Inline script in `scripts` above swaps media back to
      // "all" the moment the sheet has parsed.
      { rel: "preload", as: "style", href: appCss },
      { rel: "stylesheet", href: appCss, media: "print", id: "appcss" },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/icon-16.png" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/icon-32.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "sitemap", type: "application/xml", href: "/sitemap.xml" },
      // hreflang removed from root — hardcoding href="/" on every route was
      // wrong (pointed every page at the homepage). Single-language UK site
      // doesn't need hreflang; leaf routes set their own canonical instead.
      { rel: "preconnect", href: "https://firestore.googleapis.com", crossOrigin: "" },
      { rel: "preconnect", href: "https://firebaseinstallations.googleapis.com", crossOrigin: "" },
      { rel: "preconnect", href: "https://firebasestorage.googleapis.com", crossOrigin: "" },
      { rel: "preconnect", href: "https://identitytoolkit.googleapis.com", crossOrigin: "" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      // NOTE: Google Fonts stylesheet (#gfonts) is intentionally NOT injected
      // in SSR HTML. It is appended to <head> after React hydration via a
      // useEffect in RootComponent (see loadGoogleFontsAfterHydration below)
      // to prevent the third-party stylesheet from mutating <head> before
      // hydration completes, which was triggering React error #418
      // (hydration mismatch) in Chrome/Firefox/Edge.
      // Analytics / Tag Manager — used sitewide; preconnect shaves ~150–300ms
      // off the first GA/GTM request on slow mobile networks.
      { rel: "preconnect", href: "https://www.googletagmanager.com", crossOrigin: "" },
      { rel: "preconnect", href: "https://www.google-analytics.com", crossOrigin: "" },
      { rel: "dns-prefetch", href: "https://firestore.googleapis.com" },
      { rel: "dns-prefetch", href: "https://firebasestorage.googleapis.com" },
      { rel: "dns-prefetch", href: "https://fonts.googleapis.com" },
      { rel: "dns-prefetch", href: "https://fonts.gstatic.com" },
      { rel: "dns-prefetch", href: "https://www.googletagmanager.com" },
      { rel: "dns-prefetch", href: "https://www.google-analytics.com" },


    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});
// Runs FIRST. Reads its own `nonce` attribute (stamped by HTMLRewriter in the
// Worker) and monkey-patches `document.createElement` so every <script>
// element created at runtime — Firebase SDK loader, GTM, recaptcha, any
// third-party injector — gets the same nonce automatically. Combined with
// `'strict-dynamic'`, this means runtime-injected scripts never appear
// without nonce coverage.
const NONCE_PROPAGATOR = `
(function(){
  try{
    var cs = document.currentScript;
    var n = (cs && cs.nonce) || (cs && cs.getAttribute && cs.getAttribute('nonce')) || '';
    if(!n) return;
    try{ window.__cspNonce = n; }catch(e){}
    var origCreate = document.createElement.bind(document);
    document.createElement = function(tag){
      var el = origCreate.apply(document, arguments);
      try{
        var t = (''+tag).toLowerCase();
        if(t === 'script' || t === 'style'){
          el.setAttribute('nonce', n);
        }
      }catch(e){}
      return el;
    };
  }catch(e){}
})();
`;


const FORCE_SW_CLEANUP = `
(function(){
  var clearAllCaches=function(){
    try{
      if('caches' in window && caches.keys){
        caches.keys().then(function(names){
          return Promise.all(names.map(function(name){
            try{ console.info('Cache deleted:', name); }catch(e){}
            return caches.delete(name).catch(function(){});
          }));
        }).catch(function(){});
      }
    }catch(e){}
  };
  var shouldFullCleanup=false;
  try{
    var qs=new URLSearchParams(location.search);
    shouldFullCleanup=qs.get('sw')==='off'||qs.get('phl_sw_cleanup')==='1';
  }catch(e){}
  var scriptUrl=function(registration){
    try{return (registration.active&&registration.active.scriptURL)||(registration.installing&&registration.installing.scriptURL)||(registration.waiting&&registration.waiting.scriptURL)||'';}catch(e){return '';}
  };
  var isLegacy=function(registration){ return new RegExp('\\/service-worker\\.js(?:$|[?#])','i').test(scriptUrl(registration)); };
  var isAppWorker=function(registration){ return new RegExp('\\/(?:sw|service-worker)\\.js(?:$|[?#])','i').test(scriptUrl(registration)); };
  try{
    if('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations){
      navigator.serviceWorker.getRegistrations().then(function(registrations){
        // Normal visits must NOT unregister /sw.js on every load. That creates
        // service-worker churn after every publish and looks like a refresh
        // loop. Only explicit ?sw=off runs a full cleanup; otherwise remove
        // only the legacy /service-worker.js kill-switch registration.
        var filtered=registrations.filter(shouldFullCleanup?isAppWorker:isLegacy);
        return Promise.all(registrations.map(function(registration){
          if(filtered.indexOf(registration)===-1) return Promise.resolve();
          try{ console.info('SW unregistered:', registration.scope); }catch(e){}
          return registration.unregister().catch(function(){});
        }));
      }).then(function(){ if(shouldFullCleanup) clearAllCaches(); },function(){ if(shouldFullCleanup) clearAllCaches(); });
    } else {
      if(shouldFullCleanup) clearAllCaches();
    }
  }catch(e){ if(shouldFullCleanup) clearAllCaches(); }

})();
`;


const EMERGENCY_STALE_RELOAD = `
(function(){
  try{
    var qs=new URLSearchParams(location.search);
    if(qs.has('__fresh')) return;
    var blocked=/^\/(?:admin|auth|login|account|cart|checkout|payment|register)(?:\/|$)/i.test(location.pathname||'');
    if(blocked) return;
    var reloading=false;
    var forceFresh=function(reason){
      if(reloading) return;
      reloading=true;
      try{ console.warn('[PHL] Stale cache detected — forcing fresh load:', reason); }catch(e){}
      try{
        if(navigator.serviceWorker&&navigator.serviceWorker.ready){
          navigator.serviceWorker.ready.then(function(reg){ try{ if(reg&&reg.active) reg.active.postMessage({type:'CLEAR_CACHE_AND_RELOAD'}); }catch(e){} }).catch(function(){});
        }
      }catch(e){}
      var finish=function(){
        try{
          var u=new URL(location.href);
          u.searchParams.set('__fresh','1');
          u.searchParams.set('t',String(Date.now()));
          location.replace(u.toString());
        }catch(e){ location.href=location.pathname+'?__fresh=1&t='+Date.now(); }
      };
      try{
        var p=[];
        if(window.caches&&caches.keys){ p.push(caches.keys().then(function(keys){ return Promise.all(keys.map(function(k){ return caches.delete(k).catch(function(){}); })); })); }
        if(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations){ p.push(navigator.serviceWorker.getRegistrations().then(function(regs){ return Promise.all(regs.map(function(r){ return r.unregister().catch(function(){}); })); })); }
        Promise.all(p).catch(function(){}).then(finish);
        setTimeout(finish,1500);
      }catch(e){ finish(); }
    };
    setTimeout(function(){
      try{
        var root=document.getElementById('root')||document.getElementById('app');
        if(root&&root.children&&root.children.length===0) forceFresh('blank-root');
      }catch(e){}
    },3000);
    window.addEventListener('error',function(e){
      var t=e&&e.target;
      if(t&&t.tagName==='SCRIPT') forceFresh('script-load-failed');
    },true);
  }catch(e){}
})();
`;


const BOOT_WATCHDOG = `
(function(){
  try{
    var qs=new URLSearchParams(location.search);
    if(qs.has('_r')){
      try{
        qs.delete('_r');
        qs.delete('stale_recovery');
        var cleanRecoveryUrl=location.pathname+(qs.toString()?'?'+qs.toString():'')+location.hash;
        history.replaceState(null,'',cleanRecoveryUrl);
      }catch(e){}
    }
    var settle=function(p){ return Promise.resolve(p).catch(function(){}); };
    var ownCache=function(k){ return true; };
    var ownReg=function(r){
      try{
        var s=(r.active&&r.active.scriptURL)||(r.installing&&r.installing.scriptURL)||(r.waiting&&r.waiting.scriptURL)||'';
        if(!s) return false;
        var u=new URL(s);
        return u.origin===location.origin;
      }catch(e){ return false; }
    };
    if(qs.get('sw')==='off'){
      // Legacy recovery URLs used to clear caches and then auto-reload. That
      // created endless loops after publish when old HTML kept reintroducing
      // ?sw=off. Now we strip the recovery-only params, run cleanup in the
      // background, and continue booting without any automatic navigation.
      try{
        qs.delete('sw');
        qs.delete('_r');
        qs.delete('stale_recovery');
        var cleanSwUrl=location.pathname+(qs.toString()?'?'+qs.toString():'')+location.hash;
        history.replaceState(null,'',cleanSwUrl);
      }catch(e){}
      try{
        if('caches' in window){
          settle(caches.keys().then(function(ks){
            return Promise.all(ks.filter(ownCache).map(function(k){ return settle(caches.delete(k)); }));
          }));
        }
      }catch(e){}
      try{
        if(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations){
          settle(navigator.serviceWorker.getRegistrations().then(function(rs){
            return Promise.all(rs.filter(ownReg).map(function(r){ return settle(r.unregister()); }));
          }));
        }
      }catch(e){}
      try{ localStorage.removeItem('php_pwa_prompted'); sessionStorage.removeItem('__phl_hard_reload_in_flight'); sessionStorage.removeItem('__phl_route_err_reload_at'); sessionStorage.removeItem('__phl_route_err_reload_count'); sessionStorage.removeItem('__phl_boot_reload_at'); sessionStorage.removeItem('__phl_boot_reload_count'); }catch(e){}
    }
    // === Blank-page watchdog =================================================
    // Goals (post-2026-06-30 refresh-loop incident):
    //  1. Structured diagnostic log so future loops are debuggable.
    //  2. Better hasPaint() — fewer false negatives on slow/legit paints.
    //  3. Hard retry limit + per-session debounce so we cannot loop reload.
    //  4. Friendly fallback UI (manual refresh button) instead of auto-reload.
    // Exposes window.__phlBlankWatchdog for e2e + admin debug.
    var WATCH='__phl_blank_watchdog_done';
    var ATTEMPTS_KEY='__phl_blank_watchdog_attempts';
    var LAST_KEY='__phl_blank_watchdog_last_at';
    // --- Config flags (URL → localStorage → window global → <meta> → default)
    // Spec/tests: src/lib/blank-watchdog.ts.
    var readNum=function(v){ if(v==null) return null; var n=Number(v); return (isFinite(n)&&n>0)?n:null; };
    var readBool=function(v){ return v===true||v==='1'||v==='true'||v==='yes'; };
    var qp=null; try{ qp=new URLSearchParams(location.search); }catch(e){}
    var lsGet=function(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } };
    var lsSet=function(k,v){ try{ localStorage.setItem(k,v); }catch(e){} };
    var metaVal=function(n){ try{ var m=document.querySelector('meta[name="'+n+'"]'); return m?m.getAttribute('content'):null; }catch(e){ return null; } };
    var winCfg=(window.__PHL_WATCHDOG_CONFIG)||{};
    var pickNum=function(key,snake,dflt){
      var url=qp?qp.get('phl_watchdog_'+snake):null;
      if(url) lsSet('__phl_watchdog_'+snake,url);
      return readNum(url)
        || readNum(lsGet('__phl_watchdog_'+snake))
        || readNum(winCfg[key])
        || readNum(metaVal('phl-watchdog-'+snake.replace(/_/g,'-')))
        || dflt;
    };
    var MAX_ATTEMPTS=pickNum('maxAttempts','max_attempts',3);
    var DEBOUNCE_MS=pickNum('debounceMs','debounce_ms',60000);
    var FALLBACK_MS=pickNum('fallbackMs','fallback_ms',12000);
    var TEXT_THRESHOLD=pickNum('textThreshold','text_threshold',40);
    var SIZED_THRESHOLD=pickNum('sizedBlocksThreshold','sized_blocks_threshold',2);
    var urlDisabled=qp?qp.get('phl_watchdog_disabled'):null;
    if(urlDisabled!=null) lsSet('__phl_watchdog_disabled',urlDisabled);
    var DISABLED=readBool(urlDisabled)||readBool(lsGet('__phl_watchdog_disabled'))||readBool(winCfg.disabled)||readBool(metaVal('phl-watchdog-disabled'));
    var started=Date.now();
    var diagnostics={ started: started, ticks: 0, lastPaint: false, reason: '', fallbackShown: false, config:{ fallbackMs:FALLBACK_MS, debounceMs:DEBOUNCE_MS, maxAttempts:MAX_ATTEMPTS, textThreshold:TEXT_THRESHOLD, sizedBlocksThreshold:SIZED_THRESHOLD, disabled:DISABLED } };
    try{ window.__phlBlankWatchdog=diagnostics; }catch(e){}
    if(DISABLED){ try{ console.info('[phlabs] blank-watchdog: DISABLED via flag'); }catch(e){} return; }
    var hasPaint=function(){
      try{
        if(document.querySelector('[data-phl-app-ready], [data-phl-ready], header, nav, main, footer, #research-gate, #home, #products, [role="dialog"], [role="main"], [role="banner"], .phl-shell, #root > *, #__next > *')) { diagnostics.reason='landmark'; return true; }
        var body=document.body;
        if(!body) { diagnostics.reason='no-body'; return false; }
        var text=(body.innerText||body.textContent||'').replace(/\\s+/g,' ').trim();
        if(text.length>TEXT_THRESHOLD) { diagnostics.reason='text:'+text.length; return true; }
        if(body.querySelector('img, svg, canvas, video, picture')) { diagnostics.reason='media'; return true; }
        var children=body.querySelectorAll('*');
        var sized=0;
        for(var i=0;i<children.length && sized<SIZED_THRESHOLD+1;i++){
          try{ var r=children[i].getBoundingClientRect(); if(r.width>40 && r.height>20) sized++; }catch(e){}
        }
        if(sized>=SIZED_THRESHOLD) { diagnostics.reason='sized:'+sized; return true; }
        try{ if(window.__PHL_REACT_READY__) { diagnostics.reason='react-ready'; return true; } }catch(e){}
        diagnostics.reason='blank';
        return false;
      }catch(e){ diagnostics.reason='hasPaint-error'; return true; }
    };
    var attempts=0;
    try{ attempts=parseInt(sessionStorage.getItem(ATTEMPTS_KEY)||'0',10)||0; }catch(e){}
    var lastAt=0;
    try{ lastAt=parseInt(sessionStorage.getItem(LAST_KEY)||'0',10)||0; }catch(e){}
    // Best-effort SVG-foreignObject screenshot. Pure JS, no deps. Lossy and
    // can return null when the canvas is tainted by cross-origin images.
    // Mirrors src/lib/blank-watchdog-screenshot.ts.
    var captureScreenshot=function(){
      return new Promise(function(resolve){
        var done=false;
        var finish=function(v){ if(done) return; done=true; resolve(v); };
        setTimeout(function(){ finish(null); },1500);
        try{
          if(!document.body) return finish(null);
          var w=Math.min(window.innerWidth||1024,1024);
          var h=Math.min(window.innerHeight||1024,1024);
          var clone=document.body.cloneNode(true);
          try{ clone.querySelectorAll("script, link[rel='stylesheet']").forEach(function(n){ n.remove(); }); }catch(e){}
          var inner=new XMLSerializer().serializeToString(clone);
          var svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="background:#060f1e;color:#f0f6ff;font-family:system-ui;width:'+w+'px;height:'+h+'px;overflow:hidden">'+inner+'</div></foreignObject></svg>';
          var img=new Image();
          img.onload=function(){
            try{
              var canvas=document.createElement('canvas');
              canvas.width=w; canvas.height=h;
              var ctx=canvas.getContext('2d');
              if(!ctx) return finish(null);
              ctx.drawImage(img,0,0);
              finish(canvas.toDataURL('image/jpeg',0.5));
            }catch(e){ finish(null); }
          };
          img.onerror=function(){ finish(null); };
          img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
        }catch(e){ finish(null); }
      });
    };
    // Upload schema-compliant payload (matches /api/public/error-monitor Zod).
    // - htmlSnapshot is hard-capped at 32KB (schema cap 40KB).
    // - screenshot is dropped when above ~600KB (schema cap 600KB) so we never
    //   blow the request body and never trigger a 413.
    // - sendBeacon is fire-and-forget; when unavailable OR returns false we
    //   retry the fetch path with exponential backoff (1s, 2s, 4s).
    // - Truncation/drops log to console.warn so admins see why artifacts went missing.
    var HTML_CAP=32000;
    var SCREENSHOT_CAP=600000; // bytes-ish; data URL length
    var recordUpload=function(patch){
      try{
        diagnostics.lastUpload = Object.assign({ method:'none', ok:false, attempts:0, htmlTruncated:false, screenshotDropped:false, htmlOriginalLength:0, at:Date.now() }, diagnostics.lastUpload||{}, patch, { at:Date.now() });
      }catch(e){}
    };
    var uploadWithRetry=function(body, baseStatus){
      var attempt=0;
      var go=function(){
        attempt++;
        recordUpload(Object.assign({}, baseStatus, { method:'fetch', attempts:attempt, ok:false }));
        fetch('/api/public/error-monitor',{ method:'POST', headers:{'content-type':'application/json'}, body:body, keepalive:true })
          .then(function(r){ if(!r || !r.ok){ throw new Error('status '+(r?r.status:'none')); } recordUpload(Object.assign({}, baseStatus, { method:'fetch', attempts:attempt, ok:true })); })
          .catch(function(err){
            var msg=(err&&err.message)||'unknown';
            if(attempt>=3){ try{ console.warn('[phlabs] blank-watchdog upload failed after retries:', msg); }catch(e){} recordUpload(Object.assign({}, baseStatus, { method:'fetch', attempts:attempt, ok:false, error:msg })); return; }
            var delay=Math.pow(2,attempt-1)*1000; // 1s, 2s, 4s
            setTimeout(go, delay);
          });
      };
      go();
    };
    var uploadSnapshot=function(payload){
      try{
        var html='';
        try{ html=(document.documentElement&&document.documentElement.outerHTML)||''; }catch(e){}
        var htmlOriginalLength=html.length;
        var htmlTruncated=false;
        if(html.length>HTML_CAP){ html=html.slice(0,HTML_CAP)+'…[truncated]'; htmlTruncated=true; }
        captureScreenshot().then(function(screenshot){
          try{
            var screenshotDropped=false;
            if(screenshot && screenshot.length>SCREENSHOT_CAP){
              screenshotDropped=true;
              screenshot=null;
            }
            if(htmlTruncated){ try{ console.warn('[phlabs] blank-watchdog: htmlSnapshot truncated from '+htmlOriginalLength+' to '+HTML_CAP+' chars'); }catch(e){} }
            if(screenshotDropped){ try{ console.warn('[phlabs] blank-watchdog: screenshot dropped (over cap)'); }catch(e){} }
            var details={ reason:String(payload.reason||''), elapsed:Number(payload.elapsed)||0, ticks:Number(payload.ticks)||0, attempts:Number(payload.attempts)||0, readyState:String(payload.readyState||''), reactReady:!!payload.reactReady, fallbackMs:Number(diagnostics.config.fallbackMs)||0, maxAttempts:Number(diagnostics.config.maxAttempts)||0, htmlTruncated:htmlTruncated, screenshotDropped:screenshotDropped, htmlOriginalLength:htmlOriginalLength };
            var bodyObj={ type:'blank_watchdog', path:location.pathname, message:'blank-watchdog fallback shown', userAgent:String(payload.ua||navigator.userAgent).slice(0,500), details:details, htmlSnapshot:html };
            if(screenshot) bodyObj.screenshot=screenshot;
            var body=JSON.stringify(bodyObj);
            var baseStatus={ htmlTruncated:htmlTruncated, screenshotDropped:screenshotDropped, htmlOriginalLength:htmlOriginalLength };
            var beaconOk=false;
            if(navigator.sendBeacon){
              try{ beaconOk=navigator.sendBeacon('/api/public/error-monitor', new Blob([body],{type:'application/json'})); }catch(e){ beaconOk=false; }
            }
            if(beaconOk){
              recordUpload(Object.assign({}, baseStatus, { method:'beacon', attempts:1, ok:true }));
            } else {
              uploadWithRetry(body, baseStatus);
            }
          }catch(e){}
        });
      }catch(e){}
    };
    var showFallback=function(payload){
      if(diagnostics.fallbackShown) return;
      diagnostics.fallbackShown=true;
      try{ var fn=window.__phlSwTelemetry; if(typeof fn==='function') fn('sw_hydration_fallback_shown',{ elapsed: payload&&payload.elapsed||0, reason: (payload&&payload.reason)||'' }); }catch(_e){}
      uploadSnapshot(payload);
      try{
        if(!document.body) return;
        if(hasPaint()) return;
        var div=document.createElement('div');
        div.id='phl-blank-fallback';
        div.setAttribute('role','alert');
        div.style.cssText='position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:#060f1e;color:#f0f6ff;font-family:Inter Tight,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px';
        div.innerHTML='<div style="max-width:440px;text-align:center"><h1 style="font-size:22px;margin:0 0 10px;font-weight:700">Taking longer than usual</h1><p style="margin:0 0 18px;color:#9fb0c8;font-size:14px;line-height:1.55">The page has not finished loading. This is usually a slow connection or a stale cache. Try refreshing manually.</p><button id="phl-blank-refresh" style="appearance:none;border:0;border-radius:8px;background:#10b981;color:#03140d;font-weight:700;padding:12px 16px;cursor:pointer;min-height:44px">Refresh page</button> <a href="/?sw=off" style="display:inline-block;margin-left:8px;color:#9fb0c8;text-decoration:underline;min-height:44px;line-height:44px">Clear &amp; reload</a></div>';
        document.body.appendChild(div);
        var btn=document.getElementById('phl-blank-refresh');
        if(btn) btn.addEventListener('click',function(){ try{ sessionStorage.removeItem(ATTEMPTS_KEY); sessionStorage.removeItem(LAST_KEY); }catch(e){} location.reload(); });
      }catch(e){}
    };
    // Public test/admin hook: trigger the full fallback pipeline on demand.
    try{ diagnostics.forceFallback=function(){
      var payload={ at:new Date().toISOString(), url:location.href, elapsed:Date.now()-started, ticks:diagnostics.ticks, reason:'forced:'+(diagnostics.reason||'manual'), attempts:attempts, lastAt:lastAt, readyState:document.readyState, reactReady:!!window.__PHL_REACT_READY__, ua:navigator.userAgent.slice(0,140), config:diagnostics.config };
      showFallback(payload);
    }; }catch(e){}

    var tick=function(){
      diagnostics.ticks++;
      var painted=hasPaint();
      diagnostics.lastPaint=painted;
      if(painted){
        try{ sessionStorage.removeItem(ATTEMPTS_KEY); }catch(e){}
        try{ console.info('[phlabs] blank-watchdog: paint detected ('+diagnostics.reason+') after '+(Date.now()-started)+'ms, ticks='+diagnostics.ticks); }catch(e){}
        return;
      }
      var elapsed=Date.now()-started;
      if(elapsed<7000){ setTimeout(tick,700); return; }
      var payload={ at:new Date().toISOString(), url:location.href, elapsed:elapsed, ticks:diagnostics.ticks, reason:diagnostics.reason, attempts:attempts, lastAt:lastAt, readyState:document.readyState, reactReady:!!window.__PHL_REACT_READY__, ua:navigator.userAgent.slice(0,140), config:diagnostics.config };
      try{ console.warn('[phlabs] blank-watchdog: NO PAINT', payload); }catch(e){}
      var canEscalate = attempts < MAX_ATTEMPTS && (Date.now()-lastAt) > DEBOUNCE_MS;
      try{ sessionStorage.setItem(ATTEMPTS_KEY,String(attempts+1)); sessionStorage.setItem(LAST_KEY,String(Date.now())); }catch(e){}
      if(elapsed>=FALLBACK_MS && canEscalate){
        try{ console.warn('[phlabs] blank-watchdog: showing manual fallback (attempts='+(attempts+1)+'/'+MAX_ATTEMPTS+')'); }catch(e){}
        showFallback(payload);
        return;
      }
      if(elapsed<FALLBACK_MS){ setTimeout(tick,1000); return; }
    };
    if(document.readyState==='loading'){
      document.addEventListener('DOMContentLoaded',function(){ setTimeout(tick,7000); },{once:true});
    }else{
      setTimeout(tick,7000);
    }





  }catch(e){}
})();
`;

const STALE_ASSET_RECOVERY = `
(function(){
  try{
    var KEY='__phl_stale_asset_reload_at';
    var COUNT='phl_reload_count';
    var LEGACY_COUNT='__phl_stale_asset_reload_count';
    var HYDRATION='__phl_hydration_error_seen';
    var PURGE_FIRED='__phl_preemptive_purge_at';
    var ASSET_RE=new RegExp('/(assets|_build)/[^?#]+\\\\.(?:js|mjs|css)(?:[?#]|$)','i');
    // Preemptive post-publish auto-purge: fire BEFORE any chunks load. The
    // server compares __BUILD_ID__ vs the last value in Firestore — only the
    // first request after a Lovable Publish triggers Cloudflare purge +
    // Prerender recache, everything else is a 200ms no-op. Running this
    // inline (not in a React useEffect) means chunks 404'ing can't block it,
    // so stale-HTML loops self-heal on the very first visitor instead of
    // requiring a manual admin purge. Throttled to once per 5 min per tab.
    // Preemptive purge on every visit was removed — it caused 3s+ TTFB on
    // origin under load. The stale-asset 404 path below still triggers the
    // purge on demand when a visitor is provably on an old build.


    var isHydration=function(x){
      var msg='';
      try{ msg=String((x&&(x.message||x.name||x.stack))||x||''); }catch(e){}
      return new RegExp('Minified React error #418\\\\b|react\\\\.dev\\\\/errors\\\\/418\\\\b|Hydration failed|hydration mismatch|server rendered HTML didn\\'t match|server-rendered HTML.+client-side React|NotFoundError.+removeChild|removeChild.+not a child of this node|Node\\\\.removeChild','i').test(msg);
    };
    var showHydration=function(){
      try{
        sessionStorage.setItem(HYDRATION,String(Date.now()));
        try{ var fn=window.__phlSwTelemetry; if(typeof fn==='function') fn('sw_hydration_error',{ path: location.pathname }); }catch(_e){}
        try{ if(window.__phlHydrationFallback){ window.__phlHydrationFallback(new Error('Hydration mismatch detected by stale asset guard')); return; } }catch(e){}
        if(!document.body) return;
        document.body.innerHTML='<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#060f1e;color:#f0f6ff;font-family:Inter Tight,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px"><div style="max-width:440px;text-align:center"><h1 style="font-size:22px;margin:0 0 10px;font-weight:700">Refresh needed</h1><p style="margin:0 0 22px;color:#9fb0c8;font-size:14px;line-height:1.55">The page did not initialise cleanly. Click to clear cached files and reload.</p><button id="phl-hydration-refresh" style="appearance:none;border:0;border-radius:8px;background:#10b981;color:#03140d;font-weight:700;padding:12px 16px;cursor:pointer;min-height:44px">Refresh &amp; clear cache</button><a href="/" style="display:inline-block;margin-left:10px;color:#9fb0c8;text-decoration:underline">Go home</a></div></div>';
        var btn=document.getElementById('phl-hydration-refresh');
        if(btn) btn.addEventListener('click',hardReloadClean);
      }catch(e){}
    };
    var hasHydration=function(){ try{ return !!sessionStorage.getItem(HYDRATION); }catch(e){ return false; } };
    var clearAllStaleFlags=function(){
      try{
        sessionStorage.removeItem(KEY);
        sessionStorage.removeItem(COUNT);
        sessionStorage.removeItem(LEGACY_COUNT);
        sessionStorage.removeItem(HYDRATION);
        sessionStorage.removeItem(PURGE_FIRED);
        sessionStorage.removeItem('__phl_boot_reload_at');
        sessionStorage.removeItem('__phl_boot_reload_count');
        sessionStorage.removeItem('__phl_route_err_reload_at');
        sessionStorage.removeItem('__phl_route_err_reload_count');
        sessionStorage.removeItem('__phl_hard_reload_in_flight');
        localStorage.removeItem('phl_reload_count');
      }catch(e){}
    };
    var emit=function(evt,extra){ try{ var fn=window.__phlSwTelemetry; if(typeof fn==='function') fn(evt,extra||null); }catch(e){} };
    var hardReloadClean=function(){
      emit('sw_cache_reset_clicked',{ path: location.pathname });
      try{ sessionStorage.setItem('phl-sw-cache-reset-pending',String(Date.now())); }catch(e){}
      clearAllStaleFlags();
      // Unregister all SWs and wipe caches so the next request hits the
      // freshly-purged Cloudflare edge instead of a stale SW snapshot.
      var done=function(){
        try{
          var u=new URL(location.href);
          u.searchParams.set('_r', String(Date.now()));
          location.replace(u.toString());
        }catch(e){ location.reload(); }
      };
      var pending=0,finished=false;
      var tick=function(){ if(!finished&&pending<=0){ finished=true; done(); } };
      try{
        if(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations){
          pending++;
          navigator.serviceWorker.getRegistrations().then(function(regs){
            return Promise.all(regs.map(function(r){ return r.unregister().catch(function(){}); }));
          }).catch(function(){}).then(function(){ pending--; tick(); });
        }
      }catch(e){}
      try{
        if(window.caches&&caches.keys){
          pending++;
          caches.keys().then(function(keys){
            return Promise.all(keys.map(function(k){ return caches.delete(k).catch(function(){}); }));
          }).catch(function(){}).then(function(){ pending--; tick(); });
        }
      }catch(e){}
      // Hard timeout — never let cleanup stall the recovery click.
      setTimeout(function(){ if(!finished){ finished=true; done(); } },1500);
      tick();
    };
    var showLimit=function(){
      try{ console.error('[STALE_ASSET] Automatic reload blocked'); }catch(e){}
      emit('sw_stale_reload_shown',{ path: location.pathname });
      try{
        if(!document.body){ document.addEventListener('DOMContentLoaded',showLimit,{once:true}); return; }
        document.body.innerHTML='<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#060f1e;color:#f0f6ff;font-family:Inter Tight,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px"><div style="max-width:460px;text-align:center"><h1 style="font-size:22px;margin:0 0 10px;font-weight:700">Update available</h1><p style="margin:0 0 22px;color:#9fb0c8;font-size:14px;line-height:1.55">A fresh version is available. Click to clear cached files and reload.</p><button id="phl-stale-refresh" style="appearance:none;border:0;border-radius:8px;background:#10b981;color:#03140d;font-weight:700;padding:12px 16px;cursor:pointer;min-height:44px">Refresh &amp; clear cache</button></div></div>';
        var btn=document.getElementById('phl-stale-refresh');
        if(btn) btn.addEventListener('click',function(){ emit('sw_stale_reload_accepted'); hardReloadClean(); });
      }catch(e){}
    };

    var readCount=function(){
      try{
        var a=Number(sessionStorage.getItem(COUNT)||'0');
        var b=Number(sessionStorage.getItem(LEGACY_COUNT)||'0');
        return Math.max(isFinite(a)?a:0,isFinite(b)?b:0);
      }catch(e){ return 0; }
    };
    var onRecoveryUrl=function(){
      try{
        var qs=new URLSearchParams(location.search);
        return qs.get('stale_recovery')==='1';
      }catch(e){ return /(?:\\?|&)stale_recovery=1(?:&|$)/.test(location.search); }
    };
    var recover=function(src){
      if(hasHydration()) return;
      try{
        var p=(location.pathname||'').toLowerCase();
        var NEVER=['/login','/auth','/account','/checkout','/cart','/register'];
        for(var i=0;i<NEVER.length;i++){ if(p.indexOf(NEVER[i])===0){ try{ console.warn('[RELOAD BLOCKED] Critical route:',p); }catch(e){} return; } }
      }catch(e){}
      try{
        var last=Number(sessionStorage.getItem(KEY)||'0');
        var count=readCount();
        if(count>=1||onRecoveryUrl()){ showLimit(); return; }
        if(last&&Date.now()-last<30000) return;
      }catch(e){}
      // Verify the asset is actually missing before forcing a reload.
      // A parse/syntax/CSP error fires the same 'error' event but the asset is fine —
      // reloading would loop. Only reload when the server confirms 404/410.
      try{
        fetch(src,{method:'HEAD',cache:'no-store',credentials:'omit'}).then(function(res){
          if(hasHydration()) return;
          if(res && (res.status===404||res.status===410)){
            try{
              if(onRecoveryUrl()){ showLimit(); return; }
              var count=readCount();
              if(count>=1){ showLimit(); return; }
              count=count+1;
              sessionStorage.setItem(KEY,String(Date.now()));
              sessionStorage.setItem(COUNT,String(count));
              sessionStorage.setItem(LEGACY_COUNT,String(count));
            }catch(e){ showLimit(); return; }
            try{ console.warn('[phlabs] stale build asset 404, forcing clean reload:', src); }catch(e){}
            // Force-fire the auto-purge again (bypass throttle) — this visitor
            // is provably on a stale build, so we want CF + Prerender purged
            // before the reload navigates back to a freshly cached HTML.
            try{
              sessionStorage.removeItem(PURGE_FIRED);
              fetch('/api/public/post-publish-check',{method:'GET',cache:'no-store',credentials:'omit',keepalive:true}).catch(function(){});
            }catch(e){}

            showLimit();
          }
        }).catch(function(){});
      }catch(e){}
    };
    addEventListener('error',function(ev){ if(isHydration(ev&&(ev.error||ev.message))) showHydration(); },true);
    addEventListener('unhandledrejection',function(ev){ if(isHydration(ev&&ev.reason)) showHydration(); },true);
    addEventListener('error',function(ev){
      var t=ev&&ev.target;
      if(!t||t===window) return;
      var src=(t.src||t.href||'')+'';
      if(!src) return;
      try{ var u=new URL(src,location.href); if(u.origin!==location.origin) return; src=u.pathname+u.search; }catch(e){}
      if(ASSET_RE.test(src)) recover(src);
    },true);

    // Auto-reset the stale-asset counter once the app has clearly booted
    // without any asset 404s. Without this, a single transient 404 leaves
    // the counter at 1 forever, so the very next 404 immediately shows the
    // "Update available" wall — even after a Cloudflare purge has fixed the
    // underlying problem. We wait 8s after first paint and only reset if
    // there have been zero asset errors in this window.
    try{
      var sawAssetErr=false;
      addEventListener('error',function(ev){
        var t=ev&&ev.target;
        if(!t||t===window) return;
        var s=(t.src||t.href||'')+'';
        if(s && ASSET_RE.test(s)) sawAssetErr=true;
      },true);
      var resetIfClean=function(){
        if(sawAssetErr) return;
        try{
          sessionStorage.removeItem(KEY);
          sessionStorage.removeItem(COUNT);
          sessionStorage.removeItem(LEGACY_COUNT);
          localStorage.removeItem('phl_reload_count');
        }catch(e){}
      };
      // Fire 8s after DOMContentLoaded (or now, if already loaded).
      var schedule=function(){ setTimeout(resetIfClean,8000); };
      if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',schedule,{once:true});
      else schedule();
    }catch(e){}

  }catch(e){}
})();
`;

function installCanonicalEnforcer() {
  const ORIGIN = "https://phlabs.co.uk";
  let running = false;

  function upsertLink(rel: string, href: string) {
    let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
    if (!el) {
      el = document.createElement("link");
      el.setAttribute("rel", rel);
      document.head.appendChild(el);
    }
    if (el.getAttribute("href") !== href) el.setAttribute("href", href);
  }

  function upsertMeta(attr: "name" | "property", name: string, content: string) {
    let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attr, name);
      document.head.appendChild(el);
    }
    if (el.getAttribute("content") !== content) el.setAttribute("content", content);
  }

  function enforce() {
    if (running) return;
    running = true;
    try {
      let path = location.pathname.replace(/\/{2,}/g, "/");
      if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
      const qs = new URLSearchParams(location.search);
      qs.delete("_r");
      qs.delete("sw");
      const query = qs.toString();
      const url = `${ORIGIN}${path}${query ? `?${query}` : ""}`;
      upsertLink("canonical", url);
      upsertMeta("property", "og:url", url);
      upsertMeta("name", "twitter:url", url);
    } finally {
      running = false;
    }
  }

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  const schedule = () => window.setTimeout(enforce, 0);
  history.pushState = function patchedPushState(...args: Parameters<typeof history.pushState>) {
    const result = originalPushState.apply(this, args);
    schedule();
    return result;
  };
  history.replaceState = function patchedReplaceState(...args: Parameters<typeof history.replaceState>) {
    const result = originalReplaceState.apply(this, args);
    schedule();
    return result;
  };
  window.addEventListener("popstate", schedule);
  schedule();

  return () => {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    window.removeEventListener("popstate", schedule);
  };
}

// Critical above-the-fold CSS — inlined so first paint doesn't wait on the
// main stylesheet (which is now loaded non-blocking via media=print swap).
// Keep this small (<3 KB): boot bg/fg, header skeleton, banner stack
// reserved heights (CLS), and the LoadingFallback. Full Tailwind layer
// applies as soon as appCss loads (~100ms typical).
const CRITICAL_CSS = `
*,*::before,*::after{box-sizing:border-box;border-width:0;border-style:solid;min-width:0}
html,body,#root{max-width:100%;overflow-x:hidden;margin:0;background:#060f1e;color:#f0f6ff}
body{font-family:'Inter Tight','Inter Tight Fallback',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
h1,h2,h3{font-family:'Cormorant Garamond','Cormorant Garamond Fallback',Georgia,serif;margin:0;line-height:1.08;letter-spacing:-.015em}
img,svg,video{display:block;max-width:100%;height:auto}
header{top:0;z-index:50;min-height:56px;background:rgba(6,15,30,.92);border-bottom:1px solid rgba(255,255,255,.06)}
@media(min-width:768px){header{min-height:64px}}
[data-phl-banner]{min-height:32px}
[data-phl-research-banner]{min-height:34px}
.phl-boot{display:flex;align-items:center;justify-content:center;min-height:60vh;color:#9fb0c8;font-size:14px}
`;

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" suppressHydrationWarning style={{ backgroundColor: "#060f1e" }}>
      <head suppressHydrationWarning>
        {/* These must run before HeadContent, because HeadContent emits
            modulepreload links for hashed bundles. Old service workers can
            otherwise intercept those requests before cleanup starts. */}
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: NONCE_PROPAGATOR }} />
        {/* Apply persisted day/night theme before paint to avoid flash. */}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var s=localStorage.getItem('phlabs-theme-mode');var m=(s==='light'||s==='dark')?s:((window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark');var d=document.documentElement;if(m==='light'){d.classList.add('light');d.setAttribute('data-theme-mode','light');d.style.backgroundColor='#ffffff';}else{d.classList.remove('light');d.setAttribute('data-theme-mode','dark');}}catch(e){}})();",

          }}
        />
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: FORCE_SW_CLEANUP }} />
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: EMERGENCY_STALE_RELOAD }} />
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: STALE_ASSET_RECOVERY }} />
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: BOOT_WATCHDOG }} />
        <HeadContent />
        {/* Inline critical CSS — covers boot bg, header skeleton + banner
            reserved heights so the page paints styled before the deferred
            appCss arrives. Keep this synchronous and BEFORE any scripts. */}
        <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: CRITICAL_CSS }} />
        {/* No-JS fallback: if scripts are disabled the media=print swap
            never fires, so reload the main sheet as a blocking stylesheet. */}
        <noscript>
          <link rel="stylesheet" href={appCss} />
        </noscript>
      </head>

      <body suppressHydrationWarning style={{ backgroundColor: "#060f1e", color: "#f0f6ff", margin: 0 }}>
        {children}
        <Scripts />
      </body>

    </html>
  );
}


function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    try {
      const currentBuildId =
        (window as unknown as { __BUILD_ID__?: string }).__BUILD_ID__ ||
        document.querySelector('meta[name="x-build-id"]')?.getAttribute('content') ||
        document.querySelector('meta[name="build-id"]')?.getAttribute('content');
      const storedBuildId = localStorage.getItem('last_seen_build_id');
      if (currentBuildId && currentBuildId !== storedBuildId) {
        localStorage.setItem('last_seen_build_id', currentBuildId);
        fetch('/api/public/post-publish-check', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'omit',
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      /* ignore */
    }
    clearStoreCachesForNewBuild();
    (window as unknown as { __PHL_REACT_READY__?: boolean }).__PHL_REACT_READY__ = true;
    initWebVitals();
    installErrorMonitor();
    installBfcacheMonitor();
    installClientErrorReporter();
    installChunkAutoRecovery();
    const stableLoadTimer = window.setTimeout(() => {
      try {
        localStorage.removeItem('phl_reload_count');
        sessionStorage.removeItem('phl_reload_count');
        sessionStorage.removeItem('__phl_stale_asset_reload_count');
        sessionStorage.removeItem('__phl_stale_asset_reload_at');
        clearHydrationError();
      } catch {
        /* ignore */
      }
    }, 5000);
    const activateStylesheet = (id: string) => {
      const link = document.getElementById(id) as HTMLLinkElement | null;
      if (!link) return;
      const apply = () => { link.media = "all"; };
      if (link.sheet) apply();
      else link.addEventListener("load", apply, { once: true });
    };
    activateStylesheet("appcss");
    // Inject Google Fonts AFTER hydration so the third-party <link> doesn't
    // mutate <head> mid-hydration (React error #418).
    if (!document.getElementById("gfonts")) {
      const fontLink = document.createElement("link");
      fontLink.id = "gfonts";
      fontLink.rel = "stylesheet";
      fontLink.href =
        "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter+Tight:wght@400;500;600;700&display=swap";
      document.head.appendChild(fontLink);
    }
    return () => window.clearTimeout(stableLoadTimer);
  }, []);

  // Load GA4/GTM AFTER React hydration completes AND the main thread is idle.
  // Deferring to requestIdleCallback (with a 4s fallback, or 1s on first user
  // interaction) keeps gtag.js (~170 KB) out of the TBT window, which is the
  // dominant mobile Lighthouse penalty on marketing/landing routes like
  // /compound, /research and /landing/*. Conversion + page_view still fire,
  // just a couple seconds later. Bootstrap stays inline so consent + dataLayer
  // queue any early events before gtag.js resolves them.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as unknown as { __phlGaBootstrapped?: boolean }).__phlGaBootstrapped) return;
    const inline = document.createElement('script');
    inline.text =
      "(function(){window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;var c={a:false,m:false};try{var r=localStorage.getItem('php_cookie_consent');if(r){var p=JSON.parse(r);c.a=!!p.analytics;c.m=!!p.marketing;}}catch(e){}gtag('consent','default',{ad_storage:c.m?'granted':'denied',ad_user_data:c.m?'granted':'denied',ad_personalization:c.m?'granted':'denied',analytics_storage:c.a?'granted':'denied',functionality_storage:'granted',security_storage:'granted',wait_for_update:500});gtag('js',new Date());gtag('config','G-5HM4YT7HDW',{cookie_domain:'auto',cookie_flags:'SameSite=None;Secure',cookie_expires:63072000,cookie_update:true,send_page_view:true,anonymize_ip:true,allow_google_signals:c.m,allow_ad_personalization_signals:c.m});gtag('config','GT-P3HVF8R5',{send_page_view:false,cookie_domain:'auto'});gtag('config','GT-WRHD4Q69',{send_page_view:false,cookie_domain:'auto'});gtag('config','MC-KJMB7MKB29',{send_page_view:false,cookie_domain:'auto'});window.__phlGaBootstrapped=true;})();";
    document.body.appendChild(inline);
    let loaded = false;
    const loadExt = () => {
      if (loaded) return;
      loaded = true;
      const ext = document.createElement('script');
      ext.async = true;
      ext.src = 'https://www.googletagmanager.com/gtag/js?id=G-5HM4YT7HDW';
      document.body.appendChild(ext);
    };
    const onInteract = () => window.setTimeout(loadExt, 800);
    ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach((ev) =>
      window.addEventListener(ev, onInteract, { once: true, passive: true })
    );
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (typeof ric === 'function') ric(loadExt, { timeout: 4000 });
    else window.setTimeout(loadExt, 3500);
  }, []);

  // Load Clarity / Taboola / Bing UET after hydration + idle, matching the
  // GA loader above. These pixels were previously injected in SSR <head>
  // scripts, each blocking parse for hundreds of ms on mobile (Clarity alone
  // owned a 304ms long-task on /compound). Deferring them keeps TBT down
  // without changing measurement semantics — pageviews still fire, a beat
  // later. Consent-gated: skip marketing pixels unless the user opted in.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as { __phlThirdPartyBootstrapped?: boolean };
    if (w.__phlThirdPartyBootstrapped) return;
    w.__phlThirdPartyBootstrapped = true;

    let marketingConsent = false;
    try {
      const raw = localStorage.getItem('php_cookie_consent');
      if (raw) marketingConsent = !!JSON.parse(raw)?.marketing;
    } catch { /* no-op */ }

    let loaded = false;
    const loadAll = () => {
      if (loaded) return;
      loaded = true;
      // Microsoft Clarity — session recording / heatmaps
      const clarity = document.createElement('script');
      clarity.async = true;
      clarity.text =
        '(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];if(y&&y.parentNode){y.parentNode.insertBefore(t,y)}else{(l.head||l.documentElement).appendChild(t)}})(window, document, "clarity", "script", "x6yaoubye8");';
      document.body.appendChild(clarity);
      if (marketingConsent) {
        // Taboola Pixel
        const tab = document.createElement('script');
        tab.async = true;
        tab.text =
          "window._tfa = window._tfa || [];window._tfa.push({notify:'event',name:'page_view',id:2057501});!function(t,f,a,x){if(!document.getElementById(x)){t.async=1;t.src=a;t.id=x;if(f&&f.parentNode){f.parentNode.insertBefore(t,f)}else{(document.head||document.documentElement).appendChild(t)}}}(document.createElement('script'),document.getElementsByTagName('script')[0],'//cdn.taboola.com/libtrc/unip/2057501/tfa.js','tb_tfa_script');";
        document.body.appendChild(tab);
        // Bing UET
        const bing = document.createElement('script');
        bing.async = true;
        bing.text =
          '(function(w,d,t,r,u){var f,n,i;w[u]=w[u]||[],f=function(){var o={ti:"K120006478",enableAutoSpaTracking:true};o.q=w[u],w[u]=new UET(o),w[u].push("pageLoad")},n=d.createElement(t),n.src=r,n.async=1,n.onload=n.onreadystatechange=function(){var s=this.readyState;s&&s!=="loaded"&&s!=="complete"||(f(),n.onload=n.onreadystatechange=null)},i=d.getElementsByTagName(t)[0];if(i&&i.parentNode){i.parentNode.insertBefore(n,i)}else{(d.head||d.documentElement).appendChild(n)}})(window,document,"script","//bat.bing.com/bat.js","uetq");';
        document.body.appendChild(bing);
      }
    };
    const onInteract = () => window.setTimeout(loadAll, 1000);
    ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach((ev) =>
      window.addEventListener(ev, onInteract, { once: true, passive: true })
    );
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (typeof ric === 'function') ric(loadAll, { timeout: 5000 });
    else window.setTimeout(loadAll, 4500);
  }, []);





  useEffect(() => {
    return installCanonicalEnforcer();
  }, []);

  // Best-effort precache of the current page's HTML + critical assets so
  // the offline fallback (see OfflineScreen / findCachedLastKnownUrl) has
  // something to offer when the network drops. No-op in dev/preview.
  useEffect(() => {
    schedulePrecacheCurrentPage();
  }, []);

  return (
    <RootHydrationBoundary>
      <QueryClientProvider client={queryClient}>
        <PageviewBeacon />
        <PageTransition />
        {/* DayNightToggle moved into the header (Layout.tsx) */}
      </QueryClientProvider>
    </RootHydrationBoundary>
  );
}
