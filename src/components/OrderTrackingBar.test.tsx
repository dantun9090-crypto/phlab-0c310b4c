import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { OrderTrackingBar } from "./OrderTrackingBar";

/**
 * DOM tests that lock the visible step states for the customer
 * order-history tracking bar. These guard the Fena auto-paid happy path
 * (status="paid" → Placed checkmarked, Processing active) and the
 * dedicated cancelled/refunded fallback states.
 */
describe("<OrderTrackingBar />", () => {
  it("paid order: Placed is complete (checkmark), Processing is active, Shipped/Delivered are upcoming", () => {
    render(<OrderTrackingBar status="paid" />);

    const bar = screen.getByTestId("order-tracking-bar");
    expect(bar).toHaveAttribute("data-current-index", "1");

    const placed = screen.getByTestId("tracking-step-pending");
    const processing = screen.getByTestId("tracking-step-processing");
    const shipped = screen.getByTestId("tracking-step-shipped");
    const delivered = screen.getByTestId("tracking-step-delivered");

    expect(placed).toHaveAttribute("data-state", "complete");
    expect(processing).toHaveAttribute("data-state", "active");
    expect(shipped).toHaveAttribute("data-state", "upcoming");
    expect(delivered).toHaveAttribute("data-state", "upcoming");

    // Placed shows a checkmark; Processing shows its step number "2".
    expect(within(placed).getByTestId("step-check-pending")).toBeInTheDocument();
    expect(within(processing).queryByTestId("step-check-processing")).toBeNull();
    expect(within(processing).getByText("2")).toBeInTheDocument();
  });

  it("pending order: only Placed is active, everything else upcoming, no checkmarks", () => {
    render(<OrderTrackingBar status="pending" />);
    expect(screen.getByTestId("order-tracking-bar")).toHaveAttribute(
      "data-current-index",
      "0",
    );
    expect(screen.getByTestId("tracking-step-pending")).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.queryByTestId("step-check-pending")).toBeNull();
    for (const s of ["processing", "shipped", "delivered"]) {
      expect(screen.getByTestId(`tracking-step-${s}`)).toHaveAttribute(
        "data-state",
        "upcoming",
      );
    }
  });

  it("delivered order: every step is complete or active", () => {
    render(<OrderTrackingBar status="delivered" />);
    expect(screen.getByTestId("order-tracking-bar")).toHaveAttribute(
      "data-current-index",
      "3",
    );
    expect(screen.getByTestId("tracking-step-pending")).toHaveAttribute("data-state", "complete");
    expect(screen.getByTestId("tracking-step-processing")).toHaveAttribute("data-state", "complete");
    expect(screen.getByTestId("tracking-step-shipped")).toHaveAttribute("data-state", "complete");
    expect(screen.getByTestId("tracking-step-delivered")).toHaveAttribute("data-state", "active");
  });

  it("cancelled order: renders the dedicated cancelled message and no progress bar", () => {
    render(<OrderTrackingBar status="cancelled" />);
    expect(screen.getByTestId("order-tracking-cancelled")).toHaveTextContent(
      "Order Cancelled",
    );
    expect(screen.queryByTestId("order-tracking-bar")).toBeNull();
  });

  it("refunded order (option A): renders dedicated refunded message and no progress bar", () => {
    render(<OrderTrackingBar status="refunded" />);
    const refunded = screen.getByTestId("order-tracking-refunded");
    expect(refunded).toHaveTextContent("Order Refunded");
    expect(refunded.className).toContain("text-orange-400");
    // Critically — the timeline does NOT render at all.
    expect(screen.queryByTestId("order-tracking-bar")).toBeNull();
    expect(screen.queryByTestId("tracking-step-delivered")).toBeNull();
  });
});
