/**
 * Serialise a value for injection into a `<script type="application/ld+json">`
 * tag. Escapes characters that would let user-controlled strings break out of
 * the script element (`</`, `<!--`, `<![CDATA[`, `\u2028`, `\u2029`).
 *
 * CodeQL: closes js/xss on JSON-LD blocks that embed dynamic values.
 */
export function safeJsonLd(value: unknown): string {
  // Note: no separate "-->" escape — after "<" → "\u003c" no closing
  // tag or comment sequence can form, so the extra filter only tripped
  // CodeQL's bad-tag-filter without adding safety.
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
