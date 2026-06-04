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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';

// --- Mocks ----------------------------------------------------------------

// Mock the server function — both gateways failing surfaces as a rejected promise.
const createLinkMock = vi.fn();
vi.mock('@/lib/payment-gateways.functions', () => ({
  createGatewayPaymentLink: createLinkMock,
}));

// useServerFn just unwraps the function — return our mock directly.
vi.mock('@tanstack/react-start', () => ({
  useServerFn: (fn: unknown) => fn,
}));

// Firebase: simulate a signed-in user owning a ready-to-pay order.
const authUser = {
  uid: 'uid-buyer-1',
  email: 'buyer@example.com',
  getIdToken: vi.fn(async () => 'id-token-xyz'),
};
vi.mock('@/lib/firebase', () => {
  return {
    db: {},
    auth: { currentUser: authUser },
    doc: vi.fn(() => ({})),
    getDoc: vi.fn(async () => ({
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
    })),
    onAuthStateChanged: (_auth: unknown, cb: (u: typeof authUser) => void) => {
      cb(authUser);
      return () => undefined;
    },
  };
});

// --- Test -----------------------------------------------------------------

import PaymentPage from './index';

describe('<PaymentPage /> — primary + backup both fail', () => {
  const originalHref = window.location.href;
  let hrefAssignments: string[] = [];

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

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL(originalHref),
      writable: true,
    });
  });

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

    // User-facing error: manual bank-transfer fallback rendered.
    expect(
      await screen.findByText(/Complete via Bank Transfer/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Online payment is temporarily unavailable/i),
    ).toBeInTheDocument();

    // No external redirect happened.
    expect(hrefAssignments).toEqual([]);

    // The original Pay button is no longer rendered (fallback took over).
    expect(
      screen.queryByRole('button', { name: /Pay with Bank Transfer/i }),
    ).toBeNull();

    // A "Try again" recovery button is offered.
    expect(
      screen.getByRole('button', { name: /Try Online Payment Again/i }),
    ).toBeInTheDocument();
  });
});
