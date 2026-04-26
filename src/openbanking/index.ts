/**
 * @module openbanking
 * Revolut Open Banking API — AISP (accounts/balances/transactions) and
 * PISP (domestic/international/scheduled/standing-order/file payments).
 */

import {
  type ClientConfig,
  HttpClient,
  BASE_URLS,
  buildPath,
  assertRequired,
} from "../client/index.js";

export class OpenBankingClient {
  readonly #http: HttpClient;
  constructor(config: ClientConfig) {
    const env = config.environment ?? "prod";
    this.#http = new HttpClient(config.baseURL ?? BASE_URLS.openbanking[env], config);
  }

  // AISP
  async getAccounts(): Promise<OBAccount[]> {
    const r = await this.#http.get<{ Data: { Account: OBAccount[] } }>(
      "/open-banking/v3.1/aisp/accounts"
    );
    return r.Data.Account;
  }
  async getAccount(accountId: string): Promise<OBAccount> {
    assertRequired(accountId, "accountId");
    const r = await this.#http.get<{ Data: { Account: OBAccount[] } }>(
      buildPath("open-banking/v3.1/aisp/accounts", accountId)
    );
    const acct = r.Data.Account[0];
    if (!acct) throw new Error(`Account ${accountId} not found`);
    return acct;
  }
  async getAccountBalances(accountId: string): Promise<OBBalance[]> {
    assertRequired(accountId, "accountId");
    const r = await this.#http.get<{ Data: { Balance: OBBalance[] } }>(
      `/open-banking/v3.1/aisp/accounts/${accountId}/balances`
    );
    return r.Data.Balance;
  }
  async getAccountBeneficiaries(accountId: string): Promise<OBBeneficiary[]> {
    assertRequired(accountId, "accountId");
    const r = await this.#http.get<{ Data: { Beneficiary: OBBeneficiary[] } }>(
      `/open-banking/v3.1/aisp/accounts/${accountId}/beneficiaries`
    );
    return r.Data.Beneficiary;
  }
  async getAccountDirectDebits(accountId: string): Promise<OBDirectDebit[]> {
    assertRequired(accountId, "accountId");
    const r = await this.#http.get<{ Data: { DirectDebit: OBDirectDebit[] } }>(
      `/open-banking/v3.1/aisp/accounts/${accountId}/direct-debits`
    );
    return r.Data.DirectDebit;
  }
  async getAccountStandingOrders(accountId: string): Promise<OBStandingOrder[]> {
    assertRequired(accountId, "accountId");
    const r = await this.#http.get<{ Data: { StandingOrder: OBStandingOrder[] } }>(
      `/open-banking/v3.1/aisp/accounts/${accountId}/standing-orders`
    );
    return r.Data.StandingOrder;
  }
  async getAccountTransactions(
    accountId: string,
    from?: string,
    to?: string
  ): Promise<OBTransaction[]> {
    assertRequired(accountId, "accountId");
    const r = await this.#http.get<{ Data: { Transaction: OBTransaction[] } }>(
      `/open-banking/v3.1/aisp/accounts/${accountId}/transactions`,
      { fromBookingDateTime: from, toBookingDateTime: to }
    );
    return r.Data.Transaction;
  }

  // PISP — Domestic
  async createDomesticPaymentConsent(
    req: OBDomesticPaymentConsentRequest
  ): Promise<OBPaymentConsent> {
    const r = await this.#http.post<{ Data: OBPaymentConsent }>(
      "/open-banking/v3.1/pisp/domestic-payment-consents",
      req
    );
    return r.Data;
  }
  async getDomesticPaymentConsent(consentId: string): Promise<OBPaymentConsent> {
    assertRequired(consentId, "consentId");
    const r = await this.#http.get<{ Data: OBPaymentConsent }>(
      `/open-banking/v3.1/pisp/domestic-payment-consents/${consentId}`
    );
    return r.Data;
  }
  async initiateDomesticPayment(req: OBDomesticPaymentRequest): Promise<OBDomesticPaymentResponse> {
    return this.#http.post<OBDomesticPaymentResponse>(
      "/open-banking/v3.1/pisp/domestic-payments",
      req
    );
  }
  async getDomesticPayment(paymentId: string): Promise<OBDomesticPaymentResponse> {
    assertRequired(paymentId, "paymentId");
    return this.#http.get<OBDomesticPaymentResponse>(
      `/open-banking/v3.1/pisp/domestic-payments/${paymentId}`
    );
  }

  // PISP — Domestic Scheduled
  async createDomesticScheduledPaymentConsent(
    req: Record<string, unknown>
  ): Promise<OBPaymentConsent> {
    const r = await this.#http.post<{ Data: OBPaymentConsent }>(
      "/open-banking/v3.1/pisp/domestic-scheduled-payment-consents",
      req
    );
    return r.Data;
  }
  async initiateDomesticScheduledPayment(
    req: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.#http.post<Record<string, unknown>>(
      "/open-banking/v3.1/pisp/domestic-scheduled-payments",
      req
    );
  }
  async getDomesticScheduledPayment(paymentId: string): Promise<Record<string, unknown>> {
    assertRequired(paymentId, "paymentId");
    return this.#http.get<Record<string, unknown>>(
      `/open-banking/v3.1/pisp/domestic-scheduled-payments/${paymentId}`
    );
  }

  // PISP — Domestic Standing Orders
  async createDomesticStandingOrderConsent(
    req: Record<string, unknown>
  ): Promise<OBPaymentConsent> {
    const r = await this.#http.post<{ Data: OBPaymentConsent }>(
      "/open-banking/v3.1/pisp/domestic-standing-order-consents",
      req
    );
    return r.Data;
  }
  async createDomesticStandingOrder(
    req: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.#http.post<Record<string, unknown>>(
      "/open-banking/v3.1/pisp/domestic-standing-orders",
      req
    );
  }
  async getDomesticStandingOrder(standingOrderId: string): Promise<Record<string, unknown>> {
    assertRequired(standingOrderId, "standingOrderId");
    return this.#http.get<Record<string, unknown>>(
      `/open-banking/v3.1/pisp/domestic-standing-orders/${standingOrderId}`
    );
  }

  // PISP — International
  async createInternationalPaymentConsent(
    req: OBInternationalPaymentConsentRequest
  ): Promise<OBPaymentConsent> {
    const r = await this.#http.post<{ Data: OBPaymentConsent }>(
      "/open-banking/v3.1/pisp/international-payment-consents",
      req
    );
    return r.Data;
  }
  async getInternationalPaymentConsent(consentId: string): Promise<OBPaymentConsent> {
    assertRequired(consentId, "consentId");
    const r = await this.#http.get<{ Data: OBPaymentConsent }>(
      `/open-banking/v3.1/pisp/international-payment-consents/${consentId}`
    );
    return r.Data;
  }
  async initiateInternationalPayment(
    req: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.#http.post<Record<string, unknown>>(
      "/open-banking/v3.1/pisp/international-payments",
      req
    );
  }
  async getInternationalPayment(paymentId: string): Promise<Record<string, unknown>> {
    assertRequired(paymentId, "paymentId");
    return this.#http.get<Record<string, unknown>>(
      `/open-banking/v3.1/pisp/international-payments/${paymentId}`
    );
  }

  // PISP — International Scheduled
  async createInternationalScheduledPaymentConsent(
    req: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.#http.post<Record<string, unknown>>(
      "/open-banking/v3.1/pisp/international-scheduled-payment-consents",
      req
    );
  }
  async initiateInternationalScheduledPayment(
    req: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.#http.post<Record<string, unknown>>(
      "/open-banking/v3.1/pisp/international-scheduled-payments",
      req
    );
  }
  async getInternationalScheduledPayment(paymentId: string): Promise<Record<string, unknown>> {
    assertRequired(paymentId, "paymentId");
    return this.#http.get<Record<string, unknown>>(
      `/open-banking/v3.1/pisp/international-scheduled-payments/${paymentId}`
    );
  }

  // PISP — International Standing Orders
  async createInternationalStandingOrderConsent(
    req: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.#http.post<Record<string, unknown>>(
      "/open-banking/v3.1/pisp/international-standing-order-consents",
      req
    );
  }
  async createInternationalStandingOrder(
    req: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.#http.post<Record<string, unknown>>(
      "/open-banking/v3.1/pisp/international-standing-orders",
      req
    );
  }
  async getInternationalStandingOrder(id: string): Promise<Record<string, unknown>> {
    assertRequired(id, "standingOrderId");
    return this.#http.get<Record<string, unknown>>(
      `/open-banking/v3.1/pisp/international-standing-orders/${id}`
    );
  }

  // PISP — File Payments (bulk CSV, Beta)
  async createFilePaymentConsent(req: Record<string, unknown>): Promise<OBPaymentConsent> {
    const r = await this.#http.post<{ Data: OBPaymentConsent }>(
      "/open-banking/v3.1/pisp/file-payment-consents",
      req
    );
    return r.Data;
  }
  async getFilePaymentConsent(consentId: string): Promise<OBPaymentConsent> {
    assertRequired(consentId, "consentId");
    const r = await this.#http.get<{ Data: OBPaymentConsent }>(
      `/open-banking/v3.1/pisp/file-payment-consents/${consentId}`
    );
    return r.Data;
  }
  async createFilePayment(req: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.#http.post<Record<string, unknown>>("/open-banking/v3.1/pisp/file-payments", req);
  }
  async getFilePayment(paymentId: string): Promise<Record<string, unknown>> {
    assertRequired(paymentId, "paymentId");
    return this.#http.get<Record<string, unknown>>(
      `/open-banking/v3.1/pisp/file-payments/${paymentId}`
    );
  }
}

// ---------------------------------------------------------------------------
// OB value objects
// ---------------------------------------------------------------------------

export interface OBAmount {
  readonly Amount: string;
  readonly Currency: string;
}
export interface OBAccountIdentifier {
  readonly SchemeName: string;
  readonly Identification: string;
  readonly Name?: string;
  readonly SecondaryIdentification?: string;
}

export interface OBAccount {
  readonly AccountId: string;
  readonly Status?: string;
  readonly Currency: string;
  readonly AccountType: string;
  readonly AccountSubType: string;
  readonly Nickname?: string;
  readonly Account?: readonly OBAccountIdentifier[];
}

export interface OBBalance {
  readonly AccountId: string;
  readonly Amount: OBAmount;
  readonly CreditDebitIndicator: string;
  readonly Type: string;
  readonly DateTime: string;
}

export interface OBBeneficiary {
  readonly AccountId?: string;
  readonly BeneficiaryId?: string;
  readonly Reference?: string;
  readonly CreditorAccount?: OBAccountIdentifier;
}

export interface OBDirectDebit {
  readonly AccountId: string;
  readonly DirectDebitId?: string;
  readonly MandateIdentification?: string;
  readonly Name?: string;
  readonly DirectDebitStatusCode?: string;
  readonly PreviousPaymentDateTime?: string;
  readonly PreviousPaymentAmount?: OBAmount;
}

export interface OBStandingOrder {
  readonly AccountId: string;
  readonly StandingOrderId?: string;
  readonly Frequency: string;
  readonly Reference?: string;
  readonly FirstPaymentDateTime: string;
  readonly NextPaymentDateTime?: string;
  readonly StandingOrderStatusCode?: string;
  readonly FirstPaymentAmount?: OBAmount;
  readonly NextPaymentAmount?: OBAmount;
  readonly CreditorAccount?: OBAccountIdentifier;
}

export interface OBTransaction {
  readonly AccountId: string;
  readonly TransactionId?: string;
  readonly Amount: OBAmount;
  readonly CreditDebitIndicator: string;
  readonly Status: string;
  readonly BookingDateTime: string;
  readonly ValueDateTime?: string;
  readonly TransactionInformation?: string;
}

export interface OBPaymentConsent {
  readonly ConsentId: string;
  readonly Status: string;
  readonly CreationDateTime: string;
  readonly StatusUpdateDateTime: string;
}

export interface OBDomesticInitiation {
  readonly InstructionIdentification: string;
  readonly EndToEndIdentification: string;
  readonly InstructedAmount: OBAmount;
  readonly CreditorAccount: OBAccountIdentifier;
  readonly DebtorAccount?: OBAccountIdentifier;
  readonly RemittanceInformation?: { readonly Unstructured?: string; readonly Reference?: string };
}

export interface OBDomesticPaymentConsentRequest {
  readonly Data: { readonly Initiation: OBDomesticInitiation };
  readonly Risk: Record<string, unknown>;
}

export interface OBDomesticPaymentRequest {
  readonly Data: { readonly ConsentId: string; readonly Initiation: OBDomesticInitiation };
  readonly Risk: Record<string, unknown>;
}

export interface OBDomesticPaymentResponse {
  readonly Data: {
    readonly DomesticPaymentId: string;
    readonly ConsentId: string;
    readonly Status: string;
    readonly CreationDateTime: string;
    readonly Initiation: OBDomesticInitiation;
  };
}

export interface OBInternationalInitiation {
  readonly InstructionIdentification: string;
  readonly EndToEndIdentification: string;
  readonly CurrencyOfTransfer: string;
  readonly InstructedAmount: OBAmount;
  readonly CreditorAccount: OBAccountIdentifier;
  readonly CreditorAgent?: { readonly SchemeName?: string; readonly Identification?: string };
  readonly DebtorAccount?: OBAccountIdentifier;
}

export interface OBInternationalPaymentConsentRequest {
  readonly Data: { readonly Initiation: OBInternationalInitiation };
  readonly Risk: Record<string, unknown>;
}
