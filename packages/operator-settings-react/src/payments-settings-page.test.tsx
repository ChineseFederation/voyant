import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import {
  canActivatePaymentConnection,
  canConfigurePaymentProvider,
  canDisconnectPaymentProvider,
  firstUnconfiguredPaymentProviderMode,
  PaymentEmbeddedOnboardingBoundary,
  type PaymentEmbeddedOnboardingClientProps,
  paymentActivationControlState,
  paymentConnectionStatusLabel,
  paymentProviderConnections,
  paymentProviderSetupMode,
  paymentProviderStatus,
  requestPaymentOnboardingSession,
  resumablePaymentProviderConnection,
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

  it("selects the first advertised payment mode without an existing connection", () => {
    const provider = { id: "voyant-pay", modes: ["sandbox", "live"] as const }

    expect(firstUnconfiguredPaymentProviderMode(provider, undefined)).toBe("sandbox")
    expect(
      firstUnconfiguredPaymentProviderMode(provider, [
        { providerId: "voyant-pay", mode: "sandbox" },
      ]),
    ).toBe("live")
    expect(
      firstUnconfiguredPaymentProviderMode(provider, [{ providerId: "voyant-pay", mode: "live" }]),
    ).toBe("sandbox")
  })

  it("reports no unconfigured mode only when every advertised mode is represented", () => {
    const provider = { id: "voyant-pay", modes: ["sandbox", "live"] as const }

    expect(
      firstUnconfiguredPaymentProviderMode(provider, [
        { providerId: "netopia", mode: "sandbox" },
        { providerId: "voyant-pay", mode: null },
      ]),
    ).toBe("sandbox")
    expect(
      firstUnconfiguredPaymentProviderMode(provider, [
        { providerId: "voyant-pay", mode: "sandbox" },
        { providerId: "voyant-pay", mode: "live" },
      ]),
    ).toBeNull()
  })

  it("resumes an unfinished connection instead of opening a free mode", () => {
    const provider = { id: "voyant-pay", modes: ["sandbox", "live"] as const }

    // The reported bug: Live exists but is not ready, so a second click on the
    // setup action must reopen Live rather than mint a Sandbox account.
    expect(
      paymentProviderSetupMode(provider, [
        { providerId: "voyant-pay", mode: "live", readiness: "not_ready" },
      ]),
    ).toBe("live")
    expect(
      resumablePaymentProviderConnection(provider, [
        { providerId: "voyant-pay", mode: "live", readiness: "not_ready" },
      ]),
    ).toMatchObject({ mode: "live" })
  })

  it("opens the real-money mode first and the free mode only once it is taken", () => {
    const provider = { id: "voyant-pay", modes: ["sandbox", "live"] as const }

    expect(paymentProviderSetupMode(provider, undefined)).toBe("live")
    expect(paymentProviderSetupMode(provider, [])).toBe("live")
    expect(
      paymentProviderSetupMode(provider, [
        { providerId: "voyant-pay", mode: "live", readiness: "ready" },
      ]),
    ).toBe("sandbox")
    // Another provider's connections never steer this provider's mode.
    expect(
      paymentProviderSetupMode(provider, [
        { providerId: "netopia", mode: "live", readiness: "ready" },
      ]),
    ).toBe("live")
  })

  it("keeps a sandbox-only provider on its advertised mode", () => {
    expect(
      paymentProviderSetupMode({ id: "voyant-pay", modes: ["sandbox"] as const }, undefined),
    ).toBe("sandbox")
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

/** Mirrors the page's internal `ConnectionState`, which is not exported. */
type PaymentConnectionStateForTest =
  | "pending_requirements"
  | "pending_verification"
  | "connected"
  | "restricted"
  | "error"
  | "disconnected"

describe("processor status", () => {
  const provider = { id: "voyant-pay", availability: "available" as const }
  const connection = (
    state: PaymentConnectionStateForTest,
    providerId = "voyant-pay",
    active = false,
  ) => ({ providerId, state, active })

  it("reports a processor nobody has set up with no status at all", () => {
    // The badge for `not_connected` is deliberately absent: it is the default
    // state of most rows, and labelling it makes every row shout.
    expect(paymentProviderStatus({ provider, connections: [], activeProviderId: null })).toBe(
      "not_connected",
    )
  })

  it("collapses ready + connected into the single fact they always agreed on", () => {
    // `paymentConnectionReadiness` is `state === "connected"`, so a separate
    // readiness badge could never disagree with the lifecycle badge.
    expect(
      paymentProviderStatus({
        provider,
        connections: [connection("connected")],
        activeProviderId: null,
      }),
    ).toBe("connected")
  })

  it("marks the active processor without needing a second badge", () => {
    expect(
      paymentProviderStatus({
        provider,
        connections: [connection("connected")],
        activeProviderId: "voyant-pay",
      }),
    ).toBe("active")
  })

  it("lets a broken or blocked connection outrank being active", () => {
    // An active processor that cannot take money is the one thing an operator
    // must not miss, so `error`/`action_required` win over `active`.
    for (const [state, expected] of [
      ["error", "error"],
      ["pending_requirements", "action_required"],
      ["restricted", "action_required"],
    ] as const) {
      expect(
        paymentProviderStatus({
          provider,
          connections: [connection(state)],
          activeProviderId: "voyant-pay",
        }),
      ).toBe(expected)
    }
  })

  it("ignores connections belonging to another processor", () => {
    expect(
      paymentProviderStatus({
        provider,
        connections: [connection("error", "netopia")],
        activeProviderId: null,
      }),
    ).toBe("not_connected")
  })

  it("stops calling a processor coming soon once it has a connection", () => {
    const soon = { id: "voyant-pay", availability: "coming_soon" as const }

    expect(paymentProviderStatus({ provider: soon, connections: [], activeProviderId: null })).toBe(
      "coming_soon",
    )
    expect(
      paymentProviderStatus({
        provider: soon,
        connections: [connection("connected")],
        activeProviderId: null,
      }),
    ).toBe("connected")
  })
})

describe("processor connections fallback", () => {
  const provider = { id: "voyant-pay" }

  it("synthesizes the active connection when the registry omits the projection", () => {
    // `connections` is optional on the route schema, so a registry may answer
    // with only the top-level fields. Losing them would hide a failing active
    // processor entirely — the old "Active provider" card read them directly.
    const resolved = paymentProviderConnections(provider, {
      activeProviderId: "voyant-pay",
      status: "restricted",
      mode: "live",
      activeConnectionId: "conn_1",
      connections: undefined,
      requirements: [{ code: "docs", message: "Upload documents" }],
      lastError: null,
      readOnly: false,
    })

    expect(resolved).toHaveLength(1)
    expect(resolved[0]).toMatchObject({
      providerId: "voyant-pay",
      connectionId: "conn_1",
      state: "restricted",
      readiness: "not_ready",
      mode: "live",
      active: true,
    })
    expect(resolved[0]?.requirements).toHaveLength(1)
  })

  it("keeps a failing active processor's status visible through the fallback", () => {
    for (const state of ["error", "restricted", "disconnected"] as const) {
      const resolved = paymentProviderConnections(provider, {
        activeProviderId: "voyant-pay",
        status: state,
        mode: null,
        connections: undefined,
      })
      const status = paymentProviderStatus({
        provider: { id: "voyant-pay", availability: "available" },
        connections: resolved,
        activeProviderId: "voyant-pay",
      })
      expect(status).not.toBe("active")
    }
  })

  it("prefers the real projection and never invents a row for another provider", () => {
    const real = [
      {
        providerId: "voyant-pay",
        connectionId: "c1",
        state: "connected" as const,
        readiness: "ready" as const,
        mode: "live" as const,
        active: true,
      },
    ]

    // The fallback is a last resort, not a merge: a real projection wins even
    // when the top-level status disagrees with it.
    expect(
      paymentProviderConnections(provider, {
        activeProviderId: "voyant-pay",
        status: "error",
        mode: null,
        connections: real,
      }),
    ).toEqual(real)

    expect(
      paymentProviderConnections(
        { id: "netopia" },
        {
          activeProviderId: "voyant-pay",
          status: "connected",
          mode: "live",
          connections: undefined,
        },
      ),
    ).toEqual([])
  })
})

describe("disconnected connections", () => {
  const provider = { id: "voyant-pay", availability: "available" as const }
  const conn = (state: PaymentConnectionStateForTest, active = false) => ({
    providerId: "voyant-pay",
    state,
    active,
  })

  it("outranks active when the active connection is disconnected", () => {
    // `updatePaymentConnectionStatus` patches only the status, so
    // `activeProviderId` can still point at a disconnected connection.
    expect(
      paymentProviderStatus({
        provider,
        connections: [conn("disconnected", true)],
        activeProviderId: "voyant-pay",
      }),
    ).toBe("disconnected")
  })

  it("badges an existing disconnected connection rather than staying silent", () => {
    expect(
      paymentProviderStatus({
        provider,
        connections: [conn("disconnected")],
        activeProviderId: null,
      }),
    ).toBe("disconnected")
  })

  it("does not let a disconnected sibling mislabel a working connection", () => {
    expect(
      paymentProviderStatus({
        provider,
        connections: [conn("connected", true), conn("disconnected")],
        activeProviderId: "voyant-pay",
      }),
    ).toBe("active")
  })
})
