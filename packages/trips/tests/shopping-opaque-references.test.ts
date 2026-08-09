import { sha256Hex } from "@voyant-travel/hono"
import type { StorefrontOpaqueReferenceIssuer } from "@voyant-travel/storefront/shopping"
import { describe, expect, it } from "vitest"

import type { TripShoppingReference } from "../src/schema.js"
import {
  createTripShoppingReferenceRuntimeWithStore,
  type ShoppingReferenceBoundary,
  type TripShoppingReferenceStore,
} from "../src/shopping-opaque-references.js"

const NOW = new Date("2026-08-08T12:00:00.000Z")
const CONTEXT = {
  storefrontId: "storefront_ro",
  channelId: "direct",
  userId: "user_1",
  buyerAccountId: "account_1",
}
const SCOPE = { marketId: "market_ro", locale: "ro-RO", currency: "EUR" }
const FLIGHT_REF = `sref_${"a".repeat(64)}`
const CATALOG_REF = `sref_${"b".repeat(64)}`

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
    ["storefront", { context: { ...CONTEXT, storefrontId: "storefront_other" } }],
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

function flightInput(): Parameters<StorefrontOpaqueReferenceIssuer["issue"]>[0] {
  return {
    purpose: "flight-offer",
    storefrontId: CONTEXT.storefrontId,
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

function catalogInput(): Parameters<StorefrontOpaqueReferenceIssuer["issue"]>[0] {
  return {
    purpose: "catalog-item",
    storefrontId: CONTEXT.storefrontId,
    channelId: CONTEXT.channelId,
    owner: { userId: CONTEXT.userId, buyerAccountId: CONTEXT.buyerAccountId },
    scope: SCOPE,
    payload: { entityModule: "products", entityId: "product_1" },
    ttlSeconds: 15 * 60,
    replay: "multi-use",
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
    reference.storefrontId === boundary.storefrontId &&
    reference.channelId === boundary.channelId &&
    reference.ownerUserId === boundary.ownerUserId &&
    reference.ownerBuyerAccountId === boundary.ownerBuyerAccountId &&
    reference.marketId === boundary.marketId &&
    reference.locale === boundary.locale &&
    reference.currency === boundary.currency &&
    reference.expiresAt > boundary.now
  )
}
