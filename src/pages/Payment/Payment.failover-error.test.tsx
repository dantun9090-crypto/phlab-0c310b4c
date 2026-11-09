/**
 * User-facing error state when the payment-link endpoint fails (both the
 * primary AND backup gateways behind /api/payments/create are down).
 *
 * Asserts that:
 *   1. The customer sees the manual bank-transfer fallback message
 *      ("Online payment is temporarily unavailable…").
 *   2. NO redirect to an external payment host is performed
 *      (window.location.assign is never called).
 *   3. The endpoint is invoked exactly once per attempt with the order id
 *      from the URL.
 *
 * Architecture note: the page posts to /api/payments/create directly (the
 * server route owns gateway failover) and redirects via
 * window.location.assign. happy-dom's Location uses private fields, which
 * break through a Proxy — so window.location is replaced with a plain
 * object instead.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";

// Firebase: simulate a signed-in user owning a ready-to-pay order.
vi.mock("@/lib/firebase", () => {
  const user = {
    uid: "uid-buyer-1",
    email: "buyer@example.com",
    getIdToken: async () => "id-token-xyz",
  };
  return {
    db: {},
    auth: { currentUser: user },
    doc: () => ({}),
    getDoc: async () => ({
      exists: () => true,
      data: () => ({
        userId: "uid-buyer-1",
        status: "pending",
        totalAmount: 49.99,
        currency: "GBP",
        orderNumber: "PH-12345",
        customerName: "Research Buyer",
        customerEmail: "buyer@example.com",
      }),
    }),
    onAuthStateChanged: (_auth: unknown, cb: (u: typeof user) => void) => {
      cb(user);
      return () => undefined;
    },
  };
});

// --- Test -----------------------------------------------------------------

import PaymentPage from "./index";

describe("<PaymentPage /> — payment endpoint fails (all gateways down)", () => {
  const realLocation = window.location;
  let assignSpy: ReturnType<typeof vi.fn>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    assignSpy = vi.fn();
    fetchSpy = vi.fn().mockRejectedValue(new Error("gateway down"));

    // Plain-object location: happy-dom Location getters use private fields
    // and throw when read through a Proxy.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        href: "https://phlabs.co.uk/payment?orderId=ord_ABC123",
        search: "?orderId=ord_ABC123",
        origin: "https://phlabs.co.uk",
        pathname: "/payment",
        assign: assignSpy,
        replace: vi.fn(),
        reload: vi.fn(),
      },
    });

    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: realLocation,
    });
    vi.unstubAllGlobals();
  });

  it("shows the bank-transfer fallback and does NOT redirect when the endpoint fails", async () => {
    render(
      <HelmetProvider>
        <PaymentPage />
      </HelmetProvider>,
    );

    // Wait for the order to load and the Pay button to appear.
    const payBtn = await screen.findByRole("button", {
      name: /Pay with Bank Transfer/i,
    });
    expect(payBtn).toBeEnabled();

    fireEvent.click(payBtn);

    // Endpoint invoked once with the order id + id token.
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("/api/payments/create");
    expect(JSON.parse(init.body)).toMatchObject({
      orderId: "ord_ABC123",
      idToken: "id-token-xyz",
    });

    // --- Accessibility: error region is announced via role=alert + aria-live ---
    const alertRegion = await screen.findByTestId("bank-fallback");
    expect(alertRegion).toHaveAttribute("role", "alert");
    expect(alertRegion).toHaveAttribute("aria-live", "assertive");

    // --- Exact user-facing error text ---
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent(/^Complete via Bank Transfer$/);
    expect(heading).toHaveStyle({ color: "#10b981" });

    expect(
      screen.getByText(
        "Online payment is temporarily unavailable. Please send your payment directly to our bank account below.",
      ),
    ).toBeInTheDocument();

    // Order reference & amount surfaced inside the fallback.
    expect(screen.getByText("PH-12345")).toBeInTheDocument();
    expect(screen.getByText("£49.99")).toBeInTheDocument();

    // --- No redirect occurred ---
    expect(assignSpy).not.toHaveBeenCalled();
    // No anchor pointing at a payment HPP host exists in the document.
    const externalAnchors = Array.from(
      document.querySelectorAll<HTMLAnchorElement>("a[href]"),
    ).filter((a) => /fena|truelayer|wallid/i.test(a.getAttribute("href") || ""));
    expect(externalAnchors).toEqual([]);

    // The original Pay button is no longer rendered (fallback took over).
    expect(screen.queryByRole("button", { name: /Pay with Bank Transfer/i })).toBeNull();

    // A "Try again" recovery button is offered.
    expect(screen.getByRole("button", { name: /Try Online Payment Again/i })).toBeInTheDocument();
  });

  it("lets the user retry after a failure and shows the fallback again on a second failure", async () => {
    render(
      <HelmetProvider>
        <PaymentPage />
      </HelmetProvider>,
    );

    // First attempt — fails.
    const payBtn = await screen.findByRole("button", {
      name: /Pay with Bank Transfer/i,
    });
    fireEvent.click(payBtn);

    const retryBtn = await screen.findByRole("button", {
      name: /Try Online Payment Again/i,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(assignSpy).not.toHaveBeenCalled();

    // Clicking "Try Online Payment Again" dismisses the fallback and
    // restores the primary Pay button without redirecting.
    fireEvent.click(retryBtn);
    expect(screen.queryByTestId("bank-fallback")).toBeNull();
    const payBtn2 = await screen.findByRole("button", {
      name: /Pay with Bank Transfer/i,
    });
    expect(payBtn2).toBeEnabled();
    expect(assignSpy).not.toHaveBeenCalled();

    // Second attempt — also fails (endpoint still down).
    fireEvent.click(payBtn2);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));

    // Fallback re-appears with role=alert and no redirect occurred.
    const alertRegion2 = await screen.findByTestId("bank-fallback");
    expect(alertRegion2).toHaveAttribute("role", "alert");
    expect(assignSpy).not.toHaveBeenCalled();
  });
});
