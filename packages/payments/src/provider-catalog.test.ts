import { describe, expect, it } from "vitest"

import { defaultPaymentProviderCatalog, findPaymentProviderDescriptor } from "./default-catalog.js"
import { paymentAdapterRuntimePort } from "./index.js"
import { validatePaymentCredentials } from "./provider-catalog.js"
import { createRemotePaymentAdapter, PAYMENT_REMOTE_NOT_IMPLEMENTED } from "./remote-adapter.js"

const netopia = findPaymentProviderDescriptor("netopia")

describe("default payment provider catalog", () => {
  it("pins the canonical Netopia cross-repository descriptor", () => {
    expect(netopia).toEqual({
      id: "netopia",
      displayName: "Netopia Payments",
      description: "Card payments and hosted checkout for the Romanian market.",
      logoRef: "netopia",
      capabilities: {
        hostedCheckout: true,
        redirectCheckout: true,
        authorize: false,
        capture: false,
        void: false,
        refund: true,
        status: true,
        callbackSignatureVerification: true,
        idempotencyKeys: true,
        retrySafeInitiation: true,
      },
      connectionMethod: "credentials",
      availability: "available",
      modes: ["sandbox", "live"],
      regions: ["RO"],
      currencies: ["RON", "EUR", "USD"],
      credentialFieldSchema: [
        {
          key: "posSignature",
          label: "POS signature",
          kind: "secret",
          required: true,
          placeholder: "e.g. 2X4B-1AAA-...",
          helpText: "The POS signature (Semnătura) identifying your Netopia point of sale.",
          maxLength: 128,
        },
        {
          key: "apiKey",
          label: "API key",
          kind: "secret",
          required: true,
          helpText:
            "Your Netopia account API key (Security → API key), sent as the Authorization header to initiate payments.",
          maxLength: 512,
        },
        {
          key: "ipnPublicKey",
          label: "IPN public key",
          kind: "secret",
          required: true,
          helpText: "Public key used to verify signed Netopia callbacks (IPN).",
          maxLength: 8_192,
        },
      ],
    })
  })

  it("ships Netopia as available and Voyant Payments as coming soon", () => {
    expect(netopia?.availability).toBe("available")
    expect(findPaymentProviderDescriptor("voyant-payments")?.availability).toBe("coming_soon")
  })

  it("declares explicit connection methods without fake hosted-account credentials", () => {
    expect(netopia?.connectionMethod).toBe("credentials")
    expect(findPaymentProviderDescriptor("voyant-payments")).toMatchObject({
      availability: "coming_soon",
      connectionMethod: "embedded_onboarding",
      credentialFieldSchema: [],
    })
  })

  it("does not advertise a hosted refund without acting-user approval claims", () => {
    expect(findPaymentProviderDescriptor("voyant-payments")?.capabilities.refund).toBe(false)
  })

  it("declares only signature-verified callbacks", () => {
    for (const provider of defaultPaymentProviderCatalog) {
      expect(provider.capabilities.callbackSignatureVerification).toBe(true)
    }
  })
})

describe("createRemotePaymentAdapter", () => {
  it("produces an adapter that passes the runtime port contract", () => {
    const adapter = createRemotePaymentAdapter({
      id: "netopia",
      label: "Netopia Payments",
      mode: "sandbox",
      capabilities: netopia!.capabilities,
      connectionRef: "conn_test",
    })
    expect(() => paymentAdapterRuntimePort.test(adapter)).not.toThrow()
  })

  it("fails closed when no transport is configured", async () => {
    const adapter = createRemotePaymentAdapter({
      id: "netopia",
      label: "Netopia Payments",
      mode: "sandbox",
      capabilities: netopia!.capabilities,
      connectionRef: "conn_test",
    })
    await expect(adapter.health({ env: {} })).rejects.toMatchObject({
      code: PAYMENT_REMOTE_NOT_IMPLEMENTED,
    })
  })

  it("rejects credentials that are not signature-verified", () => {
    expect(() =>
      createRemotePaymentAdapter({
        id: "x",
        label: "X",
        mode: "sandbox",
        connectionRef: "c",
        capabilities: { ...netopia!.capabilities, callbackSignatureVerification: false },
      }),
    ).toThrow()
  })
})

describe("validatePaymentCredentials", () => {
  it("flags missing required fields", () => {
    const errors = validatePaymentCredentials(netopia!.credentialFieldSchema, {})
    expect(errors.map((error) => error.key)).toContain("apiKey")
  })

  it("passes when all required fields are present", () => {
    const errors = validatePaymentCredentials(netopia!.credentialFieldSchema, {
      apiKey: "k",
      posSignature: "sig",
      ipnPublicKey: "-----BEGIN PUBLIC KEY-----",
    })
    expect(errors).toEqual([])
  })
})
