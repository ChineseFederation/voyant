// @vitest-environment jsdom

import type { PublicPaymentSession } from "@voyant-travel/finance/public-validation"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { VoyantFetcher } from "../client.js"
import { VoyantFinanceProvider } from "../provider.js"
import {
  type PaymentEmbeddedCheckoutClientProps,
  PaymentLinkLandingPage,
} from "./payment-link-landing-page.js"

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const baseSession: PublicPaymentSession = {
  id: "ps_123",
  target: null,
  provenance: null,
  targetType: "booking",
  targetId: null,
  bookingId: "book_123",
  legacyOrderId: null,
  invoiceId: null,
  bookingPaymentScheduleId: null,
  bookingGuaranteeId: null,
  status: "requires_redirect",
  provider: "netopia",
  providerConnectionId: null,
  providerSessionId: "provider_session_123",
  providerPaymentId: null,
  externalReference: null,
  clientReference: null,
  currency: "EUR",
  amountCents: 1234,
  paymentMethod: "credit_card",
  payerEmail: "traveler@example.com",
  payerName: "Traveler",
  redirectUrl: "https://pay.example.com/stale",
  checkout: null,
  returnUrl: null,
  cancelUrl: null,
  expiresAt: null,
  completedAt: null,
  failureCode: null,
  failureMessage: null,
  notes: null,
}

describe("PaymentLinkLandingPage", () => {
  let container: HTMLDivElement
  let root: Root
  let fetcher: ReturnType<typeof vi.fn<VoyantFetcher>>

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    fetcher = vi.fn<VoyantFetcher>(async () => Response.json({ data: { redirectUrl: null } }))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("continues a redirect session without starting the processor again", async () => {
    await act(async () => {
      root.render(
        <VoyantFinanceProvider baseUrl="https://api.example.test/api/" fetcher={fetcher}>
          <PaymentLinkLandingPage session={baseSession} />
        </VoyantFinanceProvider>,
      )
    })

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click()
    })

    expect(fetcher).not.toHaveBeenCalled()
  })

  it("asks for redirect only when no embedded client is wired", async () => {
    const pending = { ...baseSession, status: "pending" as const, redirectUrl: null }
    fetcher.mockResolvedValue(
      Response.json({ data: { redirectUrl: "https://pay.example.com/go", checkout: null } }),
    )

    await act(async () => {
      root.render(
        <VoyantFinanceProvider baseUrl="https://api.example.test/api/" fetcher={fetcher}>
          <PaymentLinkLandingPage session={pending} />
        </VoyantFinanceProvider>,
      )
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click()
    })

    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))
    expect(body.acceptedCheckoutHandoffs).toBeUndefined()
  })

  it("mounts the deployment's form instead of redirecting when one is wired", async () => {
    const pending = { ...baseSession, status: "pending" as const, redirectUrl: null }
    fetcher.mockResolvedValue(
      Response.json({
        data: {
          redirectUrl: null,
          checkout: {
            kind: "embedded",
            clientSecret: "seti_secret_1",
            publishableKey: "pk_test_1",
          },
        },
      }),
    )
    // Typed by its props so the assertions below see the real parameter, not
    // an empty tuple under noUncheckedIndexedAccess.
    const client = vi.fn((props: PaymentEmbeddedCheckoutClientProps) => (
      <div data-testid="embedded-form">card form for {props.publishableKey}</div>
    ))

    await act(async () => {
      root.render(
        <VoyantFinanceProvider baseUrl="https://api.example.test/api/" fetcher={fetcher}>
          <PaymentLinkLandingPage embeddedCheckoutClient={client} session={pending} />
        </VoyantFinanceProvider>,
      )
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click()
    })

    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))
    expect(body.acceptedCheckoutHandoffs).toEqual(["embedded", "redirect"])
    expect(container.querySelector("[data-testid=embedded-form]")).not.toBeNull()
    // The secret is handed over behind a callback, never as a rendered prop.
    expect(client.mock.calls[0]?.[0]).toMatchObject({ publishableKey: "pk_test_1" })
    expect(client.mock.calls[0]?.[0]?.fetchClientSecret).toBeTypeOf("function")
    expect(container.innerHTML).not.toContain("seti_secret_1")
  })

  it("falls back to a message rather than a blank panel when the client is missing", async () => {
    const embedded = {
      ...baseSession,
      redirectUrl: null,
      checkout: {
        kind: "embedded" as const,
        clientSecret: "seti_secret_1",
        publishableKey: "pk_test_1",
      },
    }

    await act(async () => {
      root.render(
        <VoyantFinanceProvider baseUrl="https://api.example.test/api/" fetcher={fetcher}>
          <PaymentLinkLandingPage session={embedded} />
        </VoyantFinanceProvider>,
      )
    })

    // No client, so the stored embedded arm is ignored entirely and the page
    // stays on its redirect path rather than rendering an empty form slot.
    expect(container.innerHTML).not.toContain("seti_secret_1")
    expect(container.querySelector("button")).not.toBeNull()
  })
})
