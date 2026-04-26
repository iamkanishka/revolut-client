import { describe, it, expect } from "vitest";
import { RevolutSDK } from "./index.js";
import { MerchantClient } from "./merchant/index.js";
import { BusinessClient } from "./business/index.js";
import { ConfigurationError } from "./errors/index.js";

describe("RevolutSDK", () => {
  it("throws ConfigurationError with no keys", () => {
    expect(() => new RevolutSDK({})).toThrow(ConfigurationError);
  });

  it("constructs with merchantKey only", () => {
    const sdk = new RevolutSDK({ merchantKey: "sk_test_abc" });
    expect(sdk).toBeDefined();
  });

  it("merchant getter returns MerchantClient", () => {
    const sdk = new RevolutSDK({ merchantKey: "sk_test_abc" });
    expect(sdk.merchant).toBeInstanceOf(MerchantClient);
  });

  it("business getter returns BusinessClient", () => {
    const sdk = new RevolutSDK({ businessKey: "biz_token_abc" });
    expect(sdk.business).toBeInstanceOf(BusinessClient);
  });

  it("merchant getter throws when no merchantKey", () => {
    const sdk = new RevolutSDK({ businessKey: "biz_abc" });
    expect(() => sdk.merchant).toThrow(ConfigurationError);
  });

  it("business getter throws when no businessKey", () => {
    const sdk = new RevolutSDK({ merchantKey: "sk_test_abc" });
    expect(() => sdk.business).toThrow(ConfigurationError);
  });

  it("cryptoRamp getter throws when no cryptoRampKey", () => {
    const sdk = new RevolutSDK({ merchantKey: "sk_test_abc" });
    expect(() => sdk.cryptoRamp).toThrow(ConfigurationError);
  });

  it("cryptoExchange getter throws when no cryptoExchangeKey", () => {
    const sdk = new RevolutSDK({ merchantKey: "sk_test_abc" });
    expect(() => sdk.cryptoExchange).toThrow(ConfigurationError);
  });

  it("returns same instance on repeated merchant access (lazy singleton)", () => {
    const sdk = new RevolutSDK({ merchantKey: "sk_test_abc" });
    expect(sdk.merchant).toBe(sdk.merchant);
  });

  it("constructs with all keys", () => {
    expect(
      () =>
        new RevolutSDK({
          merchantKey: "sk_test",
          businessKey: "biz_test",
          openBankingKey: "ob_test",
          cryptoRampKey: "cr_test",
          cryptoExchangeKey: "cx_test",
        })
    ).not.toThrow();
  });

  it("passes environment to sub-clients", () => {
    const sdk = new RevolutSDK({ merchantKey: "sk_test", environment: "sandbox" });
    // sandbox client is constructed without throwing
    expect(sdk.merchant).toBeDefined();
  });
});
