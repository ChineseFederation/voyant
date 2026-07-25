import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import {
  canConfigurePaymentProvider,
  canDisconnectPaymentProvider,
  PaymentEmbeddedOnboardingBoundary,
  type PaymentEmbeddedOnboardingClientProps,
  paymentConnectionStatusLabel,
  requestPaymentOnboardingSession,
} from "./payments-settings-page.js"

describe("PaymentEmbeddedOnboardingBoundary", () => {
  it("does not render the ephemeral AccountSession secret", () => {
    const html = renderToStaticMarkup(
      <PaymentEmbeddedOnboardingBoundary
        session={{
          type: "embedded_onboarding",
          publishableKey: "pk_test_public",
          clientSecret: "secret_that_must_not_reach_markup",
          expiresAt: "2026-07-25T12:00:00.000Z",
        }}
        refreshClientSecret={vi.fn(async () => "fresh_secret")}
        onExit={() => undefined}
        fallbackTitle="Unavailable"
        fallbackDescription="Install the embedded client."
      />,
    )

    expect(html).toContain("Unavailable")
    expect(html).not.toContain("secret_that_must_not_reach_markup")
    expect(html).not.toContain("clientSecret")
  })

  it("gives an injected client a callback instead of a secret prop", async () => {
    const observed: PaymentEmbeddedOnboardingClientProps[] = []
    const refreshClientSecret = vi.fn(async () => "refreshed_account_session_secret")
    const Client = (props: PaymentEmbeddedOnboardingClientProps) => {
      observed.push(props)
      return <div data-testid="embedded-onboarding" />
    }

    const html = renderToStaticMarkup(
      <PaymentEmbeddedOnboardingBoundary
        session={{
          type: "embedded_onboarding",
          publishableKey: "pk_test_public",
          clientSecret: "account_session_secret",
          expiresAt: "2026-07-25T12:00:00.000Z",
        }}
        client={Client}
        refreshClientSecret={refreshClientSecret}
        onExit={vi.fn()}
        fallbackTitle="Unavailable"
        fallbackDescription="Install the embedded client."
      />,
    )

    expect(html).toContain('data-testid="embedded-onboarding"')
    expect(html).not.toContain("account_session_secret")
    expect(observed[0]).not.toHaveProperty("clientSecret")
    expect(observed[0]?.publishableKey).toBe("pk_test_public")
    expect(observed[0]?.fetchClientSecret).toEqual(expect.any(Function))
    await expect(observed[0]?.fetchClientSecret()).resolves.toBe("account_session_secret")
    await expect(observed[0]?.fetchClientSecret()).resolves.toBe("refreshed_account_session_secret")
    await expect(observed[0]?.fetchClientSecret()).resolves.toBe("refreshed_account_session_secret")
    expect(refreshClientSecret).toHaveBeenCalledTimes(2)
  })

  it("replaces refresh errors instead of exposing potentially sensitive details", async () => {
    const observed: PaymentEmbeddedOnboardingClientProps[] = []
    const Client = (props: PaymentEmbeddedOnboardingClientProps) => {
      observed.push(props)
      return null
    }

    renderToStaticMarkup(
      <PaymentEmbeddedOnboardingBoundary
        session={{
          type: "embedded_onboarding",
          publishableKey: "pk_test_public",
          clientSecret: "initial_secret",
          expiresAt: "2026-07-25T12:00:00.000Z",
        }}
        client={Client}
        refreshClientSecret={async () => {
          throw new Error("upstream accidentally included secret_value")
        }}
        onExit={vi.fn()}
        fallbackTitle="Unavailable"
        fallbackDescription="Safe generic failure"
      />,
    )

    await expect(observed[0]?.fetchClientSecret()).resolves.toBe("initial_secret")
    await expect(observed[0]?.fetchClientSecret()).rejects.toThrow("Safe generic failure")
  })
})

describe("payments settings contract", () => {
  it("posts hosted setup to the onboarding endpoint without putting secrets in the URL", async () => {
    const fetcher = vi.fn(async (_input: string, _init?: RequestInit) =>
      Response.json({
        data: {
          ok: true,
          status: {
            activeProviderId: "voyant-payments",
            status: "pending_requirements",
            mode: "sandbox",
          },
          session: {
            type: "embedded_onboarding",
            publishableKey: "pk_test_public",
            clientSecret: "ephemeral_secret",
            expiresAt: "2026-07-25T12:00:00.000Z",
          },
        },
      }),
    )

    const result = await requestPaymentOnboardingSession(
      fetcher,
      "/api",
      "voyant-payments",
      "sandbox",
      "Failed",
    )

    expect(fetcher).toHaveBeenCalledWith("/api/v1/admin/settings/payments/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: "voyant-payments", mode: "sandbox" }),
    })
    expect(fetcher.mock.calls[0]?.[0]).not.toContain("ephemeral_secret")
    expect(result.session?.clientSecret).toBe("ephemeral_secret")
  })

  it("does not reflect an onboarding endpoint error body into browser errors", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        { error: "server accidentally included account_session_secret" },
        { status: 500 },
      ),
    )

    await expect(
      requestPaymentOnboardingSession(
        fetcher,
        "/api",
        "voyant-payments",
        "sandbox",
        "Safe generic failure",
      ),
    ).rejects.toThrow("Safe generic failure")
  })

  it("labels every readiness state and keeps unavailable providers disabled", () => {
    const labels = {
      pending_requirements: "Action required",
      pending_verification: "Verification pending",
      connected: "Connected",
      restricted: "Restricted",
      error: "Connection error",
      disconnected: "Not connected",
    }

    expect(
      Object.keys(labels).map((state) =>
        paymentConnectionStatusLabel(state as keyof typeof labels, labels),
      ),
    ).toEqual(Object.values(labels))
    expect(
      canConfigurePaymentProvider({
        availability: "coming_soon",
        connectionMethod: "embedded_onboarding",
      }),
    ).toBe(false)
    expect(
      canConfigurePaymentProvider({
        availability: "available",
        connectionMethod: "read_only",
      }),
    ).toBe(false)
    expect(
      canConfigurePaymentProvider({
        availability: "available",
        connectionMethod: "credentials",
      }),
    ).toBe(true)
    expect(
      canDisconnectPaymentProvider({
        connectionMethod: "embedded_onboarding",
      }),
    ).toBe(false)
    expect(canDisconnectPaymentProvider(undefined)).toBe(false)
    expect(
      canDisconnectPaymentProvider({
        connectionMethod: "credentials",
      }),
    ).toBe(true)
  })
})
