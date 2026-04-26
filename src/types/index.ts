/**
 * @module types
 * Shared branded primitives, value types, enumerations, and pagination.
 */

declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

export type Currency = Brand<string, "Currency">;
export type Amount = Brand<number, "Amount">;
export type UUID = Brand<string, "UUID">;
export type ISODuration = Brand<string, "ISODuration">;
export type ISODateTime = Brand<string, "ISODateTime">;
export type HttpsURL = Brand<string, "HttpsURL">;

export const Currency = (s: string): Currency => s as Currency;
export const Amount = (n: number): Amount => n as Amount;
export const UUID = (s: string): UUID => s as UUID;
export const ISODuration = (s: string): ISODuration => s as ISODuration;
export const ISODateTime = (s: string): ISODateTime => s as ISODateTime;
export const HttpsURL = (s: string): HttpsURL => s as HttpsURL;

export type Environment = "prod" | "sandbox";

export type OrderState =
  | "pending"
  | "authorised"
  | "processing"
  | "completed"
  | "cancelled"
  | "failed";
export type CaptureMode = "automatic" | "manual";
export type AuthorisationType = "final" | "pre_authorisation";
export type IncrementalAuthState = "pending" | "authorised" | "declined" | "failed";

export type PaymentMethodType = "card" | "revolut_pay" | "apple_pay" | "google_pay" | "pay_by_bank";

export type PaymentState =
  | "pending"
  | "authentication_challenge"
  | "authentication_verified"
  | "authorisation_started"
  | "authorisation_passed"
  | "authorised"
  | "capture_started"
  | "captured"
  | "refund_validated"
  | "refund_started"
  | "cancellation_started"
  | "completing"
  | "completed"
  | "declined"
  | "soft_declined"
  | "cancelled"
  | "failed";

export type PaymentFailureReason =
  | "insufficient_funds"
  | "expired_card"
  | "invalid_cvv"
  | "invalid_card"
  | "suspected_fraud"
  | "do_not_honour"
  | "high_risk"
  | "restricted_card"
  | "technical_error"
  | "withdrawal_limit_exceeded"
  | "rejected_by_customer"
  | "invalid_amount"
  | "invalid_address"
  | "invalid_email"
  | "invalid_phone"
  | "cardholder_name_missing"
  | "customer_challenge_failed"
  | "pick_up_card"
  | "issuer_not_available"
  | "invalid_merchant"
  | "transaction_not_allowed_for_cardholder"
  | "unknown_card";

export type SubscriptionState = "pending" | "active" | "paused" | "cancelled" | "completed";
export type DisputeState = "new" | "review_needed" | "under_review" | "won" | "lost" | "accepted";
export type PayoutState = "pending" | "completed" | "failed";
export type ReportType = "transactions" | "payouts" | "orders";
export type ReportRunState = "pending" | "ready" | "failed";
export type TransactionState = "pending" | "completed" | "failed" | "reverted" | "declined";
export type PayoutLinkState = "created" | "active" | "paid" | "cancelled" | "expired";
export type CardState = "active" | "frozen" | "terminated";
export type TeamMemberRole = "owner" | "admin" | "member" | "viewer";
export type ExchangeOrderSide = "buy" | "sell";
export type ExchangeOrderType = "market" | "limit" | "tpsl";
export type ExchangeOrderState = "open" | "filled" | "cancelled" | "rejected";

export type MerchantWebhookEvent =
  | "ORDER_COMPLETED"
  | "ORDER_AUTHORISED"
  | "ORDER_CANCELLED"
  | "ORDER_FAILED"
  | "ORDER_INCREMENTAL_AUTHORISATION_AUTHORISED"
  | "ORDER_INCREMENTAL_AUTHORISATION_DECLINED"
  | "ORDER_INCREMENTAL_AUTHORISATION_FAILED"
  | "ORDER_PAYMENT_AUTHENTICATION_CHALLENGED"
  | "ORDER_PAYMENT_AUTHENTICATED"
  | "ORDER_PAYMENT_DECLINED"
  | "ORDER_PAYMENT_FAILED"
  | "PAYMENT_CREATED"
  | "PAYMENT_UPDATED"
  | "REFUND_CREATED"
  | "SUBSCRIPTION_INITIATED"
  | "SUBSCRIPTION_FINISHED"
  | "SUBSCRIPTION_CANCELLED"
  | "SUBSCRIPTION_OVERDUE"
  | "PAYOUT_INITIATED"
  | "PAYOUT_COMPLETED"
  | "PAYOUT_FAILED"
  | "DISPUTE_CREATED"
  | "DISPUTE_UPDATED"
  | "DISPUTE_ACTION_REQUIRED"
  | "DISPUTE_UNDER_REVIEW"
  | "DISPUTE_WON"
  | "DISPUTE_LOST";

export type BusinessWebhookEvent =
  | "TransactionCreated"
  | "TransactionStateChanged"
  | "PayoutLinkCreated"
  | "PayoutLinkStateChanged";
export type CryptoRampWebhookEvent = "ORDER_PROCESSING" | "ORDER_COMPLETED" | "ORDER_FAILED";
export type WebhookEvent = MerchantWebhookEvent | BusinessWebhookEvent | CryptoRampWebhookEvent;

export interface Address {
  readonly street_line1?: string;
  readonly street_line2?: string;
  readonly city?: string;
  readonly region?: string;
  readonly postcode?: string;
  readonly country_code?: string;
}

export interface Money {
  readonly amount: Amount;
  readonly currency: Currency;
}

export interface LineItem {
  readonly name: string;
  readonly type?: string;
  readonly quantity?: { readonly value: number; readonly unit?: string };
  readonly unit_price?: Amount;
  readonly total_amount: Amount;
  readonly item_id?: string;
  readonly discounts?: ReadonlyArray<{ readonly name: string; readonly amount: Amount }>;
  readonly taxes?: ReadonlyArray<{ readonly name: string; readonly amount: Amount }>;
}

export interface PageRequest {
  readonly limit?: number;
  readonly cursor?: string;
}

export interface PageResponse<T> {
  readonly items: readonly T[];
  readonly next_cursor?: string;
  readonly has_more: boolean;
  readonly total?: number;
}

export function hasNextPage<T>(page: PageResponse<T>): boolean {
  return page.has_more && page.next_cursor !== undefined;
}

export interface AirlineLeg {
  readonly sequence: number;
  readonly departure_airport_code: string;
  readonly arrival_airport_code: string;
  readonly flight_number: string;
  readonly travel_date: string;
  readonly airline_name: string;
  readonly airline_code: string;
  readonly fare_base_code?: string;
}

export interface IndustryData {
  readonly airline?: { readonly legs: AirlineLeg[]; readonly pnr?: string };
  readonly lodging?: {
    readonly check_in_date: string;
    readonly check_out_date: string;
    readonly property_name?: string;
  };
  readonly car_rental?: { readonly pickup_date: string; readonly return_date: string };
}
