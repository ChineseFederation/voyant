import { sha256Hex } from "@voyant-travel/hono"
import type { PublicApiOpaqueReferenceIssuer } from "@voyant-travel/public-api/shopping"
import { describe, expect, it } from "vitest"

import type { TripShoppingReference } from "../src/schema.js"
import {
  createTripShoppingReferenceRuntimeWithStore,
  type ShoppingReferenceBoundary,
  type TripShoppingReferenceStore,
} from "../src/shopping-opaque-references.js"

const NOW = new Date("2026-08-08T12:00:00.000Z")
const CONTEXT = {
  channelId: "direct",
  userId: "user_1",
  buyerAccountId: "account_1",
}
const SCOPE = { marketId: "market_ro", locale: "ro-RO", currency: "EUR" }
const FLIGHT_REF = `sref_${"a".repeat(64)}`
const CATALOG_REF = `sref_${"b".repeat(64)}`
const PACKAGE_REF = `sref_${"c".repeat(64)}`
const CONTINUATION_REF = `sref_${"d".repeat(64)}`
const CRUISE_REF = `sref_${"e".repeat(64)}`
const STAY_REF = `sref_${"f".repeat(64)}`

describe("durable shopping opaque references", () => {
  it("issues a 256-bit capability while persisting only its digest and bounded payload", async () => {
    const store = new MemoryReferenceStore()
    const runtime = createTripShoppingReferenceRuntimeWithStore(store, {
      now: () => NOW,
      createReference: () => FLIGHT_REF,
    })

    const issued = await runtime.issuer.issue(flightInput())
    const persisted = [...store.references.values()][0]

    expect(issued).toEqual({ ref: FLIGHT_REF, expiresAt: "2026-08-08T12:15:00.000Z" })
    expect(issued.ref).toMatch(/^sref_[a-f0-9]{64}$/)
    expect(persisted?.referenceDigest).toBe(await sha256Hex(FLIGHT_REF))
    expect(JSON.stringify(persisted)).not.toContain(FLIGHT_REF)
    expect(JSON.stringify(issued)).not.toContain("provider-secret")
  })

  it.each([
    ["channel", { context: { ...CONTEXT, channelId: "chan_other" } }],
    ["channel", { context: { ...CONTEXT, channelId: "partner" } }],
    ["managed user", { context: { ...CONTEXT, userId: "user_other" } }],
    ["buyer account", { context: { ...CONTEXT, buyerAccountId: "account_other" } }],
    ["market", { scope: { ...SCOPE, marketId: "market_us" } }],
    ["locale", { scope: { ...SCOPE, locale: "en-US" } }],
    ["currency", { scope: { ...SCOPE, currency: "USD" } }],
  ])("rejects a cross-boundary %s redemption without consuming it", async (_label, override) => {
    const { runtime, store } = await issuedFlightRuntime()
    const resolution = await runtime.offerResolver.resolve(
      "context" in override ? override.context : CONTEXT,
      {
        kind: "flight",
        offerRef: FLIGHT_REF,
        scope: "scope" in override ? override.scope : SCOPE,
      },
    )

    expect(resolution).toBeNull()
    expect([...store.references.values()][0]?.consumedAt).toBeNull()
    await expect(
      runtime.offerResolver.resolve(CONTEXT, {
        kind: "flight",
        offerRef: FLIGHT_REF,
        scope: SCOPE,
      }),
    ).resolves.not.toBeNull()
  })

  it("rejects expiry and kind/purpose substitution without consuming the offer", async () => {
    let clock = NOW
    const { runtime, store } = await issuedFlightRuntime(() => clock)

    await expect(
      runtime.offerResolver.resolve(CONTEXT, {
        kind: "stay",
        offerRef: FLIGHT_REF,
        scope: SCOPE,
      }),
    ).resolves.toBeNull()
    expect([...store.references.values()][0]?.consumedAt).toBeNull()
    clock = new Date("2026-08-08T12:15:00.000Z")
    await expect(
      runtime.offerResolver.resolve(CONTEXT, {
        kind: "flight",
        offerRef: FLIGHT_REF,
        scope: SCOPE,
      }),
    ).resolves.toBeNull()
  })

  it("keeps catalog references multi-use and makes offers single-use", async () => {
    const store = new MemoryReferenceStore()
    const catalog = createTripShoppingReferenceRuntimeWithStore(store, {
      now: () => NOW,
      createReference: () => CATALOG_REF,
    })
    await catalog.issuer.issue(catalogInput())

    const product = { kind: "product" as const, offerRef: CATALOG_REF, scope: SCOPE }
    await expect(catalog.offerResolver.resolve(CONTEXT, product)).resolves.toMatchObject({
      component: { kind: "catalog_booking", catalogRef: { entityId: "product_1" } },
    })
    await expect(catalog.offerResolver.resolve(CONTEXT, product)).resolves.not.toBeNull()

    const flight = createTripShoppingReferenceRuntimeWithStore(store, {
      now: () => NOW,
      createReference: () => FLIGHT_REF,
    })
    await flight.issuer.issue(flightInput())
    const offer = { kind: "flight" as const, offerRef: FLIGHT_REF, scope: SCOPE }
    await expect(flight.offerResolver.resolve(CONTEXT, offer)).resolves.not.toBeNull()
    await expect(flight.offerResolver.resolve(CONTEXT, offer)).resolves.toBeNull()
  })

  it("atomically allows only one concurrent single-use redemption", async () => {
    const { runtime } = await issuedFlightRuntime()
    const input = { kind: "flight" as const, offerRef: FLIGHT_REF, scope: SCOPE }

    const resolutions = await Promise.all(
      Array.from({ length: 8 }, () => runtime.offerResolver.resolve(CONTEXT, input)),
    )

    expect(resolutions.filter((value) => value !== null)).toHaveLength(1)
  })

  it("atomically redeems a continuation payload without exposing its source cursor", async () => {
    const store = new MemoryReferenceStore()
    const runtime = createTripShoppingReferenceRuntimeWithStore(store, {
      now: () => NOW,
      createReference: () => CONTINUATION_REF,
    })
    await runtime.issuer.issue(continuationInput())

    const input = {
      ref: CONTINUATION_REF,
      purpose: "live-continuation" as const,
      channelId: CONTEXT.channelId,
      owner: { userId: CONTEXT.userId, buyerAccountId: CONTEXT.buyerAccountId },
      scope: SCOPE,
      kind: "flight" as const,
      intentFingerprint: "fingerprint",
    }
    const resolutions = await Promise.all(
      Array.from({ length: 8 }, () => runtime.issuer.redeem(input)),
    )

    expect(resolutions.filter(Boolean)).toEqual([
      {
        payload: expect.objectContaining({
          intentFingerprint: "fingerprint",
          sources: [{ key: "flight:connection_secret", cursor: "provider-secret-cursor" }],
        }),
      },
    ])
    expect(JSON.stringify({ ref: CONTINUATION_REF })).not.toContain("provider-secret-cursor")
  })

  it("does not consume a continuation when its intent fingerprint does not match", async () => {
    const store = new MemoryReferenceStore()
    const runtime = createTripShoppingReferenceRuntimeWithStore(store, {
      now: () => NOW,
      createReference: () => CONTINUATION_REF,
    })
    await runtime.issuer.issue(continuationInput())
    const boundary = {
      ref: CONTINUATION_REF,
      purpose: "live-continuation" as const,
      channelId: CONTEXT.channelId,
      owner: { userId: CONTEXT.userId, buyerAccountId: CONTEXT.buyerAccountId },
      scope: SCOPE,
      kind: "flight" as const,
    }

    await expect(
      runtime.issuer.redeem({ ...boundary, intentFingerprint: "wrong-fingerprint" }),
    ).resolves.toBeNull()
    await expect(
      runtime.issuer.redeem({ ...boundary, intentFingerprint: "fingerprint" }),
    ).resolves.not.toBeNull()
  })

  it("turns one live package capability into stable Catalog booking pins exactly once", async () => {
    const store = new MemoryReferenceStore()
    const runtime = createTripShoppingReferenceRuntimeWithStore(store, {
      now: () => NOW,
      createReference: () => PACKAGE_REF,
    })
    await runtime.issuer.issue(packageInput())
    const input = { kind: "package" as const, offerRef: PACKAGE_REF, scope: SCOPE }

    await expect(runtime.offerResolver.resolve(CONTEXT, input)).resolves.toEqual({
      component: {
        kind: "catalog_booking",
        estimatedPricing: {
          currency: "EUR",
          subtotalAmountCents: 100_000,
          taxAmountCents: 0,
          totalAmountCents: 100_000,
          priceExpiresAt: "2026-08-08T12:10:00.000Z",
          warnings: ["non_binding_storefront_estimate"],
        },
        catalogRef: {
          entityModule: "products",
          entityId: "product_1",
          sourceKind: "voyant-connect",
          sourceConnectionId: "connection_server",
          sourceRef: "product_1",
        },
        metadata: {
          bookingDraftV1: {
            entity: {
              module: "products",
              id: "product_1",
              sourceKind: "voyant-connect",
              sourceConnectionId: "connection_server",
              sourceRef: "product_1",
            },
            configure: {
              departureDate: "2026-09-10",
              departureAirportCode: "OTP",
              nights: 5,
              pax: { adult: 2 },
              roomTypeId: "room_1",
              ratePlanId: "rate_1:AI",
              board: "AI",
            },
          },
        },
      },
    })
    await expect(runtime.offerResolver.resolve(CONTEXT, input)).resolves.toBeNull()
  })

  it("rejects and consumes a package capability after its supplier offer expires", async () => {
    const store = new MemoryReferenceStore()
    const runtime = createTripShoppingReferenceRuntimeWithStore(store, {
      now: () => new Date("2026-08-08T12:06:00.000Z"),
      createReference: () => PACKAGE_REF,
    })
    await runtime.issuer.issue(packageInput("2026-08-08T12:05:00.000Z"))

    await expect(
      runtime.offerResolver.resolve(CONTEXT, {
        kind: "package",
        offerRef: PACKAGE_REF,
        scope: SCOPE,
      }),
    ).resolves.toBeNull()
    expect([...store.references.values()][0]?.consumedAt).toEqual(
      new Date("2026-08-08T12:06:00.000Z"),
    )
  })

  it("turns a sourced stay capability into a date- and rate-pinned Catalog component", async () => {
    const store = new MemoryReferenceStore()
    const runtime = createTripShoppingReferenceRuntimeWithStore(store, {
      now: () => NOW,
      createReference: () => STAY_REF,
    })
    await runtime.issuer.issue(stayInput())

    await expect(
      runtime.offerResolver.resolve(CONTEXT, {
        kind: "stay",
        offerRef: STAY_REF,
        scope: SCOPE,
      }),
    ).resolves.toEqual({
      component: {
        kind: "catalog_booking",
        catalogRef: {
          entityModule: "accommodations",
          entityId: "acc_canonical",
          sourceKind: "voyant-connect",
          sourceConnectionId: "connection_server",
          sourceRef: "hotel_source",
        },
        metadata: {
          bookingDraftV1: {
            entity: {
              module: "accommodations",
              id: "acc_canonical",
              sourceKind: "voyant-connect",
              sourceConnectionId: "connection_server",
              sourceRef: "hotel_source",
            },
            configure: {
              dateRange: { checkIn: "2026-09-10", checkOut: "2026-09-15" },
              pax: { adult: 2 },
              roomTypeId: "room_1",
              ratePlanId: "rate_1",
            },
            accommodation: {
              rooms: [
                {
                  optionUnitId: "room_1",
                  ratePlanId: "rate_1",
                  quantity: 1,
                  occupancy: { adults: 2 },
                },
              ],
              travelerAssignments: {},
            },
          },
        },
      },
    })
  })

  it("redeems a cruise offer only for its exact managed owner and shopping scope", async () => {
    const store = new MemoryReferenceStore()
    const runtime = createTripShoppingReferenceRuntimeWithStore(store, {
      now: () => NOW,
      createReference: () => CRUISE_REF,
    })
    await runtime.issuer.issue(cruiseInput())

    await expect(
      runtime.offerResolver.resolve(CONTEXT, {
        kind: "cruise",
        offerRef: CRUISE_REF,
        scope: { ...SCOPE, currency: "USD" },
      }),
    ).resolves.toBeNull()
    await expect(
      runtime.offerResolver.resolve(CONTEXT, {
        kind: "cruise",
        offerRef: CRUISE_REF,
        scope: SCOPE,
      }),
    ).resolves.toMatchObject({
      component: {
        kind: "catalog_booking",
        catalogRef: {
          entityModule: "cruises",
          entityId: "cruise_secret",
          sourceKind: "cruise:provider",
          sourceConnectionId: "connection_secret",
          sourceRef: "source_ref_secret",
        },
        metadata: {
          bookingDraftV1: {
            configure: {
              sailingId: "sailing_secret",
              cabinCategoryId: "cabin_secret",
              occupancy: 2,
            },
          },
          publicApiShopping: {
            purpose: "cruise-offer",
            selection: {
              target: {
                entityModule: "cruises",
                sourceConnectionId: "connection_secret",
              },
            },
          },
        },
      },
    })
  })

  it("sanitizes persistence and payload-shape failures before they can reach request logs", async () => {
    const failing = createTripShoppingReferenceRuntimeWithStore(
      {
        insert: async () => {
          throw new Error("driver params include provider-secret")
        },
        claimSingle: async () => null,
        readMulti: async () => null,
      },
      { now: () => NOW, createReference: () => FLIGHT_REF },
    )
    const persistenceError = await failing.issuer.issue(flightInput()).catch((error) => error)
    expect(persistenceError).toEqual(new Error("shopping_reference_issue_failed"))
    expect(JSON.stringify(persistenceError)).not.toContain("provider-secret")

    const store = new MemoryReferenceStore()
    const malformed = createTripShoppingReferenceRuntimeWithStore(store, {
      now: () => NOW,
      createReference: () => FLIGHT_REF,
    })
    await malformed.issuer.issue({
      ...flightInput(),
      payload: { unexpectedProviderSecret: "never-serialized" },
    })
    await expect(
      malformed.offerResolver.resolve(CONTEXT, {
        kind: "flight",
        offerRef: FLIGHT_REF,
        scope: SCOPE,
      }),
    ).resolves.toBeNull()
  })
})

function flightInput(): Parameters<PublicApiOpaqueReferenceIssuer["issue"]>[0] {
  return {
    purpose: "flight-offer",
    channelId: CONTEXT.channelId,
    owner: { userId: CONTEXT.userId, buyerAccountId: CONTEXT.buyerAccountId },
    scope: SCOPE,
    payload: {
      selection: { offerId: "internal-offer" },
      providerData: { token: "provider-secret" },
    },
    ttlSeconds: 15 * 60,
    replay: "single-use",
  }
}

function catalogInput(): Parameters<PublicApiOpaqueReferenceIssuer["issue"]>[0] {
  return {
    purpose: "catalog-item",
    channelId: CONTEXT.channelId,
    owner: { userId: CONTEXT.userId, buyerAccountId: CONTEXT.buyerAccountId },
    scope: SCOPE,
    payload: { entityModule: "products", entityId: "product_1" },
    ttlSeconds: 15 * 60,
    replay: "multi-use",
  }
}

function continuationInput(): Parameters<PublicApiOpaqueReferenceIssuer["issue"]>[0] {
  return {
    purpose: "live-continuation",
    channelId: CONTEXT.channelId,
    owner: { userId: CONTEXT.userId, buyerAccountId: CONTEXT.buyerAccountId },
    scope: SCOPE,
    payload: {
      version: 1,
      kind: "flight",
      intentFingerprint: "fingerprint",
      page: 1,
      sources: [{ key: "flight:connection_secret", cursor: "provider-secret-cursor" }],
    },
    ttlSeconds: 5 * 60,
    replay: "single-use",
  }
}

function packageInput(
  offerExpiresAt = "2026-08-08T12:10:00.000Z",
): Parameters<PublicApiOpaqueReferenceIssuer["issue"]>[0] {
  return {
    purpose: "package-offer",
    channelId: CONTEXT.channelId,
    owner: { userId: CONTEXT.userId, buyerAccountId: CONTEXT.buyerAccountId },
    scope: SCOPE,
    payload: {
      estimatedPricing: {
        currency: "EUR",
        subtotalAmountCents: 100_000,
        taxAmountCents: 0,
        totalAmountCents: 100_000,
        priceExpiresAt: offerExpiresAt,
        warnings: ["non_binding_storefront_estimate"],
      },
      selection: {
        target: {
          entityModule: "products",
          entityId: "product_1",
          sourceKind: "voyant-connect",
          sourceConnectionId: "connection_server",
          sourceRef: "product_1",
        },
        configure: {
          departureDate: "2026-09-10",
          departureAirportCode: "OTP",
          nights: 5,
          pax: { adult: 2 },
          roomTypeId: "room_1",
          ratePlanId: "rate_1:AI",
          board: "AI",
        },
        offerExpiresAt,
      },
    },
    ttlSeconds: 15 * 60,
    replay: "single-use",
  }
}

function cruiseInput(): Parameters<PublicApiOpaqueReferenceIssuer["issue"]>[0] {
  return {
    purpose: "cruise-offer",
    channelId: CONTEXT.channelId,
    owner: { userId: CONTEXT.userId, buyerAccountId: CONTEXT.buyerAccountId },
    scope: SCOPE,
    payload: {
      selection: {
        target: {
          entityModule: "cruises",
          entityId: "cruise_secret",
          sourceKind: "cruise:provider",
          sourceConnectionId: "connection_secret",
          sourceRef: "source_ref_secret",
        },
        configure: {
          sailingId: "sailing_secret",
          cabinCategoryId: "cabin_secret",
          occupancy: 2,
          passengerComposition: { adults: 2 },
          fareCode: null,
          fareVariant: "cruise_only",
          bookingTerms: null,
        },
      },
    },
    ttlSeconds: 15 * 60,
    replay: "single-use",
  }
}

function stayInput(): Parameters<PublicApiOpaqueReferenceIssuer["issue"]>[0] {
  return {
    purpose: "stay-offer",
    channelId: CONTEXT.channelId,
    owner: { userId: CONTEXT.userId, buyerAccountId: CONTEXT.buyerAccountId },
    scope: SCOPE,
    payload: {
      selection: {
        target: {
          entityModule: "accommodations",
          entityId: "acc_canonical",
          sourceKind: "voyant-connect",
          sourceConnectionId: "connection_server",
          sourceRef: "hotel_source",
        },
        configure: {
          dateRange: { checkIn: "2026-09-10", checkOut: "2026-09-15" },
          pax: { adult: 2 },
          roomTypeId: "room_1",
          ratePlanId: "rate_1",
        },
        rooms: [{ roomTypeId: "room_1", ratePlanId: "rate_1", occupancy: { adults: 2 } }],
      },
    },
    ttlSeconds: 15 * 60,
    replay: "single-use",
  }
}

async function issuedFlightRuntime(now = () => NOW) {
  const store = new MemoryReferenceStore()
  const runtime = createTripShoppingReferenceRuntimeWithStore(store, {
    now,
    createReference: () => FLIGHT_REF,
  })
  await runtime.issuer.issue(flightInput())
  return { runtime, store }
}

class MemoryReferenceStore implements TripShoppingReferenceStore {
  references = new Map<string, TripShoppingReference>()

  async insert(reference: TripShoppingReference): Promise<void> {
    if (this.references.has(reference.referenceDigest)) throw new Error("duplicate_reference")
    this.references.set(reference.referenceDigest, structuredClone(reference))
  }

  async claimSingle(boundary: ShoppingReferenceBoundary): Promise<TripShoppingReference | null> {
    const reference = this.references.get(boundary.referenceDigest)
    if (reference?.replay !== "single-use" || reference.consumedAt) return null
    if (!matchesBoundary(reference, boundary)) return null
    const claimed = { ...reference, consumedAt: boundary.now }
    this.references.set(reference.referenceDigest, claimed)
    return structuredClone(claimed)
  }

  async readMulti(boundary: ShoppingReferenceBoundary): Promise<TripShoppingReference | null> {
    const reference = this.references.get(boundary.referenceDigest)
    return reference && reference.replay === "multi-use" && matchesBoundary(reference, boundary)
      ? structuredClone(reference)
      : null
  }
}

function matchesBoundary(
  reference: TripShoppingReference,
  boundary: ShoppingReferenceBoundary,
): boolean {
  return (
    reference.purpose === boundary.purpose &&
    reference.channelId === boundary.channelId &&
    reference.ownerUserId === boundary.ownerUserId &&
    reference.ownerBuyerAccountId === boundary.ownerBuyerAccountId &&
    reference.marketId === boundary.marketId &&
    reference.locale === boundary.locale &&
    reference.currency === boundary.currency &&
    (boundary.liveKind === undefined ||
      (reference.payload as { kind?: unknown }).kind === boundary.liveKind) &&
    (boundary.intentFingerprint === undefined ||
      (reference.payload as { intentFingerprint?: unknown }).intentFingerprint ===
        boundary.intentFingerprint) &&
    reference.expiresAt > boundary.now
  )
}
