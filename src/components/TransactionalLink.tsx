import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { isLegacyHost, transactionalHref } from '@/lib/legacy-host';

/**
 * Link for transactional destinations (/login, /register, /account, /checkout).
 *
 * On the canonical host it is a normal SPA <Link>. On the legacy SEO mirror
 * (prohealthpeptides.co.uk) it becomes a plain absolute anchor to check-domains-allow-line
 * phlabs.co.uk, so the user lands on the auth/session origin directly instead
 * of being 302'd mid-flow by the Worker (which broke Google sign-in UX).
 */
export default function TransactionalLink({
  to,
  children,
  className,
  style,
  onClick,
  'aria-label': ariaLabel,
}: {
  to: string;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  'aria-label'?: string;
}) {
  if (isLegacyHost()) {
    return (
      <a
        href={transactionalHref(to)}
        className={className}
        style={style}
        onClick={onClick}
        aria-label={ariaLabel}
      >
        {children}
      </a>
    );
  }

  return (
    <Link to={to} className={className} style={style} onClick={onClick} aria-label={ariaLabel}>
      {children}
    </Link>
  );
}
