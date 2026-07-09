/**
 * Country-aware shipping-address helpers.
 *
 * German addresses read `Straße Hausnr. / PLZ Stadt / Land` — putting the
 * postcode BEFORE the city, not after it. UK/IE read `Address, City,
 * Postcode`. Using the wrong order on a checkout confirmation or invoice
 * looks unprofessional to German customers and can slow down Royal Mail
 * / DHL handoff sorting.
 *
 * Keep this the single source of truth for both the on-screen summary
 * (`src/pages/Checkout/index.tsx`) and the branded HTML invoice
 * (`src/templates/professionalInvoiceEmail.ts`).
 */

export type SupportedCountry = 'United Kingdom' | 'Germany' | 'Ireland' | 'Other' | string;

/** Human-readable label for the postcode field per country. */
export function postcodeLabel(country: SupportedCountry): string {
  switch (country) {
    case 'Germany': return 'PLZ (Postleitzahl)';
    case 'Ireland': return 'Eircode';
    case 'United Kingdom': return 'Postcode';
    default: return 'Postcode';
  }
}

/** Short label used in inline summaries (e.g. "· PLZ 10115"). */
export function shortPostcodeLabel(country: SupportedCountry): string {
  switch (country) {
    case 'Germany': return 'PLZ';
    case 'Ireland': return 'Eircode';
    default: return 'Postcode';
  }
}

interface AddressParts {
  firstName?: string;
  lastName?: string;
  address?: string;
  city?: string;
  postcode?: string;
  country?: SupportedCountry;
}

/**
 * Returns the address as an ordered array of lines, ready to render with
 * `<br>` (email) or `\n` / `<br />` (UI). No line is emitted for a missing
 * value, so callers do not need to filter.
 */
export function formatShippingAddressLines(parts: AddressParts): string[] {
  const { firstName, lastName, address, city, postcode, country } = parts;
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  const lines: string[] = [];
  if (name) lines.push(name);
  if (address) lines.push(address);

  if (country === 'Germany') {
    // DIN 5008: "PLZ Ort" on one line, country on its own line.
    const plzCity = [postcode, city].filter(Boolean).join(' ').trim();
    if (plzCity) lines.push(plzCity);
    lines.push('Germany');
  } else if (country === 'Ireland') {
    if (city) lines.push(city);
    if (postcode) lines.push(postcode);
    lines.push('Ireland');
  } else {
    // UK / default: "City, Postcode" on one line.
    const cityPc = [city, postcode].filter(Boolean).join(', ').trim();
    if (cityPc) lines.push(cityPc);
    if (country && country !== 'United Kingdom') lines.push(country);
  }

  return lines;
}

/** Compact inline form for accordion summaries. */
export function formatShippingAddressInline(parts: AddressParts): string {
  const { address, city, postcode, country } = parts;
  if (!address && !city && !postcode) return '';
  if (country === 'Germany') {
    const plzCity = [postcode, city].filter(Boolean).join(' ').trim();
    return [address, plzCity, 'Germany'].filter(Boolean).join(', ');
  }
  if (country === 'Ireland') {
    return [address, city, postcode, 'Ireland'].filter(Boolean).join(', ');
  }
  return [address, [city, postcode].filter(Boolean).join(' ').trim()].filter(Boolean).join(', ');
}
