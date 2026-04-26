import { describe, it, expect, vi } from "vitest";
import { BusinessClient } from "./index.js";
import { ValidationError } from "../errors/index.js";
import type { UUID, Currency } from "../types/index.js";

function mockFetch(status: number, body: unknown) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })
  );
}

function makeClient(fetchImpl: typeof globalThis.fetch) {
  return new BusinessClient({
    apiKey: "biz_token_test",
    fetch: fetchImpl,
    retry: { maxAttempts: 1 },
  });
}

// Helper: safely get the URL from mock call N
function callUrl(mock: ReturnType<typeof vi.fn>, n = 0): string {
  return (mock.mock.calls as unknown[][])[n]?.[0] as string;
}

describe("BusinessClient — accounts", () => {
  it("listAccounts returns array", async () => {
    const fetch = mockFetch(200, [
      {
        id: "acc_1",
        name: "Main GBP",
        balance: 1000,
        currency: "GBP",
        state: "active",
        public: false,
        created_at: "",
        updated_at: "",
      },
    ]);
    const accounts = await makeClient(fetch).listAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.currency).toBe("GBP");
  });

  it("getAccountBankDetails fetches bank-details path", async () => {
    const fetch = mockFetch(200, [{ iban: "GB29NWBK60161331926819" }]);
    await makeClient(fetch).getAccountBankDetails("acc_1" as UUID);
    expect(callUrl(fetch)).toContain("bank-details");
  });
});

describe("BusinessClient — counterparties", () => {
  it("addCounterparty validates profile_type", async () => {
    await expect(
      makeClient(mockFetch(200, {})).addCounterparty({
        profile_type: "" as "personal",
        name: "Test",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("addCounterparty validates name", async () => {
    await expect(
      makeClient(mockFetch(200, {})).addCounterparty({
        profile_type: "personal",
        name: "",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("validatePayeeName requires name", async () => {
    await expect(makeClient(mockFetch(200, {})).validatePayeeName({ name: "" })).rejects.toThrow(
      ValidationError
    );
  });
});

describe("BusinessClient — FX", () => {
  it("getExchangeRate returns rate", async () => {
    const fetch = mockFetch(200, { from: "USD", to: "GBP", rate: 0.79 });
    const rate = await makeClient(fetch).getExchangeRate("USD" as Currency, "GBP" as Currency);
    expect(rate.rate).toBe(0.79);
  });

  it("exchange validates request_id", async () => {
    await expect(
      makeClient(mockFetch(200, {})).exchange({
        request_id: "",
        from: { currency: "USD" as Currency },
        to: { currency: "GBP" as Currency },
      })
    ).rejects.toThrow(ValidationError);
  });
});

describe("BusinessClient — transfers", () => {
  it("createTransfer validates source_account_id", async () => {
    await expect(
      makeClient(mockFetch(200, {})).createTransfer({
        request_id: "req_1",
        source_account_id: "" as UUID,
        target_account_id: "acc_2" as UUID,
        amount: 100,
        currency: "GBP" as Currency,
      })
    ).rejects.toThrow(ValidationError);
  });

  it("createPayment validates counterparty", async () => {
    await expect(
      makeClient(mockFetch(200, {})).createPayment({
        request_id: "req_1",
        account_id: "acc_1" as UUID,
        counterparty: "" as UUID,
        amount: 100,
        currency: "GBP" as Currency,
      })
    ).rejects.toThrow(ValidationError);
  });
});

describe("BusinessClient — webhooks v2", () => {
  it("createWebhookV2 uses /webhooks/2.0 path", async () => {
    const fetch = mockFetch(200, {
      id: "wh_1",
      url: "https://example.com",
      events: ["TransactionCreated"],
      created_at: "",
      updated_at: "",
    });
    await makeClient(fetch).createWebhookV2({
      url: "https://example.com",
      events: ["TransactionCreated"],
    });
    expect(callUrl(fetch)).toContain("/webhooks/2.0");
  });

  it("rotateWebhookSigningSecretV2 sends to rotate-signing-secret path", async () => {
    const fetch = mockFetch(200, { id: "wh_1", signing_secret: "new_sec" });
    await makeClient(fetch).rotateWebhookSigningSecretV2("wh_1" as UUID, {
      expiration_period: "P1D",
    });
    expect(callUrl(fetch)).toContain("rotate-signing-secret");
  });

  it("getFailedWebhookEvents fetches failed-events path", async () => {
    const fetch = mockFetch(200, []);
    await makeClient(fetch).getFailedWebhookEvents("wh_1" as UUID);
    expect(callUrl(fetch)).toContain("failed-events");
  });
});

describe("BusinessClient — payout links", () => {
  it("createPayoutLink validates counterparty_name", async () => {
    await expect(
      makeClient(mockFetch(200, {})).createPayoutLink({
        counterparty_name: "",
        amount: 100,
        currency: "GBP" as Currency,
      })
    ).rejects.toThrow(ValidationError);
  });

  it("cancelPayoutLink sends to cancel path", async () => {
    const fetch = mockFetch(200, undefined);
    await makeClient(fetch).cancelPayoutLink("link_1" as UUID);
    expect(callUrl(fetch)).toContain("link_1/cancel");
  });
});
