import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebhookHandler, verifyWebhookSignature, computeWebhookSignature } from "./index.js";
import { WebhookError } from "../errors/index.js";

// ---------------------------------------------------------------------------
// Test key from Revolut docs (example only — not a real credential)
// ---------------------------------------------------------------------------
const TEST_SECRET = "wsk_test_secret_for_unit_tests_only"; // not a real key

async function makeSignedHeaders(secret: string, body: string, timestamp: string) {
  const sig = await computeWebhookSignature({ secret, timestamp, body });
  return {
    "revolut-signature": sig,
    "revolut-request-timestamp": timestamp,
  };
}

// ---------------------------------------------------------------------------
// computeWebhookSignature
// ---------------------------------------------------------------------------

describe("computeWebhookSignature", () => {
  it("returns v1= prefixed hex string", async () => {
    const sig = await computeWebhookSignature({
      secret: TEST_SECRET,
      timestamp: "1683650202360",
      body: '{"event":"ORDER_COMPLETED"}',
    });
    expect(sig).toMatch(/^v1=[a-f0-9]{64}$/);
  });

  it("different timestamps produce different signatures", async () => {
    const a = await computeWebhookSignature({
      secret: TEST_SECRET,
      timestamp: "1000",
      body: "payload",
    });
    const b = await computeWebhookSignature({
      secret: TEST_SECRET,
      timestamp: "2000",
      body: "payload",
    });
    expect(a).not.toBe(b);
  });

  it("different secrets produce different signatures", async () => {
    const a = await computeWebhookSignature({
      secret: "secret_a",
      timestamp: "1000",
      body: "payload",
    });
    const b = await computeWebhookSignature({
      secret: "secret_b",
      timestamp: "1000",
      body: "payload",
    });
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// verifyWebhookSignature
// ---------------------------------------------------------------------------

describe("verifyWebhookSignature", () => {
  it("returns true for a valid signature", async () => {
    const body = '{"event":"ORDER_COMPLETED","order_id":"ord_123"}';
    const timestamp = "1683650202360";
    const sig = await computeWebhookSignature({ secret: TEST_SECRET, timestamp, body });
    const valid = await verifyWebhookSignature({
      secret: TEST_SECRET,
      timestamp,
      body,
      sigHeader: sig,
    });
    expect(valid).toBe(true);
  });

  it("returns false for tampered body", async () => {
    const timestamp = "1683650202360";
    const body = '{"event":"ORDER_COMPLETED"}';
    const tampered = '{"event":"ORDER_CANCELLED"}';
    const sig = await computeWebhookSignature({ secret: TEST_SECRET, timestamp, body });
    const valid = await verifyWebhookSignature({
      secret: TEST_SECRET,
      timestamp,
      body: tampered,
      sigHeader: sig,
    });
    expect(valid).toBe(false);
  });

  it("returns false for wrong secret", async () => {
    const timestamp = "1000";
    const body = "hello";
    const sig = await computeWebhookSignature({ secret: "correct_secret", timestamp, body });
    const valid = await verifyWebhookSignature({
      secret: "wrong_secret",
      timestamp,
      body,
      sigHeader: sig,
    });
    expect(valid).toBe(false);
  });

  it("returns false for tampered signature", async () => {
    const valid = await verifyWebhookSignature({
      secret: TEST_SECRET,
      timestamp: "1000",
      body: "payload",
      sigHeader: "v1=0000000000000000000000000000000000000000000000000000000000000000",
    });
    expect(valid).toBe(false);
  });

  it("handles Uint8Array body", async () => {
    const bodyStr = '{"event":"ORDER_COMPLETED"}';
    const body = new TextEncoder().encode(bodyStr);
    const timestamp = "1683650202360";
    const sig = await computeWebhookSignature({ secret: TEST_SECRET, timestamp, body });
    const valid = await verifyWebhookSignature({
      secret: TEST_SECRET,
      timestamp,
      body,
      sigHeader: sig,
    });
    expect(valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// WebhookHandler — signature verification
// ---------------------------------------------------------------------------

describe("WebhookHandler — signature verification", () => {
  it("verifies valid signature and calls handler", async () => {
    const body = '{"event":"ORDER_COMPLETED","order_id":"ord_abc"}';
    const timestamp = String(Date.now());
    const headers = await makeSignedHeaders(TEST_SECRET, body, timestamp);

    const onCompleted = vi.fn();
    const handler = new WebhookHandler({ secret: TEST_SECRET });
    handler.on("ORDER_COMPLETED", onCompleted);

    await handler.processRequest(body, headers);
    expect(onCompleted).toHaveBeenCalledOnce();
    expect(onCompleted.mock.calls[0]![0].order_id).toBe("ord_abc");
  });

  it("throws WebhookError for missing Revolut-Signature header", async () => {
    const handler = new WebhookHandler({ secret: TEST_SECRET });
    await expect(
      handler.processRequest('{"event":"ORDER_COMPLETED"}', {
        "revolut-request-timestamp": String(Date.now()),
      })
    ).rejects.toThrow(WebhookError);
  });

  it("throws WebhookError for missing timestamp header", async () => {
    const handler = new WebhookHandler({ secret: TEST_SECRET });
    await expect(
      handler.processRequest('{"event":"ORDER_COMPLETED"}', {
        "revolut-signature": "v1=abc123",
      })
    ).rejects.toThrow(WebhookError);
  });

  it("throws WebhookError for invalid signature", async () => {
    const handler = new WebhookHandler({ secret: TEST_SECRET });
    await expect(
      handler.processRequest('{"event":"ORDER_COMPLETED"}', {
        "revolut-signature": "v1=0000000000000000000000000000000000000000000000000000000000000000",
        "revolut-request-timestamp": String(Date.now()),
      })
    ).rejects.toThrow(WebhookError);
  });

  it("accepts any payload when no secret configured", async () => {
    const onCompleted = vi.fn();
    const handler = new WebhookHandler();
    handler.on("ORDER_COMPLETED", onCompleted);
    await handler.processRequest('{"event":"ORDER_COMPLETED","order_id":"ord_1"}', {});
    expect(onCompleted).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// WebhookHandler — timestamp validation
// ---------------------------------------------------------------------------

describe("WebhookHandler — timestamp validation", () => {
  it("rejects events older than 5 minutes when validateTimestamp is true", async () => {
    const body = '{"event":"ORDER_COMPLETED"}';
    const oldTimestamp = String(Date.now() - 6 * 60 * 1000); // 6 minutes ago
    const sig = await computeWebhookSignature({
      secret: TEST_SECRET,
      timestamp: oldTimestamp,
      body,
    });
    const handler = new WebhookHandler({ secret: TEST_SECRET, validateTimestamp: true });
    await expect(
      handler.processRequest(body, {
        "revolut-signature": sig,
        "revolut-request-timestamp": oldTimestamp,
      })
    ).rejects.toThrow(WebhookError);
  });

  it("accepts events within 5 minutes when validateTimestamp is true", async () => {
    const body = '{"event":"ORDER_COMPLETED","order_id":"ord_1"}';
    const timestamp = String(Date.now() - 2 * 60 * 1000); // 2 minutes ago
    const sig = await computeWebhookSignature({ secret: TEST_SECRET, timestamp, body });
    const called = vi.fn();
    const handler = new WebhookHandler({ secret: TEST_SECRET, validateTimestamp: true });
    handler.on("ORDER_COMPLETED", called);
    await handler.processRequest(body, {
      "revolut-signature": sig,
      "revolut-request-timestamp": timestamp,
    });
    expect(called).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// WebhookHandler — event dispatch
// ---------------------------------------------------------------------------

describe("WebhookHandler — event dispatch", () => {
  it("dispatches ORDER_AUTHORISED event", async () => {
    const fn = vi.fn();
    const handler = new WebhookHandler();
    handler.on("ORDER_AUTHORISED", fn);
    await handler.processRequest('{"event":"ORDER_AUTHORISED","order_id":"ord_1"}', {});
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({ event: "ORDER_AUTHORISED" }));
  });

  it("dispatches DISPUTE_ACTION_REQUIRED event", async () => {
    const fn = vi.fn();
    const handler = new WebhookHandler();
    handler.on("DISPUTE_ACTION_REQUIRED", fn);
    await handler.processRequest(
      '{"event":"DISPUTE_ACTION_REQUIRED","order_id":"ord_1","dispute_id":"dis_1"}',
      {}
    );
    expect(fn).toHaveBeenCalledOnce();
  });

  it("dispatches SUBSCRIPTION_INITIATED event", async () => {
    const fn = vi.fn();
    const handler = new WebhookHandler();
    handler.on("SUBSCRIPTION_INITIATED", fn);
    await handler.processRequest(
      '{"event":"SUBSCRIPTION_INITIATED","subscription_id":"sub_1"}',
      {}
    );
    expect(fn).toHaveBeenCalledOnce();
  });

  it("dispatches PAYOUT_COMPLETED event", async () => {
    const fn = vi.fn();
    const handler = new WebhookHandler();
    handler.on("PAYOUT_COMPLETED", fn);
    await handler.processRequest('{"event":"PAYOUT_COMPLETED","payout_id":"pay_1"}', {});
    expect(fn).toHaveBeenCalledOnce();
  });

  it("silently ignores unknown events (no handler registered)", async () => {
    const handler = new WebhookHandler();
    // Should not throw
    await expect(
      handler.processRequest('{"event":"ORDER_COMPLETED"}', {})
    ).resolves.toBeUndefined();
  });

  it("off() removes a handler", async () => {
    const fn = vi.fn();
    const handler = new WebhookHandler();
    handler.on("ORDER_COMPLETED", fn);
    handler.off("ORDER_COMPLETED");
    await handler.processRequest('{"event":"ORDER_COMPLETED"}', {});
    expect(fn).not.toHaveBeenCalled();
  });

  it("throws WebhookError for invalid JSON body", async () => {
    const handler = new WebhookHandler();
    await expect(handler.processRequest("not-valid-json", {})).rejects.toThrow(WebhookError);
  });

  it("calls onError handler instead of throwing", async () => {
    const onError = vi.fn();
    const handler = new WebhookHandler({ onError });
    handler.on("ORDER_COMPLETED", async () => {
      throw new Error("handler error");
    });
    await handler.processRequest('{"event":"ORDER_COMPLETED"}', {});
    expect(onError).toHaveBeenCalledOnce();
  });

  it("supports chaining .on() calls", async () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const handler = new WebhookHandler();
    handler.on("ORDER_COMPLETED", fn1).on("ORDER_CANCELLED", fn2);
    await handler.processRequest('{"event":"ORDER_COMPLETED"}', {});
    expect(fn1).toHaveBeenCalledOnce();
    expect(fn2).not.toHaveBeenCalled();
  });

  it("supports header lookup case-insensitively", async () => {
    const body = '{"event":"ORDER_COMPLETED","order_id":"ord_1"}';
    const timestamp = String(Date.now());
    const sig = await computeWebhookSignature({ secret: TEST_SECRET, timestamp, body });
    const fn = vi.fn();
    const handler = new WebhookHandler({ secret: TEST_SECRET });
    handler.on("ORDER_COMPLETED", fn);
    // Use uppercase header names
    await handler.processRequest(body, {
      "Revolut-Signature": sig,
      "Revolut-Request-Timestamp": timestamp,
    });
    expect(fn).toHaveBeenCalledOnce();
  });
});
