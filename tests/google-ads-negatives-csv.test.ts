// @vitest-environment node
/**

 * Validates Google Ads Editor bulk-import CSV shape for negative keywords:
 *  - exact header order
 *  - CRLF line endings
 *  - RFC-4180 cell escaping (quotes, commas, newlines)
 *  - trailing CRLF on the last row
 */
import { describe, it, expect } from 'vitest';
import {
  buildNegativesCsv,
  buildSampleNegativesCsv,
} from '@/lib/compound-queries.functions';

const HEADER =
  'Campaign,Keyword,Criterion Type,Match Type,Status\r\n';

describe('buildNegativesCsv — Google Ads Editor schema', () => {
  it('uses the exact header expected by Google Ads Editor', () => {
    const csv = buildNegativesCsv('PHLABS — Compound Search', ['kw one']);
    expect(csv.startsWith(HEADER)).toBe(true);
  });

  it('uses CRLF line endings on every row including the last', () => {
    const csv = buildNegativesCsv('Camp', ['a', 'b', 'c']);
    // every line ends with \r\n and there are no bare \n
    const stripped = csv.replace(/\r\n/g, '');
    expect(stripped.includes('\n')).toBe(false);
    expect(csv.endsWith('\r\n')).toBe(true);
    // header + 3 rows + trailing CRLF = 4 \r\n
    expect(csv.match(/\r\n/g)?.length).toBe(4);
  });

  it('lower-cases and trims the keyword value', () => {
    const csv = buildNegativesCsv('Camp', ['  Mixed CASE Word  ']);
    expect(csv).toContain(',mixed case word,');
  });

  it('sets criterion type to "Negative Keyword" and defaults to Phrase / Enabled', () => {
    const csv = buildNegativesCsv('Camp', ['kw']);
    const row = csv.split('\r\n')[1];
    expect(row).toBe('Camp,kw,Negative Keyword,Phrase,Enabled');
  });

  it('honours custom matchType + status', () => {
    const csv = buildNegativesCsv('Camp', ['kw'], 'Exact', 'Paused');
    expect(csv.split('\r\n')[1]).toBe('Camp,kw,Negative Keyword,Exact,Paused');
  });

  it('RFC-4180 escapes commas inside cells', () => {
    const csv = buildNegativesCsv('Brand, Inc.', ['kw,with,commas']);
    expect(csv).toContain('"Brand, Inc."');
    expect(csv).toContain('"kw,with,commas"');
  });

  it('RFC-4180 escapes double-quotes by doubling them', () => {
    const csv = buildNegativesCsv('"Quoted" Camp', ['kw "x"']);
    expect(csv).toContain('"""Quoted"" Camp"');
    expect(csv).toContain('"kw ""x"""');
  });

  it('RFC-4180 escapes embedded CR / LF in cells', () => {
    const csv = buildNegativesCsv('Multi\nLine', ['kw\r\nwrap']);
    expect(csv).toContain('"Multi\nLine"');
    expect(csv).toContain('"kw\r\nwrap"');
  });

  it('returns just the header when no negatives are supplied', () => {
    expect(buildNegativesCsv('Camp', [])).toBe(HEADER);
  });

  it('sample CSV matches the same schema', () => {
    const sample = buildSampleNegativesCsv();
    expect(sample.startsWith(HEADER)).toBe(true);
    expect(sample.endsWith('\r\n')).toBe(true);
    const lines = sample.split('\r\n').filter(Boolean);
    // header + 4 sample rows
    expect(lines.length).toBe(5);
    for (const row of lines.slice(1)) {
      expect(row).toMatch(/,Negative Keyword,Phrase,Enabled$/);
    }
  });
});
