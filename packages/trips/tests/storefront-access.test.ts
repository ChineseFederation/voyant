import type { AnyDrizzleDb } from "@voyant-travel/db"
import { sha256Hex } from "@voyant-travel/hono"
import { describe, expect, it } from "vitest"
import {
  type TripEnvelope,
  type TripStorefrontAccess,
  tripComponents,
  tripEnvelopes,
  tripStorefrontAccess,
} from "../src/schema.js"
import {
  createStorefrontTrip,
  resolveStorefrontTripAccess,
  STOREFRONT_TRIP_CAPABILITY_TTL_MS,
} from "../src/storefront-access.js"

const CAPABILITY = `tcap_${"a".repeat(64)}`
const NOW = new Date("2026-08-08T10:00:00.000Z")
const CONTEXT = {
  storefrontId: "storefront_bucharest",
  channelId: "channel_direct",
  userId: "anonymous-storefront",
}
const SCOPE = { marketId: "market_ro", locale: "ro-RO", currency: "EUR" }

describe("storefront Trip access", () => {
  it("creates an empty managed Trip and persists only the capability digest", async () => {
    const state: { envelope?: TripEnvelope; access?: TripStorefrontAccess } = {}
    const result = await createStorefrontTrip(
      createDb(state),
      { title: "City and coast", scope: SCOPE },
      CONTEXT,
      { now: () => NOW, createCapability: () => CAPABILITY },
    )

    expect(result.capability).toBe(CAPABILITY)
    expect(result.trip.envelope.id).toBe("trip_storefront_1")
    expect(result.trip.envelope.travelerParty).toEqual({})
    expect(result.trip.envelope.constraints).toEqual({ storefrontScope: SCOPE })
    expect(result.trip.envelope.createdBy).toBe("storefront:storefront_bucharest:anonymous")
    expect(state.access).toMatchObject({
      envelopeId: "trip_storefront_1",
      capabilityDigest: await sha256Hex(CAPABILITY),
      storefrontId: CONTEXT.storefrontId,
      channelId: CONTEXT.channelId,
      ...SCOPE,
      ownerUserId: null,
      revision: 1,
      expiresAt: new Date(NOW.getTime() + STOREFRONT_TRIP_CAPABILITY_TTL_MS),
    })
    expect(JSON.stringify(state.access)).not.toContain(CAPABILITY)
  })

  it("resolves only in the bound storefront and channel", async () => {
    const state = await seededState()
    const db = createDb(state)
    const result = await resolveStorefrontTripAccess(db, CAPABILITY, CONTEXT, { now: () => NOW })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.access.currency).toBe("EUR")

    await expect(
      resolveStorefrontTripAccess(
        db,
        CAPABILITY,
        { ...CONTEXT, storefrontId: "storefront_other" },
        { now: () => NOW },
      ),
    ).resolves.toEqual({ ok: false, reason: "wrong_storefront" })
  })

  it("fails closed for malformed, expired, and differently-owned capabilities", async () => {
    const state = await seededState()
    const db = createDb(state)
    await expect(resolveStorefrontTripAccess(db, "trip_storefront_1", CONTEXT)).resolves.toEqual({
      ok: false,
      reason: "invalid",
    })

    state.access = { ...state.access, expiresAt: new Date("2026-08-08T09:00:00.000Z") }
    await expect(
      resolveStorefrontTripAccess(db, CAPABILITY, CONTEXT, { now: () => NOW }),
    ).resolves.toEqual({ ok: false, reason: "expired" })

    state.access = {
      ...state.access,
      expiresAt: new Date("2026-09-01T00:00:00.000Z"),
      ownerUserId: "customer_1",
    }
    await expect(
      resolveStorefrontTripAccess(
        db,
        CAPABILITY,
        { ...CONTEXT, userId: "customer_2" },
        { now: () => NOW },
      ),
    ).resolves.toEqual({ ok: false, reason: "wrong_owner" })
  })
})

async function seededState(): Promise<{ envelope: TripEnvelope; access: TripStorefrontAccess }> {
  const envelope = envelopeRow()
  return {
    envelope,
    access: {
      envelopeId: envelope.id,
      capabilityDigest: await sha256Hex(CAPABILITY),
      storefrontId: CONTEXT.storefrontId,
      channelId: CONTEXT.channelId,
      marketId: SCOPE.marketId,
      locale: SCOPE.locale,
      currency: SCOPE.currency,
      ownerUserId: null,
      ownerBuyerAccountId: null,
      revision: 1,
      expiresAt: new Date("2026-09-01T00:00:00.000Z"),
      createdAt: NOW,
      updatedAt: NOW,
    },
  }
}

function envelopeRow(): TripEnvelope {
  return {
    id: "trip_storefront_1",
    status: "draft",
    title: "City and coast",
    description: null,
    travelerParty: {},
    constraints: { storefrontScope: SCOPE },
    aggregateCurrency: null,
    aggregateSubtotalAmountCents: null,
    aggregateTaxAmountCents: null,
    aggregateTotalAmountCents: null,
    aggregatePricingSnapshot: null,
    currentPriceExpiresAt: null,
    bookingGroupId: null,
    orderId: null,
    paymentSessionId: null,
    reserveIdempotencyKey: null,
    reserveStartedAt: null,
    reservedAt: null,
    checkoutIdempotencyKey: null,
    checkoutStartedAt: null,
    createdBy: "storefront:storefront_bucharest:anonymous",
    updatedBy: "storefront:storefront_bucharest:anonymous",
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function createDb(state: { envelope?: TripEnvelope; access?: TripStorefrontAccess }): AnyDrizzleDb {
  const tx = {
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          if (table === tripEnvelopes) {
            state.envelope = { ...envelopeRow(), ...values } as TripEnvelope
            return [state.envelope]
          }
          if (table === tripStorefrontAccess) {
            state.access = {
              revision: 1,
              createdAt: NOW,
              updatedAt: NOW,
              ...values,
            } as TripStorefrontAccess
            return [state.access]
          }
          return []
        },
      }),
    }),
  }
  const db = {
    transaction: async (operation: (transaction: typeof tx) => unknown) => operation(tx),
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === tripStorefrontAccess) return state.access ? [state.access] : []
            if (table === tripEnvelopes) return state.envelope ? [state.envelope] : []
            return []
          },
          orderBy: async () => (table === tripComponents ? [] : []),
        }),
      }),
    }),
  }
  return db as AnyDrizzleDb
}
