/**
 * @module business
 * Complete Revolut Business API client.
 *
 * Resources: Accounts + bank details, Cards (freeze/unfreeze/terminate),
 * Counterparties (CoP validation), Expenses, FX (rate+exchange),
 * Payment Drafts, Payout Links, Team Members, Transactions,
 * Transfers + payments + card transfers, Webhooks v1 + v2 (rotate + failed events).
 */

import {
  type ClientConfig,
  HttpClient,
  BASE_URLS,
  buildPath,
  assertRequired,
} from "../client/index.js";
import { ValidationError } from "../errors/index.js";
import type {
  TransactionState,
  PayoutLinkState,
  CardState,
  TeamMemberRole,
  BusinessWebhookEvent,
  Currency,
  UUID,
} from "../types/index.js";

export class BusinessClient {
  readonly #http: HttpClient;

  constructor(config: ClientConfig) {
    const env = config.environment ?? "prod";
    const baseURL = config.baseURL ?? BASE_URLS.business[env];
    this.#http = new HttpClient(baseURL, { ...config, baseURL });
  }

  // ==========================================================================
  // ACCOUNTS
  // ==========================================================================

  async listAccounts(): Promise<Account[]> {
    return this.#http.get<Account[]>("/accounts");
  }

  async getAccount(accountId: UUID): Promise<Account> {
    assertRequired(accountId, "accountId");
    return this.#http.get<Account>(buildPath("accounts", accountId));
  }

  async getAccountBankDetails(accountId: UUID): Promise<BankDetails[]> {
    assertRequired(accountId, "accountId");
    return this.#http.get<BankDetails[]>(`/accounts/${accountId}/bank-details`);
  }

  // ==========================================================================
  // CARDS
  // ==========================================================================

  async listCards(): Promise<Card[]> {
    return this.#http.get<Card[]>("/cards");
  }

  async getCard(cardId: UUID): Promise<Card> {
    assertRequired(cardId, "cardId");
    return this.#http.get<Card>(buildPath("cards", cardId));
  }

  async freezeCard(cardId: UUID): Promise<Card> {
    assertRequired(cardId, "cardId");
    return this.#http.post<Card>(`/cards/${cardId}/freeze`);
  }

  async unfreezeCard(cardId: UUID): Promise<Card> {
    assertRequired(cardId, "cardId");
    return this.#http.post<Card>(`/cards/${cardId}/unfreeze`);
  }

  async terminateCard(cardId: UUID): Promise<void> {
    assertRequired(cardId, "cardId");
    return this.#http.post<void>(`/cards/${cardId}/terminate`);
  }

  // ==========================================================================
  // COUNTERPARTIES
  // ==========================================================================

  async addCounterparty(req: AddCounterpartyRequest): Promise<Counterparty> {
    if (!req.profile_type)
      throw new ValidationError("profile_type", "is required (personal or business)");
    if (!req.name) throw new ValidationError("name", "is required");
    return this.#http.post<Counterparty>("/counterparties", req);
  }

  async getCounterparty(counterpartyId: UUID): Promise<Counterparty> {
    assertRequired(counterpartyId, "counterpartyId");
    return this.#http.get<Counterparty>(buildPath("counterparties", counterpartyId));
  }

  async deleteCounterparty(counterpartyId: UUID): Promise<void> {
    assertRequired(counterpartyId, "counterpartyId");
    return this.#http.delete<void>(buildPath("counterparties", counterpartyId));
  }

  async listCounterparties(req?: ListCounterpartiesRequest): Promise<Counterparty[]> {
    return this.#http.get<Counterparty[]>("/counterparties", {
      name: req?.name,
      account_no: req?.accountNo,
      sort_code: req?.sortCode,
      created_before: req?.createdBefore,
      limit: req?.limit,
    });
  }

  async validatePayeeName(req: ConfirmationOfPayeeRequest): Promise<ConfirmationOfPayeeResult> {
    if (!req.name) throw new ValidationError("name", "is required");
    return this.#http.post<ConfirmationOfPayeeResult>("/counterparties/validate", req);
  }

  // ==========================================================================
  // EXPENSES
  // ==========================================================================

  async listExpenses(req?: ListExpensesRequest): Promise<Expense[]> {
    return this.#http.get<Expense[]>("/expenses", {
      from: req?.dateFrom,
      to: req?.dateTo,
      category: req?.category,
      count: req?.limit,
    });
  }

  async getExpense(expenseId: UUID): Promise<Expense> {
    assertRequired(expenseId, "expenseId");
    return this.#http.get<Expense>(buildPath("expenses", expenseId));
  }

  async updateExpense(expenseId: UUID, req: UpdateExpenseRequest): Promise<Expense> {
    assertRequired(expenseId, "expenseId");
    return this.#http.patch<Expense>(buildPath("expenses", expenseId), req);
  }

  // ==========================================================================
  // FOREIGN EXCHANGE
  // ==========================================================================

  async getExchangeRate(from: Currency, to: Currency): Promise<ExchangeRate> {
    assertRequired(from, "from");
    assertRequired(to, "to");
    return this.#http.get<ExchangeRate>("/rate", { from, to });
  }

  async exchange(req: ExchangeRequest): Promise<Transaction> {
    if (!req.request_id) throw new ValidationError("request_id", "idempotency key is required");
    if (!req.from.currency) throw new ValidationError("from.currency", "is required");
    if (!req.to.currency) throw new ValidationError("to.currency", "is required");
    return this.#http.post<Transaction>("/exchange", req);
  }

  // ==========================================================================
  // TRANSACTIONS
  // ==========================================================================

  async listTransactions(req?: ListTransactionsRequest): Promise<Transaction[]> {
    return this.#http.get<Transaction[]>("/transactions", {
      from: req?.dateFrom,
      to: req?.dateTo,
      account: req?.accountId,
      counterparty: req?.counterpartyId,
      type: req?.type,
      count: req?.limit,
      last_retrieved_id: req?.cursor,
    });
  }

  async getTransaction(txId: UUID): Promise<Transaction> {
    assertRequired(txId, "txId");
    return this.#http.get<Transaction>(buildPath("transactions", txId));
  }

  async getTransactionByRequestId(requestId: string): Promise<Transaction> {
    assertRequired(requestId, "requestId");
    return this.#http.get<Transaction>("/transactions", { request_id: requestId });
  }

  async cancelScheduledTransaction(txId: UUID): Promise<void> {
    assertRequired(txId, "txId");
    return this.#http.delete<void>(buildPath("transactions", txId));
  }

  // ==========================================================================
  // TRANSFERS & PAYMENTS
  // ==========================================================================

  async createTransfer(req: TransferRequest): Promise<Transaction> {
    if (!req.request_id) throw new ValidationError("request_id", "is required");
    if (!req.source_account_id) throw new ValidationError("source_account_id", "is required");
    if (!req.target_account_id) throw new ValidationError("target_account_id", "is required");
    if (!req.amount || req.amount <= 0) throw new ValidationError("amount", "must be positive");
    return this.#http.post<Transaction>("/transfer", req);
  }

  async createPayment(req: PaymentRequest): Promise<Transaction> {
    if (!req.request_id) throw new ValidationError("request_id", "is required");
    if (!req.account_id) throw new ValidationError("account_id", "is required");
    if (!req.counterparty) throw new ValidationError("counterparty", "is required");
    if (!req.amount || req.amount <= 0) throw new ValidationError("amount", "must be positive");
    return this.#http.post<Transaction>("/pay", req);
  }

  async createCardTransfer(req: CardTransferRequest): Promise<Transaction> {
    if (!req.request_id) throw new ValidationError("request_id", "is required");
    if (!req.counterparty_id) throw new ValidationError("counterparty_id", "is required");
    if (!req.amount || req.amount <= 0) throw new ValidationError("amount", "must be positive");
    return this.#http.post<Transaction>("/card-transfer", req);
  }

  // ==========================================================================
  // PAYMENT DRAFTS
  // ==========================================================================

  async createPaymentDraft(req: CreatePaymentDraftRequest): Promise<PaymentDraft> {
    if (!req.title) throw new ValidationError("title", "is required");
    if (!req.payments?.length)
      throw new ValidationError("payments", "at least one payment entry is required");
    return this.#http.post<PaymentDraft>("/payment-drafts", req);
  }

  async getPaymentDraft(draftId: UUID): Promise<PaymentDraft> {
    assertRequired(draftId, "draftId");
    return this.#http.get<PaymentDraft>(buildPath("payment-drafts", draftId));
  }

  async deletePaymentDraft(draftId: UUID): Promise<void> {
    assertRequired(draftId, "draftId");
    return this.#http.delete<void>(buildPath("payment-drafts", draftId));
  }

  async listPaymentDrafts(state?: string): Promise<PaymentDraft[]> {
    return this.#http.get<PaymentDraft[]>("/payment-drafts", { state });
  }

  // ==========================================================================
  // PAYOUT LINKS
  // ==========================================================================

  async createPayoutLink(req: CreatePayoutLinkRequest): Promise<PayoutLink> {
    if (!req.counterparty_name) throw new ValidationError("counterparty_name", "is required");
    if (!req.amount || req.amount <= 0) throw new ValidationError("amount", "must be positive");
    if (!req.currency) throw new ValidationError("currency", "is required");
    return this.#http.post<PayoutLink>("/payout-links", req);
  }

  async getPayoutLink(linkId: UUID): Promise<PayoutLink> {
    assertRequired(linkId, "linkId");
    return this.#http.get<PayoutLink>(buildPath("payout-links", linkId));
  }

  async cancelPayoutLink(linkId: UUID): Promise<void> {
    assertRequired(linkId, "linkId");
    return this.#http.post<void>(`/payout-links/${linkId}/cancel`);
  }

  async listPayoutLinks(state?: PayoutLinkState, limit?: number): Promise<PayoutLink[]> {
    return this.#http.get<PayoutLink[]>("/payout-links", { state, count: limit });
  }

  // ==========================================================================
  // TEAM MEMBERS
  // ==========================================================================

  async listTeamMembers(): Promise<TeamMember[]> {
    return this.#http.get<TeamMember[]>("/team-members");
  }

  async getTeamMember(memberId: UUID): Promise<TeamMember> {
    assertRequired(memberId, "memberId");
    return this.#http.get<TeamMember>(buildPath("team-members", memberId));
  }

  async inviteTeamMember(req: InviteTeamMemberRequest): Promise<TeamMember> {
    if (!req.email) throw new ValidationError("email", "is required");
    if (!req.role) throw new ValidationError("role", "is required");
    return this.#http.post<TeamMember>("/team-members", req);
  }

  async updateTeamMember(memberId: UUID, req: UpdateTeamMemberRequest): Promise<TeamMember> {
    assertRequired(memberId, "memberId");
    return this.#http.patch<TeamMember>(buildPath("team-members", memberId), req);
  }

  // ==========================================================================
  // WEBHOOKS v1
  // ==========================================================================

  async createWebhook(req: CreateBusinessWebhookRequest): Promise<BusinessWebhook> {
    if (!req.url) throw new ValidationError("url", "is required");
    if (!req.events?.length) throw new ValidationError("events", "at least one event is required");
    return this.#http.post<BusinessWebhook>("/webhooks", req);
  }

  async getWebhook(webhookId: UUID): Promise<BusinessWebhook> {
    assertRequired(webhookId, "webhookId");
    return this.#http.get<BusinessWebhook>(buildPath("webhooks", webhookId));
  }

  async updateWebhook(
    webhookId: UUID,
    req: CreateBusinessWebhookRequest
  ): Promise<BusinessWebhook> {
    assertRequired(webhookId, "webhookId");
    return this.#http.patch<BusinessWebhook>(buildPath("webhooks", webhookId), req);
  }

  async deleteWebhook(webhookId: UUID): Promise<void> {
    assertRequired(webhookId, "webhookId");
    return this.#http.delete<void>(buildPath("webhooks", webhookId));
  }

  async listWebhooks(): Promise<BusinessWebhook[]> {
    return this.#http.get<BusinessWebhook[]>("/webhooks");
  }

  // ==========================================================================
  // WEBHOOKS v2
  // ==========================================================================

  async createWebhookV2(req: CreateBusinessWebhookRequest): Promise<BusinessWebhookV2> {
    if (!req.url) throw new ValidationError("url", "is required");
    if (!req.events?.length) throw new ValidationError("events", "at least one event is required");
    return this.#http.post<BusinessWebhookV2>("/webhooks/2.0", req);
  }

  async getWebhookV2(webhookId: UUID): Promise<BusinessWebhookV2> {
    assertRequired(webhookId, "webhookId");
    return this.#http.get<BusinessWebhookV2>(`/webhooks/2.0/${webhookId}`);
  }

  async updateWebhookV2(
    webhookId: UUID,
    req: Partial<CreateBusinessWebhookRequest>
  ): Promise<BusinessWebhookV2> {
    assertRequired(webhookId, "webhookId");
    return this.#http.patch<BusinessWebhookV2>(`/webhooks/2.0/${webhookId}`, req);
  }

  async deleteWebhookV2(webhookId: UUID): Promise<void> {
    assertRequired(webhookId, "webhookId");
    return this.#http.delete<void>(`/webhooks/2.0/${webhookId}`);
  }

  async listWebhooksV2(): Promise<BusinessWebhookV2[]> {
    return this.#http.get<BusinessWebhookV2[]>("/webhooks/2.0");
  }

  async rotateWebhookSigningSecretV2(
    webhookId: UUID,
    req?: RotateWebhookSecretV2Request
  ): Promise<RotateWebhookSecretV2Response> {
    assertRequired(webhookId, "webhookId");
    return this.#http.post<RotateWebhookSecretV2Response>(
      `/webhooks/2.0/${webhookId}/rotate-signing-secret`,
      req
    );
  }

  async getFailedWebhookEvents(
    webhookId: UUID,
    req?: ListFailedEventsRequest
  ): Promise<FailedWebhookEvent[]> {
    assertRequired(webhookId, "webhookId");
    return this.#http.get<FailedWebhookEvent[]>(`/webhooks/2.0/${webhookId}/failed-events`, {
      created_before: req?.createdBefore,
      limit: req?.limit,
    });
  }
}

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

export interface Account {
  readonly id: UUID;
  readonly name: string;
  readonly balance: number;
  readonly currency: Currency;
  readonly state: string;
  readonly public: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface BankDetails {
  readonly account_no?: string;
  readonly sort_code?: string;
  readonly iban?: string;
  readonly bic?: string;
  readonly bank_name?: string;
  readonly bank_country?: string;
  readonly country?: string;
}

export interface Card {
  readonly id: UUID;
  readonly last_digits: string;
  readonly expiry?: string;
  readonly label?: string;
  readonly state: CardState;
  readonly virtual: boolean;
  readonly currency?: Currency;
  readonly holder_id?: UUID;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CounterpartyAccount {
  readonly id: UUID;
  readonly currency: string;
  readonly type: string;
  readonly account_no?: string;
  readonly sort_code?: string;
  readonly iban?: string;
  readonly bic?: string;
  readonly country?: string;
  readonly recipient_name?: string;
  readonly bank_name?: string;
  readonly bank_country?: string;
}

export interface CounterpartyCard {
  readonly id: UUID;
  readonly card_last_four: string;
  readonly card_brand: string;
  readonly name?: string;
}

export interface Counterparty {
  readonly id: UUID;
  readonly name: string;
  readonly profile_type: string;
  readonly accounts?: readonly CounterpartyAccount[];
  readonly cards?: readonly CounterpartyCard[];
  readonly created_at: string;
  readonly updated_at: string;
}

export interface AddCounterpartyRequest {
  readonly profile_type: "personal" | "business";
  readonly name: string;
  readonly email?: string;
  readonly revolut_id?: string;
  readonly phone?: string;
  readonly bank_account?: Partial<CounterpartyAccount>;
}

export interface ListCounterpartiesRequest {
  readonly name?: string;
  readonly accountNo?: string;
  readonly sortCode?: string;
  readonly createdBefore?: string;
  readonly limit?: number;
}

export interface ConfirmationOfPayeeRequest {
  readonly name: string;
  readonly account_no?: string;
  readonly sort_code?: string;
  readonly iban?: string;
}

export interface ConfirmationOfPayeeResult {
  readonly matched: boolean;
  readonly name?: string;
  readonly reason?: string;
}

export interface Expense {
  readonly id: UUID;
  readonly amount: number;
  readonly currency: Currency;
  readonly state: string;
  readonly category?: string;
  readonly notes?: string;
  readonly merchant_name?: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ListExpensesRequest {
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly category?: string;
  readonly limit?: number;
}

export interface UpdateExpenseRequest {
  readonly category?: string;
  readonly notes?: string;
}

export interface ExchangeRate {
  readonly from: Currency;
  readonly to: Currency;
  readonly rate: number;
}

export interface ExchangeRequest {
  readonly request_id: string;
  readonly from: {
    readonly account_id?: UUID;
    readonly currency: Currency;
    readonly amount?: number;
  };
  readonly to: {
    readonly account_id?: UUID;
    readonly currency: Currency;
    readonly amount?: number;
  };
  readonly reference?: string;
}

export interface TransactionLeg {
  readonly leg_id: UUID;
  readonly account_id: UUID;
  readonly amount: number;
  readonly currency: Currency;
  readonly balance?: number;
  readonly counterparty?: UUID;
  readonly description?: string;
  readonly bill_amount?: number;
  readonly bill_currency?: string;
}

export interface Transaction {
  readonly id: UUID;
  readonly type: string;
  readonly request_id?: string;
  readonly state: TransactionState;
  readonly created_at: string;
  readonly updated_at: string;
  readonly completed_at?: string;
  readonly reference?: string;
  readonly legs?: readonly TransactionLeg[];
  readonly merchant?: {
    readonly name?: string;
    readonly city?: string;
    readonly category_code?: string;
  };
}

export interface ListTransactionsRequest {
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly accountId?: UUID;
  readonly counterpartyId?: UUID;
  readonly type?: string;
  readonly limit?: number;
  readonly cursor?: UUID;
}

export interface TransferRequest {
  readonly request_id: string;
  readonly source_account_id: UUID;
  readonly target_account_id: UUID;
  readonly amount: number;
  readonly currency: Currency;
  readonly description?: string;
}

export interface PaymentRequest {
  readonly request_id: string;
  readonly account_id: UUID;
  readonly counterparty: UUID;
  readonly counterparty_account_id?: UUID;
  readonly amount: number;
  readonly currency: Currency;
  readonly reference?: string;
  readonly scheduled_for?: string;
  readonly charge_bearer?: "shared" | "debtor";
}

export interface CardTransferRequest {
  readonly request_id: string;
  readonly source_account_id?: UUID;
  readonly counterparty_id: UUID;
  readonly card_id?: UUID;
  readonly amount: number;
  readonly currency: Currency;
  readonly reference?: string;
}

export interface DraftPayment {
  readonly currency: Currency;
  readonly amount: number;
  readonly account_id: UUID;
  readonly counterparty: UUID;
  readonly reference?: string;
}

export interface PaymentDraft {
  readonly id: UUID;
  readonly title: string;
  readonly state: string;
  readonly schedule_for?: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly payments?: readonly DraftPayment[];
}

export interface CreatePaymentDraftRequest {
  readonly title: string;
  readonly schedule_for?: string;
  readonly payments: readonly DraftPayment[];
}

export interface PayoutLink {
  readonly id: UUID;
  readonly amount: number;
  readonly currency: Currency;
  readonly url: string;
  readonly state: PayoutLinkState;
  readonly expiration_date?: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreatePayoutLinkRequest {
  readonly counterparty_name: string;
  readonly account_id?: UUID;
  readonly amount: number;
  readonly currency: Currency;
  readonly reference?: string;
  readonly expiration_date?: string;
  readonly save_counterparty?: boolean;
}

export interface TeamMember {
  readonly id: UUID;
  readonly first_name?: string;
  readonly last_name?: string;
  readonly email: string;
  readonly role: TeamMemberRole;
  readonly state: string;
  readonly created_at: string;
}

export interface InviteTeamMemberRequest {
  readonly email: string;
  readonly role: TeamMemberRole;
}

export interface UpdateTeamMemberRequest {
  readonly role?: TeamMemberRole;
}

export interface BusinessWebhook {
  readonly id: UUID;
  readonly url: string;
  readonly events: readonly BusinessWebhookEvent[];
  readonly active: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface BusinessWebhookV2 {
  readonly id: UUID;
  readonly url: string;
  readonly events: readonly BusinessWebhookEvent[];
  readonly signing_secret?: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreateBusinessWebhookRequest {
  readonly url: string;
  readonly events: readonly BusinessWebhookEvent[];
}

export interface RotateWebhookSecretV2Request {
  /** ISO 8601 duration (max "P7D"). Old secret remains valid during this period. */
  readonly expiration_period?: string;
}

export interface RotateWebhookSecretV2Response {
  readonly id: UUID;
  readonly signing_secret: string;
}

export interface FailedWebhookEvent {
  readonly id: UUID;
  readonly webhook_id: UUID;
  readonly url: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly payload?: Record<string, unknown>;
}

export interface ListFailedEventsRequest {
  /** ISO 8601 date-time. Cannot be older than 21 days. */
  readonly createdBefore?: string;
  readonly limit?: number;
}
