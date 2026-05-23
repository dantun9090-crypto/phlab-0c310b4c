/**
 * Lean Firebase Auth shim — used ONLY for the route-level auth guard.
 * Imports ONLY firebase/auth (no Firestore, no Storage, no email templates).
 * This keeps the initial JS bundle small and TBT low.
 *
 * The full firebase.ts is dynamically imported by Layout and pages as needed.
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyB5sWYCTkzeFFup0mqyg3PzCIzjP2oGJdM',
  authDomain: 'prohealthpeptides-a0808.firebaseapp.com',
  projectId: 'prohealthpeptides-a0808',
  storageBucket: 'prohealthpeptides-a0808.firebasestorage.app',
  messagingSenderId: '1070409753291',
  appId: '1:1070409753291:web:8bf1e58130fbe23e66f14e',
  measurementId: 'G-L8X0591XKB',
};

// Reuse existing app if already initialised (e.g. by firebase.ts in same session)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export { onAuthStateChanged };
export type { FirebaseUser };
