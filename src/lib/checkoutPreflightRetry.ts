/**
 * Client-side retry wrapper for the checkout preflight validation call.
 *
 * Retries on transient network / 5xx failures using exponential backoff
 * (baseDelayMs * 2^attempt). 4xx and other deterministic errors surface
 * immediately.
 */

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  /** Called before each attempt (1-indexed). Useful for UI progress. */
  onAttempt?: (attempt: number, total: number) => void;
}

interface WithStatus {
  statusCode?: number;
  status?: number;
  code?: string;
  name?: string;
}

function isRetryable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return true;
  const e = error as WithStatus;
  const status = e.statusCode ?? e.status;
  if (typeof status === 'number') {
    return status >= 500;
  }
  // No status → treat as network / timeout / abort → retry.
  if (e.code === 'NETWORK_ERROR' || e.name === 'AbortError' || e.name === 'TimeoutError') {
    return true;
  }
  // Plain thrown Error with no status is retryable (fetch failures typically).
  return true;
}

export async function callPreflightWithRetry<T>(
  callFn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { maxRetries, baseDelayMs, onAttempt } = options;
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      onAttempt?.(attempt + 1, maxRetries + 1);
      return await callFn();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === maxRetries) {
        throw error;
      }
      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
