import { beforeEach, describe, expect, it, vi } from "vitest"

const overlayMocks = vi.hoisted(() => ({
  fetchOverlayRowsForEntity: vi.fn(async () => [] as unknown[]),
}))
const contentMocks = vi.hoisted(() => ({
  getProductContent: vi.fn(),
}))

vi.mock("@voyant-travel/catalog/services/overlay", () => overlayMocks)
vi.mock("../../src/service-content.js", () => contentMocks)

import {
  OwnedProductNotOverlayableError,
  readProductEditorialOverlayState,
} from "../../src/service-editorial-overlay-state.js"

const SCOPE = {
  preferredLocales: ["ro-RO"],
  audience: "customer" as const,
  market: "RO",
  acceptMachineTranslated: false,
}

function makeContent(overrides: Record<string, unknown> = {}) {
  return {
    product: { id: "prod_1", name: "Source name", description: "Source description" },
    options: [],
    days: [{ id: "day_1", day_number: 1, title: "Day one", description: null, services: [] }],
    media: [],
    policies: [],
    departures: [],
    ...overrides,
  }
}

function makeResolved(content: ReturnType<typeof makeContent>, matchKind = "exact") {
  return {
    content,
    resolution: {
      served_locale: "ro-RO",
      match_kind: matchKind,
      candidate: { locale: "ro-RO" },
    },
    provenance: { source_kind: "direct:test" },
    source: "sourced-cache",
    served_stale: false,
    synthesized: false,
    machine_translated: false,
  }
}

function makeDb(sourcedRows: unknown[] = []) {
  return {
    select: () => ({ from: () => ({ where: async () => sourcedRows }) }),
  } as never
}

function makeRegistry() {
  return {} as never
}

function overlayRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ovl_1",
    entity_module: "products",
    entity_id: "prod_1",
    node_kind: "root",
    node_key: "root",
    field_path: "/product/name",
    locale: "ro-RO",
    audience: "customer",
    market: "RO",
    value: "Overlay name",
    origin: { kind: "admin-ui", user_id: "usr_1" },
    version: 3,
    editorial_note: null,
    updated_at: new Date("2026-02-01T00:00:00Z"),
    created_at: new Date("2026-02-01T00:00:00Z"),
    ...overrides,
  }
}

describe("readProductEditorialOverlayState", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    overlayMocks.fetchOverlayRowsForEntity.mockResolvedValue([])
  })

  it("enumerates every eligible field even when no overlay exists", async () => {
    const content = makeContent()
    contentMocks.getProductContent.mockResolvedValue(makeResolved(content))

    const state = await readProductEditorialOverlayState(makeDb(), "prod_1", SCOPE, {
      registry: makeRegistry(),
    })

    expect(state).not.toBeNull()
    expect(state?.fields["root:root:/product/name"]).toMatchObject({
      state: "exact",
      kind: "text",
      sourceValue: "Source name",
      effectiveValue: "Source name",
      overlayValue: undefined,
    })
    // Provider supplied no day description -> operator can still author one.
    expect(state?.fields["itinerary-day:day_1:description"]).toMatchObject({
      state: "missing",
      kind: "long-text",
    })
    expect(state?.nodes).toEqual([
      { nodeKind: "root", nodeKey: "root", dayNumber: null, label: null },
      { nodeKind: "itinerary-day", nodeKey: "day_1", dayNumber: 1, label: "Day one" },
    ])
  })

  // The read model exists to compare provider copy against an operator's
  // restatement of it. An owned product is both sides of that comparison, so
  // there is nothing to compare and no overlay collection to return.
  it("refuses an owned product instead of returning an empty comparison", async () => {
    contentMocks.getProductContent.mockResolvedValue({
      ...makeResolved(makeContent()),
      source: "owned",
      provenance: { source_kind: "owned" },
    })

    await expect(
      readProductEditorialOverlayState(makeDb(), "prod_1", SCOPE, { registry: makeRegistry() }),
    ).rejects.toThrow(OwnedProductNotOverlayableError)
    expect(overlayMocks.fetchOverlayRowsForEntity).not.toHaveBeenCalled()
  })

  it("marks locale-fallback source fields so admin can see what was served", async () => {
    const content = makeContent()
    contentMocks.getProductContent.mockResolvedValue(makeResolved(content, "language_match"))

    const state = await readProductEditorialOverlayState(makeDb(), "prod_1", SCOPE, {
      registry: makeRegistry(),
    })

    expect(state?.fields["root:root:/product/name"]?.state).toBe("language-fallback")
  })

  it("reports overlay-only translations when the provider supplied no value", async () => {
    const source = makeContent({
      product: { id: "prod_1", name: "Source name", description: null },
    })
    const effective = makeContent({
      product: { id: "prod_1", name: "Source name", description: "Overlay description" },
    })
    contentMocks.getProductContent
      .mockResolvedValueOnce(makeResolved(source))
      .mockResolvedValueOnce(makeResolved(effective))
    overlayMocks.fetchOverlayRowsForEntity.mockResolvedValue([
      overlayRow({ field_path: "/product/description", value: "Overlay description" }),
    ])

    const state = await readProductEditorialOverlayState(makeDb(), "prod_1", SCOPE, {
      registry: makeRegistry(),
    })

    expect(state?.fields["root:root:/product/description"]).toMatchObject({
      state: "overlay-only",
      overlayValue: "Overlay description",
      version: 3,
      id: "ovl_1",
    })
    expect(state?.locale.matchKind).toBe("overlay-only")
  })

  it("marks an overlay drifted when the provider refreshed the source afterwards", async () => {
    const content = makeContent()
    contentMocks.getProductContent.mockResolvedValue(makeResolved(content))
    overlayMocks.fetchOverlayRowsForEntity.mockResolvedValue([overlayRow()])
    const db = makeDb([
      {
        locale: "ro-RO",
        returned_locale: "ro-RO",
        source_updated_at: new Date("2026-03-01T00:00:00Z"),
      },
    ])

    const state = await readProductEditorialOverlayState(db, "prod_1", SCOPE, {
      registry: makeRegistry(),
    })

    expect(state?.fields["root:root:/product/name"]).toMatchObject({
      state: "overlaid",
      drifted: true,
    })
    expect(state?.sourceUpdatedAt).toBe("2026-03-01T00:00:00.000Z")
  })

  it("orphans an overlay whose itinerary day the provider removed", async () => {
    const content = makeContent({ days: [] })
    contentMocks.getProductContent.mockResolvedValue(makeResolved(content))
    overlayMocks.fetchOverlayRowsForEntity.mockResolvedValue([
      overlayRow({
        id: "ovl_day",
        node_kind: "itinerary-day",
        node_key: "day_removed",
        field_path: "description",
        value: "Localized day",
      }),
    ])

    const state = await readProductEditorialOverlayState(makeDb(), "prod_1", SCOPE, {
      registry: makeRegistry(),
    })

    expect(state?.fields["itinerary-day:day_removed:description"]).toMatchObject({
      state: "orphaned",
      overlayValue: "Localized day",
      effectiveValue: undefined,
    })
  })

  it("flags an overlay whose value fails the vertical content schema", async () => {
    const content = makeContent()
    contentMocks.getProductContent.mockResolvedValue(makeResolved(content))
    overlayMocks.fetchOverlayRowsForEntity.mockResolvedValue([
      overlayRow({ field_path: "/product/highlights", value: { not: "an array" } }),
    ])

    const state = await readProductEditorialOverlayState(makeDb(), "prod_1", SCOPE, {
      registry: makeRegistry(),
    })

    const field = state?.fields["root:root:/product/highlights"]
    expect(field?.state).toBe("invalid")
    expect(field?.invalidReason).toBeTruthy()
  })

  it("lists the source locales the provider cache actually holds", async () => {
    const content = makeContent()
    contentMocks.getProductContent.mockResolvedValue(makeResolved(content))
    const db = makeDb([
      { locale: "en-GB", returned_locale: "en-GB", source_updated_at: null },
      { locale: "ro-RO", returned_locale: "en-GB", source_updated_at: null },
    ])

    const state = await readProductEditorialOverlayState(db, "prod_1", SCOPE, {
      registry: makeRegistry(),
    })

    expect(state?.availableSourceLocales).toEqual(["en-GB", "ro-RO"])
  })
})
