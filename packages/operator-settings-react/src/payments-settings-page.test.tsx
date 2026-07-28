import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import {
  canActivatePaymentConnection,
  canConfigurePaymentProvider,
  canDisconnectPaymentProvider,
  PaymentEmbeddedOnboardingBoundary,
  type PaymentEmbeddedOnboardingClientProps,
  paymentActivationControlState,
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
            activeProviderId: "voyant-pay",
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
      "voyant-pay",
      "sandbox",
      "Failed",
    )

    expect(fetcher).toHaveBeenCalledWith("/api/v1/admin/settings/payments/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: "voyant-pay", mode: "sandbox" }),
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
        "voyant-pay",
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

  it("only enables activation for ready, inactive, writable connections", () => {
    // Ready + inactive → the one activatable case.
    expect(
      canActivatePaymentConnection({ readiness: "ready", active: false, readOnly: false }),
    ).toBe(true)
    // Already the active default → no activation offered.
    expect(
      canActivatePaymentConnection({ readiness: "ready", active: true, readOnly: false }),
    ).toBe(false)
    // Not ready → gated off even when inactive.
    expect(
      canActivatePaymentConnection({ readiness: "not_ready", active: false, readOnly: false }),
    ).toBe(false)
    expect(
      canActivatePaymentConnection({ readiness: "unknown", active: false, readOnly: false }),
    ).toBe(false)
    // Env-pinned (read-only) connections cannot be re-activated here.
    expect(
      canActivatePaymentConnection({ readiness: "ready", active: false, readOnly: true }),
    ).toBe(false)
  })

  it("resolves the activation control to distinct active/activating/activatable/gated states", () => {
    const ready = { connectionId: "c1", readiness: "ready" as const, readOnly: false }

    // Already active → shows the default marker, no button.
    expect(paymentActivationControlState({ summary: { ...ready, active: true } })).toBe("active")

    // Ready + inactive, nothing pending → an actionable button.
    expect(paymentActivationControlState({ summary: { ...ready, active: false } })).toBe(
      "activatable",
    )

    // This connection's request is in flight → pending state (spinner).
    expect(
      paymentActivationControlState({
        summary: { ...ready, active: false },
        activatingConnectionId: "c1",
      }),
    ).toBe("activating")

    // A different connection is activating → this one stays activatable (the
    // component disables it to prevent duplicate concurrent submits).
    expect(
      paymentActivationControlState({
        summary: { ...ready, active: false },
        activatingConnectionId: "c2",
      }),
    ).toBe("activatable")

    // Not ready → gated (disabled control + reason).
    expect(
      paymentActivationControlState({
        summary: { connectionId: "c3", readiness: "not_ready", active: false, readOnly: false },
      }),
    ).toBe("gated")
  })
})
