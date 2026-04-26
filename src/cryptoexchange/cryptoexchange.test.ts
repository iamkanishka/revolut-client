import { describe, it, expect, vi, type Mock } from "vitest";
import { CryptoExchangeClient } from "./index.js";
import { ValidationError } from "../errors/index.js";

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
  return new CryptoExchangeClient({
    apiKey: "cx_test_key",
    fetch: fetchImpl as typeof globalThis.fetch,
    retry: { maxAttempts: 1 },
  });
}

function callUrl(mock: FetchMock, n = 0): string {
  return (mock.mock.calls as unknown[][])[n]?.[0] as string;
}

describe("CryptoExchangeClient — balances", () => {
  it("getBalances fetches balances path", async () => {
    const fetch = mockFetch(200, [
      { currency: "BTC", available: "0.5", staked: "0", reserved: "0" },
    ]);
    const balances = await makeClient(fetch).getBalances();
    expect(balances[0]?.currency).toBe("BTC");
    expect(callUrl(fetch)).toContain("balances");
  });
});

describe("CryptoExchangeClient — orders", () => {
  it("createOrder validates symbol", async () => {
    await expect(
      makeClient(mockFetch(200, {})).createOrder({
        symbol: "",
        side: "buy",
        type: "market",
        market: { base_size: "0.1" },
      })
    ).rejects.toThrow(ValidationError);
  });

  it("createOrder validates exactly one config", async () => {
    await expect(
      makeClient(mockFetch(200, {})).createOrder({
        symbol: "BTC/USD",
        side: "buy",
        type: "limit",
        limit: { base_size: "0.1", price: "50000" },
        market: { base_size: "0.1" },
      })
    ).rejects.toThrow(ValidationError);
  });

  it("createOrder succeeds with limit config", async () => {
    const fetch = mockFetch(200, {
      id: "ord_cx_1",
      symbol: "BTC/USD",
      side: "buy",
      type: "limit",
      state: "open",
      qty: "0.1",
      price: "50000",
      created_at: "",
      updated_at: "",
    });
    const order = await makeClient(fetch).createOrder({
      symbol: "BTC/USD",
      side: "buy",
      type: "limit",
      limit: { base_size: "0.1", price: "50000" },
    });
    expect(order.id).toBe("ord_cx_1");
    expect(order.type).toBe("limit");
  });

  it("createOrder succeeds with market config", async () => {
    const fetch = mockFetch(200, {
      id: "ord_cx_2",
      symbol: "ETH/USD",
      side: "sell",
      type: "market",
      state: "filled",
      qty: "1.0",
      created_at: "",
      updated_at: "",
    });
    const order = await makeClient(fetch).createOrder({
      symbol: "ETH/USD",
      side: "sell",
      type: "market",
      market: { base_size: "1.0" },
    });
    expect(order.state).toBe("filled");
  });

  it("cancelOrder sends DELETE with orderId in path", async () => {
    const fetch = mockFetch(200, null);
    await makeClient(fetch).cancelOrder("ord_cx_123");
    expect(callUrl(fetch)).toContain("ord_cx_123");
    const init = (fetch.mock.calls as unknown[][])[0]?.[1] as RequestInit;
    expect(init?.method).toBe("DELETE");
  });

  it("cancelOrder throws for empty orderId", async () => {
    await expect(makeClient(mockFetch(200, {})).cancelOrder("")).rejects.toThrow(ValidationError);
  });

  it("getActiveOrders returns list", async () => {
    const fetch = mockFetch(200, [
      {
        id: "ord_1",
        symbol: "BTC/USD",
        side: "buy",
        type: "limit",
        state: "open",
        qty: "0.01",
        created_at: "",
        updated_at: "",
      },
    ]);
    const orders = await makeClient(fetch).getActiveOrders();
    expect(orders).toHaveLength(1);
    expect(callUrl(fetch)).toContain("active");
  });

  it("getOrderHistory accepts filters", async () => {
    const fetch = mockFetch(200, []);
    await makeClient(fetch).getOrderHistory({ symbol: "BTC/USD", state: "filled" });
    expect(callUrl(fetch)).toContain("BTC");
  });

  it("cancelAllOrders without symbol cancels all", async () => {
    const fetch = mockFetch(200, null);
    await makeClient(fetch).cancelAllOrders();
    const init = (fetch.mock.calls as unknown[][])[0]?.[1] as RequestInit;
    expect(init?.method).toBe("DELETE");
  });

  it("cancelAllOrders with symbol appends query param", async () => {
    const fetch = mockFetch(200, null);
    await makeClient(fetch).cancelAllOrders("ETH/USD");
    expect(callUrl(fetch)).toContain("ETH");
  });
});

describe("CryptoExchangeClient — trades", () => {
  it("getPublicTrades validates symbol", async () => {
    await expect(makeClient(mockFetch(200, [])).getPublicTrades("", 10)).rejects.toThrow(
      ValidationError
    );
  });

  it("getPublicTrades fetches with symbol", async () => {
    const fetch = mockFetch(200, [
      { id: "t1", symbol: "BTC/USD", side: "buy", price: "50000", size: "0.1", created_at: "" },
    ]);
    const trades = await makeClient(fetch).getPublicTrades("BTC/USD", 10);
    expect(trades[0]?.symbol).toBe("BTC/USD");
    expect(callUrl(fetch)).toContain("BTC");
  });

  it("getMyTrades fetches private fills", async () => {
    const fetch = mockFetch(200, []);
    await makeClient(fetch).getMyTrades("ETH/USD", 20);
    expect(callUrl(fetch)).toContain("mine");
  });
});

describe("CryptoExchangeClient — market data", () => {
  it("getOrderBook validates symbol", async () => {
    await expect(makeClient(mockFetch(200, {})).getOrderBook("")).rejects.toThrow(ValidationError);
  });

  it("getOrderBook returns bids and asks", async () => {
    const fetch = mockFetch(200, {
      symbol: "BTC/USD",
      bids: [{ price: "49990", size: "1.0" }],
      asks: [{ price: "50010", size: "0.5" }],
    });
    const book = await makeClient(fetch).getOrderBook("BTC/USD", 5);
    expect(book.bids[0]?.price).toBe("49990");
    expect(book.asks[0]?.price).toBe("50010");
  });

  it("getTicker validates symbol", async () => {
    await expect(makeClient(mockFetch(200, {})).getTicker("")).rejects.toThrow(ValidationError);
  });

  it("getTicker returns price data", async () => {
    const fetch = mockFetch(200, {
      symbol: "BTC/USD",
      price: "50000",
      change_24h: "+2.5",
      volume_24h: "1234.5",
      high_24h: "51000",
      low_24h: "49000",
      updated_at: "",
    });
    const ticker = await makeClient(fetch).getTicker("BTC/USD");
    expect(ticker.price).toBe("50000");
    expect(ticker.symbol).toBe("BTC/USD");
  });

  it("getAllTickers returns array", async () => {
    const fetch = mockFetch(200, [
      {
        symbol: "BTC/USD",
        price: "50000",
        change_24h: "0",
        volume_24h: "100",
        high_24h: "51000",
        low_24h: "49000",
        updated_at: "",
      },
      {
        symbol: "ETH/USD",
        price: "3000",
        change_24h: "1",
        volume_24h: "500",
        high_24h: "3100",
        low_24h: "2900",
        updated_at: "",
      },
    ]);
    const tickers = await makeClient(fetch).getAllTickers();
    expect(tickers).toHaveLength(2);
  });

  it("listSymbols returns trading pairs", async () => {
    const fetch = mockFetch(200, [
      {
        name: "BTC/USD",
        base_currency: "BTC",
        quote_currency: "USD",
        min_base_size: "0.001",
        min_quote_size: "1",
        tick_size: "0.01",
        step_size: "0.0001",
      },
    ]);
    const symbols = await makeClient(fetch).listSymbols();
    expect(symbols[0]?.name).toBe("BTC/USD");
    expect(callUrl(fetch)).toContain("symbols");
  });
});
