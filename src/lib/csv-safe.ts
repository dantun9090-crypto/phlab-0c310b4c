/**
 * CSV cell encoder with spreadsheet-formula neutralisation.
 * Values starting with = + - @ TAB or CR are prefixed with an apostrophe so
 * Excel / Sheets treat them as text, then RFC 4180 quoting is applied.
 */
export function csvSafeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
