import { describe, it, expect } from "vitest";
import { Currency, Amount, UUID, ISODuration, hasNextPage } from "./index.js";
import type { PageResponse, OrderState, PaymentState } from "./index.js";

describe("Branded primitive constructors", () => {
  it("Currency wraps string", () => {
    const c = Currency("GBP");
    expect(c).toBe("GBP");
    expect(typeof c).toBe("string");
  });

  it("Amount wraps number", () => {
    const a = Amount(1000);
    expect(a).toBe(1000);
    expect(typeof a).toBe("number");
  });

  it("UUID wraps string", () => {
    const id = UUID("ord_abc-123");
    expect(id).toBe("ord_abc-123");
  });

  it("ISODuration wraps string", () => {
    const d = ISODuration("P14D");
    expect(d).toBe("P14D");
  });
});

describe("hasNextPage", () => {
  it("returns true when has_more and next_cursor are set", () => {
    const page: PageResponse<string> = {
      items: ["a", "b"],
      has_more: true,
      next_cursor: "cursor_abc",
    };
    expect(hasNextPage(page)).toBe(true);
  });

  it("returns false when has_more is false", () => {
    const page: PageResponse<string> = { items: ["a"], has_more: false };
    expect(hasNextPage(page)).toBe(false);
  });

  it("returns false when next_cursor is missing", () => {
    const page: PageResponse<string> = { items: ["a"], has_more: true };
    expect(hasNextPage(page)).toBe(false);
  });

  it("returns false for empty page", () => {
    const page: PageResponse<never> = { items: [], has_more: false };
    expect(hasNextPage(page)).toBe(false);
  });
});

describe("OrderState type coverage", () => {
  it("accepts valid order states", () => {
    const states: OrderState[] = [
      "pending",
      "authorised",
      "processing",
      "completed",
      "cancelled",
      "failed",
    ];
    expect(states).toHaveLength(6);
  });
});

describe("PaymentState type coverage", () => {
  it("all payment states are valid strings", () => {
    const states: PaymentState[] = [
      "pending",
      "authentication_challenge",
      "authentication_verified",
      "authorisation_started",
      "authorisation_passed",
      "authorised",
      "capture_started",
      "captured",
      "refund_validated",
      "refund_started",
      "cancellation_started",
      "completing",
      "completed",
      "declined",
      "soft_declined",
      "cancelled",
      "failed",
    ];
    expect(states.every((s) => typeof s === "string")).toBe(true);
  });
});
