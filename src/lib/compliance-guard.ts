/**
 * Compliance guard — runs validateContent() on admin-controlled copy
 * before persisting, and logs any violation to `securityEvents`.
 *
 * Returns { ok, message } so the caller can toast the message and abort.
 */
import { validateContent } from '@/lib/peptide-compliance';
import { logSecurityEvent } from '@/lib/security-events';

export interface ComplianceCheckResult {
  ok: boolean;
  message: string;
}

export function checkComplianceAndLog(
  field: string,
  text: string | null | undefined,
  context: { collection: string; docId?: string | null },
): ComplianceCheckResult {
  const result = validateContent(text);
  if (result.valid) return { ok: true, message: '' };

  const summary = result.violations
    .map((v) => `"${v.match}" — ${v.reason}`)
    .join('; ');

  logSecurityEvent({
    type: 'compliance_violation',
    message: `[${context.collection}/${context.docId ?? 'new'}] ${field}: ${summary}`.slice(0, 500),
    meta: {
      collection: context.collection,
      docId: context.docId ?? null,
      field,
      violations: result.violations,
    },
  });

  return {
    ok: false,
    message: `Blocked: forbidden medical/health claim in ${field} — ${summary}`,
  };
}
