import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import "@/lib/chunk-reload";

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

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

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
              router.invalidate();
              reset();
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
      { name: "google-site-verification", content: "tYtU-dRlfAq14D7lyPTYf8noiJH-b0LifcvvrGi8AZw" },
      { property: "og:type", content: "website" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": "https://www.phlabs.co.uk/#organization",
              name: "PH Labs UK",
              url: "https://www.phlabs.co.uk",
              logo: {
                "@type": "ImageObject",
                url: "https://www.phlabs.co.uk/og-image.jpg",
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
                "https://www.facebook.com/prohealthpeptides",
                "https://www.instagram.com/prohealthpeptides",
              ],
            },
            {
              "@type": "WebSite",
              "@id": "https://www.phlabs.co.uk/#website",
              url: "https://www.phlabs.co.uk",
              name: "PH Labs UK",
              inLanguage: "en-GB",
              publisher: { "@id": "https://www.phlabs.co.uk/#organization" },
              potentialAction: {
                "@type": "SearchAction",
                target: "https://www.phlabs.co.uk/search?q={search_term_string}",
                "query-input": "required name=search_term_string",
              },
            },
          ],
        }),
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "alternate", hrefLang: "en-GB", href: "https://www.phlabs.co.uk/" },
      { rel: "alternate", hrefLang: "en", href: "https://www.phlabs.co.uk/" },
      { rel: "alternate", hrefLang: "x-default", href: "https://www.phlabs.co.uk/" },
      { rel: "preconnect", href: "https://firestore.googleapis.com", crossOrigin: "" },
      { rel: "preconnect", href: "https://firebaseinstallations.googleapis.com", crossOrigin: "" },
      { rel: "preconnect", href: "https://firebasestorage.googleapis.com", crossOrigin: "" },
      { rel: "preconnect", href: "https://identitytoolkit.googleapis.com", crossOrigin: "" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      { rel: "preconnect", href: "https://cdn.wegic.ai" },
      { rel: "dns-prefetch", href: "https://firestore.googleapis.com" },
      { rel: "dns-prefetch", href: "https://firebasestorage.googleapis.com" },
      { rel: "dns-prefetch", href: "https://cdn.wegic.ai" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const BOOT_WATCHDOG = `
(function(){
  try{
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
    },10000);
  }catch(e){}
})();
`;

const CANONICAL_ENFORCER = `
(function(){
  var ORIGIN='https://www.phlabs.co.uk';
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
  function enforce(){
    try{
      var path=location.pathname.replace(/\\/{2,}/g,'/');
      if(path.length>1&&path.endsWith('/')) path=path.slice(0,-1);
      var url=ORIGIN+path+location.search;
      upsertLink('canonical',url);
      upsertMeta('property','og:url',url);
      upsertMeta('name','twitter:url',url);
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
    <html lang="en" style={{ backgroundColor: "#060f1e" }}>
      <head>
        <HeadContent />
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
