import { describe, it, expect, vi, type Mock } from "vitest";
import { MerchantClient } from "./index.js";
import { APIError, ValidationError } from "../errors/index.js";
import type { Amount, Currency, UUID } from "../types/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FetchMock = Mock<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>;

function mockFetch(status: number, body: unknown): FetchMock {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })
  ) as FetchMock;
}

function makeClient(fetchImpl: FetchMock) {
  return new MerchantClient({
    apiKey: "sk_test_merchant",
    fetch: fetchImpl as typeof globalThis.fetch,
    retry: { maxAttempts: 1 },
  });
}

function callUrl(mock: FetchMock, n = 0): string {
  return (mock.mock.calls as unknown[][])[n]?.[0] as string;
}
function callInit(mock: FetchMock, n = 0): RequestInit {
  return (mock.mock.calls as unknown[][])[n]?.[1] as RequestInit;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

describe("MerchantClient — orders", () => {
  it("createOrder returns order with token", async () => {
    const fetch = mockFetch(200, {
      id: "ord_123",
      token: "tok_abc",
      state: "pending",
      amount: 1000,
      currency: "GBP",
      outstanding_amount: 1000,
      capture_mode: "automatic",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      checkout_url: "https://checkout.revolut.com/payment/tok_abc",
    });
    const order = await makeClient(fetch).createOrder({
      amount: 1000 as Amount,
      currency: "GBP" as Currency,
      description: "Widget",
    });
    expect(order.id).toBe("ord_123");
    expect(order.token).toBe("tok_abc");
    expect(order.state).toBe("pending");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("createOrder throws for missing amount", async () => {
    await expect(
      makeClient(mockFetch(200, {})).createOrder({
        amount: 0 as Amount,
        currency: "GBP" as Currency,
      })
    ).rejects.toThrow();
  });

  it("createOrder throws for missing currency", async () => {
    await expect(
      makeClient(mockFetch(200, {})).createOrder({
        amount: 1000 as Amount,
        currency: "" as Currency,
      })
    ).rejects.toThrow();
  });

  it("getOrder returns order", async () => {
    const fetch = mockFetch(200, {
      id: "ord_123",
      state: "completed",
      amount: 1000,
      currency: "GBP",
      outstanding_amount: 0,
      capture_mode: "automatic",
      created_at: "",
      updated_at: "",
    });
    const order = await makeClient(fetch).getOrder("ord_123" as UUID);
    expect(order.id).toBe("ord_123");
    expect(order.state).toBe("completed");
  });

  it("getOrder throws ValidationError for empty ID", async () => {
    await expect(makeClient(mockFetch(200, {})).getOrder("" as UUID)).rejects.toThrow(
      ValidationError
    );
  });

  it("listOrders returns paginated response", async () => {
    const fetch = mockFetch(200, { items: [{ id: "ord_1" }, { id: "ord_2" }], has_more: false });
    const result = await makeClient(fetch).listOrders();
    expect(result.items).toHaveLength(2);
    expect(result.has_more).toBe(false);
  });

  it("cancelOrder sends POST to cancel path", async () => {
    const fetch = mockFetch(200, {
      id: "ord_1",
      state: "cancelled",
      amount: 500,
      currency: "GBP",
      outstanding_amount: 500,
      capture_mode: "manual",
      created_at: "",
      updated_at: "",
    });
    await makeClient(fetch).cancelOrder("ord_1" as UUID);
    expect(callUrl(fetch)).toContain("ord_1/cancel");
  });

  it("refundOrder sends POST to refund path", async () => {
    const fetch = mockFetch(200, {
      id: "ord_1",
      state: "completed",
      amount: 1000,
      currency: "GBP",
      outstanding_amount: 0,
      capture_mode: "automatic",
      created_at: "",
      updated_at: "",
    });
    await makeClient(fetch).refundOrder("ord_1" as UUID, {
      amount: 500 as Amount,
      currency: "GBP" as Currency,
    });
    expect(callUrl(fetch)).toContain("ord_1/refund");
  });

  it("captureOrder sends correct path", async () => {
    const fetch = mockFetch(200, {
      id: "ord_1",
      state: "processing",
      amount: 1000,
      currency: "GBP",
      outstanding_amount: 0,
      capture_mode: "manual",
      created_at: "",
      updated_at: "",
    });
    await makeClient(fetch).captureOrder("ord_1" as UUID);
    expect(callUrl(fetch)).toContain("ord_1/capture");
  });

  it("updateOrder uses PATCH method", async () => {
    const fetch = mockFetch(200, {
      id: "ord_1",
      state: "pending",
      amount: 1000,
      currency: "GBP",
      outstanding_amount: 1000,
      capture_mode: "automatic",
      created_at: "",
      updated_at: "",
    });
    await makeClient(fetch).updateOrder("ord_1" as UUID, {
      description: "Updated desc",
    });
    expect(callInit(fetch).method).toBe("PATCH");
  });

  it("incrementalAuthorise sends to authorise path", async () => {
    const fetch = mockFetch(200, {
      id: "ord_1",
      state: "authorised",
      amount: 15000,
      currency: "GBP",
      outstanding_amount: 15000,
      capture_mode: "manual",
      created_at: "",
      updated_at: "",
    });
    await makeClient(fetch).incrementalAuthorise("ord_1" as UUID, {
      amount: 15000 as Amount,
      currency: "GBP" as Currency,
    });
    expect(callUrl(fetch)).toContain("ord_1/authorise");
  });

  it("incrementalAuthorise throws for zero amount", async () => {
    await expect(
      makeClient(mockFetch(200, {})).incrementalAuthorise("ord_1" as UUID, {
        amount: 0 as Amount,
        currency: "GBP" as Currency,
      })
    ).rejects.toThrow();
  });

  it("getPaymentDetails fetches correct path", async () => {
    const fetch = mockFetch(200, {
      id: "pay_1",
      order_id: "ord_1",
      state: "completed",
      amount: 1000,
      currency: "GBP",
      created_at: "",
      updated_at: "",
    });
    await makeClient(fetch).getPaymentDetails("pay_1" as UUID);
    expect(callUrl(fetch)).toContain("/api/payments/pay_1/details");
  });

  it("handles APIError from server", async () => {
    const fetch = mockFetch(404, { message: "Order not found" });
    const client = makeClient(fetch);
    await expect(client.getOrder("ord_missing" as UUID)).rejects.toThrow(APIError);
    try {
      await client.getOrder("ord_missing" as UUID);
    } catch (e) {
      expect((e as APIError).isNotFound).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

describe("MerchantClient — customers", () => {
  it("createCustomer requires email or phone", async () => {
    await expect(makeClient(mockFetch(200, {})).createCustomer({})).rejects.toThrow();
  });

  it("createCustomer with email succeeds", async () => {
    const fetch = mockFetch(200, {
      id: "cust_1",
      email: "test@example.com",
      created_at: "",
      updated_at: "",
    });
    const cust = await makeClient(fetch).createCustomer({ email: "test@example.com" });
    expect(cust.id).toBe("cust_1");
  });

  it("deleteCustomer sends DELETE", async () => {
    const fetch = mockFetch(200, null);
    await makeClient(fetch).deleteCustomer("cust_1" as UUID);
    expect(callInit(fetch).method).toBe("DELETE");
  });

  it("listSavedPaymentMethods fetches correct path", async () => {
    const fetch = mockFetch(200, []);
    await makeClient(fetch).listSavedPaymentMethods("cust_1" as UUID);
    expect(callUrl(fetch)).toContain("cust_1/payment-methods");
  });
});

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

describe("MerchantClient — subscriptions", () => {
  it("createPlan validates name", async () => {
    await expect(
      makeClient(mockFetch(200, {})).createPlan({ name: "", variations: [] })
    ).rejects.toThrow(ValidationError);
  });

  it("createPlan validates variations", async () => {
    await expect(
      makeClient(mockFetch(200, {})).createPlan({ name: "Test", variations: [] })
    ).rejects.toThrow(ValidationError);
  });

  it("createPlan succeeds with valid input", async () => {
    const fetch = mockFetch(200, {
      id: "plan_1",
      name: "Pro",
      state: "active",
      variations: [
        {
          id: "var_1",
          name: "Monthly",
          phases: [{ ordinal: 1, cycle_duration: "P1M", amount: 999, currency: "GBP" }],
        },
      ],
      created_at: "",
      updated_at: "",
    });
    const plan = await makeClient(fetch).createPlan({
      name: "Pro",
      variations: [
        {
          name: "Monthly",
          phases: [
            {
              ordinal: 1,
              cycle_duration: "P1M",
              amount: 999 as Amount,
              currency: "GBP" as Currency,
            },
          ],
        },
      ],
    });
    expect(plan.id).toBe("plan_1");
    expect(plan.variations[0]?.name).toBe("Monthly");
  });

  it("createSubscription validates plan_variation_id", async () => {
    await expect(
      makeClient(mockFetch(200, {})).createSubscription({
        plan_variation_id: "" as UUID,
        customer_id: "cust_1" as UUID,
      })
    ).rejects.toThrow(ValidationError);
  });

  it("listBillingCycles fetches correct path", async () => {
    const fetch = mockFetch(200, []);
    await makeClient(fetch).listBillingCycles("sub_1" as UUID);
    expect(callUrl(fetch)).toContain("sub_1/cycles");
  });

  it("getBillingCycle fetches correct path", async () => {
    const fetch = mockFetch(200, {
      id: "cycle_1",
      subscription_id: "sub_1",
      plan_variation_id: "var_1",
      plan_phase_id: "ph_1",
      cycle_number: 1,
      state: "completed",
      amount: 999,
      currency: "GBP",
      start_date: "",
      created_at: "",
      updated_at: "",
    });
    await makeClient(fetch).getBillingCycle("sub_1" as UUID, "cycle_1" as UUID);
    expect(callUrl(fetch)).toContain("sub_1/cycles/cycle_1");
  });
});

// ---------------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------------

describe("MerchantClient — disputes", () => {
  it("challengeDispute validates evidence_ids", async () => {
    await expect(
      makeClient(mockFetch(200, {})).challengeDispute("dis_1" as UUID, {
        evidence_ids: [],
      })
    ).rejects.toThrow();
  });

  it("uploadDisputeEvidence sends to evidence path", async () => {
    const fetch = mockFetch(200, {
      id: "ev_1",
      file_name: "invoice.pdf",
      content_type: "application/pdf",
      uploaded_at: "",
    });
    await makeClient(fetch).uploadDisputeEvidence("dis_1" as UUID, {
      file_name: "invoice.pdf",
      content_type: "application/pdf",
    });
    expect(callUrl(fetch)).toContain("dis_1/evidence");
  });
});

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

describe("MerchantClient — webhooks", () => {
  it("createWebhook validates url", async () => {
    await expect(
      makeClient(mockFetch(200, {})).createWebhook({
        url: "",
        events: ["ORDER_COMPLETED"],
      })
    ).rejects.toThrow(ValidationError);
  });

  it("createWebhook validates events", async () => {
    await expect(
      makeClient(mockFetch(200, {})).createWebhook({
        url: "https://example.com",
        events: [],
      })
    ).rejects.toThrow(ValidationError);
  });

  it("rotateWebhookSecret sends to rotate-secret path", async () => {
    const fetch = mockFetch(200, { signing_secret: "new_secret" });
    await makeClient(fetch).rotateWebhookSecret("wh_1" as UUID);
    expect(callUrl(fetch)).toContain("wh_1/rotate-secret");
  });
});

// ---------------------------------------------------------------------------
// Synchronous Webhooks (Fast Checkout)
// ---------------------------------------------------------------------------

describe("MerchantClient — synchronous webhooks", () => {
  it("registerAddressValidation sends correct payload", async () => {
    const fetch = mockFetch(200, {
      id: "sw_1",
      event_type: "fast_checkout.validate_address",
      url: "https://example.com/validate",
      signing_key: "swsk_abc",
    });
    const sw = await makeClient(fetch).registerAddressValidation({
      url: "https://example.com/validate",
    });
    expect(sw.signing_key).toBe("swsk_abc");
    expect(callInit(fetch).body).toContain("fast_checkout.validate_address");
  });

  it("registerAddressValidation requires url", async () => {
    await expect(
      makeClient(mockFetch(200, {})).registerAddressValidation({ url: "" })
    ).rejects.toThrow(ValidationError);
  });
});

// ---------------------------------------------------------------------------
// Report Runs
// ---------------------------------------------------------------------------

describe("MerchantClient — report runs", () => {
  it("createReportRun validates required fields", async () => {
    await expect(
      makeClient(mockFetch(200, {})).createReportRun({
        type: "" as "transactions",
        date_from: "",
        date_to: "",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("getReportRun fetches by ID", async () => {
    const fetch = mockFetch(200, {
      id: "rr_1",
      type: "transactions",
      state: "ready",
      date_from: "",
      date_to: "",
      created_at: "",
      updated_at: "",
    });
    const rr = await makeClient(fetch).getReportRun("rr_1" as UUID);
    expect(rr.id).toBe("rr_1");
    expect(rr.state).toBe("ready");
  });
});
