import { describe, it, expect, vi, type Mock } from "vitest";
import { CryptoRampClient } from "./index.js";
import { ValidationError, WebhookError } from "../errors/index.js";
import type { UUID } from "../types/index.js";

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
  return new CryptoRampClient({
    apiKey: "cr_test_key",
    fetch: fetchImpl as typeof globalThis.fetch,
    retry: { maxAttempts: 1 },
  });
}

function callUrl(mock: FetchMock, n = 0): string {
  return (mock.mock.calls as unknown[][])[n]?.[0] as string;
}

describe("CryptoRampClient — config", () => {
  it("getConfig fetches config endpoint", async () => {
    const fetch = mockFetch(200, {
      fiat_currencies: ["GBP", "EUR", "USD"],
      crypto_tokens: ["BTC", "ETH"],
      payment_methods: ["revolut", "card"],
      supported_regions: ["GB", "DE"],
    });
    const config = await makeClient(fetch).getConfig();
    expect(config.fiat_currencies).toContain("GBP");
    expect(config.crypto_tokens).toContain("BTC");
    expect(callUrl(fetch)).toContain("config");
  });
});

describe("CryptoRampClient — quotes", () => {
  it("getQuote validates fiat", async () => {
    await expect(
      makeClient(mockFetch(200, {})).getQuote({ fiat: "", crypto: "ETH", amount: "100" })
    ).rejects.toThrow(ValidationError);
  });

  it("getQuote validates crypto", async () => {
    await expect(
      makeClient(mockFetch(200, {})).getQuote({ fiat: "GBP", crypto: "", amount: "100" })
    ).rejects.toThrow(ValidationError);
  });

  it("getQuote validates amount", async () => {
    await expect(
      makeClient(mockFetch(200, {})).getQuote({ fiat: "GBP", crypto: "ETH", amount: "" })
    ).rejects.toThrow(ValidationError);
  });

  it("getQuote returns quote data", async () => {
    const fetch = mockFetch(200, {
      fiat_amount: "100",
      crypto_amount: "0.035",
      fiat: "GBP",
      crypto: "ETH",
      rate: "2857.14",
      fee: "2.50",
      expires_at: "2025-01-01T00:01:00Z",
    });
    const quote = await makeClient(fetch).getQuote({
      fiat: "GBP",
      crypto: "ETH",
      amount: "100",
    });
    expect(quote.fiat).toBe("GBP");
    expect(quote.crypto).toBe("ETH");
    expect(quote.fiat_amount).toBe("100");
  });
});

describe("CryptoRampClient — buy redirect", () => {
  it("getBuyRedirectURL validates fiat", async () => {
    await expect(
      makeClient(mockFetch(200, {})).getBuyRedirectURL({
        fiat: "",
        crypto: "BTC",
        walletAddress: "0xabc",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("getBuyRedirectURL validates walletAddress", async () => {
    await expect(
      makeClient(mockFetch(200, {})).getBuyRedirectURL({
        fiat: "GBP",
        crypto: "BTC",
        walletAddress: "",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("getBuyRedirectURL returns checkout URL", async () => {
    const fetch = mockFetch(200, {
      url: "https://revolut.com/crypto-ramp/buy?fiat=GBP&crypto=BTC",
    });
    const result = await makeClient(fetch).getBuyRedirectURL({
      fiat: "GBP",
      crypto: "BTC",
      walletAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
      amount: "100",
    });
    expect(result.url).toContain("revolut.com");
  });
});

describe("CryptoRampClient — orders", () => {
  it("getOrder requires orderId", async () => {
    await expect(makeClient(mockFetch(200, {})).getOrder("", "0xabc")).rejects.toThrow(
      ValidationError
    );
  });

  it("getOrder requires walletAddress", async () => {
    await expect(makeClient(mockFetch(200, {})).getOrder("ord_1", "")).rejects.toThrow(
      ValidationError
    );
  });

  it("getOrder returns order data", async () => {
    const fetch = mockFetch(200, {
      id: "ramp_ord_1",
      state: "completed",
      fiat_amount: "100",
      fiat_currency: "GBP",
      crypto_amount: "0.035",
      crypto_currency: "ETH",
      wallet_address: "0xabc",
      created_at: "",
      updated_at: "",
    });
    const order = await makeClient(fetch).getOrder("ramp_ord_1", "0xabc");
    expect(order.id).toBe("ramp_ord_1");
    expect(order.state).toBe("completed");
    expect(callUrl(fetch)).toContain("ramp_ord_1");
  });

  it("listOrders returns array", async () => {
    const fetch = mockFetch(200, [
      {
        id: "r1",
        state: "completed",
        fiat_amount: "50",
        fiat_currency: "GBP",
        crypto_amount: "0.01",
        crypto_currency: "BTC",
        wallet_address: "0xabc",
        created_at: "",
        updated_at: "",
      },
    ]);
    const orders = await makeClient(fetch).listOrders({ start: "2025-01-01", end: "2025-01-31" });
    expect(orders).toHaveLength(1);
    expect(callUrl(fetch)).toContain("orders");
  });
});

describe("CryptoRampClient — webhooks", () => {
  it("createWebhook validates url", async () => {
    await expect(
      makeClient(mockFetch(200, {})).createWebhook({ url: "", events: ["ORDER_COMPLETED"] })
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

  it("createWebhook registers webhook", async () => {
    const fetch = mockFetch(200, {
      id: "wh_cr_1",
      url: "https://example.com/ramp-events",
      events: ["ORDER_COMPLETED"],
      active: true,
      created_at: "",
      updated_at: "",
    });
    const wh = await makeClient(fetch).createWebhook({
      url: "https://example.com/ramp-events",
      events: ["ORDER_COMPLETED"],
    });
    expect(wh.id).toBe("wh_cr_1");
    expect(wh.active).toBe(true);
  });

  it("deleteWebhook validates webhookId", async () => {
    await expect(makeClient(mockFetch(200, {})).deleteWebhook("" as UUID)).rejects.toThrow(
      ValidationError
    );
  });

  it("listWebhooks returns array", async () => {
    const fetch = mockFetch(200, [
      {
        id: "wh_1",
        url: "https://ex.com",
        events: ["ORDER_COMPLETED"],
        active: true,
        created_at: "",
        updated_at: "",
      },
    ]);
    const hooks = await makeClient(fetch).listWebhooks();
    expect(hooks).toHaveLength(1);
  });
});

describe("CryptoRampClient — webhook signature", () => {
  it("verifyWebhookSignature throws without secret configured", () => {
    const client = makeClient(mockFetch(200, {}));
    expect(() => client.verifyWebhookSignature(Buffer.from("payload"), "sig_abc")).toThrow(
      WebhookError
    );
  });

  it("parseWebhookPayload throws on invalid JSON", () => {
    const client = makeClient(mockFetch(200, {}));
    expect(() => client.parseWebhookPayload("not-json", undefined)).toThrow(WebhookError);
  });

  it("parseWebhookPayload parses valid payload without secret", () => {
    const client = makeClient(mockFetch(200, {}));
    const body = JSON.stringify({
      event: "ORDER_COMPLETED",
      order_id: "ramp_123",
      timestamp: "2025-01-01T00:00:00Z",
    });
    const payload = client.parseWebhookPayload(body, undefined);
    expect(payload.event).toBe("ORDER_COMPLETED");
    expect(payload.order_id).toBe("ramp_123");
  });

  it("withWebhookSecret returns same client instance", () => {
    const client = makeClient(mockFetch(200, {}));
    const result = client.withWebhookSecret("wsk_test_secret_ramp");
    expect(result).toBe(client);
  });
});
