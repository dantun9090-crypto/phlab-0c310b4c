// Variant URL guard — prevents open-redirect / XSS / path-traversal via ?variant=
// Used by ProductDetail page. Bad variants are stripped and the URL is replaced
// with the canonical product URL (no ?variant=).

export const ALLOWED_VARIANT_PATTERN = /^[a-z0-9][a-z0-9._\-]{0,49}$/i;

// Known concentration / blend tokens used across the catalogue.
// Extend as the catalogue grows. The regex above is the real guard;
// this list is an additional fast-path whitelist for canonical tokens.
export const ALLOWED_VARIANTS = new Set<string>([
  '200mg', '500mg', '1000mg',
  '2mg', '5mg', '10mg', '15mg', '20mg', '30mg', '50mg', '100mg',
  '100mcg', '500mcg', '1000mcg',
  'blend-v1', 'blend-v2', 'standard', 'premium',
]);

export function sanitizeVariant(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  if (trimmed.length > 50) return null;
  // Hard-block path traversal, scheme injection, HTML, encoded payloads.
  if (/[.\/\\<>%?#&=\s'"`;:]/.test(trimmed) && !/^[a-z0-9][a-z0-9._\-]{0,49}$/i.test(trimmed)) {
    return null;
  }
  if (!ALLOWED_VARIANT_PATTERN.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

/** Returns true when the variant is null (none provided) or matches the whitelist pattern. */
export function isAcceptableVariant(input: string | null | undefined): boolean {
  if (input == null || input === '') return true;
  return sanitizeVariant(input) !== null;
}
