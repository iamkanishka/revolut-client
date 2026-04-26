# revolut-sdk — Usage Guide

Complete guide for the Revolut TypeScript SDK covering every API, configuration option, error pattern, and advanced feature.

---

## Table of Contents

1. [Installation](#1-installation)
2. [Quick Start](#2-quick-start)
3. [Configuration](#3-configuration)
4. [Merchant API](#4-merchant-api)
   - [Orders](#41-orders)
   - [Payments](#42-payments)
   - [Customers & Saved Methods](#43-customers--saved-methods)
   - [Subscription Plans](#44-subscription-plans)
   - [Subscriptions & Billing Cycles](#45-subscriptions--billing-cycles)
   - [Payouts](#46-payouts)
   - [Disputes](#47-disputes)
   - [Report Runs](#48-report-runs)
   - [Webhooks](#49-webhooks)
   - [Locations](#410-locations)
   - [Fast Checkout Address Validation](#411-fast-checkout-address-validation)
5. [Business API](#5-business-api)
   - [Accounts](#51-accounts)
   - [Cards](#52-cards)
   - [Counterparties](#53-counterparties)
   - [Foreign Exchange](#54-foreign-exchange)
   - [Transactions](#55-transactions)
   - [Transfers & Payments](#56-transfers--payments)
   - [Payment Drafts](#57-payment-drafts)
   - [Payout Links](#58-payout-links)
   - [Team Members](#59-team-members)
   - [Webhooks v2](#510-webhooks-v2)
6. [Open Banking API](#6-open-banking-api)
   - [AISP — Account Information](#61-aisp--account-information)
   - [PISP — Payment Initiation](#62-pisp--payment-initiation)
7. [Crypto Ramp API](#7-crypto-ramp-api)
8. [Crypto Exchange API](#8-crypto-exchange-api)
9. [Webhooks & Signature Verification](#9-webhooks--signature-verification)
10. [Error Handling](#10-error-handling)
11. [Pagination](#11-pagination)
12. [Retry & Rate Limiting](#12-retry--rate-limiting)
13. [Telemetry & Observability](#13-telemetry--observability)
14. [TypeScript Features](#14-typescript-features)
15. [Sub-package Imports](#15-sub-package-imports)
16. [Framework Integration Examples](#16-framework-integration-examples)

---

## 1. Installation

```bash
npm install revolut-sdk
# or
yarn add revolut-sdk
# or
pnpm add revolut-sdk
```

**Requirements:** Node.js 18+, TypeScript 5.5+ (for consumers), zero runtime dependencies.

---

## 2. Quick Start

```typescript
import { RevolutSDK, Amount, Currency } from "revolut-sdk";

const sdk = new RevolutSDK({
  merchantKey: "sk_live_...",   // Merchant API secret key
  environment: "prod",          // "prod" | "sandbox"
});

// Create a payment order
const order = await sdk.merchant.createOrder({
  amount:      Amount(1000),   // £10.00 — always use minor units (pence/cents)
  currency:    Currency("GBP"),
  description: "Widget purchase",
});

console.log(order.checkout_url); // redirect customer here
console.log(order.token);        // pass to Revolut Checkout Widget
```

### Sandbox testing

```typescript
const sdk = new RevolutSDK({
  merchantKey: "sk_sandbox_...",
  environment: "sandbox",
});
```

---

## 3. Configuration

### Unified SDK (all APIs)

```typescript
import { RevolutSDK } from "revolut-sdk";

const sdk = new RevolutSDK({
  // ── API Keys (provide only the ones you use) ───────────────────────────
  merchantKey:       "sk_live_...",         // Merchant API
  businessKey:       "biz_access_token",    // Business API (OAuth2 token)
  openBankingKey:    "ob_bearer_token",     // Open Banking API (OAuth2)
  cryptoRampKey:     "ramp_partner_key",    // Crypto Ramp API
  cryptoExchangeKey: "cx_api_key",          // Crypto Exchange API

  // ── Environment ────────────────────────────────────────────────────────
  environment: "prod",   // "prod" (default) | "sandbox"

  // ── Network ────────────────────────────────────────────────────────────
  timeoutMs: 30_000,     // Per-request timeout. Default: 30 000 ms

  // ── Retry Policy ───────────────────────────────────────────────────────
  retry: {
    maxAttempts:    3,          // Total attempts (1 = no retry). Default: 3
    initialDelayMs: 500,        // First backoff delay. Default: 500 ms
    maxDelayMs:     30_000,     // Backoff cap. Default: 30 000 ms
    multiplier:     2,          // Exponential factor. Default: 2
    jitter:         0.5,        // Random ±factor applied to backoff. Default: 0.5
  },

  // ── Client-side Rate Limiting ──────────────────────────────────────────
  rateLimit: {
    requestsPerSecond: 50,   // Sustained rate
    burst:             100,  // Token-bucket burst capacity
  },

  // ── Telemetry Hooks ────────────────────────────────────────────────────
  telemetry: {
    onRequest:  (e) => logger.debug({ url: e.url, attempt: e.attempt }),
    onResponse: (e) => metrics.record("http.duration", e.durationMs),
    onError:    (e) => { if (e.final) logger.error(e.error); },
  },
});
```

### Individual clients

```typescript
import { MerchantClient, BASE_URLS } from "revolut-sdk/merchant";

const merchant = new MerchantClient({
  apiKey:      "sk_live_...",
  environment: "prod",
  timeoutMs:   15_000,
  // Override base URL completely if needed
  baseURL:     BASE_URLS.merchant.prod,
});
```

---

## 4. Merchant API

### 4.1 Orders

Orders are the core Merchant API resource. They represent a payment session.

```typescript
const m = sdk.merchant;

// ── Create ──────────────────────────────────────────────────────────────────

const order = await m.createOrder({
  amount:      Amount(2500),   // £25.00
  currency:    Currency("GBP"),
  description: "Order #1234",

  // Optional: manual capture (authorise now, capture later)
  capture_mode:        "manual",
  authorisation_type:  "pre_authorisation",  // hotel-style holds

  // Optional: attach to an existing customer
  customer_id: "cust_...",

  // Optional: inline customer data (creates a guest record)
  customer: { email: "alice@example.com", phone: "+447700900000" },

  // Optional: send back to your site after checkout
  redirect_url: "https://example.com/order-complete",

  // Optional: line items (required for some MCCs)
  line_items: [
    { name: "Widget Pro", total_amount: Amount(2500), quantity: { value: 1 } },
  ],

  // Optional: airline / lodging / car-rental data
  industry_data: {
    airline: {
      legs: [{
        sequence:              1,
        departure_airport_code: "LHR",
        arrival_airport_code:   "JFK",
        flight_number:          "BA117",
        travel_date:            "2025-06-01",
        airline_name:           "British Airways",
        airline_code:           "BA",
      }],
      pnr: "ABC123",
    },
  },

  // Optional: up to 20 arbitrary key-value pairs
  metadata: { internal_order_id: "ORD-9876" },
});

console.log(order.id);            // "ord_..."
console.log(order.state);         // "pending"
console.log(order.checkout_url);  // hosted checkout URL
console.log(order.token);         // Revolut Checkout Widget token

// ── Retrieve ──────────────────────────────────────────────────────────────

const fetched = await m.getOrder("ord_..." as UUID);

// ── List ──────────────────────────────────────────────────────────────────

const page = await m.listOrders({
  state:    "completed",
  dateFrom: "2025-01-01",
  dateTo:   "2025-01-31",
  page:     { limit: 50 },
});

// ── Update (before capture) ───────────────────────────────────────────────

await m.updateOrder("ord_..." as UUID, {
  description:   "Updated description",
  metadata:      { crm_ref: "CRM-555" },
  // Extend the auto-cancel window (ISO 8601, max P7D)
  auto_cancel_period: "P3D",
});

// ── Capture (manual-capture orders) ──────────────────────────────────────

// Full capture
await m.captureOrder("ord_..." as UUID);

// Partial capture
await m.captureOrder("ord_..." as UUID, {
  amount:   Amount(1500),
  currency: Currency("GBP"),
});

// ── Cancel ────────────────────────────────────────────────────────────────

await m.cancelOrder("ord_..." as UUID);

// ── Refund ────────────────────────────────────────────────────────────────

// Full refund
await m.refundOrder("ord_..." as UUID);

// Partial refund
await m.refundOrder("ord_..." as UUID, {
  amount:      Amount(1000),
  currency:    Currency("GBP"),
  description: "Partial refund — item returned",
});

// ── Incremental authorisation (pre-auth orders only) ─────────────────────
// Increase the authorised amount WITHOUT a new customer 3DS challenge.
// `amount` is the NEW TOTAL — not a delta.

await m.incrementalAuthorise("ord_..." as UUID, {
  amount:    Amount(35000),   // new total: £350.00
  currency:  Currency("GBP"),
  reference: "minibar_charges",
});
// Fires webhook: ORDER_INCREMENTAL_AUTHORISATION_AUTHORISED

// ── Pay via saved payment method (MIT — Merchant-Initiated Transaction) ──

await m.payViaSavedMethod("ord_..." as UUID, {
  saved_payment_method_id: "spm_..." as UUID,
});
```

### 4.2 Payments

```typescript
// Get full payment lifecycle (state machine, failure reasons, ARN, fingerprint)
const details = await m.getPaymentDetails("pay_..." as UUID);

console.log(details.state);           // "captured" | "declined" | ...
console.log(details.failure_reason);  // "insufficient_funds" | "expired_card" | ...
console.log(details.fingerprint);     // 44-char unique ID — use for duplicate detection
console.log(details.acquirer_reference_number); // ARN for refund tracking

// List all payment attempts for an order
const payments = await m.listOrderPayments("ord_..." as UUID);
```

### 4.3 Customers & Saved Methods

```typescript
// ── Create ────────────────────────────────────────────────────────────────

const customer = await m.createCustomer({
  full_name: "Alice Smith",
  email:     "alice@example.com",
  phone:     "+447700900000",
});

// ── Retrieve / Update / Delete ────────────────────────────────────────────

const c = await m.getCustomer("cust_..." as UUID);
await m.updateCustomer("cust_..." as UUID, { email: "new@example.com" });
await m.deleteCustomer("cust_..." as UUID);

// ── List ──────────────────────────────────────────────────────────────────

const page = await m.listCustomers({ limit: 100 });

// ── Saved payment methods ─────────────────────────────────────────────────

const methods = await m.listSavedPaymentMethods("cust_..." as UUID);
// methods[0].type  → "card"
// methods[0].card  → { card_brand, card_last_four, expiry_month, expiry_year }

// Remove a saved method
await m.deleteSavedPaymentMethod("cust_..." as UUID, "spm_..." as UUID);
```

### 4.4 Subscription Plans

Revolut uses a **Variations + Phases** model. A Plan has one or more named Variations (e.g. "Monthly", "Yearly"), and each Variation has ordered Phases (e.g. "Trial → Paid").

```typescript
// ── Create a plan ─────────────────────────────────────────────────────────

const plan = await m.createPlan({
  name:           "Pro Plan",
  trial_duration: "P14D",   // 14-day free trial (ISO 8601 — days only)
  variations: [
    {
      name: "Monthly",
      phases: [
        {
          ordinal:        1,
          cycle_duration: "P1M",      // 1 month
          cycle_count:    1,          // only 1 cycle in this phase (the trial)
          amount:         Amount(0),
          currency:       Currency("GBP"),
        },
        {
          ordinal:        2,
          cycle_duration: "P1M",      // repeats indefinitely (no cycle_count)
          amount:         Amount(999),
          currency:       Currency("GBP"),
        },
      ],
    },
    {
      name: "Yearly",
      phases: [
        {
          ordinal:        1,
          cycle_duration: "P1Y",
          amount:         Amount(9900),
          currency:       Currency("GBP"),
        },
      ],
    },
  ],
});

const planId = plan.id;                           // "plan_..."
const monthlyVarId = plan.variations[0]?.id;     // "var_..."
const yearlyVarId  = plan.variations[1]?.id;     // "var_..."

// ── Retrieve / List ───────────────────────────────────────────────────────

const fetched = await m.getPlan("plan_..." as UUID);
const plans   = await m.listPlans({ limit: 20 });
```

### 4.5 Subscriptions & Billing Cycles

```typescript
// ── Create a subscription ─────────────────────────────────────────────────
// Subscription targets a specific plan variation (not the plan itself).

const sub = await m.createSubscription({
  plan_variation_id: monthlyVarId as UUID,
  customer_id:       customer.id,

  // Optional: redirect URL for the hosted setup payment page
  // When set, sub.setup_order_id contains an order you can retrieve for checkout_url
  setup_order_redirect_url: "https://example.com/subscription/success",

  // Optional: override the plan's default trial
  trial_duration: "P7D",

  // Optional: your own reference
  external_reference: "sub_my_system_id_123",
});

// If setup_order_redirect_url was set:
if (sub.setup_order_id) {
  const setupOrder = await m.getOrder(sub.setup_order_id);
  // redirect customer to setupOrder.checkout_url
}

// ── Manage ────────────────────────────────────────────────────────────────

await m.updateSubscription("sub_..." as UUID, {
  external_reference: "updated_ref",
});

await m.cancelSubscription("sub_..." as UUID);

const subs = await m.listSubscriptions({
  externalReference: "sub_my_system_id_123",
});

// ── Billing Cycles ────────────────────────────────────────────────────────
// A billing cycle is created for each charge period.

const cycles = await m.listBillingCycles("sub_..." as UUID, { limit: 12 });
// cycles[0].state     → "completed" | "pending" | ...
// cycles[0].amount    → Amount(999)
// cycles[0].start_date → "2025-01-01"

const cycle = await m.getBillingCycle("sub_..." as UUID, "cycle_..." as UUID);
```

### 4.6 Payouts

```typescript
const payout = await m.getPayout("po_..." as UUID);

const page = await m.listPayouts({
  state:    "completed",
  dateFrom: "2025-01-01",
  dateTo:   "2025-01-31",
  page:     { limit: 50 },
});
```

### 4.7 Disputes

```typescript
// ── Retrieve ──────────────────────────────────────────────────────────────

const dispute = await m.getDispute("dis_..." as UUID);
// dispute.state    → "new" | "review_needed" | "under_review" | "won" | "lost"
// dispute.due_date → deadline to respond
// dispute.reason   → chargeback reason code

const page = await m.listDisputes({
  state:    "review_needed",
  dateFrom: "2025-01-01",
  page:     { limit: 20 },
});

// ── Accept (concede without fighting) ────────────────────────────────────

await m.acceptDispute("dis_..." as UUID);

// ── Challenge (fight the dispute) ────────────────────────────────────────

// Step 1: Upload evidence files (PDF, PNG, or JPEG only)
const evidence1 = await m.uploadDisputeEvidence("dis_..." as UUID, {
  file_name:    "invoice.pdf",
  content_type: "application/pdf",
});

const evidence2 = await m.uploadDisputeEvidence("dis_..." as UUID, {
  file_name:    "delivery_proof.png",
  content_type: "image/png",
});

// Step 2: Submit the challenge with the evidence IDs
await m.challengeDispute("dis_..." as UUID, {
  evidence_ids: [evidence1.id, evidence2.id],
});
// Fires webhook: DISPUTE_UNDER_REVIEW
```

### 4.8 Report Runs

Reports are generated asynchronously. Poll `getReportRun` until `state === "ready"`.

```typescript
// Trigger generation
const run = await m.createReportRun({
  type:      "transactions",    // "transactions" | "payouts" | "orders"
  date_from: "2025-01-01",
  date_to:   "2025-01-31",
  currency:  Currency("GBP"),  // optional — all currencies if omitted
});

// Poll until ready (production: use a queue/scheduler instead of a loop)
let result = await m.getReportRun(run.id);
while (result.state === "pending") {
  await new Promise((r) => setTimeout(r, 5000));
  result = await m.getReportRun(run.id);
}

if (result.state === "ready") {
  console.log(result.download_url); // signed S3 URL — download within 24 hrs
}

const allRuns = await m.listReportRuns({ limit: 10 });
```

### 4.9 Webhooks

```typescript
// ── Register ──────────────────────────────────────────────────────────────

const wh = await m.createWebhook({
  url:    "https://your-app.com/webhooks/revolut",
  events: [
    "ORDER_COMPLETED",
    "ORDER_AUTHORISED",
    "DISPUTE_ACTION_REQUIRED",
    "SUBSCRIPTION_INITIATED",
    "PAYOUT_COMPLETED",
  ],
});

// ── Manage ────────────────────────────────────────────────────────────────

await m.updateWebhook(wh.id, {
  events: ["ORDER_COMPLETED", "ORDER_FAILED"],
  active: true,
});

await m.deleteWebhook(wh.id);

const all = await m.listWebhooks();

// ── Rotate signing secret ─────────────────────────────────────────────────
// The new secret takes effect immediately. Update your server before rotating.

const rotated = await m.rotateWebhookSecret(wh.id);
console.log(rotated.signing_secret); // "wsk_..."  — store this securely
```

### 4.10 Locations

```typescript
const loc = await m.createLocation({
  name:    "London HQ",
  type:    "office",
  address: { street_line1: "1 Revolut Way", city: "London", country_code: "GB" },
});

await m.getLocation(loc.id);
const page = await m.listLocations({ limit: 20 });
```

### 4.11 Fast Checkout Address Validation

Revolut Pay Fast Checkout can call your endpoint in real-time to validate a customer's shipping address before they confirm payment.

```typescript
// Register your validation endpoint
const syncWh = await m.registerAddressValidation({
  url:         "https://your-app.com/validate-shipping",
  location_id: loc.id,  // optional — scope to a specific location
});

// Store syncWh.signing_key — use it to verify the Revolut-Pay-Payload-Signature
// header on incoming POST requests from Revolut Pay.
console.log(syncWh.signing_key);  // "swsk_..."

// List all registered synchronous webhooks
const all = await m.listSynchronousWebhooks();
```

Your validation endpoint must respond within **2 seconds** with:
```json
{ "valid": true }
// or
{ "valid": false, "error_message": "We don't ship to PO boxes" }
```

---

## 5. Business API

### 5.1 Accounts

```typescript
const b = sdk.business;

// All accounts and balances
const accounts = await b.listAccounts();
// accounts[0].currency → "GBP"
// accounts[0].balance  → 15000.50 (in major units for Business API)

// Single account
const gbp = await b.getAccount("acc_..." as UUID);

// Bank details (IBAN, sort code, BIC — for receiving external transfers)
const details = await b.getAccountBankDetails("acc_..." as UUID);
// details[0].iban       → "GB29NWBK60161331926819"
// details[0].sort_code  → "608371"
// details[0].bic        → "NWBKGB2L"
```

### 5.2 Cards

```typescript
const cards = await b.listCards();
const card  = await b.getCard("card_..." as UUID);

// Temporarily block a card (transactions will be declined)
await b.freezeCard("card_..." as UUID);

// Re-enable a frozen card
await b.unfreezeCard("card_..." as UUID);

// Permanently cancel — IRREVERSIBLE
await b.terminateCard("card_..." as UUID);
```

### 5.3 Counterparties

```typescript
// ── Add a recipient ───────────────────────────────────────────────────────

// Revolut user (by email or phone)
const revolut = await b.addCounterparty({
  profile_type: "personal",
  name:         "Bob Jones",
  email:        "bob@example.com",
});

// External bank account
const external = await b.addCounterparty({
  profile_type: "business",
  name:         "Acme Ltd",
  bank_account: {
    account_no: "12345678",
    sort_code:  "608371",
    currency:   "GBP",
  },
});

// SEPA via IBAN
const sepa = await b.addCounterparty({
  profile_type: "business",
  name:         "Berlin GmbH",
  bank_account: {
    iban: "DE89370400440532013000",
    bic:  "COBADEFFXXX",
  },
});

// ── Manage ────────────────────────────────────────────────────────────────

await b.getCounterparty("cp_..." as UUID);
await b.deleteCounterparty("cp_..." as UUID);

const all = await b.listCounterparties({ name: "Acme" });

// ── UK Confirmation of Payee (CoP) ────────────────────────────────────────
// Verify the account holder's name before sending money.

const result = await b.validatePayeeName({
  name:       "Acme Ltd",
  account_no: "12345678",
  sort_code:  "608371",
});

if (!result.matched) {
  console.warn(`Name mismatch. Bank says: ${result.name}`);
}
```

### 5.4 Foreign Exchange

```typescript
// Live mid-market rate
const rate = await b.getExchangeRate(
  Currency("USD"),
  Currency("GBP")
);
console.log(rate.rate); // e.g. 0.7912

// Convert between your own Revolut accounts
const tx = await b.exchange({
  request_id: crypto.randomUUID(), // idempotency key
  from: { account_id: "acc_usd" as UUID, currency: Currency("USD"), amount: 1000 },
  to:   { account_id: "acc_gbp" as UUID, currency: Currency("GBP") },
  // Specify either from.amount OR to.amount — Revolut calculates the other
});
```

### 5.5 Transactions

```typescript
// List with filters
const txs = await b.listTransactions({
  dateFrom:       "2025-01-01",
  dateTo:         "2025-01-31",
  accountId:      "acc_gbp" as UUID,
  counterpartyId: "cp_..." as UUID,
  type:           "transfer",
  limit:          100,
});

// Single transaction
const tx = await b.getTransaction("tx_..." as UUID);

// By your own request_id (idempotency lookup)
const byRef = await b.getTransactionByRequestId("my-uuid-ref");

// Cancel a future-dated (scheduled) payment before execution
await b.cancelScheduledTransaction("tx_..." as UUID);
```

### 5.6 Transfers & Payments

All payment operations require a `request_id` — use a UUID v4 as an idempotency key. Duplicate calls with the same `request_id` return the original transaction.

```typescript
// ── Internal transfer (between your own Revolut accounts) ─────────────────

const internalTx = await b.createTransfer({
  request_id:        crypto.randomUUID(),
  source_account_id: "acc_gbp_1" as UUID,
  target_account_id: "acc_gbp_2" as UUID,
  amount:            500,
  currency:          Currency("GBP"),
  description:       "Move to reserve account",
});

// ── External payment (to a counterparty bank account) ─────────────────────

const payment = await b.createPayment({
  request_id:   crypto.randomUUID(),
  account_id:   "acc_gbp" as UUID,
  counterparty: "cp_..." as UUID,
  amount:       1000,
  currency:     Currency("GBP"),
  reference:    "Invoice #INV-2025-001",
  // Optional: schedule for a future date (YYYY-MM-DD)
  scheduled_for: "2025-02-01",
  // Optional: who bears SWIFT fees ("shared" or "debtor")
  charge_bearer: "shared",
});

// ── Card transfer (send to a debit/credit card) ───────────────────────────

const cardTx = await b.createCardTransfer({
  request_id:      crypto.randomUUID(),
  counterparty_id: "cp_..." as UUID,
  card_id:         "cp_card_..." as UUID,
  amount:          250,
  currency:        Currency("GBP"),
});
```

### 5.7 Payment Drafts

Drafts are approval-queued or scheduled payments awaiting authorisation.

```typescript
const draft = await b.createPaymentDraft({
  title:        "January supplier run",
  schedule_for: "2025-02-01",   // optional future date
  payments: [
    {
      account_id:   "acc_gbp" as UUID,
      counterparty: "cp_1" as UUID,
      currency:     Currency("GBP"),
      amount:       500,
      reference:    "Invoice A",
    },
    {
      account_id:   "acc_gbp" as UUID,
      counterparty: "cp_2" as UUID,
      currency:     Currency("GBP"),
      amount:       750,
      reference:    "Invoice B",
    },
  ],
});

await b.getPaymentDraft(draft.id);
await b.deletePaymentDraft(draft.id);      // cancel before execution
const all = await b.listPaymentDrafts();   // optionally filter by state
```

### 5.8 Payout Links

Send money without knowing the recipient's bank details — they claim it via a link.

```typescript
const link = await b.createPayoutLink({
  counterparty_name: "Freelancer Name",
  amount:            50000,   // £500.00
  currency:          Currency("GBP"),
  reference:         "Freelance payment March 2025",
  expiration_date:   "2025-03-31",
  save_counterparty: true,    // save their details after they claim
});

console.log(link.url);   // share this with the recipient

await b.getPayoutLink(link.id);
await b.cancelPayoutLink(link.id);

const links = await b.listPayoutLinks("active");
```

### 5.9 Team Members

```typescript
const members = await b.listTeamMembers();
const member  = await b.getTeamMember("mem_..." as UUID);

// Invite a new team member
const invited = await b.inviteTeamMember({
  email: "colleague@example.com",
  role:  "admin",   // "owner" | "admin" | "member" | "viewer"
});

// Change their role
await b.updateTeamMember("mem_..." as UUID, { role: "viewer" });
```

### 5.10 Webhooks v2

Business API v2 webhooks are the current recommended version.

```typescript
// ── Create ────────────────────────────────────────────────────────────────

const wh = await b.createWebhookV2({
  url:    "https://your-app.com/business-events",
  events: [
    "TransactionCreated",
    "TransactionStateChanged",
    "PayoutLinkCreated",
    "PayoutLinkStateChanged",
  ],
});

// ── Rotate signing secret ─────────────────────────────────────────────────
// ExpirationPeriod keeps the OLD secret valid during transition (max P7D).

const rotated = await b.rotateWebhookSigningSecretV2(wh.id, {
  expiration_period: "P1D",   // old secret valid for 1 day
});
console.log(rotated.signing_secret);   // store securely

// ── Retrieve failed delivery events ──────────────────────────────────────
// Events that failed to deliver — max 21 days old, sorted newest first.

const failed = await b.getFailedWebhookEvents(wh.id, {
  limit:         50,
  createdBefore: "2025-01-15T00:00:00Z",   // for pagination
});

// ── Update / Delete / List ────────────────────────────────────────────────

await b.updateWebhookV2(wh.id, { url: "https://new-url.com/events" });
await b.deleteWebhookV2(wh.id);
const all = await b.listWebhooksV2();
```

---

## 6. Open Banking API

### 6.1 AISP — Account Information

```typescript
const ob = sdk.openBanking;

// All consented accounts
const accounts = await ob.getAccounts();
// accounts[0].AccountId       → "acc_ob_..."
// accounts[0].Currency        → "GBP"
// accounts[0].AccountType     → "Personal"
// accounts[0].AccountSubType  → "CurrentAccount"

// Single account
const account = await ob.getAccount("acc_ob_...");

// Balances
const balances = await ob.getAccountBalances("acc_ob_...");
// balances[0].Amount.Amount → "1500.00"
// balances[0].Type          → "InterimAvailable"

// Beneficiaries (saved payees)
const bens = await ob.getAccountBeneficiaries("acc_ob_...");

// Direct debits
const dds = await ob.getAccountDirectDebits("acc_ob_...");

// Standing orders
const sos = await ob.getAccountStandingOrders("acc_ob_...");

// Transactions (optionally filtered by date)
const txs = await ob.getAccountTransactions(
  "acc_ob_...",
  "2025-01-01T00:00:00Z",   // fromBookingDateTime
  "2025-01-31T23:59:59Z"    // toBookingDateTime
);
```

### 6.2 PISP — Payment Initiation

The PISP flow is always: **Create Consent → Redirect customer to authorise → Initiate Payment**.

```typescript
// ── Domestic Payment ──────────────────────────────────────────────────────

const consent = await ob.createDomesticPaymentConsent({
  Data: {
    Initiation: {
      InstructionIdentification: "instr-001",
      EndToEndIdentification:    "e2e-001",
      InstructedAmount: { Amount: "100.00", Currency: "GBP" },
      CreditorAccount: {
        SchemeName:     "SortCodeAccountNumber",
        Identification: "60837112345678",
        Name:           "Alice Smith",
      },
      RemittanceInformation: { Reference: "Invoice 001" },
    },
  },
  Risk: { PaymentContextCode: "TransferToThirdParty" },
});

// Redirect customer to authorise: consent.ConsentId → build auth URL
// After authorisation, initiate:

const payment = await ob.initiateDomesticPayment({
  Data: {
    ConsentId:  consent.ConsentId,
    Initiation: { /* same as consent */ } as never,
  },
  Risk: {},
});

console.log(payment.Data.DomesticPaymentId);  // "dpay_..."
console.log(payment.Data.Status);             // "AcceptedSettlementInProcess"

// Check status
const status = await ob.getDomesticPayment(payment.Data.DomesticPaymentId);

// ── Domestic Scheduled Payment ────────────────────────────────────────────

const schedConsent = await ob.createDomesticScheduledPaymentConsent({
  Data: {
    Initiation: {
      RequestedExecutionDateTime: "2025-02-15T09:00:00Z",
      InstructionIdentification:  "sched-001",
      EndToEndIdentification:     "e2e-sched-001",
      InstructedAmount: { Amount: "250.00", Currency: "GBP" },
      CreditorAccount: {
        SchemeName:     "SortCodeAccountNumber",
        Identification: "60837112345678",
        Name:           "Alice Smith",
      },
    },
  },
  Risk: {},
});

// ── Domestic Standing Order ───────────────────────────────────────────────

const soConsent = await ob.createDomesticStandingOrderConsent({
  Data: {
    Initiation: {
      Frequency:            "EvryDay",
      Reference:            "Monthly rent",
      FirstPaymentDateTime: "2025-02-01T00:00:00Z",
      FirstPaymentAmount:   { Amount: "1500.00", Currency: "GBP" },
      CreditorAccount: {
        SchemeName:     "SortCodeAccountNumber",
        Identification: "60837112345678",
        Name:           "Landlord Co",
      },
    },
  },
  Risk: {},
});

// ── International Payment ─────────────────────────────────────────────────

const intlConsent = await ob.createInternationalPaymentConsent({
  Data: {
    Initiation: {
      InstructionIdentification: "intl-001",
      EndToEndIdentification:    "e2e-intl-001",
      CurrencyOfTransfer:        "EUR",
      InstructedAmount: { Amount: "500.00", Currency: "GBP" },
      CreditorAccount: {
        SchemeName:     "IBAN",
        Identification: "DE89370400440532013000",
        Name:           "Berlin GmbH",
      },
      CreditorAgent: {
        SchemeName:     "BICFI",
        Identification: "COBADEFFXXX",
      },
    },
  },
  Risk: {},
});
```

---

## 7. Crypto Ramp API

```typescript
const ramp = sdk.cryptoRamp;

// ── Configuration ─────────────────────────────────────────────────────────

const config = await ramp.getConfig();
// config.fiat_currencies  → ["GBP", "EUR", "USD", ...]
// config.crypto_tokens    → ["BTC", "ETH", "SOL", ...]
// config.supported_regions → ["GB", "DE", ...]

// ── Get a live quote ──────────────────────────────────────────────────────

const quote = await ramp.getQuote({
  fiat:   "GBP",
  crypto: "ETH",
  amount: "100",           // £100 worth of ETH
  region: "GB",
});
// quote.crypto_amount → "0.03521"
// quote.rate          → "2840.00"
// quote.fee           → "1.50"
// quote.expires_at    → "2025-01-01T12:01:00Z"

// ── Generate a buy redirect URL ───────────────────────────────────────────
// Redirect your customer to this URL to complete the purchase on Revolut.

const redirect = await ramp.getBuyRedirectURL({
  fiat:               "GBP",
  crypto:             "ETH",
  walletAddress:      "0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe",
  amount:             "100",
  region:             "GB",
  partnerRedirectURL: "https://your-app.com/crypto/success",
  orderId:            "my-internal-order-id",
});
// redirect.url → "https://revolut.com/crypto-ramp/buy?..."

// ── Track orders ──────────────────────────────────────────────────────────

const order = await ramp.getOrder("ramp_ord_...", "0xde0B2956...");
// order.state          → "completed"
// order.crypto_amount  → "0.03521"
// order.tx_hash        → "0xabc..."  (on-chain tx hash when complete)

const orders = await ramp.listOrders({
  start: "2025-01-01",
  end:   "2025-01-31",
  limit: 100,
});

// ── Webhooks ──────────────────────────────────────────────────────────────

const wh = await ramp.createWebhook({
  url:    "https://your-app.com/ramp-events",
  events: ["ORDER_COMPLETED", "ORDER_FAILED"],
});

// Verify incoming webhook signatures
ramp.withWebhookSecret("your-webhook-secret");

const payload = ramp.parseWebhookPayload(rawBody, sigHeader);
// payload.event    → "ORDER_COMPLETED"
// payload.order_id → "ramp_ord_..."
// payload.order    → RampOrder (full object)
```

---

## 8. Crypto Exchange API

```typescript
const cx = sdk.cryptoExchange;

// ── Account ───────────────────────────────────────────────────────────────

const balances = await cx.getBalances();
// balances[0].currency  → "BTC"
// balances[0].available → "0.5000"
// balances[0].reserved  → "0.0100"   (in open orders)

// ── Place orders ──────────────────────────────────────────────────────────

// Market order — execute immediately at best price
const market = await cx.createOrder({
  symbol: "BTC/USD",
  side:   "buy",
  type:   "market",
  market: { base_size: "0.001" },   // buy 0.001 BTC
  // OR spend a fixed USD amount:
  // market: { quote_size: "50" }   // spend $50
});

// Limit order — set your price
const limit = await cx.createOrder({
  symbol: "ETH/USD",
  side:   "sell",
  type:   "limit",
  limit:  { base_size: "1.0", price: "3500.00" },
  client_order_id: crypto.randomUUID(),  // your idempotency key
});

// Take-Profit / Stop-Loss order
const tpsl = await cx.createOrder({
  symbol: "BTC/USD",
  side:   "sell",
  type:   "tpsl",
  tpsl: {
    base_size:        "0.1",
    take_profit_price: "70000.00",
    stop_loss_price:   "45000.00",
  },
});

// ── Manage orders ─────────────────────────────────────────────────────────

const active  = await cx.getActiveOrders();
const history = await cx.getOrderHistory({
  symbol: "BTC/USD",
  state:  "filled",
  limit:  50,
});

await cx.cancelOrder("ord_cx_...");
await cx.cancelAllOrders();            // cancel all open orders
await cx.cancelAllOrders("ETH/USD");   // cancel for specific symbol only

// ── Trades (fills) ────────────────────────────────────────────────────────

// Public — all trades on the exchange
const publicTrades = await cx.getPublicTrades("BTC/USD", 100);

// Private — your own executed trades
const myTrades = await cx.getMyTrades("BTC/USD", 50);

// ── Market data ───────────────────────────────────────────────────────────

// Order book (live bids & asks)
const book = await cx.getOrderBook("BTC/USD", 10);  // top 10 levels
// book.bids[0] → { price: "49990.00", size: "2.5" }
// book.asks[0] → { price: "50010.00", size: "1.2" }

// Single ticker
const ticker = await cx.getTicker("ETH/USD");
// ticker.price     → "3000.00"
// ticker.change_24h → "+2.50"
// ticker.volume_24h → "12345.67"

// All tickers
const allTickers = await cx.getAllTickers();

// All available trading pairs and their constraints
const symbols = await cx.listSymbols();
// symbols[0].name          → "BTC/USD"
// symbols[0].min_base_size → "0.00001"
// symbols[0].tick_size     → "0.01"
```

---

## 9. Webhooks & Signature Verification

### WebhookHandler (recommended)

```typescript
import { WebhookHandler, computeWebhookSignature } from "revolut-sdk/webhook";

const handler = new WebhookHandler({
  secret:            "wsk_...",     // from Revolut dashboard or rotateWebhookSecret()
  validateTimestamp: true,          // reject events older than 5 minutes (anti-replay)
  onError: (err, rawBody) => {
    logger.error({ err }, "webhook dispatch error");
    // Re-throw to return HTTP 500 to Revolut (triggering a retry)
    throw err;
  },
});

// Register strongly-typed event handlers — payload type is automatically narrowed
handler
  .on("ORDER_COMPLETED", async (evt) => {
    // evt.order_id is typed as string
    await fulfillOrder(evt.order_id!);
  })
  .on("ORDER_AUTHORISED", async (evt) => {
    await notifyDashboard(evt.order_id!);
  })
  .on("ORDER_FAILED", async (evt) => {
    await notifyCustomer(evt.order_id!);
  })
  .on("ORDER_INCREMENTAL_AUTHORISATION_AUTHORISED", async (evt) => {
    await updateOrderTotal(evt.order_id!, evt.incremental_authorisation_reference);
  })
  .on("DISPUTE_ACTION_REQUIRED", async (evt) => {
    await alertDisputeTeam(evt.dispute_id!);
  })
  .on("SUBSCRIPTION_INITIATED", async (evt) => {
    await activateSubscription(evt.subscription_id!);
  })
  .on("SUBSCRIPTION_CANCELLED", async (evt) => {
    await deactivateSubscription(evt.subscription_id!);
  })
  .on("PAYOUT_COMPLETED", async (evt) => {
    await reconcilePayout(evt.payout_id!);
  });

// Remove a handler
handler.off("ORDER_COMPLETED");

// Call from your HTTP server
await handler.processRequest(rawBody, headers);
// rawBody: string | Uint8Array  (the raw unmodified request body)
// headers: Record<string, string | string[] | undefined>
```

### Revolut Signature Format

```
Signed payload: "v1.{Revolut-Request-Timestamp}.{rawBody}"
Signature:      HMAC-SHA256(signingSecret, signedPayload)
Header:         Revolut-Signature: v1={lowercase-hex}
Timestamp:      Revolut-Request-Timestamp: {unix-ms}
Replay window:  5 minutes (enforced when validateTimestamp: true)
```

### Standalone verification (any framework)

```typescript
import { verifyWebhookSignature, computeWebhookSignature } from "revolut-sdk/webhook";

// Verify (async — uses Web Crypto API, works everywhere)
const isValid = await verifyWebhookSignature({
  secret:    "wsk_...",
  timestamp: req.headers["revolut-request-timestamp"] as string,
  body:      rawBody,
  sigHeader: req.headers["revolut-signature"] as string,
});

if (!isValid) {
  return res.status(401).json({ error: "Invalid signature" });
}

// Generate for testing
const sig = await computeWebhookSignature({
  secret:    "wsk_test",
  timestamp: String(Date.now()),
  body:      JSON.stringify({ event: "ORDER_COMPLETED", order_id: "ord_1" }),
});
// sig → "v1=a1b2c3d4..."
```

---

## 10. Error Handling

```typescript
import {
  isAPIError,
  isValidationError,
  isNetworkError,
  isRevolutError,
  APIError,
  ValidationError,
} from "revolut-sdk";

async function safeCreateOrder() {
  try {
    return await sdk.merchant.createOrder({
      amount:   Amount(1000),
      currency: Currency("GBP"),
    });
  } catch (err) {

    // ── Caught before HTTP — bad input ────────────────────────────────────
    if (isValidationError(err)) {
      console.error(`Invalid field "${err.field}": ${err.message}`);
      // err.field → "amount" | "currency" | ...
      return null;
    }

    // ── HTTP error from Revolut servers ───────────────────────────────────
    if (isAPIError(err)) {
      // Predicates
      if (err.isNotFound)     { /* 404 */ }
      if (err.isRateLimited)  { /* 429 — back off and retry */ }
      if (err.isUnauthorized) { /* 401 — check API key */ }
      if (err.isServerError)  { /* 5xx — transient, SDK will retry */ }
      if (err.isRetryable)    { /* 429 or 5xx */ }

      console.error(`Revolut API [${err.statusCode}/${err.code}]: ${err.message}`);
      console.error(`request_id: ${err.requestId}`); // share with Revolut support
      console.error(`details:`, err.details);
      return null;
    }

    // ── Network / transport failure ────────────────────────────────────────
    if (isNetworkError(err)) {
      console.error(`Network error: ${err.message}`, err.cause);
      return null;
    }

    // ── Any SDK error ──────────────────────────────────────────────────────
    if (isRevolutError(err)) {
      console.error(`SDK error [${err.code}]: ${err.message}`);
      return null;
    }

    throw err; // unexpected — re-throw
  }
}
```

### Error class hierarchy

```
RevolutError (abstract)
├── APIError           — non-2xx HTTP response
│   Properties: statusCode, code, requestId, details
│   Getters:    isNotFound, isRateLimited, isUnauthorized, isServerError, isRetryable
├── ValidationError    — bad input caught before HTTP call
│   Properties: field
├── ConfigurationError — missing/invalid SDK config
├── NetworkError       — transport-level failure (timeout, DNS, etc.)
│   Properties: cause
└── WebhookError       — invalid signature or malformed payload
```

---

## 11. Pagination

All list endpoints return `PageResponse<T>`:

```typescript
import { hasNextPage } from "revolut-sdk";

// ── Manual cursor pagination ──────────────────────────────────────────────

let cursor: string | undefined;

do {
  const page = await sdk.merchant.listOrders({
    state: "completed",
    page:  { limit: 100, cursor },
  });

  for (const order of page.items) {
    await processOrder(order);
  }

  cursor = page.next_cursor;
} while (hasNextPage(page));

// ── Collect all items ─────────────────────────────────────────────────────

async function fetchAll<T>(
  fetcher: (cursor?: string) => Promise<{ items: T[]; next_cursor?: string; has_more: boolean }>
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetcher(cursor);
    all.push(...page.items);
    cursor = page.next_cursor;
  } while (hasNextPage(page));
  return all;
}

const allOrders = await fetchAll((cursor) =>
  sdk.merchant.listOrders({ page: { limit: 100, cursor } })
);
```

---

## 12. Retry & Rate Limiting

### Retry policy

The SDK retries **5xx errors** and **429 Too Many Requests** using exponential backoff with jitter. 4xx errors (except 429) are **not** retried — they indicate a problem with the request.

```typescript
const sdk = new RevolutSDK({
  merchantKey: "sk_live_...",
  retry: {
    maxAttempts:    5,          // 1 = no retry
    initialDelayMs: 300,
    maxDelayMs:     60_000,
    multiplier:     2,
    jitter:         0.5,        // adds up to ±50% random noise to each delay
  },
});

// Disable retry for a specific client
import { withNoRetry } from "revolut-sdk";
// (pass retry: { maxAttempts: 1 } in ClientConfig)
```

**Backoff formula:** `delay = min(initialDelayMs × multiplier^(attempt-1), maxDelayMs) × (1 + random() × jitter)`

### Client-side rate limiting

The token-bucket rate limiter queues requests that would exceed the configured rate. This prevents unnecessary 429 responses.

```typescript
const sdk = new RevolutSDK({
  merchantKey: "sk_live_...",
  rateLimit: {
    requestsPerSecond: 50,   // sustained rate
    burst:             100,  // allows short bursts up to 100 req
  },
});
```

---

## 13. Telemetry & Observability

```typescript
import type { RequestEvent, ResponseEvent, ErrorEvent } from "revolut-sdk";

const sdk = new RevolutSDK({
  merchantKey: "sk_live_...",
  telemetry: {
    onRequest: (e: RequestEvent) => {
      // e.method   → "GET" | "POST" | ...
      // e.url      → full URL
      // e.attempt  → 1 (first try), 2 (first retry), ...
      logger.debug({ method: e.method, url: e.url, attempt: e.attempt }, "HTTP →");
    },

    onResponse: (e: ResponseEvent) => {
      // e.statusCode  → 200 | 404 | 429 | ...
      // e.durationMs  → wall-clock time for this attempt
      // e.attempt     → which attempt this was
      // e.requestId   → Revolut's x-request-id header (for support)
      metrics.histogram("revolut.http.duration_ms", e.durationMs, {
        status: String(e.statusCode),
      });
    },

    onError: (e: ErrorEvent) => {
      // e.error     → the thrown error object
      // e.attempt   → which attempt just failed
      // e.final     → true when no more retries will be attempted
      // e.durationMs → duration of the failed attempt
      if (e.final) {
        logger.error({ err: e.error, attempt: e.attempt }, "Revolut request failed");
      }
    },
  },
});
```

---

## 14. TypeScript Features

### Branded primitives

Prevent accidental type confusion at compile time:

```typescript
import { Currency, Amount, UUID, ISODuration } from "revolut-sdk";

// ✅ Correct — use the helper functions to create branded values
const amount   = Amount(1000);         // Amount (not just number)
const currency = Currency("GBP");      // Currency (not just string)
const id       = UUID("ord_abc-123");  // UUID (not just string)
const duration = ISODuration("P14D");  // ISODuration (not just string)

// ✅ Branded types are assignable where the branded type is expected
const order: { amount: Amount; currency: Currency } = { amount, currency };

// ✅ But plain string/number are NOT assignable — caught at compile time:
// const bad: Amount = 1000;     // ← TS error
// const bad2: Currency = "GBP"; // ← TS error
```

### Discriminated union webhook payloads

Event payload types are narrowed automatically by the event name:

```typescript
handler.on("ORDER_COMPLETED", (evt) => {
  // evt is typed as OrderCompletedPayload
  // evt.order_id is string
});

handler.on("DISPUTE_ACTION_REQUIRED", (evt) => {
  // evt is typed as DisputeEventPayload
  // evt.dispute_id is string | undefined
});

handler.on("SUBSCRIPTION_INITIATED", (evt) => {
  // evt is typed as SubscriptionEventPayload
  // evt.subscription_id is string | undefined
});
```

### Generic pagination

```typescript
import type { PageResponse } from "revolut-sdk";
import type { Order } from "revolut-sdk/merchant";

// The generic parameter gives you typed items
const page: PageResponse<Order> = await sdk.merchant.listOrders();
const order: Order = page.items[0]!;  // typed, not `unknown`
```

### `strictest` TypeScript mode

The package is built with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`. This means:

```typescript
// exactOptionalPropertyTypes — undefined ≠ absent
const req: UpdateOrderRequest = {
  description: undefined,   // ← TS error: use `{}` to omit instead
};
const req2: UpdateOrderRequest = {};  // ✅ correct — field is simply absent

// noUncheckedIndexedAccess — array[0] is T | undefined, not T
const items = page.items;
const first = items[0];          // type: Order | undefined
const safe  = items[0]?.id;     // ✅ correct — use optional chaining
```

---

## 15. Sub-package Imports

Import only what you need for better tree-shaking:

```typescript
// Full SDK + all types from root
import { RevolutSDK, Currency, Amount, APIError, isAPIError } from "revolut-sdk";

// Merchant API only
import { MerchantClient } from "revolut-sdk/merchant";
import type { Order, CreateOrderRequest, Subscription } from "revolut-sdk/merchant";

// Business API only
import { BusinessClient } from "revolut-sdk/business";
import type { Account, Transaction, PayoutLink } from "revolut-sdk/business";

// Open Banking API only
import { OpenBankingClient } from "revolut-sdk/openbanking";
import type { OBAccount, OBTransaction } from "revolut-sdk/openbanking";

// Crypto Ramp API only
import { CryptoRampClient } from "revolut-sdk/cryptoramp";
import type { RampOrder, Quote } from "revolut-sdk/cryptoramp";

// Crypto Exchange API only
import { CryptoExchangeClient } from "revolut-sdk/cryptoexchange";
import type { Order as ExchangeOrder, Ticker } from "revolut-sdk/cryptoexchange";

// Webhook handler only
import { WebhookHandler, verifyWebhookSignature } from "revolut-sdk/webhook";
```

---

## 16. Framework Integration Examples

### Express.js

```typescript
import express from "express";
import { WebhookHandler } from "revolut-sdk/webhook";
import { RevolutSDK, Amount, Currency } from "revolut-sdk";

const app = express();
const sdk = new RevolutSDK({ merchantKey: process.env["REVOLUT_SECRET_KEY"]! });

// ── Create order endpoint ──────────────────────────────────────────────────
app.post("/api/orders", express.json(), async (req, res) => {
  try {
    const order = await sdk.merchant.createOrder({
      amount:   Amount(req.body.amount),
      currency: Currency(req.body.currency),
    });
    res.json({ orderId: order.id, checkoutUrl: order.checkout_url });
  } catch (err) {
    res.status(500).json({ error: "Failed to create order" });
  }
});

// ── Webhook endpoint ──────────────────────────────────────────────────────
const webhookHandler = new WebhookHandler({
  secret:            process.env["REVOLUT_WEBHOOK_SECRET"]!,
  validateTimestamp: true,
});

webhookHandler.on("ORDER_COMPLETED", async (evt) => {
  await fulfillOrder(evt.order_id!);
});

// IMPORTANT: use raw body parser for webhooks — JSON.parse breaks signature verification
app.post(
  "/webhooks/revolut",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      await webhookHandler.processRequest(req.body, req.headers);
      res.sendStatus(200);
    } catch {
      res.sendStatus(401);
    }
  }
);
```

### Fastify

```typescript
import Fastify from "fastify";
import { WebhookHandler } from "revolut-sdk/webhook";

const fastify = Fastify();

const handler = new WebhookHandler({
  secret: process.env["REVOLUT_WEBHOOK_SECRET"]!,
  validateTimestamp: true,
});

handler.on("ORDER_COMPLETED", async (evt) => {
  await fulfillOrder(evt.order_id!);
});

fastify.addContentTypeParser(
  "application/json",
  { parseAs: "buffer" },
  (_req, body, done) => done(null, body)
);

fastify.post("/webhooks/revolut", async (request, reply) => {
  try {
    await handler.processRequest(
      request.body as Buffer,
      request.headers as Record<string, string>
    );
    return reply.status(200).send({ ok: true });
  } catch {
    return reply.status(401).send({ error: "Unauthorized" });
  }
});
```

### Next.js App Router

```typescript
// app/api/webhooks/revolut/route.ts
import { NextRequest, NextResponse } from "next/server";
import { WebhookHandler } from "revolut-sdk/webhook";

const handler = new WebhookHandler({
  secret:            process.env["REVOLUT_WEBHOOK_SECRET"]!,
  validateTimestamp: true,
});

handler.on("ORDER_COMPLETED", async (evt) => {
  await fulfillOrder(evt.order_id!);
});

export async function POST(req: NextRequest) {
  // Read raw bytes — do NOT use req.json() which would break the signature
  const rawBody = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => { headers[key] = value; });

  try {
    await handler.processRequest(rawBody, headers);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
```

### Cloudflare Workers / Edge Runtime

```typescript
import { WebhookHandler, computeHMACAsync } from "revolut-sdk/webhook";

// Use async Web Crypto API — no node:crypto, works on all edge runtimes
const handler = new WebhookHandler({ secret: REVOLUT_WEBHOOK_SECRET });

handler.on("ORDER_COMPLETED", async (evt) => {
  // Call your Worker KV, D1, or Queue here
  await env.ORDERS_QUEUE.send({ orderId: evt.order_id });
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const rawBody = await request.text();
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => { headers[key] = value; });

    try {
      await handler.processRequest(rawBody, headers);
      return new Response("OK", { status: 200 });
    } catch {
      return new Response("Unauthorized", { status: 401 });
    }
  },
};
```

### Hono

```typescript
import { Hono } from "hono";
import { WebhookHandler } from "revolut-sdk/webhook";

const app = new Hono();
const handler = new WebhookHandler({ secret: Bun.env["REVOLUT_WEBHOOK_SECRET"]! });

handler.on("ORDER_COMPLETED", async (evt) => {
  console.log("Order completed:", evt.order_id);
});

app.post("/webhooks/revolut", async (c) => {
  const rawBody = await c.req.text();
  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((v, k) => { headers[k] = v; });

  try {
    await handler.processRequest(rawBody, headers);
    return c.json({ ok: true });
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
});

export default app;
```

---

## Environment Variables Reference

```env
# Merchant API
REVOLUT_MERCHANT_KEY=sk_live_...
REVOLUT_SANDBOX_MERCHANT_KEY=sk_sandbox_...

# Business API (OAuth2 access token)
REVOLUT_BUSINESS_KEY=biz_access_token

# Open Banking API (OAuth2 bearer)
REVOLUT_OPEN_BANKING_KEY=ob_bearer_token

# Crypto Ramp API
REVOLUT_CRYPTO_RAMP_KEY=ramp_partner_key

# Crypto Exchange API
REVOLUT_CRYPTO_EXCHANGE_KEY=cx_api_key

# Webhook secrets
REVOLUT_MERCHANT_WEBHOOK_SECRET=wsk_...
REVOLUT_BUSINESS_WEBHOOK_SECRET=wsk_...
```

---

## Development & Testing

```bash
npm test                # run 222 unit tests
npm run test:coverage   # coverage report (branches: 83%+)
npm run test:watch      # interactive watch mode
npm run typecheck       # strict TypeScript check
npm run lint            # ESLint
npm run format          # Prettier
npm run build           # dual CJS + ESM dist/
```
