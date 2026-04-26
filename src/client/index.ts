/**
 * @module client
 * Core HTTP transport layer. Handles authentication, serialisation,
 * retry with exponential backoff + jitter, rate limiting, telemetry
 * hooks, and structured API error mapping.
 */

import {
  APIError,
  ConfigurationError,
  NetworkError,
  ValidationError,
  httpStatusToCode,
} from "../errors/index.js";
import type { Environment } from "../types/index.js";

// ---------------------------------------------------------------------------
// Telemetry hooks
// ---------------------------------------------------------------------------

export interface RequestEvent {
  readonly method: string;
  readonly url: string;
  readonly attempt: number;
  readonly requestId?: string;
}

export interface ResponseEvent {
  readonly statusCode: number;
  readonly durationMs: number;
  readonly attempt: number;
  readonly requestId?: string;
}

export interface ErrorEvent {
  readonly error: unknown;
  readonly durationMs: number;
  readonly attempt: number;
  readonly final: boolean;
}

export interface TelemetryHook {
  readonly onRequest?: (event: RequestEvent) => void;
  readonly onResponse?: (event: ResponseEvent) => void;
  readonly onError?: (event: ErrorEvent) => void;
}

// ---------------------------------------------------------------------------
// Retry policy
// ---------------------------------------------------------------------------

export interface RetryPolicy {
  /** Maximum total attempts (1 = no retries). Default: 3 */
  readonly maxAttempts: number;
  /** Base backoff in ms. Default: 500 */
  readonly initialDelayMs: number;
  /** Maximum backoff cap in ms. Default: 30_000 */
  readonly maxDelayMs: number;
  /** Exponential multiplier. Default: 2 */
  readonly multiplier: number;
  /** Jitter factor 0-1. Default: 0.5 */
  readonly jitter: number;
  /** Override which errors are retryable. */
  readonly isRetryable?: (err: unknown, attempt: number) => boolean;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 30_000,
  multiplier: 2,
  jitter: 0.5,
};

export const NO_RETRY: RetryPolicy = {
  maxAttempts: 1,
  initialDelayMs: 0,
  maxDelayMs: 0,
  multiplier: 1,
  jitter: 0,
};

function computeBackoff(policy: RetryPolicy, attempt: number): number {
  const exp = Math.pow(policy.multiplier, attempt - 1);
  const base = Math.min(policy.initialDelayMs * exp, policy.maxDelayMs);
  const noise = Math.random() * policy.jitter * base;
  return Math.floor(base + noise);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultIsRetryable(err: unknown): boolean {
  if (err instanceof APIError) return err.isRetryable;
  return true; // retry network errors by default
}

// ---------------------------------------------------------------------------
// Rate limiter — token bucket, no external deps
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  readonly requestsPerSecond: number;
  readonly burst: number;
}

class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly ratePerMs: number,
    private readonly maxBurst: number
  ) {
    this.tokens = maxBurst;
    this.lastRefill = Date.now();
  }

  async acquire(signal?: AbortSignal): Promise<void> {
    while (true) {
      if (signal?.aborted) throw new Error("Aborted");
      const now = Date.now();
      const elapsed = now - this.lastRefill;
      this.tokens = Math.min(this.maxBurst, this.tokens + elapsed * this.ratePerMs);
      this.lastRefill = now;

      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }

      const waitMs = (1 - this.tokens) / this.ratePerMs;
      await sleep(Math.ceil(waitMs));
    }
  }
}

// ---------------------------------------------------------------------------
// HTTP client configuration
// ---------------------------------------------------------------------------

export interface ClientConfig {
  /** API secret key (Merchant / Business / Crypto Exchange). Required. */
  readonly apiKey: string;
  /** Public API key for widget initialisation. Optional. */
  readonly publicKey?: string;
  /** Target environment. Default: "prod". */
  readonly environment?: Environment;
  /** Override the API base URL. */
  readonly baseURL?: string;
  /** Per-request timeout in ms. Default: 30_000. */
  readonly timeoutMs?: number;
  /** Retry policy. Default: DEFAULT_RETRY_POLICY. */
  readonly retry?: Partial<RetryPolicy>;
  /** Rate limit configuration. */
  readonly rateLimit?: RateLimitConfig;
  /** Observability hooks. */
  readonly telemetry?: TelemetryHook;
  /** Custom User-Agent string. */
  readonly userAgent?: string;
  /** API version header (Merchant API). */
  readonly apiVersion?: string;
  /** Custom fetch implementation. Default: globalThis.fetch. */
  readonly fetch?: typeof globalThis.fetch;
}

export type ClientOption = (config: Partial<ClientConfig>) => void;

export const withApiKey =
  (key: string): ClientOption =>
  (c) => {
    (c as Record<string, unknown>)["apiKey"] = key;
  };
export const withEnvironment =
  (env: Environment): ClientOption =>
  (c) => {
    (c as Record<string, unknown>)["environment"] = env;
  };
export const withSandbox = (): ClientOption => withEnvironment("sandbox");
export const withBaseURL =
  (url: string): ClientOption =>
  (c) => {
    (c as Record<string, unknown>)["baseURL"] = url;
  };
export const withTimeout =
  (ms: number): ClientOption =>
  (c) => {
    (c as Record<string, unknown>)["timeoutMs"] = ms;
  };
export const withRetry =
  (policy: Partial<RetryPolicy>): ClientOption =>
  (c) => {
    (c as Record<string, unknown>)["retry"] = policy;
  };
export const withNoRetry = (): ClientOption => withRetry(NO_RETRY);
export const withRateLimit =
  (cfg: RateLimitConfig): ClientOption =>
  (c) => {
    (c as Record<string, unknown>)["rateLimit"] = cfg;
  };
export const withTelemetry =
  (hooks: TelemetryHook): ClientOption =>
  (c) => {
    (c as Record<string, unknown>)["telemetry"] = hooks;
  };
export const withApiVersion =
  (v: string): ClientOption =>
  (c) => {
    (c as Record<string, unknown>)["apiVersion"] = v;
  };

// ---------------------------------------------------------------------------
// Base URLs
// ---------------------------------------------------------------------------

export const BASE_URLS = {
  merchant: {
    prod: "https://merchant.revolut.com",
    sandbox: "https://sandbox-merchant.revolut.com",
  },
  business: { prod: "https://b2b.revolut.com/api/1.0", sandbox: "https://b2b.revolut.com/api/1.0" },
  openbanking: { prod: "https://oba.revolut.com", sandbox: "https://oba.revolut.com" },
  cryptoramp: {
    prod: "https://ramp-partners.revolut.com/partners/api/2.0",
    sandbox: "https://ramp-partners.revolut.codes/partners/api/2.0",
  },
  cryptoexchange: {
    prod: "https://revx.revolut.com/api/1.0",
    sandbox: "https://revx.revolut.com/api/1.0",
  },
} as const;

// ---------------------------------------------------------------------------
// HTTP request descriptor
// ---------------------------------------------------------------------------

export interface HttpRequest {
  readonly method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  readonly path: string;
  readonly query?: Record<string, string | number | boolean | undefined>;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
  readonly skipRetry?: boolean;
}

// ---------------------------------------------------------------------------
// Core HTTP client
// ---------------------------------------------------------------------------

export class HttpClient {
  private readonly config: Required<
    Omit<
      ClientConfig,
      "baseURL" | "publicKey" | "rateLimit" | "telemetry" | "userAgent" | "apiVersion" | "fetch"
    >
  > &
    ClientConfig;
  private readonly bucket: TokenBucket | null;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(
    private readonly baseURL: string,
    userConfig: ClientConfig
  ) {
    if (!userConfig.apiKey) {
      throw new ConfigurationError("apiKey is required");
    }
    const retry: RetryPolicy = { ...DEFAULT_RETRY_POLICY, ...userConfig.retry };
    this.config = { ...userConfig, retry } as typeof this.config;
    this.bucket = userConfig.rateLimit
      ? new TokenBucket(userConfig.rateLimit.requestsPerSecond / 1000, userConfig.rateLimit.burst)
      : null;
    this.fetchFn = userConfig.fetch ?? globalThis.fetch.bind(globalThis);
  }

  // ---------------------------------------------------------------------------
  // Public request method
  // ---------------------------------------------------------------------------

  async request<T>(req: HttpRequest): Promise<T> {
    const policy: RetryPolicy = { ...DEFAULT_RETRY_POLICY, ...this.config.retry };
    const maxAttempts = req.skipRetry ? 1 : policy.maxAttempts;

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.doOnce<T>(req, attempt);
      } catch (err) {
        lastError = err;
        const isRetryable = policy.isRetryable
          ? policy.isRetryable(err, attempt)
          : defaultIsRetryable(err);

        const isFinal = attempt >= maxAttempts || !isRetryable;

        this.config.telemetry?.onError?.({
          error: err,
          durationMs: 0,
          attempt,
          final: isFinal,
        });

        if (isFinal || !isRetryable) break;

        const delay = computeBackoff(policy, attempt);
        await sleep(delay);
      }
    }
    throw lastError;
  }

  // ---------------------------------------------------------------------------
  // Single HTTP round-trip
  // ---------------------------------------------------------------------------

  private async doOnce<T>(req: HttpRequest, attempt: number): Promise<T> {
    // Rate limit
    if (this.bucket) {
      await this.bucket.acquire();
    }

    // Build URL
    const url = new URL(this.baseURL + req.path);
    if (req.query) {
      for (const [k, v] of Object.entries(req.query)) {
        if (v !== undefined && v !== null && v !== "") {
          url.searchParams.set(k, String(v));
        }
      }
    }

    // Build headers
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
      "User-Agent": this.config.userAgent ?? "revolut-client/1.0.0",
      ...req.headers,
    };
    if (req.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (this.config.apiVersion) {
      headers["Revolut-Api-Version"] = this.config.apiVersion;
    }

    this.config.telemetry?.onRequest?.({
      method: req.method,
      url: url.toString(),
      attempt,
    });

    const startMs = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 30_000);

    let fetchResponse: Response;
    try {
      fetchResponse = await this.fetchFn(url.toString(), {
        method: req.method,
        headers,
        ...(req.body !== undefined ? { body: JSON.stringify(req.body) } : {}),
        signal: controller.signal,
      });
    } catch (err) {
      throw new NetworkError(
        `Fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        err
      );
    } finally {
      clearTimeout(timeoutId);
    }

    const durationMs = Date.now() - startMs;
    const requestId = fetchResponse.headers.get("x-request-id") ?? undefined;

    this.config.telemetry?.onResponse?.({
      statusCode: fetchResponse.status,
      durationMs,
      attempt,
      ...(requestId !== undefined ? { requestId } : {}),
    });

    // Parse body
    const text = await fetchResponse.text();
    let parsed: unknown;
    try {
      parsed = text.length > 0 ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }

    // Map non-2xx to APIError
    if (fetchResponse.status < 200 || fetchResponse.status >= 300) {
      const body = (parsed ?? {}) as Record<string, unknown>;
      const detailsBody = typeof body === "object" && body !== null ? body : undefined;
      throw new APIError({
        statusCode: fetchResponse.status,
        code: httpStatusToCode(fetchResponse.status),
        message: typeof body["message"] === "string" ? body["message"] : fetchResponse.statusText,
        ...(requestId !== undefined ? { requestId } : {}),
        ...(detailsBody !== undefined ? { details: detailsBody } : {}),
      });
    }

    return parsed as T;
  }

  // ---------------------------------------------------------------------------
  // Convenience methods
  // ---------------------------------------------------------------------------

  get<T>(path: string, query?: HttpRequest["query"]): Promise<T> {
    const req: HttpRequest =
      query !== undefined ? { method: "GET", path, query } : { method: "GET", path };
    return this.request<T>(req);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: "POST", path, body });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: "PATCH", path, body });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: "PUT", path, body });
  }

  delete<T = void>(path: string): Promise<T> {
    return this.request<T>({ method: "DELETE", path });
  }
}

// ---------------------------------------------------------------------------
// Path builder helpers
// ---------------------------------------------------------------------------

export function buildPath(...segments: string[]): string {
  return `/${segments.map((s) => s.replace(/^\/|\/$/g, "")).join("/")}`;
}

export function assertRequired<T>(value: T | undefined | null, field: string): asserts value is T {
  if (value === undefined || value === null || value === "") {
    throw new ValidationError(field, "is required");
  }
}
