/**
 * @module cryptoramp
 * Revolut Crypto Ramp API — config, quotes, buy redirects, orders, webhooks,
 * HMAC signature verification, and typed payload parsing.
 */

import {
  type ClientConfig,
  HttpClient,
  BASE_URLS,
  buildPath,
  assertRequired,
} from "../client/index.js";
import { ValidationError, WebhookError } from "../errors/index.js";
import type { CryptoRampWebhookEvent, UUID } from "../types/index.js";
import { computeHMAC, verifyHMAC } from "../webhook/crypto.js";

export class CryptoRampClient {
  readonly #http: HttpClient;
  #webhookSecret?: string;

  constructor(config: ClientConfig) {
    const env = config.environment ?? "prod";
    this.#http = new HttpClient(config.baseURL ?? BASE_URLS.cryptoramp[env], config);
  }

  withWebhookSecret(secret: string): this {
    this.#webhookSecret = secret;
    return this;
  }

  // Config
  async getConfig(): Promise<RampConfig> {
    return this.#http.get<RampConfig>("/config");
  }

  // Quote
  async getQuote(req: QuoteRequest): Promise<Quote> {
    if (!req.fiat) throw new ValidationError("fiat", "is required");
    if (!req.crypto) throw new ValidationError("crypto", "is required");
    if (!req.amount) throw new ValidationError("amount", "is required");
    return this.#http.get<Quote>("/quote", {
      fiat: req.fiat,
      crypto: req.crypto,
      amount: req.amount,
      payment: req.paymentMethod,
      region: req.region,
    });
  }

  // Buy redirect
  async getBuyRedirectURL(req: BuyRedirectRequest): Promise<BuyRedirect> {
    if (!req.fiat) throw new ValidationError("fiat", "is required");
    if (!req.crypto) throw new ValidationError("crypto", "is required");
    if (!req.walletAddress) throw new ValidationError("walletAddress", "is required");
    return this.#http.get<BuyRedirect>("/buy", {
      fiat: req.fiat,
      crypto: req.crypto,
      wallet: req.walletAddress,
      amount: req.amount,
      payment: req.paymentMethod,
      region: req.region,
      orderId: req.orderId,
      partnerRedirectUrl: req.partnerRedirectURL,
    });
  }

  // Orders
  async getOrder(orderId: string, walletAddress: string): Promise<RampOrder> {
    assertRequired(orderId, "orderId");
    assertRequired(walletAddress, "walletAddress");
    return this.#http.get<RampOrder>(buildPath("orders", orderId), { wallet: walletAddress });
  }

  async listOrders(req?: ListRampOrdersRequest): Promise<RampOrder[]> {
    return this.#http.get<RampOrder[]>("/orders", {
      start: req?.start,
      end: req?.end,
      skip: req?.skip,
      limit: req?.limit,
    });
  }

  // Webhooks
  async createWebhook(req: CreateRampWebhookRequest): Promise<RampWebhook> {
    if (!req.url) throw new ValidationError("url", "is required");
    if (!req.events?.length)
      throw new ValidationError("events", "at least one event type is required");
    return this.#http.post<RampWebhook>("/webhooks", req);
  }

  async getWebhook(webhookId: UUID): Promise<RampWebhook> {
    assertRequired(webhookId, "webhookId");
    return this.#http.get<RampWebhook>(buildPath("webhooks", webhookId));
  }

  async updateWebhook(webhookId: UUID, req: UpdateRampWebhookRequest): Promise<RampWebhook> {
    assertRequired(webhookId, "webhookId");
    return this.#http.patch<RampWebhook>(buildPath("webhooks", webhookId), req);
  }

  async deleteWebhook(webhookId: UUID): Promise<void> {
    assertRequired(webhookId, "webhookId");
    return this.#http.delete<void>(buildPath("webhooks", webhookId));
  }

  async listWebhooks(): Promise<RampWebhook[]> {
    return this.#http.get<RampWebhook[]>("/webhooks");
  }

  verifyWebhookSignature(payload: Uint8Array | string, sigHeader: string): void {
    if (!this.#webhookSecret)
      throw new WebhookError("webhook secret not configured: call withWebhookSecret() first");
    if (!verifyHMAC(this.#webhookSecret, payload, sigHeader)) {
      throw new WebhookError("webhook signature verification failed");
    }
  }

  parseWebhookPayload(payload: Uint8Array | string, sigHeader?: string): RampWebhookPayload {
    if (sigHeader && this.#webhookSecret) {
      this.verifyWebhookSignature(payload, sigHeader);
    }
    const text = typeof payload === "string" ? payload : new TextDecoder().decode(payload);
    try {
      return JSON.parse(text) as RampWebhookPayload;
    } catch {
      throw new WebhookError("failed to parse webhook payload as JSON");
    }
  }

  /** Compute HMAC for testing or outgoing signature generation. */
  computeSignature(payload: Uint8Array | string): string {
    if (!this.#webhookSecret) throw new WebhookError("webhook secret not configured");
    return computeHMAC(this.#webhookSecret, payload);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RampConfig {
  readonly fiat_currencies: readonly string[];
  readonly crypto_tokens: readonly string[];
  readonly payment_methods: readonly string[];
  readonly supported_regions: readonly string[];
}

export interface QuoteRequest {
  readonly fiat: string;
  readonly amount: string;
  readonly crypto: string;
  readonly paymentMethod?: string;
  readonly region?: string;
}

export interface Quote {
  readonly fiat_amount: string;
  readonly crypto_amount: string;
  readonly fiat: string;
  readonly crypto: string;
  readonly rate: string;
  readonly fee?: string;
  readonly expires_at: string;
}

export interface BuyRedirectRequest {
  readonly fiat: string;
  readonly amount?: string;
  readonly crypto: string;
  readonly walletAddress: string;
  readonly paymentMethod?: string;
  readonly region?: string;
  readonly orderId?: string;
  readonly partnerRedirectURL?: string;
}

export interface BuyRedirect {
  readonly url: string;
}

export type RampOrderState = "pending" | "processing" | "completed" | "failed" | "cancelled";

export interface RampOrder {
  readonly id: string;
  readonly state: RampOrderState;
  readonly fiat_amount: string;
  readonly fiat_currency: string;
  readonly crypto_amount: string;
  readonly crypto_currency: string;
  readonly wallet_address: string;
  readonly network?: string;
  readonly tx_hash?: string;
  readonly rate?: string;
  readonly fee?: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly completed_at?: string;
}

export interface ListRampOrdersRequest {
  readonly start?: string;
  readonly end?: string;
  readonly skip?: number;
  readonly limit?: number;
}

export interface RampWebhook {
  readonly id: UUID;
  readonly url: string;
  readonly events: readonly CryptoRampWebhookEvent[];
  readonly active: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreateRampWebhookRequest {
  readonly url: string;
  readonly events: readonly CryptoRampWebhookEvent[];
}

export interface UpdateRampWebhookRequest {
  readonly url?: string;
  readonly events?: readonly CryptoRampWebhookEvent[];
}

export interface RampWebhookPayload {
  readonly event: CryptoRampWebhookEvent;
  readonly order_id: string;
  readonly timestamp: string;
  readonly order?: RampOrder;
}
