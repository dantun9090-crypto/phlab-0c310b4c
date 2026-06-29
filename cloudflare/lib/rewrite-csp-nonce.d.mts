export const NONCE_PLACEHOLDER: "__CSP_NONCE__";
export const NONCE_PLACEHOLDER_RX: RegExp;
export function generateNonce(rng?: (n: number) => Uint8Array): string;
export function rewriteCspNonceString(input: {
  csp: string;
  html: string;
  nonce?: string;
}): {
  csp: string;
  html: string;
  nonce: string | null;
  rewritten: boolean;
};
