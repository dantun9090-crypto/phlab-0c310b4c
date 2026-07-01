import { describe, it, expect } from 'vitest';
import { parseBrowser } from '../browser-info';

describe('parseBrowser', () => {
  it('detects Chrome on macOS desktop', () => {
    const b = parseBrowser(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    );
    expect(b.name).toBe('Chrome');
    expect(b.version).toBe('149');
    expect(b.os).toBe('macOS');
    expect(b.mobile).toBe(false);
  });

  it('detects Firefox', () => {
    const b = parseBrowser(
      'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
    );
    expect(b.name).toBe('Firefox');
    expect(b.version).toBe('128');
    expect(b.os).toBe('Linux');
  });

  it('detects Safari on iOS mobile', () => {
    const b = parseBrowser(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    );
    expect(b.name).toBe('Safari');
    expect(b.version).toBe('17');
    expect(b.os).toBe('iOS');
    expect(b.mobile).toBe(true);
  });

  it('detects Edge before Chrome', () => {
    const b = parseBrowser(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
    );
    expect(b.name).toBe('Edge');
    expect(b.version).toBe('130');
    expect(b.os).toBe('Windows');
  });

  it('falls back to Other', () => {
    const b = parseBrowser('CustomBot/1.0');
    expect(b.name).toBe('Other');
    expect(b.version).toBe('0');
  });

  it('handles null/undefined safely', () => {
    expect(parseBrowser(null).name).toBe('Other');
    expect(parseBrowser(undefined).name).toBe('Other');
  });
});
