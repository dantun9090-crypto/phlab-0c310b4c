/**
 * UK delivery-address helpers.
 *
 * Royal Mail labels are rejected / mis-sorted when the first address line has
 * no house number or property name — "High Street, London SW1A 1AA" is not a
 * deliverable address. These helpers are the single source of truth for that
 * rule and are shared by checkout, the account address form and the server
 * order validator.
 */

/** Tokens that identify a named property (no street number by design). */
const NAMED_PROPERTY_RE =
  /\b(?:cottage|house|villa|lodge|farm|barn|manor|hall|bungalow|rectory|vicarage|mill|grange|croft|the\s+old)\b/i;

/** Flat / unit prefixes that already carry a number ("Flat 3", "Unit 12b"). */
const UNIT_NUMBER_RE = /\b(?:flat|apt|apartment|unit|suite|room|studio|no\.?)\s*\d+[a-z]?\b/i;

/** A bare house number token: 12, 12A, 12-14, 221b. */
const HOUSE_NUMBER_RE = /(?:^|[\s,])\d+[a-z]?(?:\s*[-/]\s*\d+[a-z]?)?(?:$|[\s,])/i;

/**
 * True when the address line carries something Royal Mail can deliver to:
 * a house number, a numbered flat/unit, or a numeric token anywhere in the
 * first two comma-separated segments.
 */
export function hasHouseNumber(address: string | null | undefined): boolean {
  const value = String(address ?? '').trim();
  if (!value) return false;
  if (UNIT_NUMBER_RE.test(value)) return true;
  // Only look at the leading segments — a trailing postcode or county must
  // never satisfy the rule.
  const head = value.split(',').slice(0, 2).join(', ');
  return HOUSE_NUMBER_RE.test(` ${head} `);
}

/** True when the line reads like a named property (Rose Cottage, The Old Mill). */
export function looksLikeNamedProperty(address: string | null | undefined): boolean {
  return NAMED_PROPERTY_RE.test(String(address ?? ''));
}

export const NO_HOUSE_NUMBER_MESSAGE =
  'Add your house number or property name (e.g. 42 Baker Street). Royal Mail cannot deliver without it.';

export const NO_HOUSE_NUMBER_CHECKBOX_LABEL =
  'My address has no house number (named property, e.g. Rose Cottage)';

/**
 * Validates a UK address line. Returns an error message, or '' when valid.
 * `allowNoNumber` is the customer's explicit "named property" confirmation.
 */
export function validateUkAddressLine(
  address: string | null | undefined,
  allowNoNumber = false,
): string {
  const value = String(address ?? '').trim();
  if (!value) return 'Required';
  if (hasHouseNumber(value)) return '';
  if (allowNoNumber) return '';
  return NO_HOUSE_NUMBER_MESSAGE;
}

/** Joins a separate house-number field with the street line, once. */
export function joinAddressLine(house: string, street: string): string {
  const h = String(house ?? '').trim().replace(/[,\s]+$/, '');
  const s = String(street ?? '').trim();
  if (!h) return s;
  if (!s) return h;
  // Avoid "12 12 Baker Street" if the shopper typed the number twice.
  if (new RegExp(`^${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(s)) return s;
  return `${h} ${s}`;
}
