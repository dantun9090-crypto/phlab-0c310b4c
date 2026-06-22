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
const GOOGLE_ADS_CONVERSION_ID = (import.meta.env.VITE_GOOGLE_ADS_CONVERSION_ID as string | undefined)?.trim() || '';
const GOOGLE_ADS_PURCHASE_LABEL = (import.meta.env.VITE_GOOGLE_ADS_PURCHASE_LABEL as string | undefined)?.trim() || '';
const GOOGLE_DESTINATION_IDS = [
  DEFAULT_MEASUREMENT_ID,
  'GT-P3HVF8R5',
  'GT-WRHD4Q69',
  'MC-KJMB7MKB29',
  ...(GOOGLE_ADS_CONVERSION_ID ? [GOOGLE_ADS_CONVERSION_ID] : []),
];
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

function uniqueDestinations(): string[] {
  const ids = [currentId || DEFAULT_MEASUREMENT_ID, ...GOOGLE_DESTINATION_IDS];
  return Array.from(new Set(ids.filter(Boolean)));
}

function ensureAnalyticsReady(): boolean {
  if (typeof window === 'undefined' || !window.gtag) return false;
  if (!currentId) currentId = DEFAULT_MEASUREMENT_ID;
  if (!debugMode) debugMode = isDebug();
  return true;
}

function ecommerceFingerprint(items: GaItem[], value: number, extra = ''): string {
  return [
    value.toFixed(2),
    extra,
    ...items.map((item) => `${item.item_id}:${item.item_variant || ''}:${item.quantity || 1}:${item.price || 0}`),
  ].join('|').slice(0, 500);
}

function oncePerSession(eventName: string, fingerprint: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const key = `php_ga_${eventName}_${fingerprint}`;
    if (sessionStorage.getItem(key) === '1') return false;
    sessionStorage.setItem(key, '1');
  } catch { /* ignore */ }
  return true;
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
    // Already present from hardcoded <script> in <head> (Google wizard visible).
    if (document.querySelector('script[src*="gtag/js"]')) {
      resolve();
      return;
    }
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

  // If the hardcoded <head> bootstrap already ran (window.__phlGaBootstrapped),
  // it called gtag('config', id) which fired the initial page_view. Skip our
  // own config to avoid a duplicate hit, and just register the GT- container.
  const bootstrapped = (window as unknown as { __phlGaBootstrapped?: boolean }).__phlGaBootstrapped === true;
  if (!bootstrapped) {
    gtag('js', new Date());
    gtag('config', id, {
      send_page_view: false, // we fire manually on route changes
      anonymize_ip: true,
      allow_google_signals: consent.marketing,
      allow_ad_personalization_signals: consent.marketing,
      debug_mode: debugMode,
    });
  }
  // Google destinations — activates linked GA4, Google Ads and Merchant Center destinations.
  for (const destinationId of GOOGLE_DESTINATION_IDS) {
    if (destinationId !== id) gtag('config', destinationId, { send_page_view: false });
  }

  // Fire initial page view (skip if the hardcoded <head> script already
  // triggered an auto-config page_view — deduplicate via lastTrackedPath).
  if (bootstrapped) {
    lastTrackedPath = window.location.pathname + window.location.search;
  } else {
    trackPageView(window.location.pathname + window.location.search);
  }

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
  if (!ensureAnalyticsReady() || !currentId) return;
  const ga = window.gtag;
  if (!ga) return;
  if (path === lastTrackedPath) return;
  lastTrackedPath = path;
  log('page_view', path);
  ga('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
    send_to: currentId,
    debug_mode: debugMode,
  });
}

export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (!ensureAnalyticsReady()) return;
  const ga = window.gtag;
  if (!ga) return;
  log(name, params);
  const destinations = uniqueDestinations();
  ga('event', name, {
    ...(params || {}),
    send_to: destinations.length === 1 ? destinations[0] : destinations,
    debug_mode: debugMode,
  });
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

export function trackViewCart(items: GaItem[], value: number): void {
  if (!oncePerSession('view_cart', ecommerceFingerprint(items, value))) return;
  trackEvent('view_cart', {
    currency: 'GBP',
    value,
    items,
  });
}

export function trackBeginCheckout(items: GaItem[], value: number): void {
  if (!oncePerSession('begin_checkout', ecommerceFingerprint(items, value))) return;
  trackEvent('begin_checkout', {
    currency: 'GBP',
    value,
    items,
  });
}

export function trackAddPaymentInfo(items: GaItem[], value: number, paymentType: string): void {
  if (!oncePerSession('add_payment_info', ecommerceFingerprint(items, value, paymentType))) return;
  trackEvent('add_payment_info', {
    currency: 'GBP',
    value,
    payment_type: paymentType,
    items,
  });
}

export function trackCtaClick(label: string, location?: string): void {
  trackEvent('cta_click', { cta_label: label, cta_location: location || window.location.pathname });
}

export function trackPurchase(transactionId: string, value: number, items: GaItem[]): void {
  trackEvent('purchase', { transaction_id: transactionId, currency: 'GBP', value, items });
  trackAdsPurchaseConversion(transactionId, value);
}

/**
 * Fire a Google Ads `conversion` event for a purchase. Requires both
 * VITE_GOOGLE_ADS_CONVERSION_ID (AW-XXXXXXXXXX) and
 * VITE_GOOGLE_ADS_PURCHASE_LABEL to be set at build time. No-op otherwise.
 */
export function trackAdsPurchaseConversion(transactionId: string, value: number): void {
  if (!GOOGLE_ADS_CONVERSION_ID || !GOOGLE_ADS_PURCHASE_LABEL) return;
  if (!ensureAnalyticsReady()) return;
  const ga = window.gtag;
  if (!ga) return;
  log('ads conversion', { transactionId, value });
  ga('event', 'conversion', {
    send_to: `${GOOGLE_ADS_CONVERSION_ID}/${GOOGLE_ADS_PURCHASE_LABEL}`,
    value,
    currency: 'GBP',
    transaction_id: transactionId,
  });
}


/* ─────────────────────────────────────────────────────────────────────────
 * Google Customer Reviews opt-in (free, official Google programme).
 *
 * After payment success we show the buyer a small "would you review this
 * purchase?" survey from Google. Reviews go straight to Google, count
 * toward seller ratings in Shopping/Search, and (after 100 reviews in 12
 * months) unlock star ratings on the merchant.
 *
 * Requires VITE_GCR_MERCHANT_ID (numeric Merchant Center ID) at build
 * time. No-op otherwise.
 * Docs: https://support.google.com/merchants/answer/7106244
 * ─────────────────────────────────────────────────────────────────────── */

const GCR_MERCHANT_ID = (import.meta.env.VITE_GCR_MERCHANT_ID as string | undefined)?.trim() || '';

export interface GcrOptInOptions {
  orderId: string;
  email: string;
  /** ISO 3166-1 alpha-2 country code. Defaults to "GB". */
  deliveryCountry?: string;
  /** YYYY-MM-DD. Defaults to today + 3 working days. */
  estimatedDeliveryDate?: string;
  /** Optional GTIN per item — improves product-level review attribution. */
  productGtins?: string[];
}

function isoPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Render the Google Customer Reviews opt-in dialog. Call once on the
 * payment success page after the order is confirmed paid.
 * Idempotent — safe to call multiple times.
 */
export function renderGoogleCustomerReviewsOptIn(opts: GcrOptInOptions): void {
  if (typeof window === 'undefined') return;
  if (!GCR_MERCHANT_ID) return;
  if (!opts.orderId || !opts.email) return;
  const w = window as unknown as { __phlabs_gcr_loaded?: boolean; renderOptIn?: () => void; gapi?: { load: (m: string, cb: () => void) => void; surveyoptin: { render: (cfg: Record<string, unknown>) => void } } };
  if (w.__phlabs_gcr_loaded) return;
  w.__phlabs_gcr_loaded = true;

  w.renderOptIn = function () {
    if (!w.gapi) return;
    w.gapi.load('surveyoptin', function () {
      w.gapi!.surveyoptin.render({
        merchant_id: GCR_MERCHANT_ID,
        order_id: opts.orderId,
        email: opts.email,
        delivery_country: opts.deliveryCountry || 'GB',
        estimated_delivery_date: opts.estimatedDeliveryDate || isoPlusDays(3),
        ...(opts.productGtins && opts.productGtins.length
          ? { products: opts.productGtins.map((gtin) => ({ gtin })) }
          : {}),
        opt_in_style: 'CENTER_DIALOG',
      });
    });
  };

  const s = document.createElement('script');
  s.src = 'https://apis.google.com/js/platform.js?onload=renderOptIn';
  s.async = true;
  s.defer = true;
  document.head.appendChild(s);
  log('GCR opt-in scheduled', { orderId: opts.orderId });
}

