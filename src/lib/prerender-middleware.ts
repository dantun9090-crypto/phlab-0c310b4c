import { createMiddleware } from "@tanstack/react-start";

// User agents that should receive prerendered HTML
const BOT_UA_RE =
  /googlebot|bingbot|yandex|baiduspider|duckduckbot|slurp|sogou|exabot|facebot|ia_archiver|facebookexternalhit|twitterbot|rogerbot|linkedinbot|embedly|quora link preview|showyoubot|outbrain|pinterest\/0\.|developers\.google\.com\/\+\/web\/snippet|slackbot|vkShare|W3C_Validator|redditbot|applebot|whatsapp|flipboard|tumblr|bitlybot|skypeuripreview|nuzzel|discordbot|google page speed|qwantify|pinterestbot|bitrix link preview|xing-contenttabreceiver|chrome-lighthouse|telegrambot|integration-test|google-inspectiontool/i;

// Paths/extensions that should never be prerendered
const SKIP_EXT_RE =
  /\.(js|css|xml|less|png|jpg|jpeg|gif|pdf|doc|txt|ico|rss|zip|mp3|rar|exe|wmv|avi|ppt|mpg|mpeg|tif|wav|mov|psd|ai|xls|mp4|m4a|swf|dat|dmg|iso|flv|m4v|torrent|woff|woff2|ttf|svg|webmanifest|webp)$/i;

export const prerenderMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const token = process.env.PRERENDER_TOKEN;
    if (!token) return next();

    const url = new URL(request.url);

    // Only intercept GET/HEAD
    if (request.method !== "GET" && request.method !== "HEAD") return next();

    // Skip API routes and static assets
    if (url.pathname.startsWith("/api/")) return next();
    if (SKIP_EXT_RE.test(url.pathname)) return next();

    // Explicit opt-in via ?_escaped_fragment_= or bot UA
    const ua = request.headers.get("user-agent") || "";
    const hasEscapedFragment = url.searchParams.has("_escaped_fragment_");
    const isBot = BOT_UA_RE.test(ua);
    if (!isBot && !hasEscapedFragment) return next();

    try {
      const target = `https://service.prerender.io/${url.toString()}`;
      const prerendered = await fetch(target, {
        headers: {
          "X-Prerender-Token": token,
          "User-Agent": ua,
          "Accept-Encoding": "gzip",
        },
        // 10s timeout via AbortSignal
        signal: AbortSignal.timeout(10_000),
      });

      const headers = new Headers(prerendered.headers);
      // Strip hop-by-hop headers
      headers.delete("content-encoding");
      headers.delete("content-length");
      headers.delete("transfer-encoding");

      return new Response(prerendered.body, {
        status: prerendered.status,
        headers,
      });
    } catch (err) {
      console.error("[prerender] fallback to SSR:", err);
      return next();
    }
  },
);
