/**
 * @module errors
 * Structured error hierarchy. All errors extend RevolutError and carry
 * contextual metadata for production observability.
 */

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNPROCESSABLE_ENTITY"
  | "RATE_LIMITED"
  | "INTERNAL_SERVER_ERROR"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "INVALID_REQUEST"
  | "SIGNATURE_INVALID"
  | "WEBHOOK_INVALID"
  | "SERIALIZATION_ERROR"
  | "CONFIGURATION_ERROR";

// ---------------------------------------------------------------------------
// V8 captureStackTrace — optional, not part of the TypeScript standard lib.
// We declare it locally so we don't need @types/node just for this one call.
// ---------------------------------------------------------------------------

interface ErrorConstructorWithCapture {
  new (message?: string): Error;
  captureStackTrace(targetObject: object, constructorOpt?: Function): void;
}

function captureStack(target: object, ctor: Function): void {
  // Only available in V8 (Node.js / Chrome). Silently skip in other runtimes.
  const E = Error as unknown as Partial<ErrorConstructorWithCapture>;
  if (typeof E.captureStackTrace === "function") {
    E.captureStackTrace(target, ctor);
  }
}

// ---------------------------------------------------------------------------
// Base error
// ---------------------------------------------------------------------------

export abstract class RevolutError extends Error {
  abstract readonly code: ErrorCode;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
    captureStack(this, this.constructor);
  }
}

// ---------------------------------------------------------------------------
// API error — returned on non-2xx HTTP responses
// ---------------------------------------------------------------------------

export interface APIErrorInfo {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly message: string;
  readonly requestId?: string;
  readonly details?: Record<string, unknown>;
}

export class APIError extends RevolutError {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly requestId?: string;
  readonly details?: Record<string, unknown>;

  constructor(info: APIErrorInfo, options?: ErrorOptions) {
    super(
      `Revolut API [${info.statusCode}/${info.code}]: ${info.message}${
        info.requestId ? ` (request_id: ${info.requestId})` : ""
      }`,
      options
    );
    this.code = info.code;
    this.statusCode = info.statusCode;
    if (info.requestId !== undefined) this.requestId = info.requestId;
    if (info.details !== undefined) this.details = info.details;
  }

  /** `true` when the server returned 404 Not Found. */
  get isNotFound(): boolean {
    return this.statusCode === 404;
  }
  /** `true` when the server returned 429 Too Many Requests. */
  get isRateLimited(): boolean {
    return this.statusCode === 429;
  }
  /** `true` when the server returned 401 Unauthorized. */
  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }
  /** `true` for any 5xx Server Error. */
  get isServerError(): boolean {
    return this.statusCode >= 500;
  }
  /** `true` when the request should be retried (5xx or 429). */
  get isRetryable(): boolean {
    return this.isServerError || this.isRateLimited;
  }
}

// ---------------------------------------------------------------------------
// Validation error — caught before any HTTP request is sent
// ---------------------------------------------------------------------------

export class ValidationError extends RevolutError {
  readonly code = "INVALID_REQUEST" as const;

  constructor(
    readonly field: string,
    message: string
  ) {
    super(`Validation failed for "${field}": ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Configuration error — invalid SDK setup
// ---------------------------------------------------------------------------

export class ConfigurationError extends RevolutError {
  readonly code = "CONFIGURATION_ERROR" as const;

  constructor(message: string) {
    super(`SDK configuration error: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Network error — transport-level failures
// ---------------------------------------------------------------------------

export class NetworkError extends RevolutError {
  readonly code = "NETWORK_ERROR" as const;

  constructor(message: string, cause?: unknown) {
    super(`Network error: ${message}`, { cause });
  }
}

// ---------------------------------------------------------------------------
// Webhook error — signature or payload problems
// ---------------------------------------------------------------------------

export class WebhookError extends RevolutError {
  readonly code = "WEBHOOK_INVALID" as const;

  constructor(message: string) {
    super(`Webhook error: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isRevolutError(err: unknown): err is RevolutError {
  return err instanceof RevolutError;
}
export function isAPIError(err: unknown): err is APIError {
  return err instanceof APIError;
}
export function isValidationError(err: unknown): err is ValidationError {
  return err instanceof ValidationError;
}
export function isNetworkError(err: unknown): err is NetworkError {
  return err instanceof NetworkError;
}

// ---------------------------------------------------------------------------
// HTTP status → ErrorCode mapping
// ---------------------------------------------------------------------------

export function httpStatusToCode(status: number): ErrorCode {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 422) return "UNPROCESSABLE_ENTITY";
  if (status === 429) return "RATE_LIMITED";
  return status >= 500 ? "INTERNAL_SERVER_ERROR" : "INVALID_REQUEST";
}
