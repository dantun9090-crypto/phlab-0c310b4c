import { useEffect } from 'react';
import { db, doc, getDoc } from '@/lib/firebase';

interface SEOData {
  title?: string;
  metaDescription?: string;
  metaKeywords?: string;
  canonical?: string;
  ogImage?: string;
  ogType?: string;
}

const CANONICAL_ORIGIN = 'https://phlabs.co.uk';
const DEFAULT_OG_IMAGE = `${CANONICAL_ORIGIN}/og-image.jpg`;

/**
 * Force every canonical / og:url / twitter:url onto the canonical origin,
 * regardless of what the page or Firestore override supplied. This eliminates
 * mismatched-domain errors from preview, prerender.io, and stale data.
 */
function toCanonicalUrl(input: string | undefined): string {
  // Derive path from input (absolute or relative) or current location.
  let path = '/';
  if (input && input.trim()) {
    try {
      const u = new URL(input, CANONICAL_ORIGIN);
      path = u.pathname + u.search;
    } catch {
      path = input.startsWith('/') ? input : `/${input}`;
    }
  } else if (typeof window !== 'undefined') {
    path = window.location.pathname + window.location.search;
  }
  // Normalize: collapse double slashes, strip trailing slash (except root).
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return `${CANONICAL_ORIGIN}${path}`;
}

function setMeta(selector: string, attr: string, value: string) {
  let el = document.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    const [attrName, attrVal] = attr.split('=');
    el.setAttribute(attrName, attrVal);
    document.head.appendChild(el);
  }
  el.content = value;
}

function setLink(rel: string, value: string) {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = value;
}

/**
 * useSEO hook — injects title, meta description, canonical, OG and Twitter tags.
 * Loads overrides from Firestore (seoPages doc) and merges with fallback.
 * Signals Prerender.io when ready.
 */
export function useSEO(pageKey: string, fallback: SEOData) {
  useEffect(() => {
    let mounted = true;

    // Apply fallback SEO synchronously so prerender.io captures content
    // on the first render without waiting for Firestore. Mark ready immediately.


    const apply = (seoData: SEOData) => {
      // Use || so empty strings stored in Firestore fall back to defaults,
      // and trim() to strip stray leading/trailing whitespace from admin edits.
      const title       = (seoData.title       || fallback.title       || '').trim();
      const description = (seoData.metaDescription || fallback.metaDescription || '').trim();
      const canonical   = (seoData.canonical   || fallback.canonical   || '').trim();
      const ogImage     = (seoData.ogImage     || fallback.ogImage     || DEFAULT_OG_IMAGE).trim() || DEFAULT_OG_IMAGE;
      const ogType      = (seoData.ogType      || fallback.ogType      || 'website').trim();

      // ── Title ──────────────────────────────────────────────────────────────
      if (title) {
        document.title = title;
        const titleEl = document.getElementById('page-title');
        if (titleEl) titleEl.textContent = title;
      }

      // ── Meta description ───────────────────────────────────────────────────
      // Intentionally NOT writing description here. Each TanStack route owns
      // its <meta name="description"> via head() — overwriting it from a
      // legacy page's generic intro produced a duplicate / wrong description
      // in the prerender snapshot.

      // ── Canonical / og:url / twitter:url ───────────────────────────────────
      // ALWAYS force onto https://phlabs.co.uk, regardless of input.
      const canonicalUrl = toCanonicalUrl(canonical);
      setLink('canonical', canonicalUrl);

      // ── Keywords ───────────────────────────────────────────────────────────
      if (seoData.metaKeywords) {
        setMeta('meta[name="keywords"]', 'name=keywords', seoData.metaKeywords);
      }

      // ── Open Graph ─────────────────────────────────────────────────────────
      if (title) {
        setMeta('meta[property="og:title"]',       'property=og:title',       title);
        setMeta('meta[property="og:site_name"]',   'property=og:site_name',   'PH Labs');
      }
      if (description) {
        setMeta('meta[property="og:description"]', 'property=og:description', description);
      }
      setMeta('meta[property="og:url"]',           'property=og:url',         canonicalUrl);
      setMeta('meta[property="og:type"]',          'property=og:type',        ogType);
      setMeta('meta[property="og:image"]',         'property=og:image',       ogImage);
      setMeta('meta[property="og:image:width"]',   'property=og:image:width', '1200');
      setMeta('meta[property="og:image:height"]',  'property=og:image:height','630');
      setMeta('meta[property="og:locale"]',        'property=og:locale',      'en_GB');

      // ── Twitter Card ───────────────────────────────────────────────────────
      setMeta('meta[name="twitter:card"]',        'name=twitter:card',        'summary_large_image');
      setMeta('meta[name="twitter:site"]',        'name=twitter:site',        '@PHLabsUK');
      setMeta('meta[name="twitter:url"]',         'name=twitter:url',         canonicalUrl);
      if (title)       setMeta('meta[name="twitter:title"]',       'name=twitter:title',       title);
      if (description) setMeta('meta[name="twitter:description"]', 'name=twitter:description', description);
      setMeta('meta[name="twitter:image"]',       'name=twitter:image',       ogImage);
    };

    // Apply fallback immediately so first paint contains correct meta.
    apply(fallback);
    if (typeof window !== 'undefined') (window as any).prerenderReady = true;

    // Then asynchronously merge Firestore overrides if present.
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'seoPages'));
        if (!mounted || !snap.exists()) return;
        const allPages = snap.data();
        if (allPages[pageKey]) {
          apply({ ...fallback, ...allPages[pageKey] });
        }
      } catch {
        // ignore — fallback already applied
      }
    })();

    return () => {
      mounted = false;
    };
  }, [pageKey, fallback.title, fallback.metaDescription, fallback.canonical]);
}
