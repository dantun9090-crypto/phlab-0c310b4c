/**
 * User-facing error state when both the primary AND backup gateways fail
 * to create a payment link.
 *
 * Asserts that:
 *   1. The customer sees the manual bank-transfer fallback message
 *      ("Online payment is temporarily unavailable…").
 *   2. NO redirect to an external payment host is performed
 *      (window.location.href is never assigned).
 *   3. The dispatcher is invoked exactly once with the order id from the URL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';

// --- Mocks ----------------------------------------------------------------

// Mock the server function — both gateways failing surfaces as a rejected promise.
vi.mock('@/lib/payment-gateways.functions', () => ({
  createGatewayPaymentLink: (...args: unknown[]) =>
    (globalThis as any).__createLinkMock(...args),
}));

// useServerFn just unwraps the function — return our mock directly.
vi.mock('@tanstack/react-start', () => ({
  useServerFn: (fn: unknown) => fn,
}));

// Firebase: simulate a signed-in user owning a ready-to-pay order.
vi.mock('@/lib/firebase', () => {
  const user = {
    uid: 'uid-buyer-1',
    email: 'buyer@example.com',
    getIdToken: async () => 'id-token-xyz',
  };
  return {
    db: {},
    auth: { currentUser: user },
    doc: () => ({}),
    getDoc: async () => ({
      exists: () => true,
      data: () => ({
        userId: 'uid-buyer-1',
        status: 'pending',
        totalAmount: 49.99,
        currency: 'GBP',
        orderNumber: 'PH-12345',
        customerName: 'Research Buyer',
        customerEmail: 'buyer@example.com',
      }),
    }),
    onAuthStateChanged: (_auth: unknown, cb: (u: typeof user) => void) => {
      cb(user);
      return () => undefined;
    },
  };
});

// --- Test -----------------------------------------------------------------

import PaymentPage from './index';

describe('<PaymentPage /> — primary + backup both fail', () => {
  const originalHref = window.location.href;
  let hrefAssignments: string[] = [];
  const createLinkMock = vi.fn();
  (globalThis as any).__createLinkMock = createLinkMock;

  beforeEach(() => {
    hrefAssignments = [];
    createLinkMock.mockReset();
    createLinkMock.mockRejectedValue(
      new Error('truelayer down'), // last error bubbled by dispatcher
    );

    // Force the order id into the URL the page reads on mount.
    window.history.replaceState({}, '', '/payment?orderId=ord_ABC123');

    // Spy on window.location.href assignment without navigating jsdom.
    const loc = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new Proxy(loc, {
        set(target, prop, value) {
          if (prop === 'href') {
            hrefAssignments.push(String(value));
            return true;
          }
          // @ts-expect-error – passthrough
          target[prop] = value;
          return true;
        },
      }),
    });
  });

  // Note: no afterEach window.location restoration — the beforeEach Proxy is
  // sufficient and replacing with a bare URL breaks subsequent tests that
  // read `window.location.search`.

  it('shows the bank-transfer fallback and does NOT redirect when both gateways fail', async () => {
    render(
      <HelmetProvider>
        <PaymentPage />
      </HelmetProvider>,
    );

    // Wait for the order to load and the Pay button to appear.
    const payBtn = await screen.findByRole('button', {
      name: /Pay with Bank Transfer/i,
    });
    expect(payBtn).toBeEnabled();

    fireEvent.click(payBtn);

    // Dispatcher invoked once with the order id from the URL.
    await waitFor(() => expect(createLinkMock).toHaveBeenCalledTimes(1));
    expect(createLinkMock.mock.calls[0]?.[0]).toMatchObject({
      data: { orderId: 'ord_ABC123', idToken: 'id-token-xyz' },
    });

    // --- Accessibility: error region is announced via role=alert + aria-live ---
    const alertRegion = await screen.findByTestId('bank-fallback');
    expect(alertRegion).toHaveAttribute('role', 'alert');
    expect(alertRegion).toHaveAttribute('aria-live', 'assertive');

    // --- Exact user-facing error text ---
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent(/^Complete via Bank Transfer$/);
    expect(heading).toHaveStyle({ color: '#10b981' });

    expect(
      screen.getByText(
        'Online payment is temporarily unavailable. Please send your payment directly to our bank account below.',
      ),
    ).toBeInTheDocument();

    // Order reference & amount surfaced inside the fallback.
    expect(screen.getByText('PH-12345')).toBeInTheDocument();
    expect(screen.getByText('£49.99')).toBeInTheDocument();

    // --- No redirect link / navigation occurred ---
    expect(hrefAssignments).toEqual([]);
    // No anchor pointing at a payment HPP host exists in the document.
    const externalAnchors = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href]'),
    ).filter((a) => /fena|truelayer/i.test(a.getAttribute('href') || ''));
    expect(externalAnchors).toEqual([]);

    // The original Pay button is no longer rendered (fallback took over).
    expect(
      screen.queryByRole('button', { name: /Pay with Bank Transfer/i }),
    ).toBeNull();

    // A "Try again" recovery button is offered.
    expect(
      screen.getByRole('button', { name: /Try Online Payment Again/i }),
    ).toBeInTheDocument();
  });

  it('lets the user retry after both gateways fail and shows the fallback again on a second failure', async () => {
    render(
      <HelmetProvider>
        <PaymentPage />
      </HelmetProvider>,
    );

    // First attempt — fails.
    const payBtn = await screen.findByRole('button', {
      name: /Pay with Bank Transfer/i,
    });
    fireEvent.click(payBtn);

    const retryBtn = await screen.findByRole('button', {
      name: /Try Online Payment Again/i,
    });
    expect(createLinkMock).toHaveBeenCalledTimes(1);
    expect(hrefAssignments).toEqual([]);

    // Clicking "Try Online Payment Again" dismisses the fallback and
    // restores the primary Pay button without redirecting.
    fireEvent.click(retryBtn);
    expect(screen.queryByTestId('bank-fallback')).toBeNull();
    const payBtn2 = await screen.findByRole('button', {
      name: /Pay with Bank Transfer/i,
    });
    expect(payBtn2).toBeEnabled();
    expect(hrefAssignments).toEqual([]);

    // Second attempt — also fails (both gateways still down).
    fireEvent.click(payBtn2);
    await waitFor(() => expect(createLinkMock).toHaveBeenCalledTimes(2));

    // Fallback re-appears with role=alert and no redirect occurred.
    const alertRegion2 = await screen.findByTestId('bank-fallback');
    expect(alertRegion2).toHaveAttribute('role', 'alert');
    expect(hrefAssignments).toEqual([]);
  });
});
