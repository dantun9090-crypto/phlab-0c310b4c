import { Component, ReactNode } from 'react';
import * as Sentry from '@sentry/react';
import { logSecurityEvent } from '@/lib/security-events';
import { isHydrationMismatchError, markHydrationError } from '@/lib/recovery';

function openFreshPage() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('nocache', '1');
    url.searchParams.set('sw', 'off');
    url.searchParams.set('phl_loop_disabled', '1');
    url.searchParams.set('_r', String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.href = `/?nocache=1&sw=off&phl_loop_disabled=1&_r=${Date.now()}`;
  }
}

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

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    if (isHydrationMismatchError(error)) markHydrationError();
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
    // Dev-only console echo
    if (import.meta.env.DEV) console.error('Error caught by boundary:', error);
  }

  handleRetry = () => {
    openFreshPage();
  };

  render() {
    if (this.state.hasError) {
      const isHydrationError = isHydrationMismatchError(this.state.error);
      if (isHydrationError) return null;
      return null;
    }

    return this.props.children;
  }
}
