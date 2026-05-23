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

const DEFAULT_OG_IMAGE = 'https://www.prohealthpeptides.co.uk/og-image.jpg';

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
    let seoLoaded = false;

    if (typeof window !== 'undefined') {
      (window as any).prerenderReady = false;
    }

    const apply = (seoData: SEOData) => {
      const title       = seoData.title       ?? fallback.title       ?? '';
      const description = seoData.metaDescription ?? fallback.metaDescription ?? '';
      const canonical   = seoData.canonical   ?? fallback.canonical   ?? '';
      const ogImage     = seoData.ogImage     ?? fallback.ogImage     ?? DEFAULT_OG_IMAGE;
      const ogType      = seoData.ogType      ?? fallback.ogType      ?? 'website';

      // ── Title ──────────────────────────────────────────────────────────────
      if (title) {
        document.title = title;
        const titleEl = document.getElementById('page-title');
        if (titleEl) titleEl.textContent = title;
      }

      // ── Meta description ───────────────────────────────────────────────────
      if (description) {
        const desc = document.querySelector('meta[name="description"]') as HTMLMetaElement;
        if (desc) desc.content = description;
        const descEl = document.getElementById('page-description') as HTMLMetaElement;
        if (descEl) descEl.content = description;
      }

      // ── Canonical ──────────────────────────────────────────────────────────
      if (canonical) setLink('canonical', canonical);

      // ── Keywords ───────────────────────────────────────────────────────────
      if (seoData.metaKeywords) {
        setMeta('meta[name="keywords"]', 'name=keywords', seoData.metaKeywords);
      }

      // ── Open Graph ─────────────────────────────────────────────────────────
      if (title) {
        setMeta('meta[property="og:title"]',       'property=og:title',       title);
        setMeta('meta[property="og:site_name"]',   'property=og:site_name',   'Pro Health Peptides');
      }
      if (description) {
        setMeta('meta[property="og:description"]', 'property=og:description', description);
      }
      if (canonical) {
        setMeta('meta[property="og:url"]',         'property=og:url',         canonical);
      }
      setMeta('meta[property="og:type"]',          'property=og:type',        ogType);
      setMeta('meta[property="og:image"]',         'property=og:image',       ogImage);
      setMeta('meta[property="og:image:width"]',   'property=og:image:width', '1200');
      setMeta('meta[property="og:image:height"]',  'property=og:image:height','630');
      setMeta('meta[property="og:locale"]',        'property=og:locale',      'en_GB');

      // ── Twitter Card ───────────────────────────────────────────────────────
      setMeta('meta[name="twitter:card"]',        'name=twitter:card',        'summary_large_image');
      setMeta('meta[name="twitter:site"]',        'name=twitter:site',        '@ProHealthPeps');
      if (title)       setMeta('meta[name="twitter:title"]',       'name=twitter:title',       title);
      if (description) setMeta('meta[name="twitter:description"]', 'name=twitter:description', description);
      setMeta('meta[name="twitter:image"]',       'name=twitter:image',       ogImage);
    };

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'seoPages'));
        if (!mounted) return;

        let seoData = { ...fallback };
        if (snap.exists()) {
          const allPages = snap.data();
          if (allPages[pageKey]) {
            seoData = { ...fallback, ...allPages[pageKey] };
          }
        }

        apply(seoData);

        seoLoaded = true;
        if (typeof window !== 'undefined') (window as any).prerenderReady = true;
      } catch {
        // Fallback on Firestore error
        apply(fallback);
        seoLoaded = true;
        if (typeof window !== 'undefined') (window as any).prerenderReady = true;
      }
    })();

    return () => {
      mounted = false;
      if (!seoLoaded && typeof window !== 'undefined') {
        (window as any).prerenderReady = true;
      }
    };
  }, [pageKey, fallback.title, fallback.metaDescription, fallback.canonical]);
}
