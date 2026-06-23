import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Link } from 'react-router-dom';
import { logSecurityEvent } from '@/lib/security-events';
import { isHydrationMismatchError, markHydrationError } from '@/lib/recovery';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    if (isHydrationMismatchError(error)) markHydrationError();
    // Detailed logging to Firestore securityEvents (fire-and-forget).
    try {
      logSecurityEvent({
        type: 'error_boundary',
        errorType: error.name,
        message: error.message,
        meta: { stack: (error.stack || '').slice(0, 1000) },
      });
    } catch { /* never break */ }
    // Dev-only console echo
    if (import.meta.env.DEV) console.error('Error caught by boundary:', error);
  }

  handleRetry = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isHydrationError = isHydrationMismatchError(this.state.error);
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center px-6">
          <div className="max-w-md w-full text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-500/20 mb-6">
              <AlertTriangle className="w-10 h-10 text-red-400" />
            </div>

            <h1 className="text-2xl font-bold text-white mb-4">
              {isHydrationError ? 'Refresh needed' : 'Something went wrong'}
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
