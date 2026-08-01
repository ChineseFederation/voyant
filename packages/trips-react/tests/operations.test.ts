import { describe, expect, it } from "vitest"
import {
  addTripComponent,
  cancelTripComponents,
  createTrip,
  freezeTripSnapshot,
  freezeTripSnapshotForProposalVersion,
  getTrip,
  getTripSnapshot,
  listTripSnapshots,
  listTrips,
  previewTripCancellation,
  priceTrip,
  reserveTrip,
  startTripCheckout,
  updateTrip,
} from "../src/operations.js"

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

describe("trips react operations", () => {
  it("reads a trip from the admin composer route", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    await getTrip(
      {
        baseUrl: "https://app.example",
        fetcher: async (url, init) => {
          calls.push({ url, init })
          return jsonResponse({ envelope: { id: "trip_123" }, components: [] })
        },
      },
      "trip_123",
    )

    expect(calls[0]?.url).toBe("https://app.example/v1/admin/trips/trip_123")
  })

  it("lists trips with query params", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    await listTrips(
      {
        baseUrl: "https://app.example",
        fetcher: async (url, init) => {
          calls.push({ url, init })
          return jsonResponse({ data: [], total: 0, limit: 25, offset: 0 })
        },
      },
      {
        status: "reserved",
        search: "istanbul",
        accommodationId: "acc_123",
        limit: 25,
        offset: 50,
      },
    )

    expect(calls[0]?.url).toBe(
      "https://app.example/v1/admin/trips?status=reserved&search=istanbul&accommodationId=acc_123&limit=25&offset=50",
    )
  })

  it("can target the public composer route", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const client = {
      baseUrl: "https://app.example",
      surface: "public" as const,
      fetcher: async (url: string, init?: RequestInit) => {
        calls.push({ url, init })
        return jsonResponse({ envelope: { id: "trip_123" }, components: [] })
      },
    }

    await createTrip(client, { title: "Bucharest extension" })
    await getTrip(client, "trip_123")
    await addTripComponent(client, "trip_123", {
      kind: "manual_placeholder",
      estimatedPricing: {
        currency: "EUR",
        subtotalAmountCents: 4000,
        taxAmountCents: 0,
        totalAmountCents: 4000,
      },
      metadata: { manualService: { name: "Airport transfer" }, template: "manual" },
    })

    expect(calls.map((call) => call.url)).toEqual([
      "https://app.example/v1/public/trips",
      "https://app.example/v1/public/trips/trip_123",
      "https://app.example/v1/public/trips/trip_123/components",
    ])
  })

  it("posts price, reserve, and checkout bodies without duplicating envelopeId", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const client = {
      baseUrl: "https://app.example",
      fetcher: async (url: string, init?: RequestInit) => {
        calls.push({ url, init })
        return jsonResponse({
          envelope: { id: "trip_123" },
          components: [],
          pricing: {},
          reserved: [],
          failures: [],
          compensations: [],
          warnings: [],
          target: {},
          componentCheckouts: [],
        })
      },
    }

    await priceTrip(client, "trip_123", {
      scope: { locale: "en", audience: "customer", market: "RO", currency: "EUR" },
    })
    await reserveTrip(client, "trip_123", { idempotencyKey: "reserve-1" })
    await startTripCheckout(client, "trip_123", {
      intent: "card",
      idempotencyKey: "checkout-1",
      request: { payerEmail: "traveler@example.com" },
    })

    expect(calls.map((call) => call.url)).toEqual([
      "https://app.example/v1/admin/trips/trip_123/price",
      "https://app.example/v1/admin/trips/trip_123/reserve",
      "https://app.example/v1/admin/trips/trip_123/checkout",
    ])
    expect(calls.map((call) => JSON.parse(String(call.init?.body)))).toEqual([
      { scope: { locale: "en", audience: "customer", market: "RO", currency: "EUR" } },
      { idempotencyKey: "reserve-1" },
      {
        intent: "card",
        idempotencyKey: "checkout-1",
        request: { payerEmail: "traveler@example.com" },
      },
    ])
  })

  it("patches trip envelope constraints through the composer route", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const client = {
      baseUrl: "https://app.example",
      fetcher: async (url: string, init?: RequestInit) => {
        calls.push({ url, init })
        return jsonResponse({
          id: "trip_123",
          constraints: { createAsDraft: true, paymentCurrency: "EUR" },
        })
      },
    }

    await updateTrip(client, "trip_123", {
      constraints: { createAsDraft: true, paymentCurrency: "EUR" },
    })

    expect(calls[0]?.url).toBe("https://app.example/v1/admin/trips/trip_123")
    expect(calls[0]?.init?.method).toBe("PATCH")
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      constraints: { createAsDraft: true, paymentCurrency: "EUR" },
    })
  })

  it("reads and creates trip snapshots from the admin composer route", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const client = {
      baseUrl: "https://app.example",
      fetcher: async (url: string, init?: RequestInit) => {
        calls.push({ url, init })
        return jsonResponse({ id: "trsn_123", envelopeId: "trip_123", proposal: { lines: [] } })
      },
    }

    await listTripSnapshots(client, "trip_123")
    await getTripSnapshot(client, "trsn_123")
    await freezeTripSnapshot(client, "trip_123", { createdBy: "agent_1" })

    expect(calls.map((call) => call.url)).toEqual([
      "https://app.example/v1/admin/trips/trip_123/snapshots",
      "https://app.example/v1/admin/trips/snapshots/trsn_123",
      "https://app.example/v1/admin/trips/trip_123/snapshots",
    ])
    expect(JSON.parse(String(calls[2]?.init?.body))).toEqual({ createdBy: "agent_1" })
  })

  it("freezes and applies a trip snapshot to a proposal version through the operator bridge", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const client = {
      baseUrl: "https://app.example",
      surface: "public" as const,
      fetcher: async (url: string, init?: RequestInit) => {
        calls.push({ url, init })
        return jsonResponse({
          snapshot: { id: "trsn_123" },
          proposalVersion: { id: "prvr_123", proposalId: "prps_123" },
          lines: [],
        })
      },
    }

    await freezeTripSnapshotForProposalVersion(client, "trip_123", "prvr_123", {
      createdBy: "agent_1",
    })

    expect(calls[0]?.url).toBe(
      "https://app.example/v1/admin/trips/trip_123/proposal-versions/prvr_123/snapshot",
    )
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ createdBy: "agent_1" })
  })

  it("posts cancellation preview and selected-component cancel bodies", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const client = {
      baseUrl: "https://app.example",
      fetcher: async (url: string, init?: RequestInit) => {
        calls.push({ url, init })
        return jsonResponse({
          envelope: { id: "trip_123" },
          components: [],
          preview: {
            envelopeId: "trip_123",
            selectedComponentIds: ["stay", "flight"],
            currency: "EUR",
            estimatedRefundAmountCents: 0,
            estimatedPenaltyAmountCents: 0,
            staffActionRequired: false,
            components: [],
            warnings: [],
          },
          cancelled: [],
          remediation: [],
          skipped: [],
        })
      },
    }

    await previewTripCancellation(client, "trip_123", {
      componentIds: ["stay", "flight"],
      reason: "Traveler changed plans",
    })
    await cancelTripComponents(client, "trip_123", {
      componentIds: ["stay", "flight"],
      idempotencyKey: "cancel-1",
      reason: "Traveler changed plans",
    })

    expect(calls.map((call) => call.url)).toEqual([
      "https://app.example/v1/admin/trips/trip_123/cancellation-preview",
      "https://app.example/v1/admin/trips/trip_123/cancel-components",
    ])
    expect(calls.map((call) => JSON.parse(String(call.init?.body)))).toEqual([
      { componentIds: ["stay", "flight"], reason: "Traveler changed plans" },
      {
        componentIds: ["stay", "flight"],
        idempotencyKey: "cancel-1",
        reason: "Traveler changed plans",
      },
    ])
  })
})
