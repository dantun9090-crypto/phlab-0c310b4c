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

import appCss from "../styles.css?url";
import "@/lib/chunk-reload";
import {
  clearClientCaches as _clearClientCaches, // re-exported for tests if needed
  findCachedLastKnownUrl,
  HARD_RELOAD_FLAG,
  hardReload,
  isOnline,
  isStaleChunkError,
} from "@/lib/recovery";
import { schedulePrecacheCurrentPage } from "@/lib/lkg-cache";
void _clearClientCaches;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
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
const AUTO_RELOAD_COOLDOWN_MS = 30_000;
const AUTO_RELOAD_MAX_ATTEMPTS = 2;

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

  // Auto-recover from stale-chunk errors after a deploy. Skip when offline
  // (a hard reload would just fail again and waste an attempt).
  if (
    typeof window !== "undefined" &&
    isStaleChunkError(error) &&
    isOnline()
  ) {
    try {
      const now = Date.now();
      const last = Number(sessionStorage.getItem(AUTO_RELOAD_KEY) ?? "0");
      const count =
        now - last > AUTO_RELOAD_COOLDOWN_MS
          ? 0
          : Number(sessionStorage.getItem(AUTO_RELOAD_COUNT_KEY) ?? "0");

      if (count < AUTO_RELOAD_MAX_ATTEMPTS) {
        sessionStorage.setItem(AUTO_RELOAD_KEY, String(now));
        sessionStorage.setItem(AUTO_RELOAD_COUNT_KEY, String(count + 1));
        setTimeout(() => { void hardReload(); }, 50);
      }
    } catch { /* ignore */ }
  }

  // Offline path: don't show the generic "didn't load" copy; we know why.
  if (offline) return <OfflineScreen />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
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
                sessionStorage.removeItem(HARD_RELOAD_FLAG);
              } catch { /* ignore */ }
              if (!isOnline()) { setOffline(true); return; }
              if (import.meta.env.PROD) {
                void hardReload();
              } else {
                router.invalidate();
                reset();
              }
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
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
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "author", content: "PH Labs UK" },
      { property: "og:site_name", content: "PH Labs UK" },
      { property: "og:locale", content: "en_GB" },
      { httpEquiv: "content-language", content: "en-GB" },
      { name: "language", content: "English" },
      { name: "geo.region", content: "GB" },
      { name: "geo.placename", content: "United Kingdom" },
      { name: "geo.position", content: "55.3781;-3.4360" },
      { name: "ICBM", content: "55.3781, -3.4360" },
      { name: "distribution", content: "UK" },
      { name: "target_country", content: "GB" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#060f1e" },
      { name: "apple-mobile-web-app-title", content: "PH Labs" },
      { name: "application-name", content: "PH Labs" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "google-site-verification", content: "tYtU-dRlfAq14D7lyPTYf8noiJH-b0LifcvvrGi8AZw" },
      // title, description, og:title/description/image, twitter:* and og:type
      // are intentionally set per-leaf-route (see src/routes/index.tsx,
      // src/routes/products.tsx, src/routes/products.$slug.tsx, src/routes/$.tsx).
      // Defining them here too creates duplicate <title>/<meta> in <head>
      // because TanStack concatenates parent + leaf meta when names collide
      // on different keys (title vs name="description" vs property="og:*").
    ],
    scripts: [
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
            {
              "@type": "LocalBusiness",
              "@id": "https://phlabs.co.uk/#localbusiness",
              name: "PH Labs UK",
              url: "https://phlabs.co.uk",
              image: "https://phlabs.co.uk/og-image.jpg",
              telephone: "+44 20 8175 4060",
              email: "info@phlabs.co.uk",
              priceRange: "££",
              address: {
                "@type": "PostalAddress",
                addressCountry: "GB",
                addressRegion: "England",
              },
              areaServed: "GB",
              parentOrganization: { "@id": "https://phlabs.co.uk/#organization" },
            },
            {
              "@type": "WebSite",
              "@id": "https://phlabs.co.uk/#website",
              url: "https://phlabs.co.uk",
              name: "PH Labs UK",
              inLanguage: "en-GB",
              publisher: { "@id": "https://phlabs.co.uk/#organization" },
              potentialAction: {
                "@type": "SearchAction",
                target: "https://phlabs.co.uk/search?q={search_term_string}",
                "query-input": "required name=search_term_string",
              },
            },
          ],
        }),
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
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
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter+Tight:wght@400;500;600;700&display=swap" },
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


const BOOT_WATCHDOG = `
(function(){
  try{
    var qs=new URLSearchParams(location.search);
    if(qs.get('sw')==='off'){
      var DONE='__phl_sw_off_done';
      if(sessionStorage.getItem(DONE)==='1'){
        // Already cleaned this session — strip ?sw=off so the URL is clean.
        try{
          qs.delete('sw'); qs.delete('_r');
          var clean=location.pathname+(qs.toString()?'?'+qs.toString():'')+location.hash;
          history.replaceState(null,'',clean);
        }catch(e){}
      } else {
        var settle=function(p){ return Promise.resolve(p).catch(function(){}); };
        var jobs=[];
        // 1. Delete every Cache Storage bucket (Workbox, runtime, custom).
        try{
          if('caches' in window){
            jobs.push(settle(caches.keys().then(function(ks){
              return Promise.all(ks.map(function(k){ return settle(caches.delete(k)); }));
            })));
          }
        }catch(e){}
        // 2. Unregister EVERY service worker registration on this origin.
        try{
          if(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations){
            jobs.push(settle(navigator.serviceWorker.getRegistrations().then(function(rs){
              return Promise.all(rs.map(function(r){ return settle(r.unregister()); }));
            })));
          }
        }catch(e){}
        // 3. Best-effort: drop IndexedDB databases used by Workbox / app shells.
        try{
          if(indexedDB&&indexedDB.databases){
            jobs.push(settle(indexedDB.databases().then(function(dbs){
              return Promise.all((dbs||[]).map(function(db){
                return new Promise(function(res){
                  try{ var req=indexedDB.deleteDatabase(db.name); req.onsuccess=req.onerror=req.onblocked=function(){res();}; }
                  catch(e){ res(); }
                });
              }));
            })));
          }
        }catch(e){}
        // 4. Clear app storage flags.
        try{ localStorage.removeItem('php_pwa_prompted'); sessionStorage.clear(); }catch(e){}
        // 5. Wait (max 4s) for cleanup then hard reload to a clean URL.
        var FALLBACK=setTimeout(finish, 4000);
        function finish(){
          clearTimeout(FALLBACK);
          try{ sessionStorage.setItem(DONE,'1'); }catch(e){}
          try{
            qs.delete('sw'); qs.delete('_r');
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
    // Skip the watchdog on dev/preview hosts — Vite cold module loads can
    // exceed the timeout and trigger a reload loop before React mounts.
    var h=location.hostname;
    if(h==='localhost'||h==='127.0.0.1'||h.endsWith('.lovableproject.com')||h.endsWith('.lovable.app')||h.endsWith('.lovable.dev')) return;
    var KEY='__phl_boot_reload_at';
    var MAX_RELOADS_KEY='__phl_boot_reload_count';
    var now=Date.now();
    var last=Number(sessionStorage.getItem(KEY)||'0');
    var count=Number(sessionStorage.getItem(MAX_RELOADS_KEY)||'0');
    // Reset counter if last reload was > 2 min ago
    if(now-last>120000){count=0;sessionStorage.setItem(MAX_RELOADS_KEY,'0');}
    function hasContent(){
      var b=document.body; if(!b) return false;
      // any element other than <script>/<style> with size?
      var els=b.querySelectorAll('div,main,section,header,nav,article,h1,h2,img,a,button');
      for(var i=0;i<els.length;i++){
        var r=els[i].getBoundingClientRect();
        if(r.width>50&&r.height>50) return true;
      }
      return false;
    }
    setTimeout(function(){
      if(hasContent()) return;
      if(count>=2) return; // stop after 2 attempts to avoid loops
      if(now-last<15000) return;
      sessionStorage.setItem(KEY,String(Date.now()));
      sessionStorage.setItem(MAX_RELOADS_KEY,String(count+1));
      try{
        // force fresh fetch — bypass HTTP cache & service worker
        if('caches' in window){caches.keys().then(function(ks){ks.forEach(function(k){caches.delete(k);});});}
        if(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations){
          navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister();});});
        }
      }catch(e){}
      location.replace(location.pathname+location.search+(location.search?'&':'?')+'_r='+Date.now()+location.hash);
    },20000);

  }catch(e){}
})();
`;

const CANONICAL_ENFORCER = `
(function(){
  var ORIGIN='https://phlabs.co.uk';
  function upsertLink(rel,href){
    var el=document.querySelector('link[rel="'+rel+'"]');
    if(!el){el=document.createElement('link');el.setAttribute('rel',rel);document.head.appendChild(el);}
    if(el.getAttribute('href')!==href) el.setAttribute('href',href);
  }
  function upsertMeta(attr,name,content){
    var el=document.querySelector('meta['+attr+'="'+name+'"]');
    if(!el){el=document.createElement('meta');el.setAttribute(attr,name);document.head.appendChild(el);}
    if(el.getAttribute('content')!==content) el.setAttribute('content',content);
  }
  function upsertHreflang(hreflang,href){
    var sel='link[rel="alternate"][hreflang="'+hreflang+'"]';
    var el=document.querySelector(sel);
    if(!el){el=document.createElement('link');el.setAttribute('rel','alternate');el.setAttribute('hreflang',hreflang);document.head.appendChild(el);}
    if(el.getAttribute('href')!==href) el.setAttribute('href',href);
  }
  function enforce(){
    try{
      var path=location.pathname.replace(/\\/{2,}/g,'/');
      if(path.length>1&&path.endsWith('/')) path=path.slice(0,-1);
      var url=ORIGIN+path+location.search;
      upsertLink('canonical',url);
      upsertMeta('property','og:url',url);
      upsertMeta('name','twitter:url',url);
      upsertHreflang('en-GB',url);
      upsertHreflang('x-default',url);
    }catch(e){}
  }
  enforce();
  var _ps=history.pushState, _rs=history.replaceState;
  history.pushState=function(){var r=_ps.apply(this,arguments);setTimeout(enforce,0);return r;};
  history.replaceState=function(){var r=_rs.apply(this,arguments);setTimeout(enforce,0);return r;};
  window.addEventListener('popstate',function(){setTimeout(enforce,0);});
  try{
    var mo=new MutationObserver(function(){enforce();});
    mo.observe(document.head,{childList:true,subtree:true,attributes:true,attributeFilter:['href','content']});
  }catch(e){}
})();
`;

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" style={{ backgroundColor: "#060f1e" }}>
      <head>
        <HeadContent />
        {/* MUST be first inline script — installs nonce propagator before
            anything else runs, so subsequent injected scripts inherit nonce. */}
        <script dangerouslySetInnerHTML={{ __html: NONCE_PROPAGATOR }} />
        <script dangerouslySetInnerHTML={{ __html: BOOT_WATCHDOG }} />
        <script dangerouslySetInnerHTML={{ __html: CANONICAL_ENFORCER }} />
      </head>

      <body style={{ backgroundColor: "#060f1e", color: "#f0f6ff", margin: 0 }}>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
