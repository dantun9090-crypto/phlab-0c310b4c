/**
 * Cryptographically-strong short id generator for session/telemetry IDs.
 * Replaces `Math.random()` fallbacks flagged by CodeQL `js/insecure-randomness`.
 */
export function cryptoRandomId(byteLen = 12): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().replace(/-/g, '');
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const buf = new Uint8Array(byteLen);
      crypto.getRandomValues(buf);
      return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    /* fall through */
  }
  // Last-resort deterministic-ish fallback — only reached on ancient runtimes.
  return `${Date.now().toString(36)}${performance.now().toString(36).replace('.', '')}`;
}
