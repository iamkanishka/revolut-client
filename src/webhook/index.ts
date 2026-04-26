/**
 * @module webhook
 * Type-safe webhook handler for Revolut Merchant API events.
 *
 * Signature format:
 *   Revolut-Signature:        v1={hmac_hex}
 *   Revolut-Request-Timestamp: {unix_ms}
 *   Signed payload:           "v1.{timestamp}.{rawBody}"
 *
 * @example
 * const handler = new WebhookHandler({ secret: "wsk_..." });
 * handler.on("ORDER_COMPLETED", async (evt) => { ... });
 * // In your HTTP server:
 * await handler.processRequest(rawBody, headers);
 */

import { WebhookError } from "../errors/index.js";
import type { MerchantWebhookEvent } from "../types/index.js";
import { verifyRevolutSignatureAsync, computeRevolutSignatureAsync } from "./crypto.js";

export {
  computeHMAC,
  computeHMACAsync,
  verifyHMAC,
  verifyRevolutSignatureAsync,
  computeRevolutSignatureAsync,
} from "./crypto.js";

// ---------------------------------------------------------------------------
// Event payload types
// ---------------------------------------------------------------------------

export interface WebhookEnvelope {
  readonly event: MerchantWebhookEvent;
  readonly order_id?: string;
  readonly merchant_order_ext_ref?: string;
  readonly incremental_authorisation_reference?: string;
}

export interface OrderCompletedPayload extends WebhookEnvelope {
  readonly event: "ORDER_COMPLETED";
}
export interface OrderAuthorisedPayload extends WebhookEnvelope {
  readonly event: "ORDER_AUTHORISED";
}
export interface OrderCancelledPayload extends WebhookEnvelope {
  readonly event: "ORDER_CANCELLED";
}
export interface OrderFailedPayload extends WebhookEnvelope {
  readonly event: "ORDER_FAILED";
}
export interface IncrementalAuthPayload extends WebhookEnvelope {
  readonly event:
    | "ORDER_INCREMENTAL_AUTHORISATION_AUTHORISED"
    | "ORDER_INCREMENTAL_AUTHORISATION_DECLINED"
    | "ORDER_INCREMENTAL_AUTHORISATION_FAILED";
}
export interface PaymentEventPayload extends WebhookEnvelope {
  readonly event:
    | "ORDER_PAYMENT_AUTHENTICATION_CHALLENGED"
    | "ORDER_PAYMENT_AUTHENTICATED"
    | "ORDER_PAYMENT_DECLINED"
    | "ORDER_PAYMENT_FAILED"
    | "PAYMENT_CREATED"
    | "PAYMENT_UPDATED";
}
export interface SubscriptionEventPayload extends WebhookEnvelope {
  readonly event:
    | "SUBSCRIPTION_INITIATED"
    | "SUBSCRIPTION_FINISHED"
    | "SUBSCRIPTION_CANCELLED"
    | "SUBSCRIPTION_OVERDUE";
  readonly subscription_id?: string;
  readonly customer_id?: string;
}
export interface PayoutEventPayload extends WebhookEnvelope {
  readonly event: "PAYOUT_INITIATED" | "PAYOUT_COMPLETED" | "PAYOUT_FAILED";
  readonly payout_id?: string;
}
export interface DisputeEventPayload extends WebhookEnvelope {
  readonly event:
    | "DISPUTE_CREATED"
    | "DISPUTE_UPDATED"
    | "DISPUTE_ACTION_REQUIRED"
    | "DISPUTE_UNDER_REVIEW"
    | "DISPUTE_WON"
    | "DISPUTE_LOST";
  readonly dispute_id?: string;
  readonly reason?: string;
}
export interface RefundEventPayload extends WebhookEnvelope {
  readonly event: "REFUND_CREATED";
}

/** Discriminated union of all Merchant webhook payloads. */
export type WebhookPayload =
  | OrderCompletedPayload
  | OrderAuthorisedPayload
  | OrderCancelledPayload
  | OrderFailedPayload
  | IncrementalAuthPayload
  | PaymentEventPayload
  | SubscriptionEventPayload
  | PayoutEventPayload
  | DisputeEventPayload
  | RefundEventPayload;

// ---------------------------------------------------------------------------
// Type-safe handler mapping
// ---------------------------------------------------------------------------

type PayloadFor<E extends MerchantWebhookEvent> = Extract<WebhookPayload, { readonly event: E }>;

type EventHandlerMap = {
  [E in MerchantWebhookEvent]?: (payload: PayloadFor<E>) => Promise<void> | void;
};

// ---------------------------------------------------------------------------
// Handler options
// ---------------------------------------------------------------------------

export interface WebhookHandlerOptions {
  /** HMAC signing secret (wsk_...). If omitted, signature is NOT verified. */
  readonly secret?: string;
  /**
   * When true, reject events with Revolut-Request-Timestamp older than 5 minutes.
   * Protects against replay attacks. Default: false.
   */
  readonly validateTimestamp?: boolean;
  /** Custom error handler. Default: rethrows. */
  readonly onError?: (err: unknown, rawPayload: string) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// WebhookHandler
// ---------------------------------------------------------------------------

const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

export class WebhookHandler {
  readonly #options: WebhookHandlerOptions;
  readonly #handlers: EventHandlerMap = {};

  constructor(options: WebhookHandlerOptions = {}) {
    this.#options = options;
  }

  /**
   * Register a strongly-typed handler for a specific event type.
   * The payload type is automatically narrowed based on the event name.
   */
  on<E extends MerchantWebhookEvent>(
    event: E,
    handler: (payload: PayloadFor<E>) => Promise<void> | void
  ): this {
    this.#handlers[event] = handler as EventHandlerMap[E];
    return this;
  }

  /** Remove a handler for an event type. */
  off<E extends MerchantWebhookEvent>(event: E): this {
    delete this.#handlers[event];
    return this;
  }

  /**
   * Process a raw webhook request. Call this from your HTTP server.
   *
   * @param rawBody - The raw, unmodified request body as string or Uint8Array.
   * @param headers - All headers from the incoming request (case-insensitive lookup).
   */
  async processRequest(
    rawBody: string | Uint8Array,
    headers: Record<string, string | string[] | undefined>
  ): Promise<void> {
    const bodyStr = typeof rawBody === "string" ? rawBody : new TextDecoder().decode(rawBody);

    // Signature verification
    if (this.#options.secret) {
      const sigHeader = this.#getHeader(headers, "revolut-signature");
      const tsHeader = this.#getHeader(headers, "revolut-request-timestamp");

      if (!sigHeader) throw new WebhookError("missing Revolut-Signature header");
      if (!tsHeader) throw new WebhookError("missing Revolut-Request-Timestamp header");

      // Timestamp replay-attack protection
      if (this.#options.validateTimestamp) {
        const tsMs = parseInt(tsHeader, 10);
        if (isNaN(tsMs) || Math.abs(Date.now() - tsMs) > MAX_TIMESTAMP_AGE_MS) {
          throw new WebhookError(
            "webhook timestamp is too old or invalid (replay attack protection)"
          );
        }
      }

      const valid = await verifyRevolutSignatureAsync(
        this.#options.secret,
        tsHeader,
        rawBody,
        sigHeader
      );
      if (!valid) throw new WebhookError("invalid webhook signature");
    }

    // Parse
    let payload: WebhookPayload;
    try {
      payload = JSON.parse(bodyStr) as WebhookPayload;
    } catch {
      throw new WebhookError("failed to parse webhook payload as JSON");
    }

    // Dispatch
    const eventType = payload.event;
    const handler = this.#handlers[eventType];

    if (!handler) return; // No handler registered — not an error

    try {
      await (handler as (p: WebhookPayload) => Promise<void> | void)(payload);
    } catch (err) {
      if (this.#options.onError) {
        await this.#options.onError(err, bodyStr);
      } else {
        throw err;
      }
    }
  }

  #getHeader(
    headers: Record<string, string | string[] | undefined>,
    name: string
  ): string | undefined {
    // Case-insensitive lookup: try exact, lowercase, and Title-Case variants
    const lower = name.toLowerCase();
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === lower) {
        const value = headers[key];
        if (Array.isArray(value)) return value[0];
        return value;
      }
    }
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Standalone verification helper
// ---------------------------------------------------------------------------

/**
 * Verify a Revolut Merchant API webhook signature.
 *
 * Revolut's format: HMAC-SHA256("v1.{timestamp}.{body}") → "v1={hex}"
 *
 * @returns true if the signature is valid
 */
export async function verifyWebhookSignature(options: {
  readonly secret: string;
  readonly timestamp: string;
  readonly body: string | Uint8Array;
  readonly sigHeader: string;
}): Promise<boolean> {
  return verifyRevolutSignatureAsync(
    options.secret,
    options.timestamp,
    options.body,
    options.sigHeader
  );
}

/**
 * Compute the Revolut webhook signature for a given payload.
 * Useful for testing and generating test payloads.
 */
export async function computeWebhookSignature(options: {
  readonly secret: string;
  readonly timestamp: string;
  readonly body: string | Uint8Array;
}): Promise<string> {
  return computeRevolutSignatureAsync(options.secret, options.timestamp, options.body);
}
