/**
 * Google Analytics 4 loader with GDPR Consent Mode v2.
 *
 * Behaviour:
 *  - gtag.js is loaded once on first call to initAnalytics().
 *  - Consent defaults to DENIED (GDPR-safe). After the user accepts
 *    analytics in the cookie banner, we call gtag('consent','update',...)
 *    which is the official Google pattern — no PII leaves the device
 *    before consent is granted.
 *  - SPA page_view events are dispatched on every route change.
 *  - Bots / prerender.io / DNT users are skipped entirely.
 *
 * The CookieConsent component dispatches `php:cookie-consent-changed`
 * with `{ analytics: boolean, marketing: boolean }` — we listen here.
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const DEFAULT_MEASUREMENT_ID = 'G-5HM4YT7HDW';
const GOOGLE_TAG_ID = 'GT-P3HVF8R5'; // Google Tag container ("phlabs") — pulls in linked destinations (Google Ads conversions etc.)
// First-party Cloudflare "Google Tag Gateway" endpoint. Loading gtag.js from our
// own origin (instead of www.googletagmanager.com) bypasses most ad-blockers and
// keeps the visitor IP off Google's edge (hideOriginalIp=true on the CF side).
// Cloudflare auto-injection is disabled (setUpTag=false) so the app is the SOLE
// loader of the tag — prevents double-tagging.
const GTAG_GATEWAY_BASE = 'https://phlabs.co.uk/60z6';
const STORAGE_KEY = 'php_cookie_consent';
const DEBUG_FLAG_KEY = 'php_ga_debug';

let loaded = false;
let currentId: string | null = null;
let lastTrackedPath: string | null = null;
let debugMode = false;

function isDebug(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).get('ga_debug') === '1') {
      localStorage.setItem(DEBUG_FLAG_KEY, '1');
      return true;
    }
    return localStorage.getItem(DEBUG_FLAG_KEY) === '1';
  } catch { return false; }
}

function log(...args: unknown[]) {
  if (debugMode) console.log('%c[GA4]', 'color:#f9a825;font-weight:bold', ...args);
}


function isBot(): boolean {
  if (typeof navigator === 'undefined') return true;
  const ua = navigator.userAgent || '';
  return /bot|crawl|spider|prerender|headless|lighthouse|pagespeed|gtmetrix/i.test(ua);
}

function dntEnabled(): boolean {
  if (typeof navigator === 'undefined') return false;
  // @ts-expect-error legacy MS prefix
  const dnt = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
  return dnt === '1' || dnt === 'yes';
}

function readStoredConsent(): { analytics: boolean; marketing: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { analytics: false, marketing: false };
    const p = JSON.parse(raw);
    return { analytics: !!p.analytics, marketing: !!p.marketing };
  } catch {
    return { analytics: false, marketing: false };
  }
}

function gtag(...args: unknown[]) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(args);
}

function injectScript(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-ga-id="${id}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.async = true;
    // Load via Cloudflare first-party Google Tag Gateway (ad-blocker bypass).
    s.src = `${GTAG_GATEWAY_BASE}/gtag/js?id=${id}`;
    s.dataset.gaId = id;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load gtag.js'));
    document.head.appendChild(s);
  });
}

/**
 * Initialise GA4. Safe to call multiple times — only loads once.
 * Pass a custom Measurement ID to override the default.
 */
export async function initAnalytics(measurementId?: string): Promise<void> {
  if (typeof window === 'undefined') return;
  if (loaded) return;
  if (isBot() || dntEnabled()) return;

  const id = (measurementId && measurementId.trim()) || DEFAULT_MEASUREMENT_ID;
  if (!/^G-[A-Z0-9]{6,}$/i.test(id)) return;

  currentId = id;
  loaded = true;
  debugMode = isDebug();

  window.dataLayer = window.dataLayer || [];
  window.gtag = function (...args: unknown[]) { window.dataLayer!.push(args); };

  // GDPR Consent Mode v2 — defaults BEFORE any tag load
  const consent = readStoredConsent();
  log('init', { id, debugMode, consent });
  gtag('consent', 'default', {
    ad_storage: consent.marketing ? 'granted' : 'denied',
    ad_user_data: consent.marketing ? 'granted' : 'denied',
    ad_personalization: consent.marketing ? 'granted' : 'denied',
    analytics_storage: consent.analytics ? 'granted' : 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted',
    wait_for_update: 500,
  });
  log('consent default', consent);

  try {
    await injectScript(id);
  } catch {
    loaded = false;
    return;
  }

  gtag('js', new Date());
  gtag('config', id, {
    send_page_view: false, // we fire manually on route changes
    anonymize_ip: true,
    allow_google_signals: consent.marketing,
    allow_ad_personalization_signals: consent.marketing,
    debug_mode: debugMode, // surfaces in GA4 DebugView
  });
  // Google Tag container — activates any GTM-linked destinations (Ads, conversions, etc.)
  gtag('config', GOOGLE_TAG_ID, { send_page_view: false });

  // Fire initial page view
  trackPageView(window.location.pathname + window.location.search);

  // Listen for consent changes from the cookie banner
  window.addEventListener('php:cookie-consent-changed', ((e: Event) => {
    const detail = (e as CustomEvent<{ analytics: boolean; marketing: boolean }>).detail || { analytics: false, marketing: false };
    log('consent update', detail);
    gtag('consent', 'update', {
      analytics_storage: detail.analytics ? 'granted' : 'denied',
      ad_storage: detail.marketing ? 'granted' : 'denied',
      ad_user_data: detail.marketing ? 'granted' : 'denied',
      ad_personalization: detail.marketing ? 'granted' : 'denied',
    });
  }) as EventListener);
}

export function trackPageView(path: string): void {
  if (!loaded || !currentId || typeof window === 'undefined' || !window.gtag) return;
  if (path === lastTrackedPath) return;
  lastTrackedPath = path;
  log('page_view', path);
  window.gtag('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
    send_to: currentId,
    debug_mode: debugMode,
  });
}

export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (!loaded || !currentId || typeof window === 'undefined' || !window.gtag) return;
  log(name, params);
  window.gtag('event', name, { ...(params || {}), send_to: currentId, debug_mode: debugMode });
}

// ============= GA4 Ecommerce helpers =============

export type GaItem = {
  item_id: string;
  item_name: string;
  item_variant?: string;
  item_category?: string;
  price?: number;
  quantity?: number;
  currency?: string;
};

export function trackAddToCart(item: GaItem, value?: number): void {
  trackEvent('add_to_cart', {
    currency: item.currency || 'GBP',
    value: value ?? (item.price ?? 0) * (item.quantity ?? 1),
    items: [item],
  });
}

export function trackBeginCheckout(items: GaItem[], value: number): void {
  trackEvent('begin_checkout', {
    currency: 'GBP',
    value,
    items,
  });
}

export function trackCtaClick(label: string, location?: string): void {
  trackEvent('cta_click', { cta_label: label, cta_location: location || window.location.pathname });
}

export function trackPurchase(transactionId: string, value: number, items: GaItem[]): void {
  trackEvent('purchase', { transaction_id: transactionId, currency: 'GBP', value, items });
}


export function getAnalyticsStatus() {
  return {
    loaded,
    measurementId: currentId,
    consent: readStoredConsent(),
  };
}
