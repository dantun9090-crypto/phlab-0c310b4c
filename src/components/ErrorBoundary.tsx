import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Link } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { logSecurityEvent } from '@/lib/security-events';
import { isHydrationMismatchError, isStaleChunkError, hardReload, markHydrationError } from '@/lib/recovery';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  componentName?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  private getComponentName(componentStack?: string | null): string {
    const firstFrame = componentStack
      ?.split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('at '));
    return firstFrame?.replace(/^at\s+/, '').split(' ')[0] || 'Unknown component';
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    if (isHydrationMismatchError(error)) markHydrationError();
    const componentName = this.getComponentName(info?.componentStack);
    this.setState({ componentName });
    console.error('[ERROR BOUNDARY]', error);
    console.error('[ERROR BOUNDARY] component:', componentName);
    console.error('[ERROR BOUNDARY] component stack:\n' + (info?.componentStack || '(no component stack)'));
    // Ship to Sentry with the React component stack for release-context alerts.
    try {
      Sentry.withScope((scope) => {
        scope.setTag('boundary', 'root');
        if (info?.componentStack) scope.setContext('react', { componentStack: info.componentStack });
        Sentry.captureException(error);
      });
    } catch { /* never break */ }
    // Detailed logging to Firestore securityEvents (fire-and-forget).
    try {
      logSecurityEvent({
        type: 'error_boundary',
        errorType: error.name,
        message: error.message,
        meta: { stack: (error.stack || '').slice(0, 1000) },
      });
    } catch { /* never break */ }
  }

  handleRetry = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isHydrationError = isHydrationMismatchError(this.state.error);
      const isChunkError = isStaleChunkError(this.state.error);
      if (isChunkError) {
        // Fire hardReload in background; render a friendly refresh UI.
        try { void hardReload({ clean: true }); } catch { /* ignore */ }
        const handleRefreshAndClearCache = async () => {
          try {
            // 1. Unregister service workers.
            if ('serviceWorker' in navigator) {
              try {
                const registrations = await navigator.serviceWorker.getRegistrations();
                await Promise.all(registrations.map((r) => r.unregister().catch(() => false)));
              } catch { /* ignore */ }
            }
            // 2. Delete all Cache Storage buckets.
            if (typeof caches !== 'undefined') {
              try {
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
              } catch { /* ignore */ }
            }
            // 3. Purge only cache/build/version/sw-related localStorage keys.
            //    Preserve `php_cart`, auth tokens, prefs, etc.
            try {
              const toRemove: string[] = [];
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && /(cache|build|version|sw-|__phl_)/i.test(key)) toRemove.push(key);
              }
              toRemove.forEach((k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
            } catch { /* ignore */ }
            // 4. Clear sessionStorage (includes hard-reload / hydration flags).
            try { sessionStorage.clear(); } catch { /* ignore */ }
            // 5. Best-effort IndexedDB wipe (skip Firebase/Firestore DBs to keep auth).
            try {
              const anyIdb = window.indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> };
              if (typeof anyIdb.databases === 'function') {
                const dbs = await anyIdb.databases();
                dbs?.forEach((db) => {
                  if (db.name && !/^firebase|firestore|firebaseLocalStorageDb/i.test(db.name)) {
                    try { window.indexedDB.deleteDatabase(db.name); } catch { /* ignore */ }
                  }
                });
              }
            } catch { /* ignore */ }
          } catch (err) {
            console.error('Cache clear failed:', err);
          } finally {
            // Firefox ignores window.location.reload(true); use href + cache-buster.
            try {
              const url = new URL(window.location.href);
              url.searchParams.set('_clear', String(Date.now()));
              window.location.href = url.toString();
            } catch {
              window.location.href = window.location.pathname + '?_force=' + Date.now();
            }
          }
        };
        return (
          <div className="min-h-screen bg-gray-900 flex items-center justify-center px-6">
            <div className="max-w-md w-full text-center">
              <h1 className="text-2xl font-bold text-white mb-4">Update available</h1>
              <p className="text-gray-400 mb-8">
                A newer version of the site is live. Refresh to load the latest page.
              </p>
              <button
                onClick={() => { void handleRefreshAndClearCache(); }}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh &amp; clear cache
              </button>
            </div>
          </div>
        );
      }
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center px-6">
          <div className="max-w-md w-full text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-500/20 mb-6">
              <AlertTriangle className="w-10 h-10 text-red-400" />
            </div>

            <h1 className="text-2xl font-bold text-white mb-4">
              {this.state.componentName || (isHydrationError ? 'Refresh needed' : 'Something went wrong')}
            </h1>

            <p className="text-gray-400 mb-8">
              {isHydrationError
                ? 'The page did not initialise cleanly. Auto-reload has been stopped; please refresh manually.'
                : 'Something went wrong. Please try again.'}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
              <button
                onClick={() => (window.location.reload as (forceReload?: boolean) => void)(true)}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Reload
              </button>

              <Link
                to="/"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-medium rounded-lg transition-colors"
              >
                <Home className="w-4 h-4" />
                Go Home
              </Link>
            </div>

            {this.state.error && import.meta.env.DEV && (
              <div className="mt-8 p-4 bg-gray-800/50 rounded-lg">
                <p className="text-gray-400 text-sm font-mono break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
