import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { PageTransition } from "@/components/PageTransition";
import appCss from "../styles.css?url";
import "@/lib/chunk-reload";
import "@/lib/sw-register";
import {
  clearClientCaches as _clearClientCaches, // re-exported for tests if needed
  findCachedLastKnownUrl,
  HARD_RELOAD_FLAG,
  hardReload,
  isOnline,
} from "@/lib/recovery";
import { schedulePrecacheCurrentPage } from "@/lib/lkg-cache";
import { clearStoreCachesForNewBuild } from "@/lib/build-cache";
import { PageviewBeacon } from "@/components/PageviewBeacon";
import { initWebVitals } from "@/lib/web-vitals";
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

    // Auto-retry when the browser reports the connection is back.
    const onOnline = () => { void hardReload(); };
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
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

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const [offline, setOffline] = useState<boolean>(() => !isOnline());

  useEffect(() => {
    if (!isOnline()) return;
    // Retry up to 3 times before giving up and showing the error screen.
    // Each attempt escalates: 1st = soft reload, 2nd = clean reload, 3rd = clean + home.
    let attempt = 0;
    try {
      attempt = Number(sessionStorage.getItem(AUTO_RECOVERY_DONE_KEY) || "0");
      if (attempt >= 3) return;
      sessionStorage.setItem(AUTO_RECOVERY_DONE_KEY, String(attempt + 1));
      sessionStorage.removeItem(HARD_RELOAD_FLAG);
    } catch { /* ignore */ }
    const delay = 250 + attempt * 400;
    const t = setTimeout(() => {
      const opts =
        attempt === 0 ? { clean: false, home: false } :
        attempt === 1 ? { clean: true, home: false } :
                        { clean: true, home: true };
      void hardReload(opts);
    }, delay);
    return () => clearTimeout(t);
  }, []);

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
      // Belt-and-braces: even when an intermediary ignores response headers,
      // these <meta http-equiv> tags signal the HTML document itself must
      // never be cached. Prevents stale shells loading new hashed asset
      // chunks (which would surface as React hydration error #418).
      { httpEquiv: "Cache-Control", content: "no-cache, no-store, must-revalidate" },
      { httpEquiv: "Pragma", content: "no-cache" },
      { httpEquiv: "Expires", content: "0" },
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
      { property: "og:description", content: "UK supplier of HPLC-verified research peptides. Lab-tested purity, transparent COAs, fast UK dispatch. For research use only." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://phlabs.co.uk/" },
      { property: "og:image", content: "https://phlabs.co.uk/og-image.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "PH Labs UK — Research Peptides" },
      { name: "twitter:title", content: "PH Labs UK — HPLC-Verified Research Peptides" },
      { name: "twitter:description", content: "UK supplier of HPLC-verified research peptides. Lab-tested purity, transparent COAs, fast UK dispatch." },
      { name: "twitter:image", content: "https://phlabs.co.uk/og-image.jpg" },
    ],
    scripts: [
      // NOTE: GA4/GTM scripts are intentionally NOT injected in <head>.
      // They are loaded after React hydration via a useEffect in
      // RootComponent (see loadGtagAfterHydration below) to prevent
      // GTM from mutating the DOM before hydration completes, which
      // was triggering React error #418 (hydration mismatch) in
      // Chrome/Firefox/Edge after the GA dynamic-config swap.
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
      {
        // Swap the Google Fonts stylesheet back to media="all" after the
        // browser finishes downloading it. Pairs with the `media="print"`
        // hint on the <link> above so fonts never block first paint.
        children:
          "(function(){var l=document.getElementById('gfonts');if(l){function s(){l.media='all'}if(l.sheet){s()}else{l.addEventListener('load',s,{once:true})}}var a=document.getElementById('appcss');if(a){function t(){a.media='all'}if(a.sheet){t()}else{a.addEventListener('load',t,{once:true})}}})();",
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
      // Non-blocking font load (media=print swap pattern). The stylesheet
      // downloads in the background without delaying first paint; the
      // inline script in `scripts` below swaps media back to "all" once
      // it's loaded, so the fonts apply as soon as they're ready. FOUT is
      // accepted in exchange for a faster FCP/LCP.
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter+Tight:wght@400;500;600;700&display=swap", media: "print", id: "gfonts" },
      { rel: "dns-prefetch", href: "https://firestore.googleapis.com" },
      { rel: "dns-prefetch", href: "https://firebasestorage.googleapis.com" },


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
    try{
      var KEY='__phl_stale_asset_reload_at';
      var ASSET_RE=/\/(assets|_build)\/[^?#]+\.(?:js|mjs|css)(?:[?#]|$)/i;
      addEventListener('error',function(ev){
        var t=ev&&ev.target;
        if(!t||t===window) return;
        var src=(t.src||t.href||'')+'';
        if(!src) return;
        try{ var u=new URL(src,location.href); if(u.origin!==location.origin) return; src=u.pathname+u.search; }catch(e){}
        if(!ASSET_RE.test(src)) return;
        try{ var last=Number(sessionStorage.getItem(KEY)||'0'); if(last&&Date.now()-last<30000) return; sessionStorage.setItem(KEY,String(Date.now())); }catch(e){}
        try{ console.warn('[phlabs] stale build asset failed, forcing clean reload:', src); }catch(e){}
        try{ var qs=new URLSearchParams(location.search); qs.set('sw','off'); qs.set('_r','stale-asset'); location.replace(location.pathname+'?'+qs.toString()+location.hash); }catch(e){ location.replace('/?sw=off&_r=stale-asset'); }
      },true);
    }catch(e){}
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
  var recoveryUrl=function(reason){
    try{
      var qs=new URLSearchParams(location.search);
      qs.set('sw','off');
      qs.set('_r',reason||'sw');
      return location.pathname+'?'+qs.toString()+location.hash;
    }catch(e){ return '/?sw=off&_r=sw'; }
  };
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
  try{
    if('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations){
      if(navigator.serviceWorker.controller){
        try{
          var KEY='__phl_controlled_sw_reload_at';
          var last=Number(sessionStorage.getItem(KEY)||'0');
          if(!last||Date.now()-last>30000){
            sessionStorage.setItem(KEY,String(Date.now()));
            navigator.serviceWorker.getRegistrations().then(function(registrations){
              return Promise.all(registrations.map(function(registration){ return registration.unregister().catch(function(){}); }));
            }).then(clearAllCaches, clearAllCaches).finally(function(){ location.replace(recoveryUrl('controlled-sw')); });
            if(document.documentElement) document.documentElement.style.visibility='hidden';
            return;
          }
        }catch(e){}
      }
      navigator.serviceWorker.getRegistrations().then(function(registrations){
        return Promise.all(registrations.map(function(registration){
          try{ console.info('SW unregistered:', registration.scope); }catch(e){}
          return registration.unregister().catch(function(){});
        }));
      }).then(clearAllCaches, clearAllCaches);
    } else {
      clearAllCaches();
    }
  }catch(e){ clearAllCaches(); }
})();
`;


const BOOT_WATCHDOG = `
(function(){
  try{
    var qs=new URLSearchParams(location.search);
    if(qs.has('_r')){
      try{
        qs.delete('_r');
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
      var DONE='__phl_sw_off_done';
      var lastDone=0;
      try{ lastDone=Number(sessionStorage.getItem(DONE)||'0'); }catch(e){}
      if(lastDone && Date.now()-lastDone<10000){
        // Already cleaned this session — strip recovery-only parameters.
        try{
          qs.delete('sw');
          qs.delete('_r');
          var clean=location.pathname+(qs.toString()?'?'+qs.toString():'')+location.hash;
          history.replaceState(null,'',clean);
        }catch(e){}
      } else {
        var jobs=[];
        // 1. Emergency cleanup: delete every Cache Storage bucket on this origin.
        try{
          if('caches' in window){
            jobs.push(settle(caches.keys().then(function(ks){
              return Promise.all(ks.filter(ownCache).map(function(k){ return settle(caches.delete(k)); }));
            })));
          }
        }catch(e){}
        // 2. Emergency cleanup: unregister every service worker on this origin.
        try{
          if(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations){
            jobs.push(settle(navigator.serviceWorker.getRegistrations().then(function(rs){
              return Promise.all(rs.filter(ownReg).map(function(r){ return settle(r.unregister()); }));
            })));
          }
        }catch(e){}
        // 3. Clear only PH Labs recovery flags, not all site/browser storage.
        try{ localStorage.removeItem('php_pwa_prompted'); sessionStorage.removeItem('__phl_hard_reload_in_flight'); sessionStorage.removeItem('__phl_route_err_reload_at'); sessionStorage.removeItem('__phl_route_err_reload_count'); sessionStorage.removeItem('__phl_boot_reload_at'); sessionStorage.removeItem('__phl_boot_reload_count'); }catch(e){}
        // 4. Wait (max 4s) for cleanup then hard reload to a clean URL.
        var FALLBACK=setTimeout(finish, 4000);
        function finish(){
          clearTimeout(FALLBACK);
          try{ sessionStorage.setItem(DONE,String(Date.now())); }catch(e){}
          try{
            qs.delete('sw');
            qs.delete('_r');
            var url=location.pathname+(qs.toString()?'?'+qs.toString():'')+location.hash;
            location.replace(url);
          }catch(e){ location.reload(); }
        }
        Promise.all(jobs).then(finish, finish);
        // Stop further script eval on this page — we're about to reload.
        if(document.documentElement) document.documentElement.style.visibility='hidden';
        return;
      }
    }
    var WATCH='__phl_blank_watchdog_done';
    var started=Date.now();
    var hasPaint=function(){
      try{
        if(document.querySelector('[data-phl-app-ready], header, main, #research-gate, #home, #products, [role="dialog"]')) return true;
        var body=document.body;
        if(!body) return false;
        var text=(body.innerText||'').replace(/\s+/g,' ').trim();
        if(text.length>80) return true;
        var rects=Array.prototype.slice.call(body.querySelectorAll('body *')).filter(function(el){
          try{ var r=el.getBoundingClientRect(); return r.width>80&&r.height>40; }catch(e){ return false; }
        });
        return rects.length>2;
      }catch(e){ return false; }
    };
    var tick=function(){
      if(hasPaint()) return;
      if(Date.now()-started<7000){ setTimeout(tick,700); return; }
      try{
        var last=Number(sessionStorage.getItem(WATCH)||'0');
        if(last&&Date.now()-last<60000) return;
        sessionStorage.setItem(WATCH,String(Date.now()));
        qs.set('sw','off');
        qs.delete('_r');
        location.replace(location.pathname+'?'+qs.toString()+location.hash);
      }catch(e){ location.replace('/?sw=off'); }
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
    var ASSET_RE=/\/(assets|_build)\/[^?#]+\.(?:js|mjs|css)(?:[?#]|$)/i;
    var clean=function(){
      try{
        var qs=new URLSearchParams(location.search);
        qs.set('sw','off');
        qs.set('_r','stale-asset');
        return location.pathname+'?'+qs.toString()+location.hash;
      }catch(e){ return '/?sw=off&_r=stale-asset'; }
    };
    var recover=function(src){
      try{
        var last=Number(sessionStorage.getItem(KEY)||'0');
        if(last&&Date.now()-last<30000) return;
        sessionStorage.setItem(KEY,String(Date.now()));
      }catch(e){}
      try{ console.warn('[phlabs] stale build asset failed, forcing clean reload:', src); }catch(e){}
      location.replace(clean());
    };
    addEventListener('error',function(ev){
      var t=ev&&ev.target;
      if(!t||t===window) return;
      var src=(t.src||t.href||'')+'';
      if(!src) return;
      try{ var u=new URL(src,location.href); if(u.origin!==location.origin) return; src=u.pathname+u.search; }catch(e){}
      if(ASSET_RE.test(src)) recover(src);
    },true);
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
body{font-family:'Inter Tight',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
h1,h2,h3{font-family:'Cormorant Garamond',Georgia,serif;margin:0;line-height:1.08;letter-spacing:-.015em}
img,svg,video{display:block;max-width:100%;height:auto}
header{top:0;z-index:50;min-height:56px;background:rgba(6,15,30,.92);border-bottom:1px solid rgba(255,255,255,.06)}
@media(min-width:768px){header{min-height:64px}}
[data-phl-banner]{min-height:32px}
[data-phl-research-banner]{min-height:34px}
.phl-boot{display:flex;align-items:center;justify-content:center;min-height:60vh;color:#9fb0c8;font-size:14px}
`;

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" style={{ backgroundColor: "#060f1e" }}>
      <head>
        {/* These must run before HeadContent, because HeadContent emits
            modulepreload links for hashed bundles. Old service workers can
            otherwise intercept those requests before cleanup starts. */}
        <script dangerouslySetInnerHTML={{ __html: NONCE_PROPAGATOR }} />
        <script dangerouslySetInnerHTML={{ __html: FORCE_SW_CLEANUP }} />
        <script dangerouslySetInnerHTML={{ __html: STALE_ASSET_RECOVERY }} />
        <script dangerouslySetInnerHTML={{ __html: BOOT_WATCHDOG }} />
        <HeadContent />
        {/* Inline critical CSS — covers boot bg, header skeleton + banner
            reserved heights so the page paints styled before the deferred
            appCss arrives. Keep this synchronous and BEFORE any scripts. */}
        <style dangerouslySetInnerHTML={{ __html: CRITICAL_CSS }} />
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
    clearStoreCachesForNewBuild();
    initWebVitals();
  }, []);

  // Load GA4/GTM AFTER React hydration completes — keeps GTM from mutating
  // the DOM mid-hydration (React error #418). The bootstrap inline script
  // installs window.gtag + consent defaults, then the async gtag.js loader
  // is appended. Both inherit the page nonce via the NONCE_PROPAGATOR.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as unknown as { __phlGaBootstrapped?: boolean }).__phlGaBootstrapped) return;
    const inline = document.createElement('script');
    inline.text =
      "(function(){window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;var c={a:false,m:false};try{var r=localStorage.getItem('php_cookie_consent');if(r){var p=JSON.parse(r);c.a=!!p.analytics;c.m=!!p.marketing;}}catch(e){}gtag('consent','default',{ad_storage:c.m?'granted':'denied',ad_user_data:c.m?'granted':'denied',ad_personalization:c.m?'granted':'denied',analytics_storage:c.a?'granted':'denied',functionality_storage:'granted',security_storage:'granted',wait_for_update:500});gtag('js',new Date());gtag('config','G-5HM4YT7HDW',{cookie_domain:'phlabs.co.uk',cookie_flags:'SameSite=None;Secure',cookie_expires:63072000,cookie_update:true,send_page_view:true,anonymize_ip:true,allow_google_signals:c.m,allow_ad_personalization_signals:c.m});gtag('config','GT-P3HVF8R5',{send_page_view:false});gtag('config','GT-WRHD4Q69',{send_page_view:false});gtag('config','MC-KJMB7MKB29',{send_page_view:false});window.__phlGaBootstrapped=true;})();";
    document.body.appendChild(inline);
    const ext = document.createElement('script');
    ext.async = true;
    ext.src = 'https://www.googletagmanager.com/gtag/js?id=G-5HM4YT7HDW';
    document.body.appendChild(ext);
  }, []);



  useEffect(() => {
    return installCanonicalEnforcer();
  }, []);

  // Best-effort precache of the current page's HTML + critical assets so
  // the offline fallback (see OfflineScreen / findCachedLastKnownUrl) has
  // something to offer when the network drops. No-op in dev/preview.
  useEffect(() => {
    schedulePrecacheCurrentPage();
    // Fire-and-forget: tell the server to detect a fresh Lovable Publish and
    // (if so) trigger Cloudflare purge_everything + Prerender.io recache
    // exactly once. Safe to call on every page load — the server-side
    // build-id compare keeps it idempotent. Skip on localhost / preview.
    try {
      const host = typeof window !== 'undefined' ? window.location.hostname : '';
      const isProd = /(^|\.)phlabs\.co\.uk$/.test(host);
      if (isProd) {
        fetch('/api/public/post-publish-check', { method: 'GET', credentials: 'omit', cache: 'no-store' }).catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <PageviewBeacon />
      <PageTransition />
    </QueryClientProvider>
  );
}
