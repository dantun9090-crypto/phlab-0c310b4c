/**
 * A11y regression tests for the Live Activity + Toast Audit admin tabs.
 *
 * These components are heavily coupled to Firebase + admin context, so instead
 * of mounting them we statically assert the accessibility contract directly
 * against the JSX source. This catches regressions where a future edit removes
 * aria-label, role="switch", aria-checked, the focus-visible ring, the
 * keyboard-accessible <button>/<input> element, or the confirmation dialog
 * gate on the destructive "Restore defaults" action.
 *
 * Covered controls:
 *   - "Humans only" toggle
 *   - "forceHideBadge = bot" toggle
 *   - "Restore defaults" button (must trigger AlertDialog, not run immediately)
 *   - "Export" allowlists button
 *   - "Import" allowlists file input
 *   - "Export CSV" button in Toast Audit
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const liveSrc = readFileSync(
  resolve(__dirname, 'LiveActivityTab.tsx'),
  'utf8',
);
const auditSrc = readFileSync(
  resolve(__dirname, 'ToastAuditTab.tsx'),
  'utf8',
);

/** Extract the JSX of an <input ... /> block whose aria-label starts with `prefix`. */
function inputBlockByAriaLabel(src: string, prefix: string): string {
  const re = new RegExp(
    `<input\\b[\\s\\S]*?aria-label=\\{\`${prefix}[\\s\\S]*?\\/>`,
    'm',
  );
  const m = src.match(re);
  if (!m) throw new Error(`input with aria-label starting "${prefix}" not found`);
  return m[0];
}

/** Extract <button ... >...</button> whose aria-label starts with `prefix`. */
function buttonBlockByAriaLabel(src: string, prefix: string): string {
  const idx = src.indexOf(`aria-label="${prefix}`);
  if (idx === -1) {
    // Try template-literal form.
    const idx2 = src.indexOf(`aria-label={\`${prefix}`);
    if (idx2 === -1) throw new Error(`button aria-label "${prefix}" not found`);
    const start = src.lastIndexOf('<button', idx2);
    const end = src.indexOf('</button>', idx2);
    return src.slice(start, end + '</button>'.length);
  }
  const start = src.lastIndexOf('<button', idx);
  const end = src.indexOf('</button>', idx);
  return src.slice(start, end + '</button>'.length);
}

describe('LiveActivityTab — keyboard + ARIA contract', () => {
  describe('"Humans only" toggle', () => {
    const block = inputBlockByAriaLabel(liveSrc, 'Humans only filter');

    it('uses a native checkbox (keyboard-accessible by default)', () => {
      expect(block).toMatch(/type="checkbox"/);
    });
    it('exposes role="switch" with aria-checked bound to state', () => {
      expect(block).toMatch(/role="switch"/);
      expect(block).toMatch(/aria-checked=\{prefs\.hideBots\}/);
    });
    it('has a descriptive aria-label that reflects on/off state', () => {
      expect(block).toMatch(/Humans only filter — \$\{prefs\.hideBots \? 'on' : 'off'\}/);
    });
    it('has a visible focus-visible ring', () => {
      expect(block).toMatch(/focus-visible:ring-2/);
    });
    it('announces state changes via the live region', () => {
      expect(block).toMatch(/announce\(`Humans only \$\{e\.target\.checked \? 'enabled' : 'disabled'\}\./);
    });
  });

  describe('"forceHideBadge = bot" toggle', () => {
    const block = inputBlockByAriaLabel(liveSrc, 'Treat forceHideBadge as bot');

    it('uses a native checkbox', () => {
      expect(block).toMatch(/type="checkbox"/);
    });
    it('exposes role="switch" with aria-checked bound to state', () => {
      expect(block).toMatch(/role="switch"/);
      expect(block).toMatch(/aria-checked=\{prefs\.treatForceHideBadgeAsBot\}/);
    });
    it('has a descriptive aria-label that reflects on/off state', () => {
      expect(block).toMatch(/Treat forceHideBadge as bot — \$\{prefs\.treatForceHideBadgeAsBot \? 'on' : 'off'\}/);
    });
    it('has a visible focus-visible ring', () => {
      expect(block).toMatch(/focus-visible:ring-2/);
    });
    it('announces state changes via the live region', () => {
      expect(block).toMatch(/announce\(`forceHideBadge classification /);
    });
  });

  describe('"Restore defaults" button', () => {
    const btn = buttonBlockByAriaLabel(liveSrc, 'Restore default allowlists');

    it('is a real <button type="button"> (Enter/Space activatable)', () => {
      expect(btn).toMatch(/<button/);
      expect(btn).toMatch(/type="button"/);
    });
    it('mentions the confirmation dialog in the aria-label', () => {
      expect(btn).toMatch(/Opens confirmation dialog/);
    });
    it('opens the AlertDialog instead of running destructively on click', () => {
      expect(btn).toMatch(/setConfirmRestoreOpen\(true\)/);
      expect(btn).not.toMatch(/restoreAllowlistDefaults\(\)/);
    });
    it('has a visible focus-visible ring', () => {
      expect(btn).toMatch(/focus-visible:ring-2/);
    });

    it('AlertDialog wraps the actual restore action behind a confirm button', () => {
      expect(liveSrc).toMatch(/<AlertDialog\s+open=\{confirmRestoreOpen\}/);
      expect(liveSrc).toMatch(/restoreAllowlistDefaults\(\);\s*setConfirmRestoreOpen\(false\)/);
    });
  });

  describe('"Export" allowlists button', () => {
    const btn = buttonBlockByAriaLabel(liveSrc, 'Export allowlists to JSON');

    it('is a keyboard-activatable <button type="button">', () => {
      expect(btn).toMatch(/<button/);
      expect(btn).toMatch(/type="button"/);
    });
    it('aria-label includes counts of UA + referrer entries', () => {
      expect(btn).toMatch(/\$\{prefs\.allowlistUAs\.length\} UA/);
      expect(btn).toMatch(/\$\{prefs\.allowlistReferrers\.length\} referrer entries/);
    });
    it('has a visible focus-visible ring', () => {
      expect(btn).toMatch(/focus-visible:ring-2/);
    });
    it('decorative icon is aria-hidden', () => {
      expect(btn).toMatch(/aria-hidden="true"/);
    });
  });

  describe('"Import" allowlists file input', () => {
    const block = inputBlockByAriaLabel(liveSrc, 'Import allowlists from a JSON file');

    it('uses a native <input type="file"> (keyboard-focusable + screenreader-named)', () => {
      expect(block).toMatch(/type="file"/);
      expect(block).toMatch(/accept="application\/json,\.json"/);
    });
    it('is sr-only but reachable via its labelled wrapper with focus-within ring', () => {
      expect(block).toMatch(/className="sr-only"/);
      expect(liveSrc).toMatch(/focus-within:ring-2 focus-within:ring-emerald-400/);
    });
  });

  it('exposes an aria-live polite status region for announcements', () => {
    expect(liveSrc).toMatch(/aria-live="polite"/);
    expect(liveSrc).toMatch(/role="status"/);
  });
});

describe('ToastAuditTab — keyboard + ARIA contract', () => {
  describe('"Export CSV" button', () => {
    const btn = buttonBlockByAriaLabel(auditSrc, 'Export');

    it('is a keyboard-activatable <button>', () => {
      expect(btn).toMatch(/<button/);
    });
    it('aria-label mentions Hidden bots are included', () => {
      expect(btn).toMatch(/Hidden bots/);
    });
    it('aria-label exposes the live count of filtered entries', () => {
      expect(btn).toMatch(/\$\{filtered\.length\} filtered audit entries/);
    });
  });
});
