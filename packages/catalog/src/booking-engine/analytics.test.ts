import type {
  BookingSessionLifecycleErrorV1,
  BookingSessionOutcomeV1,
} from "@voyant-travel/catalog-contracts/booking-engine/contracts"
import {
  bookingSessionLifecycleErrorV1,
  bookingSessionScopeV1,
} from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"
import { ANALYTICS_FAILURE_REASONS, noopAnalytics } from "@voyant-travel/core/analytics"
import { describe, expect, it } from "vitest"
import type { z } from "zod"

import { commitResolution, errorFailureReason, withBookingSessionAnalytics } from "./analytics.js"
import type { BookingSessionModule } from "./sessions-service.js"

type Tracked = { event: string; properties: Record<string, unknown> }

function recorder() {
  const events: Tracked[] = []
  return {
    events,
    analytics: {
      ...noopAnalytics,
      track: (event: string, properties?: Record<string, unknown>) => {
        events.push({ event, properties: properties ?? {} })
      },
    },
    named(event: string): Tracked[] {
      return events.filter((entry) => entry.event === event)
    },
  }
}

const SCOPE = bookingSessionScopeV1.parse({ locale: "en-GB", market: "GB", currency: "GBP" })

function sessionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "bses_1",
    target: { kind: "product" as const, productId: "prod_1" },
    actorKind: "customer" as const,
    state: "active" as const,
    revision: 1,
    scope: SCOPE,
    expiresAt: "2026-08-05T12:00:00.000Z",
    createdAt: "2026-08-05T11:00:00.000Z",
    updatedAt: "2026-08-05T11:04:00.000Z",
    ...overrides,
  }
}

/**
 * A module that answers with whatever the test hands it. The decorator is
 * pure over outcomes, so the real 2,500-line service is not the unit here.
 */
function stubModule(answers: Partial<Record<keyof BookingSessionModule, unknown>>) {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get: (_target, property: string) => {
      const answer = answers[property as keyof BookingSessionModule]
      return async () => {
        if (answer === undefined) throw new Error(`stub module has no answer for ${property}`)
        return answer
      }
    },
  }
  return new Proxy({}, handler) as unknown as BookingSessionModule
}

function clockFrom(values: number[]): () => number {
  let index = 0
  return () => values[Math.min(index++, values.length - 1)] ?? 0
}

describe("withBookingSessionAnalytics", () => {
  it("emits session.created with the Session's commercial scope", async () => {
    const { analytics, named } = recorder()
    const module = withBookingSessionAnalytics(
      stubModule({ createSession: { kind: "session_created", session: sessionRecord() } }),
      { analytics },
    )

    await module.createSession({} as never, {} as never)

    expect(named("engine.session.created")).toEqual([
      {
        event: "engine.session.created",
        properties: {
          booking_session_id: "bses_1",
          scope: "en-GB",
          market: "GB",
          channel: "storefront",
        },
      },
    ])
  })

  it("attributes a staff Session to the operator channel", async () => {
    const { analytics, named } = recorder()
    const module = withBookingSessionAnalytics(
      stubModule({
        createSession: {
          kind: "session_created",
          session: sessionRecord({ actorKind: "staff" }),
        },
      }),
      { analytics },
    )

    await module.createSession({} as never, {} as never)

    expect(named("engine.session.created")[0]?.properties.channel).toBe("operator")
  })

  it("emits requested then succeeded for a Quote, with its duration and total", async () => {
    const { analytics, events } = recorder()
    const module = withBookingSessionAnalytics(
      stubModule({
        quoteSession: {
          kind: "quote_created",
          session: sessionRecord(),
          quote: {
            id: "bquo_1",
            sessionId: "bses_1",
            sessionRevision: 1,
            state: "active",
            requirements: {},
            requirementsFingerprint: "rf",
            pricing: {
              currency: "GBP",
              lines: [],
              taxes: [],
              subtotal: 0,
              taxTotal: 0,
              total: 14900,
            },
            quotedAt: "2026-08-05T11:02:00.000Z",
            expiresAt: "2026-08-05T11:12:00.000Z",
          },
        },
      }),
      { analytics, clock: clockFrom([1_000, 1_120]) },
    )

    await module.quoteSession("bses_1", {} as never, {} as never)

    expect(events).toEqual([
      { event: "engine.quote.requested", properties: { booking_session_id: "bses_1" } },
      {
        event: "engine.quote.succeeded",
        properties: {
          booking_session_id: "bses_1",
          duration_ms: 120,
          total: 14900,
          currency: "GBP",
        },
      },
    ])
  })

  it("unwraps quote_unavailable to its nested reason", async () => {
    const { analytics, named } = recorder()
    const module = withBookingSessionAnalytics(
      stubModule({
        quoteSession: {
          kind: "rejected",
          error: {
            kind: "quote_unavailable",
            reason: "price_unavailable",
            nextAction: "contact_operator",
          },
        },
      }),
      { analytics },
    )

    await module.quoteSession("bses_1", {} as never, {} as never)

    expect(named("engine.quote.failed")[0]?.properties.failure_reason).toBe("price_unavailable")
  })

  it("carries missing_requirements when a Commit is rejected as incomplete", async () => {
    const { analytics, named } = recorder()
    const module = withBookingSessionAnalytics(
      stubModule({
        commitSession: {
          kind: "rejected",
          error: {
            kind: "selection_incomplete",
            unsatisfied: [
              { requirementKey: "traveler.0.passportNumber", reason: "missing" },
              { requirementKey: "billing.postalCode", reason: "missing" },
            ],
            nextAction: "update_selection",
          },
        },
      }),
      { analytics },
    )

    await module.commitSession("bses_1", {} as never, {} as never)

    expect(named("engine.commit.failed")).toEqual([
      {
        event: "engine.commit.failed",
        properties: {
          booking_session_id: "bses_1",
          failure_reason: "selection_incomplete",
          missing_requirements: ["traveler.0.passportNumber", "billing.postalCode"],
        },
      },
    ])
  })

  it("emits commit.succeeded with the booking id", async () => {
    const { analytics, named } = recorder()
    const module = withBookingSessionAnalytics(
      stubModule({
        commitSession: {
          kind: "commit_result",
          outcome: {
            kind: "committed",
            nextAction: "none",
            booking: { id: "bkg_1", status: "confirmed" },
            allocationIds: [],
            consumedSessionId: "bses_1",
            consumedQuoteId: "bquo_1",
          },
        },
      }),
      { analytics, clock: clockFrom([500, 900]) },
    )

    await module.commitSession("bses_1", {} as never, {} as never)

    expect(named("engine.commit.succeeded")).toEqual([
      {
        event: "engine.commit.succeeded",
        properties: { booking_session_id: "bses_1", booking_id: "bkg_1", duration_ms: 400 },
      },
    ])
  })

  it("treats a suspended Commit as neither a success nor a failure", async () => {
    const { analytics, named } = recorder()
    const module = withBookingSessionAnalytics(
      stubModule({
        commitSession: {
          kind: "commit_result",
          outcome: {
            kind: "payment_required",
            nextAction: "establish_payment_guarantee",
          },
        },
      }),
      { analytics },
    )

    await module.commitSession("bses_1", {} as never, {} as never)

    expect(named("engine.commit.attempted")).toHaveLength(1)
    expect(named("engine.commit.succeeded")).toHaveLength(0)
    expect(named("engine.commit.failed")).toHaveLength(0)
  })

  it("reports how long an expired Quote had been alive", async () => {
    const { analytics, named } = recorder()
    const module = withBookingSessionAnalytics(
      stubModule({
        quoteSession: {
          kind: "quote_created",
          session: sessionRecord(),
          quote: {
            id: "bquo_1",
            sessionId: "bses_1",
            sessionRevision: 1,
            state: "active",
            requirements: {},
            requirementsFingerprint: "rf",
            pricing: {
              currency: "GBP",
              lines: [],
              taxes: [],
              subtotal: 0,
              taxTotal: 0,
              total: 100,
            },
            quotedAt: "2026-08-05T11:02:00.000Z",
            expiresAt: "2026-08-05T11:12:00.000Z",
          },
        },
        placeHold: {
          kind: "rejected",
          error: { kind: "quote_expired", nextAction: "request_fresh_quote" },
        },
      }),
      {
        analytics,
        clock: clockFrom([0, 0, 0, Date.parse("2026-08-05T11:13:00.000Z")]),
      },
    )

    await module.quoteSession("bses_1", {} as never, {} as never)
    await module.placeHold("bses_1", {} as never, {} as never)

    expect(named("engine.quote.expired")).toEqual([
      {
        event: "engine.quote.expired",
        properties: { booking_session_id: "bses_1", seconds_since_issue: 660 },
      },
    ])
  })

  it("reports the furthest step reached when a Session is abandoned", async () => {
    const { analytics, named } = recorder()
    const module = withBookingSessionAnalytics(
      stubModule({
        placeHold: { kind: "hold_created", session: sessionRecord(), hold: {} },
        abandonSession: {
          kind: "session_abandoned",
          session: sessionRecord({ state: "abandoned" }),
        },
      }),
      { analytics },
    )

    await module.placeHold("bses_1", {} as never, {} as never)
    await module.abandonSession("bses_1", {} as never, {} as never)

    expect(named("engine.session.abandoned")).toEqual([
      {
        event: "engine.session.abandoned",
        properties: { booking_session_id: "bses_1", last_step: "hold", age_seconds: 240 },
      },
    ])
  })

  it("emits offer.previewed for both a priced and an unavailable target", async () => {
    const { analytics, named } = recorder()
    const priced = withBookingSessionAnalytics(
      stubModule({
        previewOffer: {
          kind: "offer_preview",
          preview: { binding: false, available: true, requirements: {}, pricing: { total: 1 } },
        },
      }),
      { analytics },
    )
    await priced.previewOffer(
      { target: { kind: "product", productId: "prod_1" } } as never,
      {} as never,
    )

    const rejected = withBookingSessionAnalytics(
      stubModule({
        previewOffer: {
          kind: "rejected",
          error: {
            kind: "quote_unavailable",
            reason: "target_not_bookable",
            nextAction: "contact_operator",
          },
        },
      }),
      { analytics },
    )
    await rejected.previewOffer(
      {
        target: { kind: "owned_entity", entityModule: "accommodations", entityId: "acc_1" },
      } as never,
      {} as never,
    )

    expect(named("engine.offer.previewed")).toEqual([
      {
        event: "engine.offer.previewed",
        properties: { target_id: "prod_1", target_type: "product", priced: true, available: true },
      },
      {
        event: "engine.offer.previewed",
        properties: {
          target_id: "acc_1",
          target_type: "owned_entity",
          priced: false,
          available: false,
        },
      },
    ])
  })

  it("returns the service's own value untouched", async () => {
    const outcome = { kind: "session_created", session: sessionRecord() }
    const module = withBookingSessionAnalytics(stubModule({ createSession: outcome }), {
      analytics: noopAnalytics,
    })

    expect(await module.createSession({} as never, {} as never)).toBe(outcome)
  })

  it("does not let a throwing consumer of the outcome escape as a booking failure", async () => {
    // The port contract says an analytics failure must never fail a booking.
    // A host binds through `createSafeAnalytics`, which is what enforces it;
    // this asserts the decorator adds no unguarded call of its own.
    const module = withBookingSessionAnalytics(
      stubModule({ createSession: { kind: "session_created", session: sessionRecord() } }),
      {
        analytics: {
          ...noopAnalytics,
          track: () => {
            throw new Error("vendor exploded")
          },
        },
      },
    )

    await expect(module.createSession({} as never, {} as never)).rejects.toThrow("vendor exploded")
  })
})

describe("failure_reason", () => {
  /**
   * Both assertions below are set differences, and a set difference against an
   * empty set is empty. Without this the pair would pass by reading nothing —
   * which is exactly what happened while `literalValues` was written against
   * the wrong Zod internals.
   */
  it("can actually read the contract's rejection kinds", () => {
    const kinds = bookingSessionLifecycleErrorV1.options.flatMap((option) =>
      literalValues((option as unknown as z.ZodObject<z.ZodRawShape>).shape.kind),
    )
    expect(kinds).toContain("selection_incomplete")
    expect(kinds).toContain("quote_unavailable")
    expect(kinds.length).toBeGreaterThan(15)

    const quoteUnavailable = bookingSessionLifecycleErrorV1.options.find((option) =>
      literalValues((option as unknown as z.ZodObject<z.ZodRawShape>).shape.kind).includes(
        "quote_unavailable",
      ),
    )
    expect(
      literalValues((quoteUnavailable as unknown as z.ZodObject<z.ZodRawShape>).shape.reason),
    ).toContain("price_unavailable")
  })

  /**
   * The load-bearing assertion of the whole effort. `failure_reason` is only
   * worth having if it is a closed enumeration, and it is only *complete* if
   * every rejection the contract can publish maps into it. A new rejection
   * kind added to `bookingSessionLifecycleErrorV1` fails here rather than
   * arriving in production as an `unknown` bucket nobody notices.
   */
  it("covers every lifecycle rejection the contract can publish", () => {
    const declared = new Set<string>(ANALYTICS_FAILURE_REASONS)
    const unmapped: string[] = []

    for (const option of bookingSessionLifecycleErrorV1.options) {
      const shape = (option as unknown as z.ZodObject<z.ZodRawShape>).shape
      const kinds = literalValues(shape.kind)
      const nested = shape.reason ? literalValues(shape.reason) : []
      const values = nested.length > 0 ? nested : kinds
      for (const value of values) if (!declared.has(value)) unmapped.push(value)
    }

    expect(unmapped).toEqual([])
  })

  it("maps a rejection to its declared reason, not to its message", () => {
    const error: BookingSessionLifecycleErrorV1 = {
      kind: "commit_rejected",
      reason: "price_changed",
      nextAction: "request_fresh_quote",
    }
    expect(errorFailureReason(error)).toBe("price_changed")
  })

  it("declares no reason that no outcome can produce", () => {
    const producible = new Set<string>(["unknown"])
    for (const option of bookingSessionLifecycleErrorV1.options) {
      const shape = (option as unknown as z.ZodObject<z.ZodRawShape>).shape
      const nested = shape.reason ? literalValues(shape.reason) : []
      for (const value of nested.length > 0 ? nested : literalValues(shape.kind)) {
        producible.add(value)
      }
    }
    // Commit outcomes that are terminal failures rather than rejections.
    for (const kind of [
      "supplier_failed",
      "revision_mismatch",
      "quote_failure",
      "hold_failure",
      "proposal_acceptance_required",
    ]) {
      producible.add(kind)
    }

    expect(ANALYTICS_FAILURE_REASONS.filter((reason) => !producible.has(reason))).toEqual([])
  })
})

describe("commitResolution", () => {
  it("unwraps an idempotent replay to the outcome it replays", () => {
    const outcome = {
      kind: "commit_result",
      outcome: {
        kind: "idempotent_replay",
        nextAction: "return_idempotent_result",
        originalCommitId: "bcmt_1",
        originalOutcome: {
          kind: "committed",
          nextAction: "none",
          booking: { id: "bkg_9", status: "confirmed" },
          allocationIds: [],
          consumedSessionId: "bses_1",
          consumedQuoteId: "bquo_1",
        },
      },
    } as unknown as BookingSessionOutcomeV1

    expect(commitResolution(outcome)).toEqual({ kind: "succeeded", bookingId: "bkg_9" })
  })
})

/**
 * The string values a `z.literal(...)` or `z.enum([...])` node admits.
 *
 * Read off the Zod v4 internal `def` rather than by parsing samples: the point
 * is to enumerate what the *contract* can publish, which sampling cannot do.
 * Guarded by `assertsIntrospectionWorks` below, so a Zod upgrade that moves
 * these fields fails loudly instead of turning both assertions vacuous.
 */
function literalValues(schema: unknown): string[] {
  const def = (schema as { def?: { type?: string; values?: unknown; entries?: unknown } }).def
  if (!def) return []
  if (def.type === "literal" && Array.isArray(def.values)) {
    return def.values.filter((entry): entry is string => typeof entry === "string")
  }
  if (def.type === "enum") {
    return Object.values((def.entries ?? {}) as Record<string, unknown>).filter(
      (value): value is string => typeof value === "string",
    )
  }
  return []
}
