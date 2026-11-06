import { auth } from '@/lib/firebase';

/** fetch() that attaches the signed-in admin's Firebase ID token. */
export async function adminFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const idToken = await auth.currentUser?.getIdToken();
  const headers = new Headers(init.headers);
  if (idToken) headers.set('authorization', `Bearer ${idToken}`);
  return fetch(input, { ...init, headers });
}
