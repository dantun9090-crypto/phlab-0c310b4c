/**
 * Password policy: min 12 chars, 1 uppercase, 1 number, 1 symbol.
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
  minLength: 12,
  requireUpper: true,
  requireNumber: true,
  requireSymbol: true,
} as const;

const SYMBOL_RE = /[^A-Za-z0-9]/;

export function evaluatePassword(password: string): PasswordPolicyResult {
  const pw = password ?? '';
  const errors: string[] = [];

  if (pw.length < PASSWORD_RULES.minLength) {
    errors.push(`At least ${PASSWORD_RULES.minLength} characters`);
  }
  if (!/[A-Z]/.test(pw)) errors.push('1 uppercase letter');
  if (!/[0-9]/.test(pw)) errors.push('1 number');
  if (!SYMBOL_RE.test(pw)) errors.push('1 symbol (e.g. !@#$%)');

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
