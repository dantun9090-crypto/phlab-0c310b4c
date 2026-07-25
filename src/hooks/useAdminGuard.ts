/**
 * useAdminGuard — single source of truth for admin access in the panel.
 *
 * Admin identity in this project is Firestore `customers/{uid}` with
 * `isAdmin === true` (a `role === 'admin'` field is also accepted). There is
 * NO `users/{uid}` document and NO `token.admin` custom claim — Storage and
 * Firestore rules resolve admin the same way, so this hook must not diverge.
 *
 * Firebase is imported lazily: `routeTree.gen.ts` statically imports every
 * route file, so a top-level `@/lib/firebase` import here would pull the
 * ~540 KB firebase vendor chunk into the eager graph of every page.
 */
import { useEffect, useState } from 'react';

export interface AdminGuardOptions {
  /** Where to send signed-out visitors. Default: `/login`. */
  loginPath?: string;
  /** Where to send signed-in non-admins. Default: `/` (null = render nothing, no redirect). */
  redirectTo?: string | null;
  /** Custom navigation (e.g. react-router `navigate`). Default: hard location change. */
  onRedirect?: (path: string) => void;
}

export interface AdminGuardState {
  /** True only when the signed-in user is a verified admin. */
  isAdmin: boolean;
  /** True until the auth + Firestore check has resolved. */
  loading: boolean;
  /** Firestore was unreachable (permission-denied / offline) — not a denial. */
  firestoreError: boolean;
  /** Resolved Firebase uid, or null when signed out. */
  uid: string | null;
}

export function useAdminGuard(options: AdminGuardOptions = {}): AdminGuardState {
  const { loginPath = '/login', redirectTo = '/', onRedirect } = options;

  const [state, setState] = useState<AdminGuardState>({
    isAdmin: false,
    loading: true,
    firestoreError: false,
    uid: null,
  });

  useEffect(() => {
    let alive = true;
    let unsub: (() => void) | undefined;

    const go = (path: string) => {
      if (onRedirect) onRedirect(path);
      else if (typeof window !== 'undefined') window.location.href = path;
    };

    void import('@/lib/firebase').then((fb) => {
      if (!alive) return;
      const { auth, db, doc, getDoc, onAuthStateChanged } = fb;

      unsub = onAuthStateChanged(auth, async (user) => {
        if (!alive) return;

        if (!user) {
          setState({ isAdmin: false, loading: false, firestoreError: false, uid: null });
          go(loginPath);
          return;
        }

        try {
          const snap = await getDoc(doc(db, 'customers', user.uid));
          const data = snap.exists() ? snap.data() : null;
          const admin = data?.isAdmin === true || data?.role === 'admin';
          if (!alive) return;
          setState({ isAdmin: admin, loading: false, firestoreError: false, uid: user.uid });
          if (!admin && redirectTo) go(redirectTo);
        } catch (err) {
          const code = (err as { code?: string })?.code || '';
          const unreachable =
            code === 'permission-denied' || code === 'unavailable' || code.includes('network');
          if (!alive) return;
          setState({
            isAdmin: false,
            loading: false,
            firestoreError: unreachable,
            uid: user.uid,
          });
          if (!unreachable && redirectTo) go(redirectTo);
        }
      });
    });

    return () => {
      alive = false;
      unsub?.();
    };
    // Options are read once on mount — the guard must not re-run on re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}

export default useAdminGuard;
