import { describe, expect, it } from "vitest"

import {
  assertOutboundWebhookEndpointUrl,
  hashWebhookPayload,
  redactWebhookHeaders,
  signWebhookPayload,
  verifyWebhookPayloadSignature,
  webhookBodyExcerpt,
} from "./index.js"

describe("webhook delivery security", () => {
  it("uses a versioned SHA-256 HMAC signature", () => {
    expect(signWebhookPayload("secret", "123", '{"ok":true}')).toMatch(/^sha256=[a-f0-9]{64}$/)
  })

  it("verifies exact bytes with timestamp tolerance and rotated keys", () => {
    const body = '{"ok":true}'
    const timestamp = "1783771200"
    const oldKey = `old-${"x".repeat(32)}`
    const newKey = `new-${"x".repeat(32)}`
    const signature = signWebhookPayload(newKey, timestamp, body)

    expect(
      verifyWebhookPayloadSignature({
        body,
        timestamp,
        signature,
        keys: [
          { id: "old", secret: oldKey },
          { id: "new", secret: newKey },
        ],
        now: new Date("2026-07-11T12:00:30.000Z"),
      }),
    ).toEqual({ ok: true, keyId: "new" })
    expect(
      verifyWebhookPayloadSignature({
        body: '{"ok": false}',
        timestamp,
        signature,
        keys: [{ id: "new", secret: newKey }],
        now: new Date("2026-07-11T12:00:30.000Z"),
      }),
    ).toEqual({ ok: false, reason: "signature_mismatch" })
    expect(
      verifyWebhookPayloadSignature({
        body,
        timestamp,
        signature,
        keys: [{ id: "new", secret: newKey }],
        now: new Date("2026-07-11T12:10:01.000Z"),
      }),
    ).toEqual({ ok: false, reason: "timestamp_outside_tolerance" })
  })

  it("uses a cryptographic body fingerprint", () => {
    expect(hashWebhookPayload("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    )
  })

  it("redacts credentials and PII from persisted audit fields", () => {
    expect(
      redactWebhookHeaders({ Authorization: "secret", "x-voyant-signature": "signature" }),
    ).toEqual({ Authorization: "[REDACTED]", "x-voyant-signature": "[REDACTED]" })
    expect(webhookBodyExcerpt('{"email":"private@example.test","bookingId":"book_1"}')).toBe(
      '{"email":"[REDACTED]","bookingId":"book_1"}',
    )
  })

  it("bounds persisted excerpts", () => {
    expect(
      Buffer.byteLength(webhookBodyExcerpt("x".repeat(10_000)) ?? "", "utf8"),
    ).toBeLessThanOrEqual(4 * 1024)
  })

  it("rejects non-HTTPS and local webhook endpoints", () => {
    expect(() => assertOutboundWebhookEndpointUrl("http://app.example.test/hook")).toThrow(/HTTPS/)
    expect(() => assertOutboundWebhookEndpointUrl("https://localhost/hook")).toThrow(/not allowed/)
    expect(() => assertOutboundWebhookEndpointUrl("https://127.0.0.1/hook")).toThrow(/not allowed/)
    expect(() => assertOutboundWebhookEndpointUrl("https://100.64.0.1/hook")).toThrow(/not allowed/)
    expect(() => assertOutboundWebhookEndpointUrl("https://192.0.2.1/hook")).toThrow(/not allowed/)
    expect(() => assertOutboundWebhookEndpointUrl("https://198.51.100.1/hook")).toThrow(
      /not allowed/,
    )
    expect(() => assertOutboundWebhookEndpointUrl("https://203.0.113.1/hook")).toThrow(
      /not allowed/,
    )
    expect(() => assertOutboundWebhookEndpointUrl("https://[::1]/hook")).toThrow(/not allowed/)
    expect(() => assertOutboundWebhookEndpointUrl("https://[::ffff:127.0.0.1]/hook")).toThrow(
      /not allowed/,
    )
    expect(() => assertOutboundWebhookEndpointUrl("https://[ff02::1]/hook")).toThrow(/not allowed/)
    expect(() => assertOutboundWebhookEndpointUrl("https://[fec0::1]/hook")).toThrow(/not allowed/)
    expect(() => assertOutboundWebhookEndpointUrl("https://[2001:db8::1]/hook")).toThrow(
      /not allowed/,
    )
    expect(() => assertOutboundWebhookEndpointUrl("https://service.internal/hook")).toThrow(
      /not allowed/,
    )
    expect(() =>
      assertOutboundWebhookEndpointUrl("https://user:pass@app.example.test/hook"),
    ).toThrow(/credentials/)
    expect(() =>
      assertOutboundWebhookEndpointUrl("https://app.example.test/hook#fragment"),
    ).toThrow(/fragment/)
    expect(() => assertOutboundWebhookEndpointUrl("https://app.example.test/hook")).not.toThrow()
  })
})
