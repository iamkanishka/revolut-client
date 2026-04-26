import { describe, it, expect, vi, type Mock } from "vitest";
import type { ClientConfig, RetryPolicy } from "./index.js";
import {
  HttpClient,
  buildPath,
  assertRequired,
  DEFAULT_RETRY_POLICY,
  withApiKey,
  withTimeout,
  withRetry,
  withNoRetry,
  withSandbox,
} from "./index.js";
import { APIError, ValidationError, NetworkError } from "../errors/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FetchMock = Mock<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>;

function makeMockFetch(responses: Array<{ status: number; body?: unknown }>): FetchMock {
  let call = 0;
  return vi.fn(async () => {
    const resp = responses[call] ?? responses[responses.length - 1]!;
    call++;
    const body = resp.body !== undefined ? JSON.stringify(resp.body) : "";
    return new Response(body, {
      status: resp.status ?? 200,
      headers: { "Content-Type": "application/json", "x-request-id": `req_${call}` },
    });
  }) as FetchMock;
}

function makeClient(fetchImpl: FetchMock, overrides?: Partial<ClientConfig>): HttpClient {
  return new HttpClient("https://merchant.revolut.com", {
    apiKey: "sk_test_abc123",
    fetch: fetchImpl as typeof globalThis.fetch,
    retry: { maxAttempts: 1 },
    ...overrides,
  });
}

// Safe accessors for mock call data
function getCallUrl(mock: FetchMock, n = 0): string {
  return (mock.mock.calls as unknown[][])[n]?.[0] as string;
}
function getCallInit(mock: FetchMock, n = 0): RequestInit {
  return (mock.mock.calls as unknown[][])[n]?.[1] as RequestInit;
}

// ---------------------------------------------------------------------------
// buildPath
// ---------------------------------------------------------------------------

describe("buildPath", () => {
  it("joins segments with leading slash", () => {
    expect(buildPath("api", "orders")).toBe("/api/orders");
  });
  it("strips extra slashes", () => {
    expect(buildPath("/api/", "/orders/")).toBe("/api/orders");
  });
  it("handles single segment", () => {
    expect(buildPath("health")).toBe("/health");
  });
});

// ---------------------------------------------------------------------------
// assertRequired
// ---------------------------------------------------------------------------

describe("assertRequired", () => {
  it("does not throw for truthy values", () => {
    expect(() => assertRequired("val", "field")).not.toThrow();
    expect(() => assertRequired(0, "field")).not.toThrow();
  });
  it("throws ValidationError for undefined", () => {
    expect(() => assertRequired(undefined, "orderId")).toThrow(ValidationError);
  });
  it("throws ValidationError for null", () => {
    expect(() => assertRequired(null, "customerId")).toThrow(ValidationError);
  });
  it("throws ValidationError for empty string", () => {
    expect(() => assertRequired("", "field")).toThrow(ValidationError);
  });
  it("includes field name in error message", () => {
    try {
      assertRequired(undefined, "orderId");
    } catch (e) {
      expect((e as ValidationError).field).toBe("orderId");
    }
  });
});

// ---------------------------------------------------------------------------
// HttpClient — successful requests
// ---------------------------------------------------------------------------

describe("HttpClient — successful requests", () => {
  it("GET returns parsed JSON", async () => {
    const fetch = makeMockFetch([{ status: 200, body: { id: "ord_123" } }]);
    const result = await makeClient(fetch).get<{ id: string }>("/api/orders/ord_123");
    expect(result.id).toBe("ord_123");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("POST sends JSON body", async () => {
    const fetch = makeMockFetch([{ status: 200, body: { id: "ord_456" } }]);
    await makeClient(fetch).post("/api/orders", { amount: 1000, currency: "GBP" });
    const init = getCallInit(fetch);
    expect(init.body).toContain("1000");
  });

  it("sets Authorization header", async () => {
    const fetch = makeMockFetch([{ status: 200, body: {} }]);
    await makeClient(fetch).get("/ping");
    const init = getCallInit(fetch);
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer sk_test_abc123");
  });

  it("sets Accept: application/json header", async () => {
    const fetch = makeMockFetch([{ status: 200, body: {} }]);
    await makeClient(fetch).get("/ping");
    const init = getCallInit(fetch);
    expect((init.headers as Record<string, string>)["Accept"]).toBe("application/json");
  });

  it("appends query params to URL", async () => {
    const fetch = makeMockFetch([{ status: 200, body: [] }]);
    await makeClient(fetch).get("/api/orders", { limit: 10, state: "completed" });
    expect(getCallUrl(fetch)).toContain("limit=10");
    expect(getCallUrl(fetch)).toContain("state=completed");
  });

  it("skips undefined query params", async () => {
    const fetch = makeMockFetch([{ status: 200, body: [] }]);
    await makeClient(fetch).get("/api/orders", { limit: undefined, state: "pending" });
    expect(getCallUrl(fetch)).not.toContain("limit");
    expect(getCallUrl(fetch)).toContain("state=pending");
  });

  it("PATCH sends partial update", async () => {
    const fetch = makeMockFetch([{ status: 200, body: { id: "ord_1" } }]);
    await makeClient(fetch).patch("/api/orders/ord_1", { description: "updated" });
    const init = getCallInit(fetch);
    expect(init.method).toBe("PATCH");
    expect(init.body).toContain("updated");
  });

  it("DELETE sends correct method", async () => {
    const fetch = makeMockFetch([{ status: 200, body: null }]);
    await makeClient(fetch).delete("/api/customers/c1");
    const init = getCallInit(fetch);
    expect(init.method).toBe("DELETE");
  });

  it("handles empty response body gracefully", async () => {
    const fetch = makeMockFetch([{ status: 200, body: null }]);
    await expect(makeClient(fetch).delete("/api/webhooks/w1")).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// HttpClient — error mapping
// ---------------------------------------------------------------------------

describe("HttpClient — error mapping", () => {
  it("throws APIError on 401", async () => {
    const fetch = makeMockFetch([{ status: 401, body: { message: "Unauthorized" } }]);
    await expect(makeClient(fetch).get("/api/orders")).rejects.toThrow(APIError);
    await expect(makeClient(fetch).get("/api/orders")).rejects.toMatchObject({
      statusCode: 401,
      code: "UNAUTHORIZED",
    });
  });

  it("throws APIError on 404", async () => {
    const fetch = makeMockFetch([{ status: 404, body: { message: "Not found" } }]);
    try {
      await makeClient(fetch).get("/api/orders/missing");
    } catch (e) {
      expect(e).toBeInstanceOf(APIError);
      expect((e as APIError).isNotFound).toBe(true);
    }
  });

  it("throws APIError on 422 with details", async () => {
    const fetch = makeMockFetch([
      { status: 422, body: { message: "Invalid", errors: ["bad field"] } },
    ]);
    try {
      await makeClient(fetch).post("/api/orders", {});
    } catch (e) {
      expect(e).toBeInstanceOf(APIError);
      expect((e as APIError).statusCode).toBe(422);
    }
  });

  it("throws NetworkError on fetch failure", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as FetchMock;
    await expect(makeClient(fetch).get("/ping")).rejects.toThrow(NetworkError);
  });
});

// ---------------------------------------------------------------------------
// HttpClient — retry logic
// ---------------------------------------------------------------------------

describe("HttpClient — retry", () => {
  it("retries on 500 and succeeds on second attempt", async () => {
    const fetch = makeMockFetch([
      { status: 500, body: { message: "Internal error" } },
      { status: 200, body: { id: "ord_1" } },
    ]);
    const client = new HttpClient("https://merchant.revolut.com", {
      apiKey: "sk_test",
      fetch: fetch as typeof globalThis.fetch,
      retry: { maxAttempts: 2, initialDelayMs: 0, maxDelayMs: 0, multiplier: 1, jitter: 0 },
    });
    const result = await client.get<{ id: string }>("/api/orders/ord_1");
    expect(result.id).toBe("ord_1");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries on 429 (rate limited)", async () => {
    const fetch = makeMockFetch([
      { status: 429, body: { message: "Too many requests" } },
      { status: 200, body: { ok: true } },
    ]);
    const client = new HttpClient("https://merchant.revolut.com", {
      apiKey: "sk_test",
      fetch: fetch as typeof globalThis.fetch,
      retry: { maxAttempts: 2, initialDelayMs: 0, maxDelayMs: 0, multiplier: 1, jitter: 0 },
    });
    await client.get("/api/orders");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on 400 (non-retryable)", async () => {
    const fetch = makeMockFetch([{ status: 400, body: { message: "Bad request" } }]);
    const client = new HttpClient("https://merchant.revolut.com", {
      apiKey: "sk_test",
      fetch: fetch as typeof globalThis.fetch,
      retry: { maxAttempts: 3, initialDelayMs: 0, maxDelayMs: 0, multiplier: 1, jitter: 0 },
    });
    await expect(client.post("/api/orders", {})).rejects.toThrow(APIError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("exhausts maxAttempts and throws last error", async () => {
    const fetch = makeMockFetch([
      { status: 500, body: { message: "err" } },
      { status: 500, body: { message: "err" } },
      { status: 500, body: { message: "err" } },
    ]);
    const client = new HttpClient("https://merchant.revolut.com", {
      apiKey: "sk_test",
      fetch: fetch as typeof globalThis.fetch,
      retry: { maxAttempts: 3, initialDelayMs: 0, maxDelayMs: 0, multiplier: 1, jitter: 0 },
    });
    await expect(client.get("/api/orders")).rejects.toThrow(APIError);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// ClientConfig option helpers
// ---------------------------------------------------------------------------

describe("ClientConfig option helpers", () => {
  it("withApiKey sets apiKey", () => {
    const config: Partial<ClientConfig> = {};
    withApiKey("sk_test_123")(config);
    expect(config.apiKey).toBe("sk_test_123");
  });

  it("withSandbox sets environment to sandbox", () => {
    const config: Partial<ClientConfig> = {};
    withSandbox()(config);
    expect(config.environment).toBe("sandbox");
  });

  it("withTimeout sets timeoutMs", () => {
    const config: Partial<ClientConfig> = {};
    withTimeout(5000)(config);
    expect(config.timeoutMs).toBe(5000);
  });

  it("withNoRetry sets maxAttempts to 1", () => {
    const config: Partial<ClientConfig> = {};
    withNoRetry()(config);
    expect((config.retry as Partial<RetryPolicy>).maxAttempts).toBe(1);
  });

  it("withRetry merges retry policy", () => {
    const config: Partial<ClientConfig> = {};
    withRetry({ maxAttempts: 5 })(config);
    expect((config.retry as Partial<RetryPolicy>).maxAttempts).toBe(5);
  });

  it("DEFAULT_RETRY_POLICY has expected defaults", () => {
    expect(DEFAULT_RETRY_POLICY.maxAttempts).toBe(3);
    expect(DEFAULT_RETRY_POLICY.initialDelayMs).toBe(500);
    expect(DEFAULT_RETRY_POLICY.multiplier).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Telemetry hooks
// ---------------------------------------------------------------------------

describe("HttpClient — telemetry hooks", () => {
  it("calls onRequest and onResponse hooks", async () => {
    const onRequest = vi.fn();
    const onResponse = vi.fn();
    const fetch = makeMockFetch([{ status: 200, body: { ok: true } }]);
    const client = new HttpClient("https://merchant.revolut.com", {
      apiKey: "sk_test",
      fetch: fetch as typeof globalThis.fetch,
      retry: { maxAttempts: 1 },
      telemetry: { onRequest, onResponse },
    });
    await client.get("/api/orders");
    expect(onRequest).toHaveBeenCalledOnce();
    expect(onResponse).toHaveBeenCalledOnce();
    expect(onResponse.mock.calls[0]?.[0]).toMatchObject({ statusCode: 200 });
  });

  it("calls onError hook on failure", async () => {
    const onError = vi.fn();
    const fetch = makeMockFetch([{ status: 503, body: { message: "unavailable" } }]);
    const client = new HttpClient("https://merchant.revolut.com", {
      apiKey: "sk_test",
      fetch: fetch as typeof globalThis.fetch,
      retry: { maxAttempts: 1 },
      telemetry: { onError },
    });
    await expect(client.get("/api/orders")).rejects.toThrow();
    expect(onError).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Configuration validation
// ---------------------------------------------------------------------------

describe("HttpClient — configuration validation", () => {
  it("throws when apiKey is missing", () => {
    expect(() => new HttpClient("https://example.com", { apiKey: "" })).toThrow();
  });
});
