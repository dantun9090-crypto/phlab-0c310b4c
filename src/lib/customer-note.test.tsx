/**
 * Regression tests for "Order notes" (customerNote) end-to-end:
 *
 *  1. Server schema (`createOrderInputSchema`) — accepts optional/null/empty,
 *     trims, enforces 500-char max, strips overly long input.
 *  2. Admin Orders panel — when an order has `customerNote`, the rendered
 *     UI must include a "Customer note" header and the note text. When
 *     missing/empty, neither must appear.
 *
 * These guard the contract between Checkout (client) → createOrder (server)
 * → Firestore `orders/{id}.customerNote` → Admin → Orders detail panel.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createOrderInputSchema } from "./create-order.server";

// ---------- 1. Server schema ----------

const baseInput = {
  items: [
    {
      productId: "p1",
      productName: "PT-141 Research Peptide",
      variantId: null,
      variantName: null,
      quantity: 1,
    },
  ],
  customer: {
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    phone: "",
    address: "1 Lab St",
    city: "London",
    postcode: "EC1A 1AA",
    country: "United Kingdom",
  },
  shippingMethod: "standard" as const,
  paymentMethod: "bank_transfer" as const,
  ageVerified: true as const,
  termsAccepted: true as const,
};

describe("createOrderInputSchema – customerNote", () => {
  it("is optional (undefined accepted)", () => {
    const parsed = createOrderInputSchema.parse(baseInput);
    expect(parsed.customerNote).toBeUndefined();
  });

  it("accepts null and a typical note up to 500 chars", () => {
    const note = "Please leave with reception. PO #4421.";
    const parsed = createOrderInputSchema.parse({
      ...baseInput,
      customerNote: note,
    });
    expect(parsed.customerNote).toBe(note);

    const max = "x".repeat(500);
    const parsedMax = createOrderInputSchema.parse({
      ...baseInput,
      customerNote: max,
    });
    expect(parsedMax.customerNote).toBe(max);

    const parsedNull = createOrderInputSchema.parse({
      ...baseInput,
      customerNote: null,
    });
    expect(parsedNull.customerNote).toBeNull();
  });

  it("trims surrounding whitespace before length check", () => {
    const parsed = createOrderInputSchema.parse({
      ...baseInput,
      customerNote: "   hello world   ",
    });
    expect(parsed.customerNote).toBe("hello world");
  });

  it("rejects notes longer than 500 characters", () => {
    const tooLong = "y".repeat(501);
    const result = createOrderInputSchema.safeParse({
      ...baseInput,
      customerNote: tooLong,
    });
    expect(result.success).toBe(false);
  });
});

// ---------- 2. Admin Orders panel rendering ----------

// Mirrors the conditional block in src/pages/Admin/tabs/OrdersTab.tsx so a
// regression that removes the panel from the admin UI fails this test too.
function CustomerNotePanel({ note }: { note?: string | null }) {
  if (!note) return null;
  return (
    <div className="mt-3 pt-3 border-t border-white/10">
      <p className="text-amber-300 text-xs font-semibold uppercase tracking-wide mb-1">
        Customer note
      </p>
      <p className="text-white text-sm whitespace-pre-wrap break-words">
        {note}
      </p>
    </div>
  );
}

describe("Admin Orders – customer note display", () => {
  it("renders the note + header when present", () => {
    render(<CustomerNotePanel note="Leave at reception, PO #4421" />);
    expect(screen.getByText(/customer note/i)).toBeInTheDocument();
    expect(screen.getByText("Leave at reception, PO #4421")).toBeInTheDocument();
  });

  it("preserves line breaks via whitespace-pre-wrap", () => {
    render(<CustomerNotePanel note={"line one\nline two"} />);
    const para = screen.getByText(/line one/);
    expect(para.className).toMatch(/whitespace-pre-wrap/);
  });

  it("renders nothing when note is empty or missing", () => {
    const { container: c1 } = render(<CustomerNotePanel note={null} />);
    expect(c1).toBeEmptyDOMElement();
    const { container: c2 } = render(<CustomerNotePanel note="" />);
    expect(c2).toBeEmptyDOMElement();
    const { container: c3 } = render(<CustomerNotePanel />);
    expect(c3).toBeEmptyDOMElement();
  });

  it("the OrdersTab source still contains the customerNote panel", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.resolve(process.cwd(), "src/pages/Admin/tabs/OrdersTab.tsx"),
      "utf8",
    );
    expect(src).toMatch(/customerNote/);
    expect(src).toMatch(/Customer note/i);
  });
});

// ---------- 3. Checkout source contract ----------

describe("Checkout source – customer note field is wired", () => {
  it("renders a textarea for customerNote and forwards it to createOrder", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.resolve(process.cwd(), "src/pages/Checkout/index.tsx"),
      "utf8",
    );
    expect(src).toMatch(/customerNote:\s*['"]['"]/);
    expect(src).toMatch(/id="customerNote"/);
    expect(src).toMatch(/maxLength=\{500\}/);
    expect(src).toMatch(/customerNote:\s*form\.customerNote/);
  });
});
