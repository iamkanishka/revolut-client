/// <reference lib="dom" />
/**
 * HMAC-SHA256 utilities for webhook signature verification.
 *
 * Two implementations are provided:
 *
 * 1. **Async (Web Crypto API)** — `computeHMACAsync`, `computeRevolutSignatureAsync`,
 *    `verifyRevolutSignatureAsync`. Works everywhere: Node 18+, Deno, Bun,
 *    Cloudflare Workers, browser. No native deps.
 *
 * 2. **Sync (Node.js `node:crypto`)** — `computeHMAC`, `verifyHMAC`.
 *    Convenience wrappers for Node.js-only environments. Not available in
 *    edge runtimes — use the async variants there.
 *
 * Revolut Merchant signature format:
 *   signed = "v1." + Revolut-Request-Timestamp + "." + rawBody
 *   header = "v1=" + hex(HMAC-SHA256(signingSecret, signed))
 */

// ---------------------------------------------------------------------------
// Internal helpers — pure Web APIs, no Node.js globals
// ---------------------------------------------------------------------------

function inputToArrayBuffer(input: string | Uint8Array): ArrayBuffer {
  if (typeof input === "string") {
    // TextEncoder always returns a Uint8Array backed by a plain ArrayBuffer
    // TextEncoder().encode().buffer is always a plain ArrayBuffer (never SharedArrayBuffer).
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- lib.dom types this as ArrayBufferLike; the cast ensures ArrayBuffer
    return new TextEncoder().encode(input).buffer as ArrayBuffer;
  }
  // Copy to guarantee a plain ArrayBuffer (never SharedArrayBuffer)
  const copy = new ArrayBuffer(input.byteLength);
  new Uint8Array(copy).set(input);
  return copy;
}

function hexEncode(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexDecode(hex: string): Uint8Array {
  const clean = hex.replace(/^(?:v1|sha256)=/u, "");
  if (clean.length % 2 !== 0) return new Uint8Array(0);
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

// ---------------------------------------------------------------------------
// Async Web Crypto API (universal — Node 18+, Deno, Workers, browser)
// ---------------------------------------------------------------------------

/**
 * Compute `HMAC-SHA256(secret, payload)` and return the result as a
 * lowercase hex string. Uses the Web Crypto API — works in any runtime.
 */
export async function computeHMACAsync(
  secret: string,
  payload: string | Uint8Array
): Promise<string> {
  const key = await importHmacKey(secret);
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, inputToArrayBuffer(payload));
  return hexEncode(sig);
}

/**
 * Compute the Revolut Merchant webhook signature.
 *
 * Revolut's format: `HMAC-SHA256("v1.{timestamp}.{rawBody}")` → `"v1={hex}"`
 *
 * @param secret    - The webhook signing secret (`wsk_…`).
 * @param timestamp - Value of the `Revolut-Request-Timestamp` header.
 * @param body      - The raw, unmodified request body.
 * @returns `"v1={lowercase-hex}"` ready to compare against `Revolut-Signature`.
 */
export async function computeRevolutSignatureAsync(
  secret: string,
  timestamp: string,
  body: string | Uint8Array
): Promise<string> {
  const bodyStr = typeof body === "string" ? body : new TextDecoder().decode(body);
  const hex = await computeHMACAsync(secret, `v1.${timestamp}.${bodyStr}`);
  return `v1=${hex}`;
}

/**
 * Verify a Revolut Merchant webhook signature using constant-time comparison.
 *
 * @returns `true` if the signature is valid, `false` otherwise.
 */
export async function verifyRevolutSignatureAsync(
  secret: string,
  timestamp: string,
  body: string | Uint8Array,
  sigHeader: string
): Promise<boolean> {
  const expected = await computeRevolutSignatureAsync(secret, timestamp, body);
  // Constant-time comparison via XOR — same length guaranteed by hex encoding.
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(sigHeader);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Sync Node.js node:crypto wrappers (Node.js only)
// ---------------------------------------------------------------------------

/**
 * Typed subset of `node:crypto` used by the sync helpers.
 * Using a local interface instead of `typeof import("node:crypto")` means
 * the file compiles without `@types/node` in non-Node TypeScript projects.
 *
 * All methods use `Uint8Array` instead of `Buffer` so the signature is
 * compatible with both `Buffer` (a `Uint8Array` subclass) and plain
 * `Uint8Array`, while staying free of Node-specific globals in the type signature.
 */
interface NodeCryptoSubset {
  createHmac(
    algorithm: string,
    key: string | Uint8Array
  ): {
    update(data: string | Uint8Array): {
      digest(encoding: "hex"): string;
    };
  };
  /**
   * Note: Node's actual signature uses `Buffer`, but `Buffer extends Uint8Array`
   * so passing `Uint8Array` is always safe at runtime.
   */
  timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
}

/**
 * Lazily load `node:crypto`. Returns `null` in edge runtimes where it is
 * unavailable, allowing callers to fall back to the async Web Crypto API.
 *
 * We use `globalThis.require` with an `unknown` cast to avoid pulling in
 * `@types/node` for the global `require` declaration when this file is
 * compiled in a non-Node TypeScript environment.
 */
function getNodeCrypto(): NodeCryptoSubset | null {
  try {
    // Resolve `require` via globalThis so it type-checks without @types/node.
    // At runtime on Node.js this is the CommonJS `require` function.
    const req =
      typeof globalThis !== "undefined" && "require" in globalThis
        ? (globalThis as Record<string, unknown>)["require"]
        : undefined;

    if (typeof req !== "function") return null;

    return (req as NodeJS.Require)("node:crypto") as NodeCryptoSubset;
  } catch {
    return null;
  }
}

/**
 * Compute `HMAC-SHA256(secret, payload)` synchronously using `node:crypto`.
 *
 * **Node.js only.** Throws in edge runtimes (Cloudflare Workers, Deno, etc.) —
 * use `computeHMACAsync` there instead.
 */
export function computeHMAC(secret: string, payload: string | Uint8Array): string {
  const nc = getNodeCrypto();
  if (!nc) {
    throw new Error(
      "computeHMAC: node:crypto is not available in this runtime. " +
        "Use computeHMACAsync instead."
    );
  }
  return nc.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Verify an HMAC-SHA256 signature synchronously using `node:crypto`.
 *
 * Accepts `v1=…` or `sha256=…` prefixed headers and strips them automatically.
 *
 * **Node.js only.** Throws if `node:crypto` is unavailable — use
 * `verifyRevolutSignatureAsync` in edge runtimes.
 */
export function verifyHMAC(
  secret: string,
  payload: string | Uint8Array,
  provided: string
): boolean {
  const expected = computeHMAC(secret, payload);

  // Hex-decode both sides (strips v1=, sha256= prefixes via hexDecode).
  const a = hexDecode(expected);
  const b = hexDecode(provided);

  if (a.length !== b.length) return false;

  const nc = getNodeCrypto();
  if (nc) {
    return nc.timingSafeEqual(a, b);
  }

  // Constant-time XOR fallback (should not be reached when node:crypto is present).
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
