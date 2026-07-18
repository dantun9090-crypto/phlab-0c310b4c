import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Link } from 'react-router-dom';
// Lazy bridge — a static `import * as Sentry` here pulled the ~1.2MB
// vendor-sentry chunk into the initial bundle (boot path: client.tsx →
// ErrorBoundary), blocking mobile LCP. The SDK now loads on demand.
import { captureExceptionLazy } from '@/lib/sentry-lazy';
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
    captureExceptionLazy(error, {
      tags: { boundary: 'root' },
      contexts: info?.componentStack
        ? { react: { componentStack: info.componentStack } }
        : undefined,
    });
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
    void hardReload({ clean: true, home: true });
  };

  render() {
    if (this.state.hasError) {
      const isHydrationError = isHydrationMismatchError(this.state.error);
      const isChunkError = isStaleChunkError(this.state.error);
      if (isChunkError) {
        // Fire the fresh-HTML recovery in background; keep a button as a fallback.
        try { void hardReload({ clean: true }); } catch { /* ignore */ }
        return (
          <div className="min-h-screen bg-gray-900 flex items-center justify-center px-6">
            <div className="max-w-md w-full text-center">
              <h1 className="text-2xl font-bold text-white mb-4">Opening fresh store</h1>
              <p className="text-gray-400 mb-8">
                Clearing an old browser copy and loading the latest page.
              </p>
              <button
                onClick={() => { void hardReload({ clean: true }); }}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Open fresh store
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
              {this.state.componentName || (isHydrationError ? 'Opening fresh store' : 'Something went wrong')}
            </h1>

            <p className="text-gray-400 mb-8">
              {isHydrationError
                ? 'Clearing an old browser copy and loading the latest page.'
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
                onClick={() => { void hardReload({ clean: true, home: true }); }}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Open fresh store
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
