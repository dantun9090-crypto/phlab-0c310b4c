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
// gtag.js loader.
//
// Preferred: Cloudflare "Google Tag Gateway" first-party endpoint
// (`https://phlabs.co.uk/60z6`) — bypasses ad-blockers and hides visitor IP.
// That gateway is a per-zone Cloudflare feature; if it is not provisioned,
// the request 404s and gtag never loads (observed 2026-07-06).
//
// Fallback: load directly from `www.googletagmanager.com` (already allowed
// by our CSP `script-src`). Override via `VITE_GTAG_GATEWAY_BASE` if/when
// the CF Google Tag Gateway is re-enabled on the zone.
const GTAG_GATEWAY_BASE =
  (import.meta.env.VITE_GTAG_GATEWAY_BASE as string | undefined)?.trim() ||
  'https://www.googletagmanager.com';
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
      cookie_domain: 'auto',
      cookie_flags: 'SameSite=None;Secure',
      cookie_expires: 63072000,
      cookie_update: true,
    });
  }
  // Google destinations — activates linked GA4, Google Ads and Merchant Center destinations.
  for (const destinationId of GOOGLE_DESTINATION_IDS) {
    if (destinationId !== id) gtag('config', destinationId, { send_page_view: false, cookie_domain: 'auto' });
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

/**
 * Best-effort hashed userData for Enhanced Conversions on upper-funnel
 * events. Reads from Firebase auth (email, phoneNumber, displayName) if a
 * user is signed in. Falls back to a session cache populated at checkout.
 * Returns an empty object when nothing is available — call sites never
 * need to pass userData explicitly.
 */
const EC_SESSION_KEY = 'php_ec_userdata_hashed';

/**
 * Cache Enhanced-Conversions user data in sessionStorage. To avoid storing
 * clear-text PII (CodeQL js/clear-text-storage-of-sensitive-data) we hash
 * every identifier field via `buildUserData` BEFORE persisting; only the
 * SHA-256 hashes (and non-sensitive country/city/postal) ever hit storage.
 */
export function cacheUserDataForEnhancedConversions(u: NonNullable<PurchaseExtras['userData']>): void {
  if (typeof sessionStorage === 'undefined') return;
  void buildUserData(u).then((hashed) => {
    try { sessionStorage.setItem(EC_SESSION_KEY, JSON.stringify(hashed)); } catch { /* ignore */ }
  }).catch(() => { /* ignore */ });
}

async function inferUpperFunnelUserData(): Promise<Record<string, string>> {
  if (typeof window === 'undefined') return {};
  // First try the pre-hashed session cache written at checkout.
  try {
    const cached = sessionStorage.getItem(EC_SESSION_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, string>;
    }
  } catch { /* ignore */ }
  // Fall back to the currently-signed-in Firebase user (hashed on the fly).
  let raw: NonNullable<PurchaseExtras['userData']> | null = null;
  try {
    const mod = await import('@/lib/firebase');
    const u = mod.auth?.currentUser;
    if (u && (u.email || u.phoneNumber)) {
      const [firstName, ...rest] = (u.displayName || '').split(' ');
      raw = {
        email: u.email || undefined,
        phone: u.phoneNumber || undefined,
        firstName: firstName || undefined,
        lastName: rest.join(' ') || undefined,
      };
    }
  } catch { /* firebase not ready — skip */ }
  if (!raw) return {};
  try { return await buildUserData(raw); } catch { return {}; }
}

function attachUserDataAndSend(eventName: string, params: Record<string, unknown>): void {
  // Fire immediately with whatever we have (don't delay the event), then
  // re-fire with user_data if we can resolve it. GA4 dedupes on
  // transaction-shaped events — for upper-funnel we just attach once.
  inferUpperFunnelUserData().then((ud) => {
    if (Object.keys(ud).length) params.user_data = ud;
    trackEvent(eventName, params);
  }).catch(() => trackEvent(eventName, params));
}

export function trackAddToCart(item: GaItem, value?: number): void {
  attachUserDataAndSend('add_to_cart', {
    currency: item.currency || 'GBP',
    value: value ?? (item.price ?? 0) * (item.quantity ?? 1),
    items: [item],
  });
}

export function trackViewCart(items: GaItem[], value: number): void {
  if (!oncePerSession('view_cart', ecommerceFingerprint(items, value))) return;
  attachUserDataAndSend('view_cart', { currency: 'GBP', value, items });
}

export function trackBeginCheckout(items: GaItem[], value: number): void {
  if (!oncePerSession('begin_checkout', ecommerceFingerprint(items, value))) return;
  attachUserDataAndSend('begin_checkout', { currency: 'GBP', value, items });
  scheduleCartRecovery(items, value);
}

export function trackAddPaymentInfo(items: GaItem[], value: number, paymentType: string): void {
  if (!oncePerSession('add_payment_info', ecommerceFingerprint(items, value, paymentType))) return;
  attachUserDataAndSend('add_payment_info', {
    currency: 'GBP',
    value,
    payment_type: paymentType,
    items,
  });
}

/* Cart-recovery: if begin_checkout fires but no purchase within 30 min in
 * the same tab/session, re-fire begin_checkout ONCE so Google Ads sees a
 * fresh signal for abandoned-cart attribution. Hashed userData is attached
 * automatically by attachUserDataAndSend. */
const RECOVERY_FLAG = 'php_ec_recovery_fired';
const PURCHASE_FLAG = 'php_ec_purchase_done';
function scheduleCartRecovery(items: GaItem[], value: number): void {
  if (typeof window === 'undefined') return;
  try {
    if (sessionStorage.getItem(RECOVERY_FLAG) === '1') return;
    if (sessionStorage.getItem(PURCHASE_FLAG) === '1') return;
  } catch { /* ignore */ }
  window.setTimeout(() => {
    try {
      if (sessionStorage.getItem(PURCHASE_FLAG) === '1') return;
      if (sessionStorage.getItem(RECOVERY_FLAG) === '1') return;
      sessionStorage.setItem(RECOVERY_FLAG, '1');
    } catch { /* ignore */ }
    attachUserDataAndSend('begin_checkout', {
      currency: 'GBP',
      value,
      items,
      cart_recovery: true,
    });
  }, 30 * 60 * 1000);
}

export function trackCtaClick(label: string, location?: string): void {
  trackEvent('cta_click', { cta_label: label, cta_location: location || window.location.pathname });
}

/**
 * Optional purchase extras: tax + shipping (both VAT-inclusive — UK B2C
 * convention: `value` is gross order total INC VAT), and user_data for
 * Enhanced Conversions (email/phone SHA-256 hashed automatically).
 */
export interface PurchaseExtras {
  /** VAT amount in the order, GBP. */
  tax?: number;
  /** Shipping cost (inc-VAT), GBP. */
  shipping?: number;
  /** Raw PII — hashed in-browser before being sent. */
  userData?: {
    email?: string;
    phone?: string; // E.164 preferred (+447…)
    firstName?: string;
    lastName?: string;
    country?: string; // ISO-3166 alpha-2
    postalCode?: string;
    city?: string; // unhashed per Google Enhanced Conversions spec
  };
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input.trim().toLowerCase());
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function buildUserData(u: NonNullable<PurchaseExtras['userData']>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (typeof crypto === 'undefined' || !crypto.subtle) return out;
  try {
    if (u.email) out.sha256_email_address = await sha256Hex(u.email);
    if (u.phone) {
      // E.164 normalisation: keep leading + and digits only.
      const e164 = u.phone.replace(/[^\d+]/g, '');
      if (e164) out.sha256_phone_number = await sha256Hex(e164);
    }
    if (u.firstName) out.sha256_first_name = await sha256Hex(u.firstName);
    if (u.lastName) out.sha256_last_name = await sha256Hex(u.lastName);
    if (u.country) out.country = u.country.toUpperCase().slice(0, 2);
    if (u.postalCode) out.postal_code = u.postalCode.toUpperCase().replace(/\s+/g, '');
    if (u.city) out.city = u.city.trim();
  } catch { /* ignore — crypto subtle unavailable */ }
  return out;
}

/**
 * GA4 + Google Ads purchase. `value` is gross/VAT-inclusive (£) — UK B2C.
 * `extras.tax` and `extras.shipping` are surfaced as native GA4 fields so
 * Google Ads reports net revenue correctly. `extras.userData` enables
 * Enhanced Conversions (PII hashed client-side; raw values never leave).
 */
export function trackPurchase(
  transactionId: string,
  value: number,
  items: GaItem[],
  extras: PurchaseExtras = {},
): void {
  const params: Record<string, unknown> = {
    transaction_id: transactionId,
    currency: 'GBP',
    value,
    items,
  };
  if (typeof extras.tax === 'number' && Number.isFinite(extras.tax)) params.tax = extras.tax;
  if (typeof extras.shipping === 'number' && Number.isFinite(extras.shipping)) params.shipping = extras.shipping;

  const fire = (userData?: Record<string, string>) => {
    if (userData && Object.keys(userData).length) params.user_data = userData;
    trackEvent('purchase', params);
    trackAdsPurchaseConversion(transactionId, value, userData);
    // Mark purchase done so the abandoned-cart recovery timer skips re-firing.
    try { sessionStorage.setItem('php_ec_purchase_done', '1'); } catch { /* ignore */ }
  };

  if (extras.userData) {
    buildUserData(extras.userData).then(fire).catch(() => fire());
  } else {
    fire();
  }
}

/**
 * Fire a Google Ads `conversion` event for a purchase. Requires both
 * VITE_GOOGLE_ADS_CONVERSION_ID (AW-XXXXXXXXXX) and
 * VITE_GOOGLE_ADS_PURCHASE_LABEL to be set at build time. No-op otherwise.
 */
export function trackAdsPurchaseConversion(
  transactionId: string,
  value: number,
  userData?: Record<string, string>,
): void {
  if (!GOOGLE_ADS_CONVERSION_ID || !GOOGLE_ADS_PURCHASE_LABEL) return;
  if (!ensureAnalyticsReady()) return;
  const ga = window.gtag;
  if (!ga) return;
  log('ads conversion', { transactionId, value });
  const payload: Record<string, unknown> = {
    send_to: `${GOOGLE_ADS_CONVERSION_ID}/${GOOGLE_ADS_PURCHASE_LABEL}`,
    value,
    currency: 'GBP',
    transaction_id: transactionId,
  };
  if (userData && Object.keys(userData).length) payload.user_data = userData;
  ga('event', 'conversion', payload);
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


/* ─────────────────────────────────────────────────────────────────────────
 * Google Customer Reviews badge widget (sitewide).
 * Renders the floating "Google Customer Reviews" trust badge using the
 * official gstatic merchant widget. Idempotent.
 * Docs: https://support.google.com/merchants/answer/7106244
 * ─────────────────────────────────────────────────────────────────────── */

export function renderGoogleMerchantBadge(opts?: { position?: 'BOTTOM_LEFT' | 'BOTTOM_RIGHT' | 'TOP_LEFT' | 'TOP_RIGHT'; region?: string }): void {
  if (typeof window === 'undefined') return;
  if (!GCR_MERCHANT_ID) return;
  if (isBot()) return;
  const w = window as unknown as { __phlabs_gcr_badge_loaded?: boolean; merchantwidget?: { start: (cfg: Record<string, unknown>) => void } };
  if (w.__phlabs_gcr_badge_loaded) return;
  w.__phlabs_gcr_badge_loaded = true;

  const start = () => {
    if (!w.merchantwidget) return;
    try {
      w.merchantwidget.start({
        merchant_id: Number(GCR_MERCHANT_ID),
        position: opts?.position || 'BOTTOM_RIGHT',
        region: opts?.region || 'GB',
      });
      // A11y: Google's merchantwidget.js injects an <iframe> with no title,
      // which trips Lighthouse `frame-title`. Label it once it appears.
      const setTitle = () => {
        const el = document.getElementById('merchantwidgetiframe') as HTMLIFrameElement | null;
        if (el && !el.title) el.title = 'Google Customer Reviews badge';
        return !!el;
      };
      if (!setTitle()) {
        const obs = new MutationObserver(() => { if (setTitle()) obs.disconnect(); });
        obs.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => obs.disconnect(), 15000);
      }
    } catch (e) {
      log('merchant badge start failed', e);
    }
  };

  // Inject MerchantVerse script ONLY after the window has fully loaded and the
  // browser is idle. This guarantees React hydration is finished before the
  // third-party script (which has been observed to throw a parse error in
  // m=_b and trigger React error #418 if it runs during hydration) is parsed.
  const inject = () => {
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    const run = () => {
      if (document.getElementById('merchantWidgetScript')) return;
      const s = document.createElement('script');
      s.src = 'https://www.gstatic.com/shopping/merchant/merchantwidget.js';
      s.defer = true;
      s.id = 'merchantWidgetScript';
      s.onload = start;
      document.head.appendChild(s);
      log('GCR badge injected');
    };
    if (ric) ric(run, { timeout: 3000 });
    else setTimeout(run, 1500);
  };
  if (document.readyState === 'complete') inject();
  else window.addEventListener('load', inject, { once: true });
  log('GCR badge scheduled');
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


export function getAnalyticsStatus() {
  return {
    loaded,
    measurementId: currentId,
    consent: readStoredConsent(),
  };
}
