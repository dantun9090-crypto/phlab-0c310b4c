/**
 * Password policy: min 6 chars (Firebase Auth floor). Composition rules
 * relaxed 2026-07-26 on owner request (was min 12 + upper + number +
 * symbol) — the strength meter still nudges users toward stronger
 * passwords but no longer blocks simple ones.
 * Used by Register, Reset Password, and Account → Change Password.
 */

export interface PasswordPolicyResult {
  ok: boolean;
  errors: string[];
  /** Numeric strength score 0..5 (length + class + entropy bonuses). */
  score: number;
  /** Human label aligned with score. */
  label: 'Too weak' | 'Weak' | 'Fair' | 'Good' | 'Strong' | 'Excellent';
  /** Token + colour for the bar UI (tailwind classes). */
  color: string;
}

export const PASSWORD_RULES = {
  minLength: 6,
  requireUpper: false,
  requireNumber: false,
  requireSymbol: false,
} as const;

const SYMBOL_RE = /[^A-Za-z0-9]/;

export function evaluatePassword(password: string): PasswordPolicyResult {
  const pw = password ?? '';
  const errors: string[] = [];

  if (pw.length < PASSWORD_RULES.minLength) {
    errors.push(`At least ${PASSWORD_RULES.minLength} characters`);
  }
  if (PASSWORD_RULES.requireUpper && !/[A-Z]/.test(pw)) errors.push('1 uppercase letter');
  if (PASSWORD_RULES.requireNumber && !/[0-9]/.test(pw)) errors.push('1 number');
  if (PASSWORD_RULES.requireSymbol && !SYMBOL_RE.test(pw)) errors.push('1 symbol (e.g. !@#$%)');

  // Score 0..5
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (SYMBOL_RE.test(pw)) score++;
  if (pw.length >= 18) score = Math.min(5, score + 1);

  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'] as const;
  const colors = [
    'bg-red-500',
    'bg-red-400',
    'bg-amber-500',
    'bg-yellow-400',
    'bg-emerald-500',
    'bg-emerald-400',
  ];

  return {
    ok: errors.length === 0,
    errors,
    score,
    label: labels[score],
    color: colors[score],
  };
}

export function summarisePolicyErrors(errors: string[]): string {
  if (errors.length === 0) return '';
  return `Password must contain: ${errors.join(', ')}.`;
}
