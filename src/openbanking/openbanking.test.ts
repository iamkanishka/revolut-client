import { describe, it, expect, vi, type Mock } from "vitest";
import { OpenBankingClient } from "./index.js";
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
  return new OpenBankingClient({
    apiKey: "ob_test_token",
    fetch: fetchImpl as typeof globalThis.fetch,
    retry: { maxAttempts: 1 },
  });
}

function callUrl(mock: FetchMock, n = 0): string {
  return (mock.mock.calls as unknown[][])[n]?.[0] as string;
}

describe("OpenBankingClient — AISP accounts", () => {
  it("getAccounts returns accounts array", async () => {
    const fetch = mockFetch(200, {
      Data: {
        Account: [
          {
            AccountId: "acc_ob_1",
            Currency: "GBP",
            AccountType: "Personal",
            AccountSubType: "CurrentAccount",
          },
        ],
      },
    });
    const accounts = await makeClient(fetch).getAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.AccountId).toBe("acc_ob_1");
    expect(callUrl(fetch)).toContain("aisp/accounts");
  });

  it("getAccount validates accountId", async () => {
    await expect(makeClient(mockFetch(200, {})).getAccount("")).rejects.toThrow(ValidationError);
  });

  it("getAccount returns single account", async () => {
    const fetch = mockFetch(200, {
      Data: {
        Account: [
          {
            AccountId: "acc_ob_2",
            Currency: "EUR",
            AccountType: "Business",
            AccountSubType: "CurrentAccount",
          },
        ],
      },
    });
    const account = await makeClient(fetch).getAccount("acc_ob_2");
    expect(account.AccountId).toBe("acc_ob_2");
    expect(account.Currency).toBe("EUR");
  });

  it("getAccountBalances validates accountId", async () => {
    await expect(makeClient(mockFetch(200, {})).getAccountBalances("")).rejects.toThrow(
      ValidationError
    );
  });

  it("getAccountBalances returns balances", async () => {
    const fetch = mockFetch(200, {
      Data: {
        Balance: [
          {
            AccountId: "acc_1",
            Amount: { Amount: "1500.00", Currency: "GBP" },
            CreditDebitIndicator: "Credit",
            Type: "InterimAvailable",
            DateTime: "2025-01-01T00:00:00Z",
          },
        ],
      },
    });
    const balances = await makeClient(fetch).getAccountBalances("acc_1");
    expect(balances[0]?.Amount.Amount).toBe("1500.00");
    expect(callUrl(fetch)).toContain("balances");
  });

  it("getAccountBeneficiaries validates accountId", async () => {
    await expect(makeClient(mockFetch(200, {})).getAccountBeneficiaries("")).rejects.toThrow(
      ValidationError
    );
  });

  it("getAccountBeneficiaries returns beneficiaries", async () => {
    const fetch = mockFetch(200, {
      Data: {
        Beneficiary: [{ AccountId: "acc_1", BeneficiaryId: "ben_1" }],
      },
    });
    const bens = await makeClient(fetch).getAccountBeneficiaries("acc_1");
    expect(bens[0]?.BeneficiaryId).toBe("ben_1");
    expect(callUrl(fetch)).toContain("beneficiaries");
  });

  it("getAccountDirectDebits validates accountId", async () => {
    await expect(makeClient(mockFetch(200, {})).getAccountDirectDebits("")).rejects.toThrow(
      ValidationError
    );
  });

  it("getAccountDirectDebits returns direct debits", async () => {
    const fetch = mockFetch(200, {
      Data: {
        DirectDebit: [{ AccountId: "acc_1", DirectDebitId: "dd_1", Name: "Netflix" }],
      },
    });
    const dds = await makeClient(fetch).getAccountDirectDebits("acc_1");
    expect(dds[0]?.Name).toBe("Netflix");
    expect(callUrl(fetch)).toContain("direct-debits");
  });

  it("getAccountStandingOrders validates accountId", async () => {
    await expect(makeClient(mockFetch(200, {})).getAccountStandingOrders("")).rejects.toThrow(
      ValidationError
    );
  });

  it("getAccountStandingOrders returns standing orders", async () => {
    const fetch = mockFetch(200, {
      Data: {
        StandingOrder: [
          {
            AccountId: "acc_1",
            Frequency: "EvryDay",
            FirstPaymentDateTime: "2025-01-01T00:00:00Z",
            FirstPaymentAmount: { Amount: "100.00", Currency: "GBP" },
          },
        ],
      },
    });
    const orders = await makeClient(fetch).getAccountStandingOrders("acc_1");
    expect(orders[0]?.Frequency).toBe("EvryDay");
    expect(callUrl(fetch)).toContain("standing-orders");
  });

  it("getAccountTransactions validates accountId", async () => {
    await expect(makeClient(mockFetch(200, {})).getAccountTransactions("")).rejects.toThrow(
      ValidationError
    );
  });

  it("getAccountTransactions returns transactions", async () => {
    const fetch = mockFetch(200, {
      Data: {
        Transaction: [
          {
            AccountId: "acc_1",
            Amount: { Amount: "50.00", Currency: "GBP" },
            CreditDebitIndicator: "Debit",
            Status: "Booked",
            BookingDateTime: "2025-01-01T12:00:00Z",
          },
        ],
      },
    });
    const txs = await makeClient(fetch).getAccountTransactions("acc_1");
    expect(txs[0]?.Status).toBe("Booked");
    expect(callUrl(fetch)).toContain("transactions");
  });
});

describe("OpenBankingClient — PISP domestic payments", () => {
  it("createDomesticPaymentConsent posts to consent endpoint", async () => {
    const fetch = mockFetch(200, {
      Data: {
        ConsentId: "con_dom_1",
        Status: "AwaitingAuthorisation",
        CreationDateTime: "2025-01-01T00:00:00Z",
        StatusUpdateDateTime: "2025-01-01T00:00:00Z",
      },
    });
    const consent = await makeClient(fetch).createDomesticPaymentConsent({
      Data: {
        Initiation: {
          InstructionIdentification: "instr_001",
          EndToEndIdentification: "e2e_001",
          InstructedAmount: { Amount: "100.00", Currency: "GBP" },
          CreditorAccount: {
            SchemeName: "SortCodeAccountNumber",
            Identification: "20000255555555",
          },
        },
      },
      Risk: {},
    });
    expect(consent.ConsentId).toBe("con_dom_1");
    expect(consent.Status).toBe("AwaitingAuthorisation");
    expect(callUrl(fetch)).toContain("domestic-payment-consents");
  });

  it("getDomesticPaymentConsent validates consentId", async () => {
    await expect(makeClient(mockFetch(200, {})).getDomesticPaymentConsent("")).rejects.toThrow(
      ValidationError
    );
  });

  it("getDomesticPaymentConsent retrieves consent", async () => {
    const fetch = mockFetch(200, {
      Data: {
        ConsentId: "con_dom_2",
        Status: "Authorised",
        CreationDateTime: "2025-01-01T00:00:00Z",
        StatusUpdateDateTime: "2025-01-01T00:01:00Z",
      },
    });
    const consent = await makeClient(fetch).getDomesticPaymentConsent("con_dom_2");
    expect(consent.Status).toBe("Authorised");
  });

  it("initiateDomesticPayment posts and returns response", async () => {
    const fetch = mockFetch(200, {
      Data: {
        DomesticPaymentId: "dpay_1",
        ConsentId: "con_dom_1",
        Status: "AcceptedSettlementInProcess",
        CreationDateTime: "2025-01-01T00:00:00Z",
        StatusUpdateDateTime: "2025-01-01T00:00:00Z",
        Initiation: {
          InstructionIdentification: "instr_001",
          EndToEndIdentification: "e2e_001",
          InstructedAmount: { Amount: "100.00", Currency: "GBP" },
          CreditorAccount: {
            SchemeName: "SortCodeAccountNumber",
            Identification: "20000255555555",
          },
        },
      },
    });
    const payment = await makeClient(fetch).initiateDomesticPayment({
      Data: {
        ConsentId: "con_dom_1",
        Initiation: {
          InstructionIdentification: "instr_001",
          EndToEndIdentification: "e2e_001",
          InstructedAmount: { Amount: "100.00", Currency: "GBP" },
          CreditorAccount: {
            SchemeName: "SortCodeAccountNumber",
            Identification: "20000255555555",
          },
        },
      },
      Risk: {},
    });
    expect(payment.Data.DomesticPaymentId).toBe("dpay_1");
    expect(callUrl(fetch)).toContain("domestic-payments");
  });

  it("getDomesticPayment validates paymentId", async () => {
    await expect(makeClient(mockFetch(200, {})).getDomesticPayment("")).rejects.toThrow(
      ValidationError
    );
  });

  it("getDomesticPayment retrieves payment status", async () => {
    const fetch = mockFetch(200, {
      Data: {
        DomesticPaymentId: "dpay_2",
        ConsentId: "con_1",
        Status: "AcceptedCreditSettlementCompleted",
        CreationDateTime: "",
        StatusUpdateDateTime: "",
        Initiation: {
          InstructionIdentification: "i",
          EndToEndIdentification: "e",
          InstructedAmount: { Amount: "50", Currency: "GBP" },
          CreditorAccount: { SchemeName: "IBAN", Identification: "GB29NWBK..." },
        },
      },
    });
    const payment = await makeClient(fetch).getDomesticPayment("dpay_2");
    expect(payment.Data.Status).toBe("AcceptedCreditSettlementCompleted");
  });
});

describe("OpenBankingClient — PISP international payments", () => {
  it("createInternationalPaymentConsent posts to intl consent endpoint", async () => {
    const fetch = mockFetch(200, {
      Data: {
        ConsentId: "con_intl_1",
        Status: "AwaitingAuthorisation",
        CreationDateTime: "",
        StatusUpdateDateTime: "",
      },
    });
    const consent = await makeClient(fetch).createInternationalPaymentConsent({
      Data: {
        Initiation: {
          InstructionIdentification: "i",
          EndToEndIdentification: "e",
          CurrencyOfTransfer: "EUR",
          InstructedAmount: { Amount: "500.00", Currency: "GBP" },
          CreditorAccount: { SchemeName: "IBAN", Identification: "DE89370400440532013000" },
        },
      },
      Risk: {},
    });
    expect(consent.ConsentId).toBe("con_intl_1");
    expect(callUrl(fetch)).toContain("international-payment-consents");
  });

  it("getInternationalPaymentConsent validates consentId", async () => {
    await expect(makeClient(mockFetch(200, {})).getInternationalPaymentConsent("")).rejects.toThrow(
      ValidationError
    );
  });

  it("initiateInternationalPayment posts payload", async () => {
    const fetch = mockFetch(200, { Data: { InternationalPaymentId: "ipay_1" } });
    const result = await makeClient(fetch).initiateInternationalPayment({
      Data: { ConsentId: "con_intl_1" },
      Risk: {},
    });
    expect(
      (result as { Data: { InternationalPaymentId: string } }).Data.InternationalPaymentId
    ).toBe("ipay_1");
  });

  it("getInternationalPayment validates paymentId", async () => {
    await expect(makeClient(mockFetch(200, {})).getInternationalPayment("")).rejects.toThrow(
      ValidationError
    );
  });
});

describe("OpenBankingClient — PISP file payments", () => {
  it("createFilePaymentConsent posts to file-payment-consents endpoint", async () => {
    const fetch = mockFetch(200, {
      Data: {
        ConsentId: "con_file_1",
        Status: "AwaitingUpload",
        CreationDateTime: "",
        StatusUpdateDateTime: "",
      },
    });
    const consent = await makeClient(fetch).createFilePaymentConsent({
      Data: {
        Initiation: {
          FileType: "UK.OBIE.PaymentInitiation.4.0",
          FileHash: "m5ah/h1UjLvJMLsohTlZuIfge2MbaRDs9C7FcvOBHvc=",
        },
      },
      Risk: {},
    });
    expect(consent.ConsentId).toBe("con_file_1");
    expect(callUrl(fetch)).toContain("file-payment-consents");
  });

  it("getFilePaymentConsent validates consentId", async () => {
    await expect(makeClient(mockFetch(200, {})).getFilePaymentConsent("")).rejects.toThrow(
      ValidationError
    );
  });

  it("getFilePayment validates paymentId", async () => {
    await expect(makeClient(mockFetch(200, {})).getFilePayment("")).rejects.toThrow(
      ValidationError
    );
  });
});

describe("OpenBankingClient — scheduled and standing orders", () => {
  it("createDomesticScheduledPaymentConsent posts consent", async () => {
    const fetch = mockFetch(200, {
      Data: {
        ConsentId: "con_sched_1",
        Status: "AwaitingAuthorisation",
        CreationDateTime: "",
        StatusUpdateDateTime: "",
      },
    });
    const consent = await makeClient(fetch).createDomesticScheduledPaymentConsent({
      Data: { Initiation: { RequestedExecutionDateTime: "2025-02-01T00:00:00Z" } },
      Risk: {},
    });
    expect(consent.ConsentId).toBe("con_sched_1");
    expect(callUrl(fetch)).toContain("domestic-scheduled-payment-consents");
  });

  it("createDomesticStandingOrderConsent posts consent", async () => {
    const fetch = mockFetch(200, {
      Data: {
        ConsentId: "con_so_1",
        Status: "AwaitingAuthorisation",
        CreationDateTime: "",
        StatusUpdateDateTime: "",
      },
    });
    const consent = await makeClient(fetch).createDomesticStandingOrderConsent({
      Data: { Initiation: { Frequency: "EvryDay" } },
      Risk: {},
    });
    expect(consent.ConsentId).toBe("con_so_1");
    expect(callUrl(fetch)).toContain("domestic-standing-order-consents");
  });

  it("getDomesticStandingOrder validates id", async () => {
    await expect(makeClient(mockFetch(200, {})).getDomesticStandingOrder("")).rejects.toThrow(
      ValidationError
    );
  });

  it("getDomesticScheduledPayment validates id", async () => {
    await expect(makeClient(mockFetch(200, {})).getDomesticScheduledPayment("")).rejects.toThrow(
      ValidationError
    );
  });
});
