/**
 * @module merchant
 * Complete Revolut Merchant API client.
 *
 * Resources: Orders (CRUD + capture + refund + incremental auth),
 * Payments, Customers + saved methods, Subscription Plans (variations+phases),
 * Subscriptions + billing cycles, Payouts, Disputes, Report Runs,
 * Webhooks (rotate secret), Locations, Synchronous Webhooks (Fast Checkout).
 *
 * API version: 2025-12-04
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
  OrderState,
  CaptureMode,
  AuthorisationType,
  IncrementalAuthState,
  PaymentState,
  PaymentFailureReason,
  PaymentMethodType,
  SubscriptionState,
  DisputeState,
  PayoutState,
  ReportType,
  ReportRunState,
  MerchantWebhookEvent,
  Currency,
  Amount,
  Address,
  LineItem,
  PageRequest,
  PageResponse,
  IndustryData,
  UUID,
} from "../types/index.js";

export const MERCHANT_API_VERSION = "2025-12-04";

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class MerchantClient {
  readonly #http: HttpClient;

  constructor(config: ClientConfig) {
    const env = config.environment ?? "prod";
    const baseURL = config.baseURL ?? BASE_URLS.merchant[env];
    this.#http = new HttpClient(baseURL, {
      apiVersion: MERCHANT_API_VERSION,
      ...config,
      baseURL,
    });
  }

  // ==========================================================================
  // ORDERS
  // ==========================================================================

  /** Create a new payment order. Returns token + checkout_url. */
  async createOrder(req: CreateOrderRequest): Promise<Order> {
    validateCreateOrder(req);
    return this.#http.post<Order>("/api/orders", req);
  }

  /** Retrieve an order by ID. */
  async getOrder(orderId: UUID): Promise<Order> {
    assertRequired(orderId, "orderId");
    return this.#http.get<Order>(buildPath("api/orders", orderId));
  }

  /** Retrieve a paginated list of orders. */
  async listOrders(req?: ListOrdersRequest): Promise<PageResponse<Order>> {
    return this.#http.get<PageResponse<Order>>("/api/orders", buildOrderQuery(req));
  }

  /** Update a mutable order before capture. */
  async updateOrder(orderId: UUID, req: UpdateOrderRequest): Promise<Order> {
    assertRequired(orderId, "orderId");
    return this.#http.patch<Order>(buildPath("api/orders", orderId), req);
  }

  /** Capture an authorised manual-capture order. */
  async captureOrder(orderId: UUID, req?: CaptureOrderRequest): Promise<Order> {
    assertRequired(orderId, "orderId");
    return this.#http.post<Order>(buildPath("api/orders", orderId, "capture"), req);
  }

  /** Cancel an uncaptured order. */
  async cancelOrder(orderId: UUID): Promise<Order> {
    assertRequired(orderId, "orderId");
    return this.#http.post<Order>(buildPath("api/orders", orderId, "cancel"));
  }

  /** Issue a full or partial refund. */
  async refundOrder(orderId: UUID, req?: RefundRequest): Promise<Order> {
    assertRequired(orderId, "orderId");
    return this.#http.post<Order>(buildPath("api/orders", orderId, "refund"), req);
  }

  /** Pay using a customer's saved payment method (MIT flow). */
  async payViaSavedMethod(orderId: UUID, req: PayViaSavedMethodRequest): Promise<Order> {
    assertRequired(orderId, "orderId");
    assertRequired(req.saved_payment_method_id, "saved_payment_method_id");
    return this.#http.post<Order>(buildPath("api/orders", orderId, "pay"), req);
  }

  /** Increase the authorised amount on a pre-authorised order. */
  async incrementalAuthorise(orderId: UUID, req: IncrementalAuthorisationRequest): Promise<Order> {
    assertRequired(orderId, "orderId");
    if ((req.amount ?? 0) <= 0)
      throw new ValidationError("amount", "must be the new total authorised amount in minor units");
    return this.#http.post<Order>(buildPath("api/orders", orderId, "authorise"), req);
  }

  // ==========================================================================
  // PAYMENTS
  // ==========================================================================

  /** Retrieve payment details by payment ID. */
  async getPaymentDetails(paymentId: UUID): Promise<PaymentDetails> {
    assertRequired(paymentId, "paymentId");
    return this.#http.get<PaymentDetails>(`/api/payments/${paymentId}/details`);
  }

  /** List all payment attempts for an order. */
  async listOrderPayments(orderId: UUID): Promise<Payment[]> {
    assertRequired(orderId, "orderId");
    return this.#http.get<Payment[]>(buildPath("api/orders", orderId, "payments"));
  }

  // ==========================================================================
  // CUSTOMERS
  // ==========================================================================

  async createCustomer(req: CreateCustomerRequest): Promise<Customer> {
    if (!req.email && !req.phone)
      throw new ValidationError("email/phone", "at least one contact field is required");
    return this.#http.post<Customer>("/api/customers", req);
  }

  async getCustomer(customerId: UUID): Promise<Customer> {
    assertRequired(customerId, "customerId");
    return this.#http.get<Customer>(buildPath("api/customers", customerId));
  }

  async updateCustomer(customerId: UUID, req: UpdateCustomerRequest): Promise<Customer> {
    assertRequired(customerId, "customerId");
    return this.#http.patch<Customer>(buildPath("api/customers", customerId), req);
  }

  async deleteCustomer(customerId: UUID): Promise<void> {
    assertRequired(customerId, "customerId");
    return this.#http.delete<void>(buildPath("api/customers", customerId));
  }

  async listCustomers(page?: PageRequest): Promise<PageResponse<Customer>> {
    return this.#http.get<PageResponse<Customer>>("/api/customers", {
      limit: page?.limit,
      cursor: page?.cursor,
    });
  }

  async listSavedPaymentMethods(customerId: UUID): Promise<SavedPaymentMethod[]> {
    assertRequired(customerId, "customerId");
    return this.#http.get<SavedPaymentMethod[]>(`/api/customers/${customerId}/payment-methods`);
  }

  async deleteSavedPaymentMethod(customerId: UUID, methodId: UUID): Promise<void> {
    assertRequired(customerId, "customerId");
    assertRequired(methodId, "methodId");
    return this.#http.delete<void>(`/api/customers/${customerId}/payment-methods/${methodId}`);
  }

  // ==========================================================================
  // SUBSCRIPTION PLANS (Variations + Phases model)
  // ==========================================================================

  async createPlan(req: CreatePlanRequest): Promise<SubscriptionPlan> {
    assertRequired(req.name, "name");
    if (!req.variations?.length)
      throw new ValidationError("variations", "at least one variation is required");
    return this.#http.post<SubscriptionPlan>("/api/subscriptions/plans", req);
  }

  async getPlan(planId: UUID): Promise<SubscriptionPlan> {
    assertRequired(planId, "planId");
    return this.#http.get<SubscriptionPlan>(buildPath("api/subscriptions/plans", planId));
  }

  async listPlans(req?: ListPlansRequest): Promise<ListPlansResponse> {
    return this.#http.get<ListPlansResponse>("/api/subscriptions/plans", {
      limit: req?.limit,
      from: req?.from,
      to: req?.to,
      page_token: req?.pageToken,
    });
  }

  // ==========================================================================
  // SUBSCRIPTIONS
  // ==========================================================================

  async createSubscription(req: CreateSubscriptionRequest): Promise<Subscription> {
    assertRequired(req.plan_variation_id, "plan_variation_id");
    assertRequired(req.customer_id, "customer_id");
    return this.#http.post<Subscription>("/api/subscriptions", req);
  }

  async getSubscription(subscriptionId: UUID): Promise<Subscription> {
    assertRequired(subscriptionId, "subscriptionId");
    return this.#http.get<Subscription>(buildPath("api/subscriptions", subscriptionId));
  }

  async updateSubscription(
    subscriptionId: UUID,
    req: UpdateSubscriptionRequest
  ): Promise<Subscription> {
    assertRequired(subscriptionId, "subscriptionId");
    return this.#http.patch<Subscription>(buildPath("api/subscriptions", subscriptionId), req);
  }

  async cancelSubscription(subscriptionId: UUID): Promise<void> {
    assertRequired(subscriptionId, "subscriptionId");
    return this.#http.post<void>(buildPath("api/subscriptions", subscriptionId, "cancel"));
  }

  async listSubscriptions(req?: ListSubscriptionsRequest): Promise<ListSubscriptionsResponse> {
    return this.#http.get<ListSubscriptionsResponse>("/api/subscriptions", {
      limit: req?.limit,
      from: req?.from,
      to: req?.to,
      external_reference: req?.externalReference,
      page_token: req?.pageToken,
    });
  }

  async listBillingCycles(subscriptionId: UUID, page?: PageRequest): Promise<BillingCycle[]> {
    assertRequired(subscriptionId, "subscriptionId");
    return this.#http.get<BillingCycle[]>(
      buildPath("api/subscriptions", subscriptionId, "cycles"),
      { limit: page?.limit, cursor: page?.cursor }
    );
  }

  async getBillingCycle(subscriptionId: UUID, cycleId: UUID): Promise<BillingCycle> {
    assertRequired(subscriptionId, "subscriptionId");
    assertRequired(cycleId, "cycleId");
    return this.#http.get<BillingCycle>(`/api/subscriptions/${subscriptionId}/cycles/${cycleId}`);
  }

  // ==========================================================================
  // PAYOUTS
  // ==========================================================================

  async getPayout(payoutId: UUID): Promise<Payout> {
    assertRequired(payoutId, "payoutId");
    return this.#http.get<Payout>(buildPath("api/payouts", payoutId));
  }

  async listPayouts(req?: ListPayoutsRequest): Promise<PageResponse<Payout>> {
    return this.#http.get<PageResponse<Payout>>("/api/payouts", {
      state: req?.state,
      date_from: req?.dateFrom,
      date_to: req?.dateTo,
      limit: req?.page?.limit,
      cursor: req?.page?.cursor,
    });
  }

  // ==========================================================================
  // DISPUTES
  // ==========================================================================

  async getDispute(disputeId: UUID): Promise<Dispute> {
    assertRequired(disputeId, "disputeId");
    return this.#http.get<Dispute>(buildPath("api/disputes", disputeId));
  }

  async listDisputes(req?: ListDisputesRequest): Promise<PageResponse<Dispute>> {
    return this.#http.get<PageResponse<Dispute>>("/api/disputes", {
      state: req?.state,
      date_from: req?.dateFrom,
      date_to: req?.dateTo,
      limit: req?.page?.limit,
      cursor: req?.page?.cursor,
    });
  }

  async acceptDispute(disputeId: UUID): Promise<Dispute> {
    assertRequired(disputeId, "disputeId");
    return this.#http.post<Dispute>(buildPath("api/disputes", disputeId, "accept"));
  }

  async uploadDisputeEvidence(
    disputeId: UUID,
    req: UploadEvidenceRequest
  ): Promise<DisputeEvidence> {
    assertRequired(disputeId, "disputeId");
    assertRequired(req.file_name, "file_name");
    return this.#http.post<DisputeEvidence>(buildPath("api/disputes", disputeId, "evidence"), req);
  }

  async challengeDispute(disputeId: UUID, req: ChallengeDisputeRequest): Promise<Dispute> {
    assertRequired(disputeId, "disputeId");
    if (!req.evidence_ids?.length)
      throw new ValidationError("evidence_ids", "at least one evidence file ID is required");
    return this.#http.post<Dispute>(buildPath("api/disputes", disputeId, "challenge"), req);
  }

  // ==========================================================================
  // REPORT RUNS
  // ==========================================================================

  async createReportRun(req: CreateReportRunRequest): Promise<ReportRun> {
    assertRequired(req.type, "type");
    assertRequired(req.date_from, "date_from");
    assertRequired(req.date_to, "date_to");
    return this.#http.post<ReportRun>("/api/report-runs", req);
  }

  async getReportRun(reportRunId: UUID): Promise<ReportRun> {
    assertRequired(reportRunId, "reportRunId");
    return this.#http.get<ReportRun>(buildPath("api/report-runs", reportRunId));
  }

  async listReportRuns(page?: PageRequest): Promise<PageResponse<ReportRun>> {
    return this.#http.get<PageResponse<ReportRun>>("/api/report-runs", {
      limit: page?.limit,
      cursor: page?.cursor,
    });
  }

  // ==========================================================================
  // WEBHOOKS
  // ==========================================================================

  async createWebhook(req: CreateWebhookRequest): Promise<Webhook> {
    assertRequired(req.url, "url");
    if (!req.events?.length)
      throw new ValidationError("events", "at least one event type is required");
    return this.#http.post<Webhook>("/api/webhooks", req);
  }

  async getWebhook(webhookId: UUID): Promise<Webhook> {
    assertRequired(webhookId, "webhookId");
    return this.#http.get<Webhook>(buildPath("api/webhooks", webhookId));
  }

  async updateWebhook(webhookId: UUID, req: UpdateWebhookRequest): Promise<Webhook> {
    assertRequired(webhookId, "webhookId");
    return this.#http.patch<Webhook>(buildPath("api/webhooks", webhookId), req);
  }

  async deleteWebhook(webhookId: UUID): Promise<void> {
    assertRequired(webhookId, "webhookId");
    return this.#http.delete<void>(buildPath("api/webhooks", webhookId));
  }

  async listWebhooks(): Promise<Webhook[]> {
    return this.#http.get<Webhook[]>("/api/webhooks");
  }

  async rotateWebhookSecret(webhookId: UUID): Promise<RotateSecretResponse> {
    assertRequired(webhookId, "webhookId");
    return this.#http.post<RotateSecretResponse>(
      buildPath("api/webhooks", webhookId, "rotate-secret")
    );
  }

  // ==========================================================================
  // LOCATIONS
  // ==========================================================================

  async createLocation(req: CreateLocationRequest): Promise<Location> {
    assertRequired(req.name, "name");
    return this.#http.post<Location>("/api/locations", req);
  }

  async getLocation(locationId: UUID): Promise<Location> {
    assertRequired(locationId, "locationId");
    return this.#http.get<Location>(buildPath("api/locations", locationId));
  }

  async listLocations(page?: PageRequest): Promise<PageResponse<Location>> {
    return this.#http.get<PageResponse<Location>>("/api/locations", {
      limit: page?.limit,
      cursor: page?.cursor,
    });
  }

  // ==========================================================================
  // SYNCHRONOUS WEBHOOKS (Fast Checkout address validation)
  // ==========================================================================

  async registerAddressValidation(
    req: RegisterAddressValidationRequest
  ): Promise<SynchronousWebhook> {
    assertRequired(req.url, "url");
    return this.#http.post<SynchronousWebhook>("/api/synchronous-webhooks", {
      event_type: "fast_checkout.validate_address",
      ...req,
    });
  }

  async listSynchronousWebhooks(): Promise<SynchronousWebhook[]> {
    return this.#http.get<SynchronousWebhook[]>("/api/synchronous-webhooks");
  }
}

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

// Orders
export interface Order {
  readonly id: UUID;
  readonly token: string;
  readonly type: string;
  readonly state: OrderState;
  readonly created_at: string;
  readonly updated_at: string;
  readonly completed_at?: string;
  readonly amount: Amount;
  readonly currency: Currency;
  readonly outstanding_amount: Amount;
  readonly capture_mode: CaptureMode;
  readonly authorisation_type?: AuthorisationType;
  readonly checkout_url?: string;
  readonly description?: string;
  readonly merchant_order_ext_ref?: string;
  readonly customer_id?: string;
  readonly customer?: { readonly name?: string; readonly email?: string; readonly phone?: string };
  readonly payments?: readonly Payment[];
  readonly metadata?: Readonly<Record<string, string>>;
  readonly redirect_url?: string;
  readonly line_items?: readonly LineItem[];
  readonly industry_data?: IndustryData;
  readonly incremental_authorisation_history?: readonly IncrementalAuth[];
}

export interface IncrementalAuth {
  readonly new_amount: Amount;
  readonly previous_amount: Amount;
  readonly state: IncrementalAuthState;
  readonly reference?: string;
}

export interface CreateOrderRequest {
  readonly amount: Amount;
  readonly currency: Currency;
  readonly capture_mode?: CaptureMode;
  readonly authorisation_type?: AuthorisationType;
  readonly customer_id?: string;
  readonly customer?: { readonly name?: string; readonly email?: string; readonly phone?: string };
  readonly redirect_url?: string;
  readonly description?: string;
  readonly merchant_order_ext_ref?: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly line_items?: readonly LineItem[];
  readonly industry_data?: IndustryData;
}

export interface UpdateOrderRequest {
  readonly description?: string;
  readonly merchant_order_ext_ref?: string;
  readonly customer_id?: string;
  readonly auto_cancel_period?: string;
  readonly amount?: Amount;
  readonly line_items?: readonly LineItem[];
  readonly metadata?: Readonly<Record<string, string>>;
  readonly industry_data?: IndustryData;
}

export interface ListOrdersRequest {
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly email?: string;
  readonly merchantOrderId?: string;
  readonly state?: OrderState;
  readonly page?: PageRequest;
}

export interface CaptureOrderRequest {
  readonly amount?: Amount;
  readonly currency?: Currency;
  readonly line_items?: readonly LineItem[];
}

export interface RefundRequest {
  readonly amount?: Amount;
  readonly currency?: Currency;
  readonly description?: string;
  readonly merchant_order_ext_ref?: string;
}

export interface PayViaSavedMethodRequest {
  readonly saved_payment_method_id: UUID;
}

export interface IncrementalAuthorisationRequest {
  readonly amount: Amount;
  readonly currency: Currency;
  readonly reference?: string;
  readonly line_items?: readonly LineItem[];
}

// Payments
export interface Payment {
  readonly id: UUID;
  readonly order_id: UUID;
  readonly state: PaymentState;
  readonly created_at: string;
  readonly updated_at: string;
  readonly amount: Amount;
  readonly currency: Currency;
  readonly settled_amount?: Amount;
  readonly payment_method?: PaymentMethod;
  readonly failure_reason?: PaymentFailureReason;
}

export interface PaymentDetails extends Payment {
  readonly authorised_amount?: Amount;
  readonly fingerprint?: string;
  readonly acquirer_reference_number?: string;
  readonly authorisation_code?: string;
  readonly capture_deadline?: string;
  readonly reward_token?: string;
  readonly payer?: { readonly email?: string; readonly phone?: string };
  readonly incremental_authorisation_history?: readonly IncrementalAuth[];
}

export interface PaymentMethod {
  readonly type: PaymentMethodType;
  readonly card?: CardDetails;
  readonly id?: UUID;
}

export interface CardDetails {
  readonly card_brand: string;
  readonly card_last_four: string;
  readonly expiry_month: number;
  readonly expiry_year: number;
  readonly cardholder_name?: string;
  readonly card_bin?: string;
  readonly funding?: string;
  readonly issuer_country?: string;
}

// Customers
export interface Customer {
  readonly id: UUID;
  readonly full_name?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreateCustomerRequest {
  readonly full_name?: string;
  readonly email?: string;
  readonly phone?: string;
}

export interface UpdateCustomerRequest {
  readonly full_name?: string;
  readonly email?: string;
  readonly phone?: string;
}

export interface SavedPaymentMethod {
  readonly id: UUID;
  readonly type: string;
  readonly created_at: string;
  readonly card?: CardDetails;
}

// Subscription Plans (Variations + Phases model)
export interface PlanPhase {
  readonly id?: UUID;
  readonly ordinal: number;
  readonly cycle_duration: string;
  readonly cycle_count?: number;
  readonly amount: Amount;
  readonly currency: Currency;
}

export interface PlanVariation {
  readonly id?: UUID;
  readonly name?: string;
  readonly phases: readonly PlanPhase[];
}

export interface SubscriptionPlan {
  readonly id: UUID;
  readonly name: string;
  readonly state: string;
  readonly trial_duration?: string;
  readonly variations: readonly PlanVariation[];
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreatePlanRequest {
  readonly name: string;
  readonly trial_duration?: string;
  readonly variations: readonly PlanVariation[];
}

export interface ListPlansRequest {
  readonly limit?: number;
  readonly from?: string;
  readonly to?: string;
  readonly pageToken?: string;
}

export interface ListPlansResponse {
  readonly items: readonly SubscriptionPlan[];
  readonly next_page_token?: string;
}

// Subscriptions
export interface Subscription {
  readonly id: UUID;
  readonly external_reference?: string;
  readonly state: SubscriptionState;
  readonly customer_id: UUID;
  readonly plan_id: UUID;
  readonly plan_variation_id: UUID;
  readonly payment_method_type?: string;
  readonly payment_method_id?: UUID;
  readonly setup_order_id?: UUID;
  readonly trial_duration?: string;
  readonly trial_end_date?: string;
  readonly start_date?: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreateSubscriptionRequest {
  readonly plan_variation_id: UUID;
  readonly customer_id: UUID;
  readonly external_reference?: string;
  readonly setup_order_redirect_url?: string;
  readonly trial_duration?: string;
}

export interface UpdateSubscriptionRequest {
  readonly external_reference?: string;
}

export interface ListSubscriptionsRequest {
  readonly limit?: number;
  readonly from?: string;
  readonly to?: string;
  readonly externalReference?: string;
  readonly pageToken?: string;
}

export interface ListSubscriptionsResponse {
  readonly items: readonly Subscription[];
  readonly next_page_token?: string;
}

export interface BillingCycle {
  readonly id: UUID;
  readonly subscription_id: UUID;
  readonly plan_variation_id: UUID;
  readonly plan_phase_id: UUID;
  readonly cycle_number: number;
  readonly state: string;
  readonly amount: Amount;
  readonly currency: Currency;
  readonly start_date: string;
  readonly end_date?: string;
  readonly orders?: readonly UUID[];
  readonly created_at: string;
  readonly updated_at: string;
}

// Payouts
export interface Payout {
  readonly id: UUID;
  readonly amount: Amount;
  readonly currency: Currency;
  readonly state: PayoutState;
  readonly account_id?: UUID;
  readonly reference?: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly completed_at?: string;
}

export interface ListPayoutsRequest {
  readonly state?: PayoutState;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly page?: PageRequest;
}

// Disputes
export interface Dispute {
  readonly id: UUID;
  readonly order_id: UUID;
  readonly payment_id?: UUID;
  readonly state: DisputeState;
  readonly reason: string;
  readonly amount: Amount;
  readonly currency: Currency;
  readonly due_date?: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly evidence?: readonly DisputeEvidence[];
}

export interface DisputeEvidence {
  readonly id: UUID;
  readonly file_name: string;
  readonly content_type: string;
  readonly uploaded_at: string;
}

export interface ListDisputesRequest {
  readonly state?: DisputeState;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly page?: PageRequest;
}

export interface UploadEvidenceRequest {
  readonly file_name: string;
  readonly content_type: "application/pdf" | "image/png" | "image/jpeg";
}

export interface ChallengeDisputeRequest {
  readonly evidence_ids: readonly UUID[];
}

// Report Runs
export interface ReportRun {
  readonly id: UUID;
  readonly type: ReportType;
  readonly state: ReportRunState;
  readonly download_url?: string;
  readonly date_from: string;
  readonly date_to: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreateReportRunRequest {
  readonly type: ReportType;
  readonly date_from: string;
  readonly date_to: string;
  readonly currency?: Currency;
}

// Webhooks
export interface Webhook {
  readonly id: UUID;
  readonly url: string;
  readonly events: readonly MerchantWebhookEvent[];
  readonly active: boolean;
  readonly signing_secret?: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreateWebhookRequest {
  readonly url: string;
  readonly events: readonly MerchantWebhookEvent[];
}

export interface UpdateWebhookRequest {
  readonly url?: string;
  readonly events?: readonly MerchantWebhookEvent[];
  readonly active?: boolean;
}

export interface RotateSecretResponse {
  readonly signing_secret: string;
}

// Locations
export interface Location {
  readonly id: UUID;
  readonly name: string;
  readonly type?: string;
  readonly address?: Address;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreateLocationRequest {
  readonly name: string;
  readonly type?: string;
  readonly address?: Address;
}

// Synchronous Webhooks
export interface SynchronousWebhook {
  readonly id: UUID;
  readonly event_type: string;
  readonly url: string;
  readonly location_id?: UUID;
  readonly signing_key?: string;
}

export interface RegisterAddressValidationRequest {
  readonly url: string;
  readonly location_id?: UUID;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function validateCreateOrder(req: CreateOrderRequest): void {
  if (!req.amount || req.amount <= 0) {
    throw new ValidationError("amount", "must be a positive integer in minor units");
  }
  if (!req.currency) {
    throw new ValidationError("currency", "is required (ISO 4217)");
  }
}

function buildOrderQuery(req?: ListOrdersRequest): Record<string, string | number | undefined> {
  return {
    date_from: req?.dateFrom,
    date_to: req?.dateTo,
    email: req?.email,
    merchant_order_ext_ref: req?.merchantOrderId,
    state: req?.state,
    limit: req?.page?.limit,
    cursor: req?.page?.cursor,
  };
}
