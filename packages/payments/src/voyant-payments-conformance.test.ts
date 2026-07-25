import { describe, expect, it, vi } from "vitest"

import {
  createRemotePaymentAdapter,
  findPaymentProviderDescriptor,
  type PaymentAdapterErrorCode,
  type PaymentInitiationInput,
  runPaymentAdapterConformance,
} from "./index.js"
import { createControlPlaneRemotePaymentTransport } from "./remote-transport.js"

const identity = {
  providerId: "voyant-payments",
  connectionId: "pacc_conformance",
}
const money = { amountMinor: 10_000, currency: "RON" }

describe("Voyant Payments public adapter acceptance", () => {
  it("passes the public kit with the real hosted capability advertisement", async () => {
    // This is the concrete OSS managed adapter plus its concrete HTTP
    // transport, exercised against an in-process platform contract harness.
    // It is intentionally not presented as a deployed Stripe integration run.
    const platform = createVoyantPaymentsPlatformHarness()
    const descriptor = findPaymentProviderDescriptor("voyant-payments")
    expect(descriptor).toBeDefined()
    const adapter = createRemotePaymentAdapter({
      id: "voyant-payments",
      label: "Voyant Payments",
      mode: "sandbox",
      capabilities: descriptor!.capabilities,
      connectionRef: identity.connectionId,
      transport: createControlPlaneRemotePaymentTransport({
        endpoint: "https://payments.test/admin-runtime/payments",
        deploymentToken: "deployment-token",
        deploymentId: "deployment-conformance",
        fetchImpl: platform.fetch,
      }),
    })
    const callback = (signature: string | undefined, rawBody: string) => ({
      headers: signature ? { "x-voyant-signature": signature } : {},
      rawBody,
      receivedAt: "2026-07-25T08:00:00.000Z",
      connectionId: identity.connectionId,
    })

    const results = await runPaymentAdapterConformance({
      adapter,
      context: { env: {} },
      initiation: {
        paymentSessionId: "psess_conformance",
        money,
        description: "Conformance payment",
        returnUrl: "https://merchant.test/return",
        cancelUrl: "https://merchant.test/cancel",
        idempotencyKey: "init_conformance",
      },
      status: {
        paymentSessionId: "psess_conformance",
        processorSessionId: "cs_conformance",
        processorPaymentId: "pi_conformance",
        processorIdentity: identity,
      },
      signedCallback: callback("valid", '{"eventId":"evt_conformance"}'),
      duplicateCallback: callback("valid", '{"eventId":"evt_conformance","delivery":2}'),
      unsignedCallback: callback(undefined, '{"eventId":"evt_conformance"}'),
      invalidSignatureCallback: callback("invalid", '{"eventId":"evt_conformance"}'),
      malformedCallback: callback("valid", "{"),
      replayCallback: callback("replay", '{"eventId":"evt_old"}'),
    })

    expect(results.filter((result) => !result.passed)).toEqual([])
    expect(platform.fetch).toHaveBeenCalled()
    expect(platform.paths).toEqual(
      expect.arrayContaining(["/initiate", "/status", "/callback/verify", "/health"]),
    )
  })
})

function createVoyantPaymentsPlatformHarness() {
  const idempotency = new Map<string, { fingerprint: string; result: unknown }>()
  const paths: string[] = []

  const error = (code: PaymentAdapterErrorCode, message: string): Response =>
    response({
      data: {
        ok: false,
        error: { code, message, retryable: false },
      },
    })

  const idempotent = (key: string, input: unknown, result: unknown): Response => {
    const fingerprint = JSON.stringify(input)
    const previous = idempotency.get(key)
    if (previous) {
      return previous.fingerprint === fingerprint
        ? response({ data: { ok: true, result: previous.result } })
        : error("IDEMPOTENCY_KEY_REUSED", "Idempotency key payload changed.")
    }
    idempotency.set(key, { fingerprint, result })
    return response({ data: { ok: true, result } })
  }

  const fetchImpl = vi.fn<typeof fetch>(async (request, init) => {
    const path = new URL(String(request)).pathname.replace("/admin-runtime/payments", "")
    paths.push(path)
    const input = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>

    if (path === "/health") {
      return response({
        data: {
          ok: true,
          result: {
            status: "ok",
            checkedAt: "2026-07-25T08:00:00.000Z",
            details: { providerId: "voyant-payments" },
          },
        },
      })
    }
    if (path === "/callback/verify") {
      const headers = input.headers as Record<string, string>
      const signature = headers["x-voyant-signature"]
      if (!signature) {
        return response({ data: { verified: false, reason: "missing_signature" } })
      }
      if (signature === "invalid") {
        return response({ data: { verified: false, reason: "invalid_signature" } })
      }
      if (signature === "replay") {
        return response({ data: { verified: false, reason: "replay" } })
      }
      try {
        JSON.parse(String(input.rawBody))
      } catch {
        return response({ data: { verified: false, reason: "malformed" } })
      }
      return response({
        data: {
          verified: true,
          event: {
            eventId: "evt_conformance",
            paymentSessionId: "psess_conformance",
            nextState: "paid",
            occurredAt: "2026-07-25T08:00:00.000Z",
            processorSessionId: "cs_conformance",
            processorPaymentId: "pi_conformance",
            processorIdentity: identity,
            money,
            idempotencyKey: "evt_conformance",
          },
        },
      })
    }

    const suppliedMoney = input.money as { amountMinor?: unknown; currency?: unknown } | undefined
    if (
      suppliedMoney &&
      (!Number.isSafeInteger(suppliedMoney.amountMinor) ||
        Number(suppliedMoney.amountMinor) <= 0 ||
        !/^[A-Z]{3}$/.test(String(suppliedMoney.currency)))
    ) {
      return error("INVALID_REQUEST", "Invalid money.")
    }
    if (path === "/initiate") {
      const initiation = input as unknown as PaymentInitiationInput
      const result = {
        processorSessionId:
          initiation.paymentSessionId === "psess_conformance"
            ? "cs_conformance"
            : `cs_${initiation.paymentSessionId}`,
        processorPaymentId:
          initiation.paymentSessionId === "psess_conformance"
            ? "pi_conformance"
            : `pi_${initiation.paymentSessionId}`,
        processorIdentity: identity,
        checkout: {
          kind: "hosted_checkout",
          url: `https://checkout.test/${initiation.paymentSessionId}`,
        },
        nextState: initiation.captureMode === "manual" ? "authorized" : "requires_redirect",
        idempotencyKey: initiation.idempotencyKey,
      }
      return idempotent(initiation.idempotencyKey, initiation, result)
    }
    if (path === "/status") {
      return response({
        data: {
          ok: true,
          result: {
            nextState: "paid",
            processorSessionId: input.processorSessionId,
            processorPaymentId: input.processorPaymentId,
            processorIdentity: input.processorIdentity,
            money,
          },
        },
      })
    }
    return new Response(null, { status: 404 })
  })
  return { fetch: fetchImpl, paths }
}

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}
