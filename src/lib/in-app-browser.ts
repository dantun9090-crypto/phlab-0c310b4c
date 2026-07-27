/**
 * Detection of embedded ("in-app") browsers.
 *
 * Why this exists: Pay-by-Bank (Wallid / Open Banking) hands off to the
 * customer's banking app via a Universal Link / App Link. Embedded webviews
 * inside Facebook, Instagram, TikTok, Threads, LinkedIn, Snapchat, Pinterest
 * and Gmail are NOT allowed to launch external applications, so the bank app
 * never opens and the customer is dumped on the bank's web login instead —
 * which many read as "the payment is broken".
 *
 * The only real fix is to get the customer out of the webview and into
 * Safari / Chrome, so we detect the situation and tell them.
 *
 * Pure + SSR-safe: never touches `window` at module scope.
 */

export type InAppBrowserName =
  | "Facebook"
  | "Instagram"
  | "TikTok"
  | "Threads"
  | "LinkedIn"
  | "Snapchat"
  | "Pinterest"
  | "Twitter"
  | "Gmail"
  | "In-app browser";

/** UA fragment → friendly app name. Order matters: most specific first. */
const SIGNATURES: Array<[RegExp, InAppBrowserName]> = [
  [/Instagram/i, "Instagram"],
  [/\bBarcelona\b/i, "Threads"],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, "Facebook"],
  [/BytedanceWebview|musical_ly|\bTikTok\b|Trill\//i, "TikTok"],
  [/\bLinkedInApp\b/i, "LinkedIn"],
  [/Snapchat/i, "Snapchat"],
  [/\bPinterest\b/i, "Pinterest"],
  [/TwitterAndroid|Twitter for/i, "Twitter"],
  [/GSA\/|\bGmail\b/i, "Gmail"],
];

/**
 * Returns the friendly name of the embedding app, or `null` when the page is
 * running in a normal browser.
 *
 * @param userAgent Optional UA string — injected in tests.
 */
export function detectInAppBrowser(
  userAgent?: string,
): InAppBrowserName | null {
  const ua =
    userAgent ??
    (typeof navigator !== "undefined" ? navigator.userAgent : "");
  if (!ua) return null;

  for (const [re, name] of SIGNATURES) {
    if (re.test(ua)) return name;
  }

  // Generic iOS webview: WebKit without Safari/CriOS/FxiOS markers. Standalone
  // (home-screen PWA) is excluded — that one CAN open universal links.
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const looksLikeWebView =
    isIos && /AppleWebKit/i.test(ua) && !/Safari|CriOS|FxiOS|EdgiOS/i.test(ua);
  if (looksLikeWebView) return "In-app browser";

  return null;
}

/** True when the current page is inside an embedded browser. */
export function isInAppBrowser(userAgent?: string): boolean {
  return detectInAppBrowser(userAgent) !== null;
}

/** Platform-specific instruction for escaping the webview. */
export function openExternallyHint(userAgent?: string): string {
  const ua =
    userAgent ??
    (typeof navigator !== "undefined" ? navigator.userAgent : "");
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return "Tap the ••• menu (top right) and choose “Open in Safari”.";
  }
  if (/Android/i.test(ua)) {
    return "Tap the ⋮ menu (top right) and choose “Open in Chrome”.";
  }
  return "Open this page in your normal browser to continue.";
}
