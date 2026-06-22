/**
 * Lean Firebase Auth shim — used ONLY for the route-level auth guard.
 * Imports ONLY firebase/auth (no Firestore, no Storage, no email templates).
 * This keeps the initial JS bundle small and TBT low.
 *
 * The full firebase.ts is dynamically imported by Layout and pages as needed.
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  indexedDBLocalPersistence,
} from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyB5sWYCTkzeFFup0mqyg3PzCIzjP2oGJdM',
  // Custom auth domain — phlabs.co.uk jest proxy'owane przez Cloudflare
  // Worker do prohealthpeptides-a0808.firebaseapp.com (zob. src/server.ts).
  // Mimo proxy, domena MUSI być dodana w Firebase Console → Authentication →
  // Settings → Authorized domains. W Google Cloud OAuth 2.0 Client dodaj
  // https://phlabs.co.uk jako Authorized JavaScript origin oraz
  // https://phlabs.co.uk/__/auth/handler jako redirect URI.
  authDomain: 'phlabs.co.uk',
  projectId: 'prohealthpeptides-a0808',
  storageBucket: 'prohealthpeptides-a0808.firebasestorage.app',
  messagingSenderId: '1070409753291',
  appId: '1:1070409753291:web:8bf1e58130fbe23e66f14e',
  measurementId: 'G-L8X0591XKB',
};

// Reuse existing app if already initialised (e.g. by firebase.ts in same session)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

// ── Persistence bootstrap ────────────────────────────────────────────────
// Apply the user's "Keep me signed in" preference IMMEDIATELY when the lean
// shim loads (this runs before firebase.ts on the auth-guard path).
// Default = persistent (indexedDB / localStorage) so a refresh OR a full
// browser restart keeps the user signed in. Only when the user explicitly
// opted out (`php_auth_remember === '0'`) do we downgrade to session-only.
const REMEMBER_KEY = 'php_auth_remember';
if (typeof window !== 'undefined') {
  let remembered = true;
  try {
    if (window.localStorage.getItem(REMEMBER_KEY) === '0') remembered = false;
  } catch { /* storage blocked → assume remembered */ }

  if (remembered) {
    // Try indexedDB first (survives browser restart), fall back to localStorage.
    setPersistence(auth, indexedDBLocalPersistence).catch(() =>
      setPersistence(auth, browserLocalPersistence).catch((e) => {
        console.warn('[auth] persistent setPersistence failed:', e);
      }),
    );
  } else {
    setPersistence(auth, browserSessionPersistence).catch((e) => {
      console.warn('[auth] session setPersistence failed:', e);
    });
  }
}

export { onAuthStateChanged };
export type { FirebaseUser };
