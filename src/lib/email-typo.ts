/**
 * Detects obvious typos in the domain part of an email address so a customer
 * cannot place an order with an unreachable address (e.g. "gmail.clm").
 *
 * Pure function — safe for client bundles. Returns the suggested corrected
 * address, or null when the domain looks fine.
 */
const COMMON_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'hotmail.co.uk',
  'outlook.com',
  'live.co.uk',
  'live.com',
  'yahoo.com',
  'yahoo.co.uk',
  'icloud.com',
  'me.com',
  'aol.com',
  'btinternet.com',
  'sky.com',
  'msn.com',
  'protonmail.com',
  'proton.me',
];

/** Known bad tails that are always a typo, mapped to the correct domain. */
const EXPLICIT_FIXES: Record<string, string> = {
  'gmail.clm': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.cim': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.comm': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmail.co': 'hotmail.co.uk',
  'outlook.con': 'outlook.com',
  'yahoo.con': 'yahoo.com',
  'icloud.con': 'icloud.com',
  'iclould.com': 'icloud.com',
};

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[n];
}

export function suggestEmailTypo(email: string): string | null {
  const value = (email || '').trim().toLowerCase();
  const at = value.lastIndexOf('@');
  if (at <= 0 || at === value.length - 1) return null;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!domain.includes('.')) return null;
  if (COMMON_DOMAINS.includes(domain)) return null;

  const explicit = EXPLICIT_FIXES[domain];
  if (explicit) return `${local}@${explicit}`;

  for (const candidate of COMMON_DOMAINS) {
    // Only correct near-misses of popular providers; leave real business
    // domains (which are always "far" from these) untouched.
    if (levenshtein(domain, candidate) === 1) return `${local}@${candidate}`;
  }
  return null;
}
