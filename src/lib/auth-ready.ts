import { auth } from '@/lib/firebase';

/**
 * Wait for Firebase Auth to restore the persisted session, then return a
 * fresh ID token. Throws a clear error if the user isn't signed in. Use
 * this from admin tabs instead of reading `auth.currentUser` directly —
 * on first render the SDK has not yet rehydrated and `currentUser` is
 * `null`, which would surface as "Not signed in" even though the admin
 * IS signed in.
 */
export async function getAdminIdToken(): Promise<string> {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not signed in — please sign in as an admin first.');
  }
  return user.getIdToken();
}
