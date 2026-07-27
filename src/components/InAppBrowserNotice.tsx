/**
 * Warning shown on Checkout when the customer is browsing inside an embedded
 * app browser (Instagram, Facebook, TikTok, …).
 *
 * Those webviews cannot launch the customer's banking app, so Pay-by-Bank
 * silently degrades to the bank's web login page. Getting the customer into
 * Safari / Chrome is the only fix, so we surface the instruction plus a
 * copy-link button.
 *
 * Renders nothing in a normal browser.
 */
import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

import {
  detectInAppBrowser,
  openExternallyHint,
  type InAppBrowserName,
} from "@/lib/in-app-browser";

export default function InAppBrowserNotice() {
  const [app, setApp] = useState<InAppBrowserName | null>(null);
  const [hint, setHint] = useState("");
  const [copied, setCopied] = useState(false);

  // Detect after mount only — navigator is unavailable during SSR/prerender
  // and a server/client mismatch would flash the banner on every render.
  useEffect(() => {
    setApp(detectInAppBrowser());
    setHint(openExternallyHint());
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      /* clipboard blocked — user can still copy from the address bar */
    }
  };

  if (!app) return null;

  return (
    <div
      data-testid="in-app-browser-notice"
      role="status"
      className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 leading-relaxed"
    >
      <p className="flex items-start gap-2 font-semibold">
        <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>You&rsquo;re browsing inside {app}</span>
      </p>
      <p className="mt-1 text-amber-100/90">
        {app} can&rsquo;t open your banking app, so Pay by Bank will show your
        bank&rsquo;s web login instead. {hint}
      </p>
      <button
        type="button"
        onClick={handleCopy}
        onTouchStart={() => {
          /* iOS needs a touch listener for reliable tap handling */
        }}
        className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-amber-300/40 bg-amber-400/15 px-4 py-2 text-xs font-semibold text-amber-50 transition-colors active:bg-amber-400/25"
      >
        {copied ? (
          <>
            <Check className="h-4 w-4" aria-hidden="true" /> Link copied
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" aria-hidden="true" /> Copy checkout link
          </>
        )}
      </button>
    </div>
  );
}
