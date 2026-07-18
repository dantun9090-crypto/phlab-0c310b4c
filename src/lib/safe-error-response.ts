/**
 * Build a generic error response body for `/api/*` routes.
 *
 * CodeQL `js/stack-trace-exposure` fires whenever an untyped error's
 * `.message` or `.stack` is passed to the client. Route handlers must:
 *   1. Log the raw error server-side via `logServerError()`.
 *   2. Return `safeErrorBody(code, publicMessage)` — never the raw message.
 *
 * The `code` is a short stable machine-readable string clients can branch on
 * (`"ORDER_INVALID"`, `"UPSTREAM_502"`, …). The `message` is a fixed,
 * user-safe sentence. No dynamic content is included.
 */
export type SafeErrorBody = { error: string; code: string; requestId?: string };

export function safeErrorBody(code: string, message: string, requestId?: string): SafeErrorBody {
  return requestId ? { error: message, code, requestId } : { error: message, code };
}

export function logServerError(scope: string, err: unknown, extra?: Record<string, unknown>): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  try {
    console.error(`[${scope}]`, message, extra ?? '', stack ?? '');
  } catch {
    /* logging must never throw */
  }
}
