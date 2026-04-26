import { describe, it, expect } from "vitest";
import {
  APIError,
  ValidationError,
  ConfigurationError,
  NetworkError,
  WebhookError,
  isAPIError,
  isValidationError,
  isNetworkError,
  isRevolutError,
  httpStatusToCode,
} from "./index.js";

describe("APIError", () => {
  it("creates with correct properties", () => {
    const err = new APIError({
      statusCode: 404,
      code: "NOT_FOUND",
      message: "not found",
      requestId: "req_123",
    });
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.requestId).toBe("req_123");
    expect(err.message).toContain("404");
    expect(err.message).toContain("req_123");
    expect(err.name).toBe("APIError");
  });

  it("isNotFound returns true for 404", () => {
    const err = new APIError({ statusCode: 404, code: "NOT_FOUND", message: "m" });
    expect(err.isNotFound).toBe(true);
    expect(err.isRateLimited).toBe(false);
    expect(err.isUnauthorized).toBe(false);
    expect(err.isServerError).toBe(false);
    expect(err.isRetryable).toBe(false);
  });

  it("isRateLimited returns true for 429", () => {
    const err = new APIError({ statusCode: 429, code: "RATE_LIMITED", message: "m" });
    expect(err.isRateLimited).toBe(true);
    expect(err.isRetryable).toBe(true);
  });

  it("isServerError and isRetryable for 500", () => {
    const err = new APIError({ statusCode: 500, code: "INTERNAL_SERVER_ERROR", message: "m" });
    expect(err.isServerError).toBe(true);
    expect(err.isRetryable).toBe(true);
  });

  it("isUnauthorized for 401", () => {
    const err = new APIError({ statusCode: 401, code: "UNAUTHORIZED", message: "m" });
    expect(err.isUnauthorized).toBe(true);
  });

  it("supports error cause chain", () => {
    const cause = new Error("root cause");
    const err = new APIError(
      { statusCode: 500, code: "INTERNAL_SERVER_ERROR", message: "m" },
      { cause }
    );
    expect(err.cause).toBe(cause);
  });
});

describe("ValidationError", () => {
  it("captures field name", () => {
    const err = new ValidationError("amount", "must be positive");
    expect(err.field).toBe("amount");
    expect(err.message).toContain("amount");
    expect(err.message).toContain("must be positive");
    expect(err.code).toBe("INVALID_REQUEST");
  });
});

describe("NetworkError", () => {
  it("creates with cause", () => {
    const cause = new Error("ECONNREFUSED");
    const err = new NetworkError("connection refused", cause);
    expect(err.code).toBe("NETWORK_ERROR");
    expect(err.cause).toBe(cause);
  });
});

describe("ConfigurationError", () => {
  it("has correct code", () => {
    const err = new ConfigurationError("apiKey is required");
    expect(err.code).toBe("CONFIGURATION_ERROR");
  });
});

describe("WebhookError", () => {
  it("has correct code", () => {
    const err = new WebhookError("invalid signature");
    expect(err.code).toBe("WEBHOOK_INVALID");
  });
});

describe("type guards", () => {
  it("isAPIError", () => {
    const err = new APIError({ statusCode: 400, code: "INVALID_REQUEST", message: "bad" });
    expect(isAPIError(err)).toBe(true);
    expect(isAPIError(new Error("plain"))).toBe(false);
    expect(isAPIError(null)).toBe(false);
  });

  it("isValidationError", () => {
    expect(isValidationError(new ValidationError("f", "m"))).toBe(true);
    expect(
      isValidationError(new APIError({ statusCode: 400, code: "INVALID_REQUEST", message: "m" }))
    ).toBe(false);
  });

  it("isNetworkError", () => {
    expect(isNetworkError(new NetworkError("conn"))).toBe(true);
    expect(isNetworkError(new Error())).toBe(false);
  });

  it("isRevolutError matches all SDK errors", () => {
    expect(
      isRevolutError(new APIError({ statusCode: 400, code: "INVALID_REQUEST", message: "m" }))
    ).toBe(true);
    expect(isRevolutError(new ValidationError("f", "m"))).toBe(true);
    expect(isRevolutError(new ConfigurationError("c"))).toBe(true);
    expect(isRevolutError(new NetworkError("n"))).toBe(true);
    expect(isRevolutError(new WebhookError("w"))).toBe(true);
    expect(isRevolutError(new Error("plain"))).toBe(false);
    expect(isRevolutError("string")).toBe(false);
  });
});

describe("httpStatusToCode", () => {
  it.each([
    [401, "UNAUTHORIZED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [409, "CONFLICT"],
    [422, "UNPROCESSABLE_ENTITY"],
    [429, "RATE_LIMITED"],
    [500, "INTERNAL_SERVER_ERROR"],
    [503, "INTERNAL_SERVER_ERROR"],
    [400, "INVALID_REQUEST"],
    [422, "UNPROCESSABLE_ENTITY"],
  ] as const)("maps %i to %s", (status, expected) => {
    expect(httpStatusToCode(status)).toBe(expected);
  });
});
