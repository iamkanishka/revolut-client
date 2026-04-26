# revolut-sdk

Production-grade **TypeScript SDK** for the complete [Revolut Developer API](https://developer.revolut.com) platform.

[![npm](https://img.shields.io/npm/v/revolut-sdk)](https://www.npmjs.com/package/revolut-sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5%2B-blue)](https://www.typescriptlang.org)
[![Tests](https://img.shields.io/badge/tests-148%20passing-brightgreen)](#)
[![Zero dependencies](https://img.shields.io/badge/deps-zero-brightgreen)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Features

- **Complete API coverage** — Merchant, Business, Open Banking, Crypto Ramp, Crypto Exchange
- **Zero runtime dependencies** — pure TypeScript, works in Node.js 18+, Deno, Cloudflare Workers, Bun
- **Dual CJS + ESM** — tree-shakeable, works in every bundler
- **Branded primitives** — `Currency`, `Amount`, `UUID` prevent type confusion at compile time
- **Typed webhook dispatch** — `handler.on("ORDER_COMPLETED", (evt) => ...)` narrows payload type automatically
- **Retry + jitter** — exponential backoff with full jitter, configurable per-client
- **Token-bucket rate limiting** — client-side, no external deps
- **Telemetry hooks** — plug in your own logger/metrics/tracing
- **Replay-attack protection** — optional 5-minute timestamp window on webhook handler
- **`strictest` TypeScript** — `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, private `#fields`

---

## Installation

```bash
npm install revolut-sdk
```

---

## Quick start

```typescript
import { RevolutSDK, Currency, Amount } from "revolut-sdk";

const sdk = new RevolutSDK({
  merchantKey:  "sk_live_...",
  businessKey:  "biz_access_token",
  environment:  "prod",
  timeoutMs:    30_000,
});

// Create a payment order
const order = await sdk.merchant.createOrder({
  amount:      Amount(1000),  // £10.00 in minor units
  currency:    Currency("GBP"),
  description: "Widget purchase",
  capture_mode: "automatic",
});

console.log(order.checkout_url); // redirect customer here
console.log(order.token);        // for Revolut Checkout Widget
```

### Sandbox

```typescript
const sdk = new RevolutSDK({
  merchantKey: "sk_sandbox_...",
  environment: "sandbox",
});
```

---

## APIs

### Merchant API

```typescript
import { MerchantClient, Currency, Amount } from "revolut-sdk/merchant";
// or via the unified SDK:
const m = sdk.merchant;

// Orders
const order    = await m.createOrder({ amount: Amount(2000), currency: Currency("EUR") });
const fetched  = await m.getOrder(order.id);
const list     = await m.listOrders({ page: { limit: 50 } });
const captured = await m.captureOrder(order.id, { amount: Amount(1500), currency: Currency("EUR") });
await m.cancelOrder(order.id);
await m.refundOrder(order.id, { amount: Amount(500) });

// Incremental authorisation (pre-auth orders, e.g. hotel holds)
await m.incrementalAuthorise(order.id, {
  amount:    Amount(15000),  // new total — not a delta
  currency:  Currency("GBP"),
  reference: "invoice_123",
});

// Pay via saved customer payment method (MIT)
await m.payViaSavedMethod(order.id, { saved_payment_method_id: savedMethodId });

// Update order before capture
await m.updateOrder(order.id, {
  description:    "Updated description",
  line_items:     [{ name: "Widget", total_amount: Amount(2000) }],
  industry_data:  { airline: { legs: [...] } },
});

// Full payment lifecycle tracking
const details = await m.getPaymentDetails(paymentId);
console.log(details.state);          // "authorised" | "captured" | ...
console.log(details.fingerprint);    // unique 44-char ID for duplicate detection
console.log(details.failure_reason); // "insufficient_funds" | "expired_card" | ...

// Customers + saved payment methods
const customer = await m.createCustomer({ email: "user@example.com" });
const methods  = await m.listSavedPaymentMethods(customer.id);

// Subscription Plans (Variations + Phases model)
const plan = await m.createPlan({
  name: "Pro Plan",
  trial_duration: "P14D",  // 14-day free trial
  variations: [
    {
      name: "Monthly",
      phases: [
        { ordinal: 1, cycle_duration: "P1M", cycle_count: 1, amount: Amount(0),   currency: Currency("GBP") }, // trial
        { ordinal: 2, cycle_duration: "P1M",                 amount: Amount(999), currency: Currency("GBP") }, // £9.99/mo
      ],
    },
    {
      name: "Yearly",
      phases: [
        { ordinal: 1, cycle_duration: "P1Y", amount: Amount(9900), currency: Currency("GBP") },
      ],
    },
  ],
});

// Subscriptions
const sub = await m.createSubscription({
  plan_variation_id:       plan.variations[0].id,
  customer_id:             customer.id,
  setup_order_redirect_url: "https://example.com/thanks",
});
// sub.setup_order_id → use getOrder(sub.setup_order_id) to get checkout_url
const cycles = await m.listBillingCycles(sub.id);

// Disputes
await m.acceptDispute(disputeId);
const evidence = await m.uploadDisputeEvidence(disputeId, {
  file_name:    "invoice.pdf",
  content_type: "application/pdf",
});
await m.challengeDispute(disputeId, { evidence_ids: [evidence.id] });

// Report Runs (async CSV generation)
const report = await m.createReportRun({
  type:      "transactions",
  date_from: "2025-01-01",
  date_to:   "2025-01-31",
});
const ready = await m.getReportRun(report.id);
console.log(ready.download_url); // signed S3 URL

// Fast Checkout address validation (Revolut Pay)
const syncWebhook = await m.registerAddressValidation({
  url: "https://your-backend.com/validate-address",
});
console.log(syncWebhook.signing_key); // use to verify Revolut-Pay-Payload-Signature
```

### Business API

```typescript
const b = sdk.business;

// Accounts
const accounts = await b.listAccounts();
const details  = await b.getAccountBankDetails(accounts[0].id); // IBAN, sort code, BIC

// Cards
const cards = await b.listCards();
await b.freezeCard(cardId);
await b.unfreezeCard(cardId);
await b.terminateCard(cardId); // irreversible

// Counterparties + UK CoP
const cp  = await b.addCounterparty({ profile_type: "business", name: "Acme Ltd" });
const cop = await b.validatePayeeName({ name: "Acme Ltd", sort_code: "608371", account_no: "12345678" });

// Payments & Transfers
const tx1 = await b.createTransfer({
  request_id:        "uuid-v4",
  source_account_id: gbpAccountId,
  target_account_id: usdAccountId,
  amount:            1000,
  currency:          Currency("GBP"),
});
const tx2 = await b.createPayment({
  request_id:   "uuid-v4",
  account_id:   gbpAccountId,
  counterparty: cpId,
  amount:       500,
  currency:     Currency("GBP"),
  reference:    "Invoice #123",
});

// FX
const rate = await b.getExchangeRate(Currency("USD"), Currency("GBP"));
const fx   = await b.exchange({
  request_id: "uuid-v4",
  from: { account_id: usdAccId, currency: Currency("USD"), amount: 1000 },
  to:   { account_id: gbpAccId, currency: Currency("GBP") },
});

// Webhooks v2 (recommended)
const wh = await b.createWebhookV2({
  url:    "https://your-app.com/revolut/business",
  events: ["TransactionCreated", "TransactionStateChanged"],
});
const rotated = await b.rotateWebhookSigningSecretV2(wh.id, {
  expiration_period: "P1D", // old secret valid for 1 day
});
const failed = await b.getFailedWebhookEvents(wh.id, { limit: 20 });
```

### Webhooks

```typescript
import { WebhookHandler, computeWebhookSignature } from "revolut-sdk/webhook";

const handler = new WebhookHandler({
  secret:            "wsk_...",      // from Revolut dashboard
  validateTimestamp: true,           // reject events > 5 minutes old (anti-replay)
  onError: (err, rawBody) => {
    logger.error({ err, rawBody }, "webhook handler error");
  },
});

// Strongly-typed handlers — payload type is narrowed by event name
handler
  .on("ORDER_COMPLETED", async (evt) => {
    // evt.order_id is typed as string
    await fulfillOrder(evt.order_id);
  })
  .on("ORDER_INCREMENTAL_AUTHORISATION_AUTHORISED", async (evt) => {
    await handleIncrementalAuth(evt.order_id, evt.incremental_authorisation_reference);
  })
  .on("DISPUTE_ACTION_REQUIRED", async (evt) => {
    await notifyDisputeTeam(evt.dispute_id);
  })
  .on("SUBSCRIPTION_INITIATED", async (evt) => {
    await activateSubscription(evt.subscription_id);
  })
  .on("PAYOUT_COMPLETED", async (evt) => {
    await reconcilePayout(evt.payout_id);
  });

// In your HTTP server (Express / Fastify / Hono / any framework)
app.post("/webhooks/revolut", async (req, res) => {
  await handler.processRequest(req.body, req.headers);
  res.sendStatus(200);
});
```

Revolut's signature format: `HMAC-SHA256("v1.{Revolut-Request-Timestamp}.{rawBody}")` → `v1={hex}`

---

## Error handling

```typescript
import {
  isAPIError, isValidationError, isNetworkError,
  APIError, ValidationError
} from "revolut-sdk";

try {
  const order = await sdk.merchant.getOrder(orderId);
} catch (err) {
  if (isValidationError(err)) {
    // Caught before HTTP — bad input
    console.error(`Field "${err.field}": ${err.message}`);
  } else if (isAPIError(err)) {
    if (err.isNotFound)     console.error("Order not found");
    if (err.isRateLimited)  console.warn("Rate limited — back off");
    if (err.isUnauthorized) console.error("Invalid API key");
    if (err.isRetryable)    console.warn("Transient server error");
    console.error(`HTTP ${err.statusCode} [${err.code}]: ${err.message}`);
    console.error(`request_id: ${err.requestId}`); // for Revolut support
  } else if (isNetworkError(err)) {
    console.error("Network failure:", err.message);
  }
}
```

---

## Configuration

```typescript
import {
  RevolutSDK,
  withApiKey, withSandbox, withRetry, withRateLimit, withTelemetry, withNoRetry
} from "revolut-sdk";

const sdk = new RevolutSDK({
  merchantKey: "sk_live_...",

  environment: "prod",  // or "sandbox"

  timeoutMs: 30_000,

  retry: {
    maxAttempts:    3,
    initialDelayMs: 500,
    maxDelayMs:     30_000,
    multiplier:     2,
    jitter:         0.5,
  },

  rateLimit: {
    requestsPerSecond: 50,
    burst:             100,
  },

  telemetry: {
    onRequest:  ({ method, url, attempt }) => logger.debug({ method, url, attempt }),
    onResponse: ({ statusCode, durationMs }) => metrics.histogram("http.duration", durationMs),
    onError:    ({ error, attempt, final }) => {
      if (final) logger.error({ error, attempt }, "request failed");
    },
  },
});
```

---

## Pagination

```typescript
import { hasNextPage } from "revolut-sdk";

let cursor: string | undefined;
do {
  const page = await sdk.merchant.listOrders({ page: { limit: 100, cursor } });
  for (const order of page.items) {
    await process(order);
  }
  cursor = page.next_cursor;
} while (cursor && hasNextPage(page));
```

---

## Sub-package imports

```typescript
// Full SDK
import { RevolutSDK } from "revolut-sdk";

// Individual client + types
import { MerchantClient }     from "revolut-sdk/merchant";
import { BusinessClient }     from "revolut-sdk/business";
import { OpenBankingClient }  from "revolut-sdk/openbanking";
import { CryptoRampClient }   from "revolut-sdk/cryptoramp";
import { CryptoExchangeClient } from "revolut-sdk/cryptoexchange";
import { WebhookHandler }     from "revolut-sdk/webhook";
```

---

## Testing

```bash
npm test              # run all 148 tests
npm run test:coverage # coverage report (target: 80%+)
npm run test:watch    # interactive watch mode
npm run typecheck     # TypeScript strict check, zero errors
npm run build         # dual CJS + ESM dist/
```

---

## License

MIT — see [LICENSE](LICENSE)
