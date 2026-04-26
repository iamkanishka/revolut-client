/**
 * revolut-client
 * Production-grade TypeScript SDK for the complete Revolut Developer API.
 *
 * @example
 * ```typescript
 * import { RevolutSDK } from "revolut-client";
 *
 * const sdk = new RevolutSDK({
 *   merchantKey: "sk_live_...",
 *   environment: "prod",
 * });
 *
 * const order = await sdk.merchant.createOrder({
 *   amount: Amount(1000),
 *   currency: Currency("GBP"),
 *   description: "Widget purchase",
 * });
 * ```
 */

import { MerchantClient } from "./merchant/index.js";
import { BusinessClient } from "./business/index.js";
import { OpenBankingClient } from "./openbanking/index.js";
import { CryptoRampClient } from "./cryptoramp/index.js";
import { CryptoExchangeClient } from "./cryptoexchange/index.js";
import { ConfigurationError } from "./errors/index.js";
import type { ClientConfig, RetryPolicy, RateLimitConfig, TelemetryHook } from "./client/index.js";
import type { Environment } from "./types/index.js";

// Core primitives — exported from root for convenience
export * from "./types/index.js";
export * from "./errors/index.js";
export * from "./client/index.js";
export * from "./webhook/index.js";

// API sub-module types — import directly from sub-packages to avoid naming conflicts:
//   import type { Order } from "revolut-client/merchant"
//   import type { Account } from "revolut-client/business"
// These re-exports use namespace aliases to keep the root barrel clean.
export type * as MerchantTypes from "./merchant/index.js";
export type * as BusinessTypes from "./business/index.js";
export type * as OpenBankingTypes from "./openbanking/index.js";
export type * as CryptoRampTypes from "./cryptoramp/index.js";
export type * as CryptoExchangeTypes from "./cryptoexchange/index.js";

// ---------------------------------------------------------------------------
// Unified SDK config
// ---------------------------------------------------------------------------

export interface RevolutSDKConfig {
  /** Merchant API secret key (sk_live_... or sk_sandbox_...). */
  readonly merchantKey?: string;
  /** Business API OAuth2 access token. */
  readonly businessKey?: string;
  /** Open Banking API OAuth2 bearer token. */
  readonly openBankingKey?: string;
  /** Crypto Ramp partner API key (X-API-KEY). */
  readonly cryptoRampKey?: string;
  /** Crypto Exchange API key. */
  readonly cryptoExchangeKey?: string;
  /** Target environment. Default: "prod". */
  readonly environment?: Environment;
  /** Per-request timeout in ms. Default: 30_000. */
  readonly timeoutMs?: number;
  /** Retry policy shared across all sub-clients. */
  readonly retry?: Partial<RetryPolicy>;
  /** Rate limiting shared across all sub-clients. */
  readonly rateLimit?: RateLimitConfig;
  /** Observability hooks shared across all sub-clients. */
  readonly telemetry?: TelemetryHook;
}

// ---------------------------------------------------------------------------
// Unified SDK entry point
// ---------------------------------------------------------------------------

/**
 * RevolutSDK bundles all API sub-clients into a single instance.
 * Only the sub-clients for which you provide API keys are initialised.
 */
export class RevolutSDK {
  readonly #config: RevolutSDKConfig;
  #merchant?: MerchantClient;
  #business?: BusinessClient;
  #openBanking?: OpenBankingClient;
  #cryptoRamp?: CryptoRampClient;
  #cryptoExchange?: CryptoExchangeClient;

  constructor(config: RevolutSDKConfig) {
    if (
      !config.merchantKey &&
      !config.businessKey &&
      !config.openBankingKey &&
      !config.cryptoRampKey &&
      !config.cryptoExchangeKey
    ) {
      throw new ConfigurationError("at least one API key must be provided");
    }
    this.#config = config;
  }

  private baseClientConfig(apiKey: string): ClientConfig {
    return {
      apiKey,
      ...(this.#config.environment !== undefined ? { environment: this.#config.environment } : {}),
      ...(this.#config.timeoutMs !== undefined ? { timeoutMs: this.#config.timeoutMs } : {}),
      ...(this.#config.retry !== undefined ? { retry: this.#config.retry } : {}),
      ...(this.#config.rateLimit !== undefined ? { rateLimit: this.#config.rateLimit } : {}),
      ...(this.#config.telemetry !== undefined ? { telemetry: this.#config.telemetry } : {}),
    };
  }

  /** Revolut Merchant API client. */
  get merchant(): MerchantClient {
    if (!this.#merchant) {
      if (!this.#config.merchantKey) {
        throw new ConfigurationError("merchantKey is required to access the Merchant API");
      }
      this.#merchant = new MerchantClient(this.baseClientConfig(this.#config.merchantKey));
    }
    return this.#merchant;
  }

  /** Revolut Business API client. */
  get business(): BusinessClient {
    if (!this.#business) {
      if (!this.#config.businessKey) {
        throw new ConfigurationError("businessKey is required to access the Business API");
      }
      this.#business = new BusinessClient(this.baseClientConfig(this.#config.businessKey));
    }
    return this.#business;
  }

  /** Revolut Open Banking API client. */
  get openBanking(): OpenBankingClient {
    if (!this.#openBanking) {
      if (!this.#config.openBankingKey) {
        throw new ConfigurationError("openBankingKey is required to access the Open Banking API");
      }
      this.#openBanking = new OpenBankingClient(this.baseClientConfig(this.#config.openBankingKey));
    }
    return this.#openBanking;
  }

  /** Revolut Crypto Ramp API client. */
  get cryptoRamp(): CryptoRampClient {
    if (!this.#cryptoRamp) {
      if (!this.#config.cryptoRampKey) {
        throw new ConfigurationError("cryptoRampKey is required to access the Crypto Ramp API");
      }
      this.#cryptoRamp = new CryptoRampClient(this.baseClientConfig(this.#config.cryptoRampKey));
    }
    return this.#cryptoRamp;
  }

  /** Revolut X Crypto Exchange API client. */
  get cryptoExchange(): CryptoExchangeClient {
    if (!this.#cryptoExchange) {
      if (!this.#config.cryptoExchangeKey) {
        throw new ConfigurationError(
          "cryptoExchangeKey is required to access the Crypto Exchange API"
        );
      }
      this.#cryptoExchange = new CryptoExchangeClient(
        this.baseClientConfig(this.#config.cryptoExchangeKey)
      );
    }
    return this.#cryptoExchange;
  }
}
