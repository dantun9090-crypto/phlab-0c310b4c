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
 * "0", "00", "0A" are never real UK house numbers — shoppers type 0 when
 * their home has no number instead of confirming the named-property option,
 * and the fake number then lands on the Royal Mail label.
 */
function isZeroLikeNumber(token: string): boolean {
  const digits = token.replace(/[^0-9]/g, '');
  return digits.length > 0 && /^0+$/.test(digits);
}

/** True when the address relies on a zero-like house number ("0 High Street"). */
export function hasZeroHouseNumber(address: string | null | undefined): boolean {
  const value = String(address ?? '').trim();
  if (!value) return false;
  const head = value.split(',').slice(0, 2).join(', ');
  return /(?:^|[\s,])0+[a-z]?(?:$|[\s,])/i.test(` ${head} `);
}

/**
 * True when the address line carries something Royal Mail can deliver to:
 * a house number, a numbered flat/unit, or a numeric token anywhere in the
 * first two comma-separated segments. Zero-like tokens ("0") do NOT count.
 */
export function hasHouseNumber(address: string | null | undefined): boolean {
  const value = String(address ?? '').trim();
  if (!value) return false;
  // Only look at the leading segments — a trailing postcode or county must
  // never satisfy the rule.
  const head = value.split(',').slice(0, 2).join(', ');
  const unitMatch = value.match(UNIT_NUMBER_RE);
  if (unitMatch && !isZeroLikeNumber(unitMatch[0])) return true;
  const m = ` ${head} `.match(new RegExp(HOUSE_NUMBER_RE.source, 'gi'));
  if (!m) return false;
  return m.some(token => !isZeroLikeNumber(token));
}

/** True when the line reads like a named property (Rose Cottage, The Old Mill). */
export function looksLikeNamedProperty(address: string | null | undefined): boolean {
  return NAMED_PROPERTY_RE.test(String(address ?? ''));
}

export const NO_HOUSE_NUMBER_MESSAGE =
  'Add your house number or property name (e.g. 42 Baker Street). Royal Mail cannot deliver without it.';

export const ZERO_HOUSE_NUMBER_MESSAGE =
  '"0" is not a valid house number. If your home has no number, choose "No house number" and enter the property name instead.';

export const NO_HOUSE_NUMBER_CHECKBOX_LABEL =
  'My address has no house number (named property, e.g. Rose Cottage)';

/** Labels for the checkout "house number: yes / no" choice cards. */
export const HAS_HOUSE_NUMBER_OPTION_LABEL = 'House with a number';
export const HAS_HOUSE_NUMBER_OPTION_HINT = 'e.g. 42 Baker Street';
export const NO_HOUSE_NUMBER_OPTION_LABEL = 'No house number';
export const NO_HOUSE_NUMBER_OPTION_HINT = 'Named property, e.g. Rose Cottage';

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
  // Named properties ("The Barn, Lower Whiddon Farm") are deliverable without a number.
  if (looksLikeNamedProperty(value)) return '';
  if (allowNoNumber) return '';
  // A zero-like number means the shopper typed 0 instead of using the
  // "no house number" option — tell them exactly how to fix it.
  if (hasZeroHouseNumber(value)) return ZERO_HOUSE_NUMBER_MESSAGE;
  return NO_HOUSE_NUMBER_MESSAGE;
}

/** Joins a separate house-number field with the street line, once. */
export function joinAddressLine(house: string, street: string): string {
  let h = String(house ?? '').trim().replace(/[,\s]+$/, '');
  const s = String(street ?? '').trim();
  // A zero-like "number" is a placeholder, not an address part — drop it so
  // it never reaches the Royal Mail label.
  if (h && isZeroLikeNumber(h)) h = '';
  if (!h) return s;
  if (!s) return h;
  // Avoid "12 12 Baker Street" if the shopper typed the number twice.
  if (new RegExp(`^${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(s)) return s;
  return `${h} ${s}`;
}
