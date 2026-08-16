import { beforeEach, describe, expect, it, vi } from "vitest"

const catalogMocks = vi.hoisted(() => ({
  fetchOverlaysForEntity: vi.fn(async () => [] as Array<{ field_path: string; value: unknown }>),
  readSourcedEntry: vi.fn(async () => null as unknown),
  pickBestCachedLocale: vi.fn(() => undefined as unknown),
  // Run the callback inline; the real implementation takes a DB advisory lock.
  withContentRefreshLock: vi.fn(async (_db: unknown, _key: unknown, fn: () => Promise<unknown>) =>
    fn(),
  ),
}))

vi.mock("@voyant-travel/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@voyant-travel/catalog")>()),
  ...catalogMocks,
}))

import { getCruiseContent } from "../../src/service-content.js"

const ENTITY_ID = "crus_sr_test"
const CONNECTION = "conn_01kztv84ncexvvgxy6s6gb33df"

function sourcedEntry() {
  const now = new Date()
  return {
    id: "cse_1",
    entity_module: "cruises",
    entity_id: ENTITY_ID,
    source_kind: "cruise:viking",
    source_provider: "viking",
    source_connection_id: CONNECTION,
    source_ref: "sr_test",
    source_freshness: "sync",
    last_sourced_at: now,
    status: "active",
    projection: {
      id: ENTITY_ID,
      name: "Elegant Elbe",
      status: "active",
      cruiseType: "river",
      nights: 7,
      lineName: "Viking Cruises (US)",
    },
    projection_etag: null,
    projection_seen_at: now,
    first_seen_at: now,
    last_seen_at: now,
  }
}

/** No cached content rows — forces the adapter path. Accepts the cache write. */
function emptyCacheDb() {
  return {
    select: () => ({ from: () => ({ where: async () => [] }) }),
    insert: () => ({
      values: () => ({ onConflictDoUpdate: async () => undefined }),
    }),
  } as never
}

function registryWith(getContent: () => Promise<never>) {
  const adapter = {
    kind: "cruise:viking",
    capabilities: { verticals: ["cruises"] },
    getContent,
  }
  return {
    byKind: (kind: string) =>
      kind === "cruise:viking" ? [{ connectionId: `${CONNECTION}:cruises`, adapter }] : [],
    resolveByConnection: () => undefined,
  } as never
}

/**
 * The adapter throwing used to escape `getCruiseContent` and 500 the detail
 * route. We hold a durable projection for the cruise and §3.6 defines the
 * synthesizer as the degraded read, so an upstream miss must not blank the page.
 * On sandbox this turned into a 500 on every concurrent cruise detail open.
 */
describe("getCruiseContent — adapter getContent failure", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    catalogMocks.fetchOverlaysForEntity.mockResolvedValue([])
    catalogMocks.readSourcedEntry.mockResolvedValue(sourcedEntry())
    catalogMocks.pickBestCachedLocale.mockReturnValue(undefined)
    catalogMocks.withContentRefreshLock.mockImplementation(
      async (_db: unknown, _key: unknown, fn: () => Promise<unknown>) => fn(),
    )
  })

  it("degrades to synthesized content instead of throwing", async () => {
    const onContentFetchError = vi.fn()
    const result = await getCruiseContent(
      emptyCacheDb(),
      ENTITY_ID,
      { preferredLocales: ["en-GB"] },
      {
        registry: registryWith(async () => {
          throw new Error(`Connect cruise content not found for ${ENTITY_ID} on ${CONNECTION}`)
        }),
        onContentFetchError,
      },
    )

    expect(result?.source).toBe("synthesized")
    expect(result?.synthesized).toBe(true)
    // The projection we already hold still renders.
    expect(result?.content.cruise.name).toBe("Elegant Elbe")
    expect(result?.content.cruise.cruise_type).toBe("river")
    expect(result?.content.cruise.cruise_line).toBe("Viking Cruises (US)")
  })

  it("reports the failure so an upstream outage stays visible", async () => {
    const onContentFetchError = vi.fn()
    await getCruiseContent(
      emptyCacheDb(),
      ENTITY_ID,
      { preferredLocales: ["en-GB"] },
      {
        registry: registryWith(async () => {
          throw new Error("Connect cruise content not found")
        }),
        onContentFetchError,
      },
    )

    expect(onContentFetchError).toHaveBeenCalledTimes(1)
    expect(onContentFetchError.mock.calls[0]?.[0]).toMatchObject({
      entity_id: ENTITY_ID,
      reason: expect.stringContaining("Connect cruise content not found"),
    })
  })

  it("still serves fresh content when the adapter succeeds", async () => {
    const result = await getCruiseContent(
      emptyCacheDb(),
      ENTITY_ID,
      { preferredLocales: ["en-GB"] },
      {
        registry: registryWith(
          async () =>
            ({
              entity_module: "cruises",
              entity_id: ENTITY_ID,
              returned_locale: "en-GB",
              content: {
                cruise: { id: ENTITY_ID, name: "Elegant Elbe", cruise_line: "Viking Cruises (US)" },
                ship: null,
                sailings: [],
                cabin_categories: [],
                itinerary_stops: [],
                policies: [],
              },
              content_schema_version: "cruises/v1",
            }) as never,
        ),
        onContentFetchError: () => {},
      },
    )

    expect(result?.synthesized).toBe(false)
  })
})
