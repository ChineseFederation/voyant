// agent-quality: file-size exception -- owner: catalog; existing test module stays co-located until a dedicated split preserves coverage.

import { assertIndexerAdapterConformance } from "@voyant-travel/catalog-contracts/indexer/conformance"
import type {
  IndexerDocument,
  IndexerSlice,
} from "@voyant-travel/catalog-contracts/indexer/contract"
import { describe, expect, it, vi } from "vitest"
import { createFieldPolicyRegistry, defineFieldPolicy } from "../contract.js"
import {
  buildCollectionSchema,
  buildDefaultTypesenseQueryBy,
  buildDefaultTypesenseSearchFields,
  buildSearchQuery,
  collectionName,
  createTypesenseIndexer,
  type ImportFailureSummary,
  parseCollectionName,
  parseTypesenseImportResults,
  summarizeImportFailures,
  type TypesenseClient,
  type TypesenseCollectionSchema,
  TypesenseImportError,
  type TypesenseSearchQuery,
  type TypesenseSearchResponse,
} from "./typesense.js"

const slice: IndexerSlice = {
  vertical: "products",
  locale: "en-GB",
  audience: "customer",
  market: "default",
}

const registry = createFieldPolicyRegistry(
  defineFieldPolicy([
    {
      path: "name",
      class: "merchandisable",
      merge: "replace",
      editRole: "marketing",
      overrideFriction: "none",
      snapshot: "on-book",
      query: "indexed-column",
      visibility: ["customer"],
    },
    {
      path: "priceFromAmountCents",
      class: "structural",
      merge: "source-only",
      editRole: "none",
      overrideFriction: "none",
      snapshot: "on-book",
      query: "indexed-column",
      visibility: ["customer"],
    },
    {
      path: "nextDepartureAt",
      class: "structural",
      merge: "source-only",
      editRole: "none",
      overrideFriction: "none",
      snapshot: "on-book",
      query: "indexed-column",
      visibility: ["customer"],
    },
    {
      path: "nextDepartureDate",
      class: "structural",
      merge: "source-only",
      editRole: "none",
      overrideFriction: "none",
      snapshot: "on-book",
      query: "indexed-column",
      visibility: ["customer"],
    },
    {
      path: "nextDepartureEndsAt",
      class: "structural",
      merge: "source-only",
      editRole: "none",
      overrideFriction: "none",
      snapshot: "on-book",
      query: "indexed-column",
      visibility: ["customer"],
    },
    {
      path: "nextDepartureEndDate",
      class: "structural",
      merge: "source-only",
      editRole: "none",
      overrideFriction: "none",
      snapshot: "on-book",
      query: "indexed-column",
      visibility: ["customer"],
    },
    {
      path: "departureTimezone",
      class: "structural",
      merge: "source-only",
      editRole: "none",
      overrideFriction: "none",
      snapshot: "on-book",
      query: "indexed-column",
      visibility: ["customer"],
    },
    {
      path: "createdAt",
      class: "managed",
      merge: "source-only",
      editRole: "none",
      overrideFriction: "none",
      snapshot: "on-book",
      query: "indexed-column",
      visibility: ["staff"],
    },
    {
      path: "durationDays",
      class: "structural",
      merge: "source-only",
      editRole: "none",
      overrideFriction: "none",
      snapshot: "on-book",
      query: "indexed-column",
      visibility: ["customer"],
    },
    {
      path: "latitude",
      class: "structural",
      merge: "source-only",
      editRole: "none",
      overrideFriction: "none",
      snapshot: "on-book",
      query: "indexed-column",
      visibility: ["customer"],
    },
    {
      path: "hasOffer",
      class: "structural",
      merge: "source-only",
      editRole: "none",
      overrideFriction: "none",
      snapshot: "on-book",
      query: "indexed-column",
      visibility: ["customer"],
    },
    {
      path: "categorySlugs[]",
      class: "structural",
      merge: "source-only",
      editRole: "none",
      overrideFriction: "none",
      snapshot: "on-book",
      query: "indexed-column",
      visibility: ["customer"],
    },
    {
      path: "thumbnailUrl",
      class: "merchandisable",
      merge: "source-only",
      editRole: "none",
      overrideFriction: "none",
      snapshot: "on-book",
      query: "indexed-column",
      visibility: ["customer"],
    },
    {
      path: "status",
      class: "structural",
      merge: "source-only",
      editRole: "none",
      overrideFriction: "none",
      snapshot: "on-book",
      query: "indexed-column",
      visibility: ["staff"],
    },
  ]),
)

describe("Typesense catalog indexer", () => {
  it("passes the public adapter conformance suite with a deterministic client", async () => {
    await expect(
      assertIndexerAdapterConformance({
        createAdapter: () =>
          createTypesenseIndexer({
            client: createDeterministicTypesenseClient(),
            vectorDimensions: 3,
          }),
        namespace: "typesense-conformance",
      }),
    ).resolves.toBeUndefined()
  })

  it("keeps semantic search pure vector and exposes larger-is-better vector and hybrid scores", async () => {
    const indexer = createTypesenseIndexer({
      client: createDeterministicTypesenseClient(),
      vectorDimensions: 3,
    })
    const vectorSlice = { ...slice, vertical: "vector-score-mapping" }
    await indexer.ensureCollection(vectorSlice, registry)
    await indexer.upsert(vectorSlice, [
      {
        id: "vector-winner",
        fields: { name: "Alpine" },
        embeddings: { text_embedding: [1, 0, 0] },
      },
      {
        id: "keyword-winner",
        fields: { name: "Coastal" },
        embeddings: { text_embedding: [-1, 0, 0] },
      },
      { id: "keyword-only", fields: { name: "Keyword Signal" } },
    ])

    const semantic = await indexer.search(vectorSlice, {
      query: "Coastal",
      mode: "semantic",
      query_embedding: [1, 0, 0],
    })
    expect(semantic.hits.map(({ id }) => id)).toEqual(["vector-winner", "keyword-winner"])
    expect(semantic.hits.map(({ score }) => score)).toEqual([1, 0])

    const hybrid = await indexer.search(vectorSlice, {
      query: "Coastal",
      mode: "hybrid",
      query_embedding: [1, 0, 0],
      alpha: 0.25,
    })
    expect(hybrid.hits[0]?.id).toBe("keyword-winner")
    expect(hybrid.hits[0]!.score).toBeGreaterThan(hybrid.hits[1]!.score)

    const keywordOnly = await indexer.search(vectorSlice, {
      query: "Keyword Signal",
      mode: "hybrid",
      query_embedding: [1, 0, 0],
      alpha: 0.25,
    })
    expect(keywordOnly.hits.map(({ id }) => id)).toContain("keyword-only")
  })

  it("uses one response-order score scale when hybrid metadata is absent", async () => {
    const indexer = createTypesenseIndexer({
      client: createDeterministicTypesenseClient({ omitHybridSearchInfo: true }),
      vectorDimensions: 3,
    })
    const vectorSlice = { ...slice, vertical: "hybrid-score-fallback" }
    await indexer.ensureCollection(vectorSlice, registry)
    await indexer.upsert(vectorSlice, [
      { id: "keyword-only", fields: { name: "Keyword Signal" } },
      {
        id: "vector-only",
        fields: { name: "Alpine" },
        embeddings: { text_embedding: [1, 0, 0] },
      },
    ])

    const results = await indexer.search(vectorSlice, {
      query: "Keyword Signal",
      mode: "hybrid",
      query_embedding: [1, 0, 0],
      alpha: 0.5,
    })

    expect(results.hits.map(({ id }) => id)).toEqual(["keyword-only", "vector-only"])
    expect(results.hits.map(({ score }) => score)).toEqual([1, 0.5])
  })

  it("includes channel in collection names when the slice is channel-scoped", () => {
    expect(collectionName({ ...slice, channel: "chan_website" })).toBe(
      "products__en-GB__customer__default__chan_website",
    )
  })

  it("round-trips prefixed staff-admin channel collection names", () => {
    const adminSlice: IndexerSlice = {
      ...slice,
      audience: "staff-admin",
      channel: "chan_trade",
    }
    const name = collectionName(adminSlice, "tenant_acme")

    expect(name).toBe("tenant_acme__products__en-GB__staff-admin__default__chan_trade")
    expect(parseCollectionName(name, "tenant_acme")).toEqual(adminSlice)
    expect(parseCollectionName(name, "tenant_other")).toBeUndefined()
  })

  it("round-trips slice values containing the collection delimiter", () => {
    const delimited = { ...slice, market: "trade__uk", channel: "agent__portal" }
    const name = collectionName(delimited)

    expect(name).toContain("trade%5F%5Fuk")
    expect(parseCollectionName(name)).toEqual(delimited)
  })

  it("declares known storefront card fields with numeric and boolean types", () => {
    const schema = buildCollectionSchema(slice, registry)
    expect(schema.fields.find((field) => field.name === "priceFromAmountCents")?.type).toBe("int64")
    expect(schema.fields.find((field) => field.name === "durationDays")?.type).toBe("int64")
    expect(schema.fields.find((field) => field.name === "latitude")?.type).toBe("float")
    expect(schema.fields.find((field) => field.name === "hasOffer")?.type).toBe("bool")
    expect(schema.fields.find((field) => field.name === "nextDepartureAt")?.sort).toBe(true)
    expect(schema.fields.find((field) => field.name === "nextDepartureDate")?.sort).toBe(true)
    expect(schema.fields.find((field) => field.name === "nextDepartureEndsAt")?.sort).toBe(true)
    expect(schema.fields.find((field) => field.name === "nextDepartureEndDate")?.sort).toBe(true)
    // The zone is a frame declaration, not prose: indexed and filterable,
    // but never swept into keyword search — otherwise "Europe" matches every
    // product in Europe/Bucharest (#4116).
    expect(schema.fields.find((field) => field.name === "departureTimezone")?.type).toBe("string")
    expect(buildDefaultTypesenseSearchFields(registry, slice)).not.toContain("departureTimezone")
    expect(schema.metadata).toEqual({
      voyant: {
        defaultQueryBy: "name,categorySlugs",
        defaultSearchFields: ["name", "categorySlugs"],
      },
    })
  })

  it("declares embedding metadata when vector indexing is enabled", () => {
    const schema = buildCollectionSchema(slice, registry, { vectorDimensions: 768 })

    expect(schema.fields.find((field) => field.name === "text_embedding")).toMatchObject({
      type: "float[]",
      num_dim: 768,
      optional: true,
    })
    expect(schema.fields.find((field) => field.name === "embedding_model_id")).toMatchObject({
      type: "string",
      facet: true,
      optional: true,
    })
  })

  it("derives default Typesense query fields from policy-visible searchable text", () => {
    expect(buildDefaultTypesenseSearchFields(registry, slice)).toEqual(["name", "categorySlugs"])
    expect(buildDefaultTypesenseQueryBy(registry, slice)).toBe("name,categorySlugs")
  })

  it("keeps non-search fields out of Typesense query_by", () => {
    const query = buildSearchQuery({ query: "retreat", mode: "keyword" }, registry, slice)
    expect(query.query_by).toBe("name,categorySlugs")
    expect(query.query_by).not.toContain("categorySlugs[]")
    expect(query.query_by).not.toContain("priceFromAmountCents")
    expect(query.query_by).not.toContain("durationDays")
    expect(query.query_by).not.toContain("hasOffer")
    expect(query.query_by).not.toContain("thumbnailUrl")
    expect(query.query_by).not.toContain("status")
  })

  it("maps typed storefront sort options to engine sort fields", () => {
    const query = buildSearchQuery(
      { query: "", mode: "keyword", sort: "price-desc" },
      registry,
      slice,
    )

    expect(query.sort_by).toBe("priceFromAmountCents:desc")
  })

  it("maps departure sort to the sortable local departure date", () => {
    const query = buildSearchQuery(
      { query: "", mode: "keyword", sort: "departure-asc" },
      registry,
      slice,
    )

    expect(query.sort_by).toBe("nextDepartureDate:asc")
  })

  it("normalizes list policy paths for facets and filters", () => {
    const query = buildSearchQuery(
      {
        query: "",
        mode: "keyword",
        facets: [{ field: "categorySlugs[]", limit: 3 }],
        filters: [
          { kind: "in", field: "categorySlugs[]", values: ["cruises", "sailing"] },
          { kind: "eq", field: "departureMonths[]", value: "2026-06" },
        ],
      },
      registry,
    )

    expect(query.facet_by).toBe("categorySlugs")
    expect(query.max_facet_values).toBe(3)
    expect(query.filter_by).toBe(
      'categorySlugs:["cruises","sailing"] && departureMonths:="2026-06"',
    )
  })

  it("uses a wildcard text query for semantic mode even when text is non-empty", () => {
    const query = buildSearchQuery(
      {
        query: "conflicting keyword",
        mode: "semantic",
        query_embedding: [1, 0, 0],
      },
      registry,
      slice,
    )

    expect(query.q).toBe("*")
  })

  it("preserves independent facet limits", async () => {
    const categoryPolicy = registry.resolve("categorySlugs[]")!
    const facetRegistry = createFieldPolicyRegistry([
      ...registry.policies,
      { ...categoryPolicy, path: "themes[]" },
    ])
    const client = createDeterministicTypesenseClient()
    const indexer = createTypesenseIndexer({ client })
    const facetSlice = { ...slice, vertical: "facet-limits" }

    await indexer.ensureCollection(facetSlice, facetRegistry)
    await indexer.upsert(facetSlice, [
      {
        id: "one",
        fields: { name: "One", categorySlugs: ["a"], themes: ["one"] },
      },
      {
        id: "two",
        fields: { name: "Two", categorySlugs: ["b"], themes: ["two"] },
      },
      {
        id: "three",
        fields: { name: "Three", categorySlugs: ["c"], themes: ["three"] },
      },
    ])

    const results = await indexer.search(facetSlice, {
      query: "",
      mode: "keyword",
      facets: [{ field: "categorySlugs[]", limit: 1 }, { field: "themes[]" }],
    })

    expect(results.facets?.categorySlugs).toHaveLength(1)
    expect(results.facets?.themes).toHaveLength(3)
  })

  it("uses the portable facet maximum for omitted and oversized limits", () => {
    const query = buildSearchQuery(
      {
        query: "",
        mode: "keyword",
        facets: [{ field: "categorySlugs[]", limit: 1 }, { field: "themes[]" }],
      },
      registry,
      slice,
    )

    expect(query.max_facet_values).toBe(250)

    const oversized = buildSearchQuery(
      {
        query: "",
        mode: "keyword",
        facets: [{ field: "categorySlugs[]", limit: 300 }],
      },
      registry,
      slice,
    )
    expect(oversized.max_facet_values).toBe(250)
  })

  it("rejects invalid explicit facet limits on direct adapter requests", async () => {
    const indexer = createTypesenseIndexer({ client: createDeterministicTypesenseClient() })
    const facetSlice = { ...slice, vertical: "facet-limit-validation" }
    await indexer.ensureCollection(facetSlice, registry)

    for (const limit of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
      await expect(
        indexer.search(facetSlice, {
          query: "",
          mode: "keyword",
          facets: [{ field: "categorySlugs[]", limit }],
        }),
      ).rejects.toThrow("Facet limit must be a positive finite integer")
    }
  })

  it("returns at most 250 facet buckets when a larger limit is requested", async () => {
    const client = createDeterministicTypesenseClient()
    const indexer = createTypesenseIndexer({ client })
    const facetSlice = { ...slice, vertical: "facet-portable-maximum" }
    await indexer.ensureCollection(facetSlice, registry)
    await indexer.upsert(
      facetSlice,
      Array.from({ length: 251 }, (_, index) => ({
        id: `facet-${index}`,
        fields: { name: `Facet ${index}`, categorySlugs: [`bucket-${index}`] },
      })),
    )

    const results = await indexer.search(facetSlice, {
      query: "",
      mode: "keyword",
      facets: [{ field: "categorySlugs[]", limit: 300 }],
    })

    expect(results.facets?.categorySlugs).toHaveLength(250)
  })

  it("rejects deterministic imports that do not match the collection schema", async () => {
    const client = createDeterministicTypesenseClient()
    const indexer = createTypesenseIndexer({ client })

    await indexer.ensureCollection(slice, registry)
    await expect(
      client
        .collections(collectionName(slice))
        .documents()
        .import([{ id: "invalid", name: "Invalid", undeclared: true }]),
    ).resolves.toEqual([
      {
        success: false,
        error:
          'Field "undeclared" is not declared in collection "products__en-GB__customer__default"',
      },
    ])
  })

  it("filters vector searches by embedding model id", () => {
    const query = buildSearchQuery(
      {
        query: "retreat",
        mode: "hybrid",
        query_embedding: [0.1, 0.2, 0.3],
        query_embedding_model_id: "gemini/text-embedding-004",
        filters: [{ kind: "eq", field: "categorySlugs[]", value: "london" }],
      },
      registry,
      slice,
    )

    expect(query.vector_query).toContain("text_embedding")
    expect(query.filter_by).toBe(
      'categorySlugs:="london" && embedding_model_id:="gemini/text-embedding-004"',
    )
  })

  it("does not sort public slices by staff-only newest fields", () => {
    const query = buildSearchQuery({ query: "", mode: "keyword", sort: "newest" }, registry, slice)

    expect(query.sort_by).toBeUndefined()
  })

  it("lists only collection slices managed under the configured prefix", async () => {
    const client: TypesenseClient = {
      collections: () => ({
        list: async () => [
          {
            name: "tenant_acme__products__en-GB__staff-admin__default__chan_trade",
            fields: [],
          },
          { name: "tenant_acme__products__fr-FR__customer__eu", fields: [] },
          { name: "tenant_other__products__en-GB__customer__default", fields: [] },
          { name: "tenant_acme__products__en-GB__unknown__default", fields: [] },
        ],
        create: async () => undefined,
        update: async () => undefined,
        delete: async () => undefined,
        retrieve: async () => ({ name: "unused", fields: [] }),
        documents: () => ({
          import: async () => ({}),
          delete: async () => undefined,
          search: async () => ({ hits: [], found: 0 }),
        }),
      }),
    }
    const indexer = createTypesenseIndexer({ client, collectionPrefix: "tenant_acme" })
    const admin = indexer.admin
    if (!admin) throw new Error("Typesense indexer did not expose admin operations")

    await expect(admin.list()).resolves.toEqual([
      {
        vertical: "products",
        locale: "en-GB",
        audience: "staff-admin",
        market: "default",
        channel: "chan_trade",
      },
      {
        vertical: "products",
        locale: "fr-FR",
        audience: "customer",
        market: "eu",
      },
    ])
  })

  it("drops the prefixed collection and reports a missing collection", async () => {
    const deletedCollections: Array<string | undefined> = []
    const client: TypesenseClient = {
      collections: (name) => ({
        list: async () => [],
        create: async () => undefined,
        update: async () => undefined,
        delete: async () => {
          deletedCollections.push(name)
          if (deletedCollections.length === 2) {
            throw Object.assign(new Error("missing collection"), { httpStatus: 404 })
          }
        },
        retrieve: async () => ({ name: name ?? "unused", fields: [] }),
        documents: () => ({
          import: async () => ({}),
          delete: async () => undefined,
          search: async () => ({ hits: [], found: 0 }),
        }),
      }),
    }
    const indexer = createTypesenseIndexer({ client, collectionPrefix: "tenant_acme" })
    const admin = indexer.admin
    if (!admin) throw new Error("Typesense indexer did not expose admin operations")

    await expect(admin.drop(slice)).resolves.toBe(true)
    await expect(admin.drop(slice)).resolves.toBe(false)
    expect(deletedCollections).toEqual([
      "tenant_acme__products__en-GB__customer__default",
      "tenant_acme__products__en-GB__customer__default",
    ])
  })

  it("returns portable next cursors and scans every Typesense page", async () => {
    const searchQueries: Array<{ page?: number; per_page?: number }> = []
    const client: TypesenseClient = {
      collections: () => ({
        list: async () => [],
        create: async () => undefined,
        update: async () => undefined,
        delete: async () => undefined,
        retrieve: async () => ({ name: "unused", fields: [] }),
        documents: () => ({
          import: async () => ({}),
          delete: async () => undefined,
          search: async (query) => {
            searchQueries.push(query)
            const withEmbedding = (document: Record<string, unknown>) =>
              query.exclude_fields
                ? document
                : {
                    ...document,
                    text_embedding: [0.1, 0.2, 0.3],
                    embedding_model_id: "test-model",
                  }
            return query.page === 1
              ? {
                  hits: [
                    {
                      document: withEmbedding({ id: "prod_abc", name: "Retreat" }),
                      text_match: 10,
                    },
                    { document: withEmbedding({ id: "prod_def", name: "Cruise" }), text_match: 9 },
                  ],
                  found: 3,
                }
              : {
                  hits: [
                    { document: withEmbedding({ id: "prod_ghi", name: "Tour" }), text_match: 8 },
                  ],
                  found: 3,
                }
          },
        }),
      }),
    }
    const indexer = createTypesenseIndexer({
      client,
      registries: new Map([[slice.vertical, registry]]),
    })
    const admin = indexer.admin
    if (!admin) throw new Error("Typesense indexer did not expose admin operations")

    const firstPage = await indexer.search(slice, {
      query: "",
      mode: "keyword",
      pagination: { limit: 2 },
    })
    const secondPage = await indexer.search(slice, {
      query: "",
      mode: "keyword",
      pagination: { limit: 2, cursor: firstPage.next_cursor },
    })

    expect(firstPage.next_cursor).toBe("2")
    expect(secondPage.next_cursor).toBeUndefined()
    expect(searchQueries).toEqual([
      expect.objectContaining({ page: 1, per_page: 2 }),
      expect.objectContaining({ page: 2, per_page: 2 }),
    ])

    searchQueries.length = 0
    const scanned: IndexerDocument[] = []
    for await (const indexedDocument of admin.scan(slice, { batchSize: 2 })) {
      scanned.push(indexedDocument)
    }

    expect(scanned.map(({ id }) => id)).toEqual(["prod_abc", "prod_def", "prod_ghi"])
    expect(scanned[0]).toEqual({
      id: "prod_abc",
      fields: { name: "Retreat" },
      embeddings: { text_embedding: [0.1, 0.2, 0.3] },
      embedding_model_id: "test-model",
    })
    expect(searchQueries).toEqual([
      expect.objectContaining({ page: 1, per_page: 2 }),
      expect.objectContaining({ page: 2, per_page: 2 }),
    ])
  })

  it("caps Typesense pages so portable cursors cannot skip results", async () => {
    const search = vi.fn(async () => ({
      hits: [{ document: { id: "prod_abc" }, text_match: 1 }],
      found: 300,
    }))
    const client: TypesenseClient = {
      collections: () => ({
        list: async () => [],
        create: async () => undefined,
        update: async () => undefined,
        delete: async () => undefined,
        retrieve: async () => ({ name: "unused", fields: [] }),
        documents: () => ({
          import: async () => ({}),
          delete: async () => undefined,
          search,
        }),
      }),
    }
    const indexer = createTypesenseIndexer({
      client,
      registries: new Map([[slice.vertical, registry]]),
    })

    const results = await indexer.search(slice, {
      query: "",
      mode: "keyword",
      pagination: { limit: 500 },
    })

    expect(search).toHaveBeenCalledWith(expect.objectContaining({ page: 1, per_page: 250 }))
    expect(results.next_cursor).toBe("2")
  })

  it("patches default search metadata onto existing collections without field diffs", async () => {
    const updatePayloads: Partial<ReturnType<typeof buildCollectionSchema>>[] = []
    const existingSchema = buildCollectionSchema(slice, registry)
    const client: TypesenseClient = {
      collections: () => ({
        list: async () => [],
        create: async () => {
          throw new Error("already exists")
        },
        update: async (schema) => {
          updatePayloads.push(schema)
        },
        delete: async () => undefined,
        retrieve: async () => ({
          name: existingSchema.name,
          fields: existingSchema.fields,
          enable_nested_fields: true,
        }),
        documents: () => ({
          import: async () => ({}),
          delete: async () => undefined,
          search: async () => ({ hits: [], found: 0 }),
        }),
      }),
    }
    const indexer = createTypesenseIndexer({ client })

    await indexer.ensureCollection(slice, registry)

    expect(updatePayloads).toEqual([
      {
        metadata: {
          voyant: {
            defaultQueryBy: "name,categorySlugs",
            defaultSearchFields: ["name", "categorySlugs"],
          },
        },
      },
    ])
  })

  it("skips collection updates when the existing schema and metadata already match", async () => {
    const existingSchema = buildCollectionSchema(slice, registry)
    let updateCalls = 0
    const client: TypesenseClient = {
      collections: () => ({
        list: async () => [],
        create: async () => {
          throw new Error("already exists")
        },
        update: async () => {
          updateCalls += 1
        },
        delete: async () => undefined,
        retrieve: async () => ({
          ...existingSchema,
          metadata: {
            voyant: {
              defaultSearchFields: ["name", "categorySlugs"],
              defaultQueryBy: "name,categorySlugs",
            },
          },
        }),
        documents: () => ({
          import: async () => ({}),
          delete: async () => undefined,
          search: async () => ({ hits: [], found: 0 }),
        }),
      }),
    }
    const indexer = createTypesenseIndexer({ client })

    await indexer.ensureCollection(slice, registry)

    expect(updateCalls).toBe(0)
  })

  it("retries transient Typesense collection update conflicts", async () => {
    const existingSchema = buildCollectionSchema(slice, registry)
    let updateCalls = 0
    const client: TypesenseClient = {
      collections: () => ({
        list: async () => [],
        create: async () => {
          throw new Error("already exists")
        },
        update: async () => {
          updateCalls += 1
          if (updateCalls < 3) {
            throw new Error(
              'Typesense PATCH /collections/products__en-GB__customer__default 422: {"message":"Another collection update operation is in progress."}',
            )
          }
        },
        delete: async () => undefined,
        retrieve: async () => ({
          name: existingSchema.name,
          fields: existingSchema.fields,
          enable_nested_fields: true,
        }),
        documents: () => ({
          import: async () => ({}),
          delete: async () => undefined,
          search: async () => ({ hits: [], found: 0 }),
        }),
      }),
    }
    const indexer = createTypesenseIndexer({
      client,
      collectionUpdateRetryDelaysMs: [0, 0],
    })

    await indexer.ensureCollection(slice, registry)

    expect(updateCalls).toBe(3)
  })

  it("upserts storefront card values without stringifying typed fields", async () => {
    const imported: unknown[][] = []
    const client: TypesenseClient = {
      collections: () => ({
        list: async () => [],
        create: async () => undefined,
        update: async () => undefined,
        delete: async () => undefined,
        retrieve: async () => ({ name: "unused", fields: [] }),
        documents: () => ({
          import: async (documents: unknown[]) => {
            imported.push(documents)
            return {}
          },
          delete: async () => undefined,
          search: async () => ({ hits: [], found: 0 }),
        }),
      }),
    }
    const indexer = createTypesenseIndexer({ client })
    const document: IndexerDocument = {
      id: "prod_abc",
      fields: {
        name: "Retreat",
        priceFromAmountCents: "125000",
        durationDays: 4,
        latitude: "45.76",
        hasOffer: true,
      },
    }

    await indexer.upsert(slice, [document])

    expect(imported[0]?.[0]).toMatchObject({
      id: "prod_abc",
      name: "Retreat",
      priceFromAmountCents: 125000,
      durationDays: 4,
      latitude: 45.76,
      hasOffer: true,
    })
  })

  it("upserts embedded documents without undeclared schema fields", async () => {
    let fieldNames = new Set<string>()
    const client: TypesenseClient = {
      collections: () => ({
        list: async () => [],
        create: async (schema) => {
          fieldNames = new Set(["id", ...schema.fields.map((field) => field.name)])
        },
        update: async () => undefined,
        delete: async () => undefined,
        retrieve: async () => ({ name: "unused", fields: [] }),
        documents: () => ({
          import: async (documents: unknown[]) => {
            const unknownFields = documents.flatMap((rawDocument) =>
              Object.keys(rawDocument as Record<string, unknown>).filter(
                (key) => !fieldNames.has(key),
              ),
            )
            if (unknownFields.length > 0) {
              return unknownFields
                .map((field) =>
                  JSON.stringify({
                    success: false,
                    error: `Field \`${field}\` is not declared in the collection schema`,
                  }),
                )
                .join("\n")
            }
            return documents.map(() => JSON.stringify({ success: true })).join("\n")
          },
          delete: async () => undefined,
          search: async () => ({ hits: [], found: 0 }),
        }),
      }),
    }
    const indexer = createTypesenseIndexer({
      client,
      vectorDimensions: 3,
      collectionUpdateRetryDelaysMs: [],
    })

    await indexer.ensureCollection(slice, registry)
    await expect(
      indexer.upsert(slice, [
        {
          id: "prod_abc",
          fields: { name: "London 3-Day Essentials" },
          embeddings: { text_embedding: [0.1, 0.2, 0.3] },
          embedding_model_id: "gemini/text-embedding-004",
        },
      ]),
    ).resolves.toBeUndefined()
  })

  it("deletes documents through Typesense's reserved id field filter", async () => {
    const documentsById = new Map<string, Record<string, unknown>>()
    const client: TypesenseClient = {
      collections: () => ({
        list: async () => [],
        create: async () => undefined,
        update: async () => undefined,
        delete: async () => undefined,
        retrieve: async () => ({ name: "unused", fields: [] }),
        documents: () => ({
          import: async (documents: unknown[]) => {
            for (const rawDocument of documents) {
              const indexedDocument = rawDocument as Record<string, unknown>
              documentsById.set(String(indexedDocument.id), indexedDocument)
            }
            return {}
          },
          delete: async (query) => {
            if (query.filter_by !== "id:[prod_abc,prod_def]") {
              return { num_deleted: 0 }
            }
            let numDeleted = 0
            for (const id of ["prod_abc", "prod_def"]) {
              if (documentsById.delete(id)) {
                numDeleted += 1
              }
            }
            return { num_deleted: numDeleted }
          },
          search: async () => ({ hits: [], found: documentsById.size }),
        }),
      }),
    }
    const indexer = createTypesenseIndexer({ client })

    await indexer.upsert(slice, [
      { id: "prod_abc", fields: { name: "Retreat" } },
      { id: "prod_def", fields: { name: "Cruise" } },
    ])
    await indexer.delete(slice, ["prod_abc", "prod_def"])

    expect([...documentsById.keys()]).toEqual([])
  })
})

const document: IndexerDocument = { id: "prod_abc", fields: { name: "Retreat" } }

function clientReturningImport(result: unknown): TypesenseClient {
  return {
    collections: () => ({
      list: async () => [],
      create: async () => undefined,
      update: async () => undefined,
      delete: async () => undefined,
      retrieve: async () => ({ name: "unused", fields: [] }),
      documents: () => ({
        import: async () => result,
        delete: async () => undefined,
        search: async () => ({ hits: [], found: 0 }),
      }),
    }),
  }
}

describe("Typesense import-failure detection", () => {
  const okLine = JSON.stringify({ success: true })
  const failLine = JSON.stringify({
    success: false,
    error: "Field `categorySlugs` must be an array",
    document: '{"id":"prod_abc"}',
  })

  it("parses an NDJSON import body into per-row results", () => {
    const rows = parseTypesenseImportResults(`${okLine}\n${failLine}`)
    expect(rows).toHaveLength(2)
    expect(rows[0]?.success).toBe(true)
    expect(rows[1]).toMatchObject({
      success: false,
      error: "Field `categorySlugs` must be an array",
      document: '{"id":"prod_abc"}',
    })
  })

  it("parses an already-parsed SDK results array", () => {
    const rows = parseTypesenseImportResults([{ success: true }, { success: false, error: "boom" }])
    expect(rows.map((r) => r.success)).toEqual([true, false])
    expect(rows[1]?.error).toBe("boom")
  })

  it("treats non-inspectable responses (e.g. a `{}` double) as no failures", () => {
    expect(summarizeImportFailures("c", {})).toBeNull()
    expect(summarizeImportFailures("c", undefined)).toBeNull()
    expect(summarizeImportFailures("c", `${okLine}\n${okLine}`)).toBeNull()
  })

  it("summarizes failures with counts and capped representative samples", () => {
    const body = [failLine, failLine, failLine].join("\n")
    const summary = summarizeImportFailures("products__en-GB__customer__default", body, 2)
    expect(summary).toMatchObject({
      collection: "products__en-GB__customer__default",
      failed: 3,
      total: 3,
    })
    expect(summary?.samples).toHaveLength(2)
    expect(summary?.samples[0]).toContain("Field `categorySlugs` must be an array")
  })

  it("upsert throws TypesenseImportError when any row fails (default mode)", async () => {
    const indexer = createTypesenseIndexer({
      client: clientReturningImport(`${okLine}\n${failLine}`),
    })
    await expect(indexer.upsert(slice, [document])).rejects.toBeInstanceOf(TypesenseImportError)
  })

  it("best-effort mode reports failures via onImportFailure without throwing", async () => {
    const reported: ImportFailureSummary[] = []
    const indexer = createTypesenseIndexer({
      client: clientReturningImport(`${okLine}\n${failLine}`),
      importFailureMode: "best-effort",
      onImportFailure: (summary) => reported.push(summary),
    })
    await expect(indexer.upsert(slice, [document])).resolves.toBeUndefined()
    expect(reported).toHaveLength(1)
    expect(reported[0]?.failed).toBe(1)
  })

  it("does not throw when every row succeeds", async () => {
    const indexer = createTypesenseIndexer({
      client: clientReturningImport(`${okLine}\n${okLine}`),
    })
    await expect(indexer.upsert(slice, [document])).resolves.toBeUndefined()
  })

  it("bulkReindex throws on row failure so the reindex CLI exits non-zero", async () => {
    const indexer = createTypesenseIndexer({
      client: clientReturningImport(`${okLine}\n${failLine}`),
    })
    async function* stream(): AsyncIterable<IndexerDocument> {
      yield document
    }
    await expect(indexer.bulkReindex(slice, stream())).rejects.toBeInstanceOf(TypesenseImportError)
  })
})

interface DeterministicTypesenseCollection {
  schema: TypesenseCollectionSchema
  documents: Map<string, Record<string, unknown>>
}

interface DeterministicTypesenseClientOptions {
  omitHybridSearchInfo?: boolean
}

function createDeterministicTypesenseClient(
  options: DeterministicTypesenseClientOptions = {},
): TypesenseClient {
  const collections = new Map<string, DeterministicTypesenseCollection>()
  const requireCollection = (name: string | undefined): DeterministicTypesenseCollection => {
    const collection = name ? collections.get(name) : undefined
    if (!collection)
      throw Object.assign(new Error(`Missing collection ${name}`), { httpStatus: 404 })
    return collection
  }

  return {
    collections(name) {
      return {
        async list() {
          return [...collections.values()].map(({ schema }) => schema)
        },
        async create(schema) {
          if (collections.has(schema.name)) throw new Error(`Collection ${schema.name} exists`)
          collections.set(schema.name, { schema, documents: new Map() })
        },
        async update(schema) {
          const collection = requireCollection(name)
          collection.schema = { ...collection.schema, ...schema }
        },
        async delete() {
          if (!name || !collections.delete(name)) {
            throw Object.assign(new Error(`Missing collection ${name}`), { httpStatus: 404 })
          }
        },
        async retrieve() {
          return requireCollection(name).schema
        },
        documents() {
          return {
            async import(documents) {
              const collection = requireCollection(name)
              const results: Array<{ success: boolean; error?: string }> = []
              for (const document of documents as Record<string, unknown>[]) {
                const error = validateDeterministicTypesenseDocument(collection.schema, document)
                if (error) {
                  results.push({ success: false, error })
                  continue
                }
                collection.documents.set(String(document.id), { ...document })
                results.push({ success: true })
              }
              return results
            },
            async delete(query) {
              const target = requireCollection(name).documents
              const ids = query.filter_by.match(/^id:\[(.*)]$/)?.[1]?.split(",") ?? []
              let numDeleted = 0
              for (const id of ids) {
                if (target.delete(id)) numDeleted += 1
              }
              return { num_deleted: numDeleted }
            },
            async search(query) {
              return searchDeterministicTypesense(requireCollection(name).documents, query, options)
            },
          }
        },
      }
    },
  }
}

function searchDeterministicTypesense(
  source: Map<string, Record<string, unknown>>,
  query: TypesenseSearchQuery,
  options: DeterministicTypesenseClientOptions,
): TypesenseSearchResponse {
  let documents = [...source.values()]
  if (query.filter_by) {
    documents = documents.filter((document) => matchesTypesenseFilter(document, query.filter_by!))
  }
  const scores = new Map<string, number>()
  const vectorDistances = new Map<string, number>()
  const keyword = query.q.toLocaleLowerCase()
  const queryFields = query.query_by.split(",")
  const vectorQuery = query.vector_query ? parseDeterministicVectorQuery(query.vector_query) : null
  if (vectorQuery) {
    const keywordMatches =
      query.q === "*"
        ? []
        : documents.filter((document) => matchesTypesenseKeyword(document, keyword, queryFields))
    const vectorMatches = documents
      .flatMap((document) => {
        const embedding = document[vectorQuery.field]
        if (!isNumberArray(embedding)) return []
        const distance = cosineDistance(vectorQuery.embedding, embedding)
        if (
          vectorQuery.distanceThreshold !== undefined &&
          distance > vectorQuery.distanceThreshold
        ) {
          return []
        }
        vectorDistances.set(String(document.id), distance)
        return [document]
      })
      .sort(
        (left, right) =>
          vectorDistances.get(String(left.id))! - vectorDistances.get(String(right.id))!,
      )
      .slice(0, vectorQuery.k)

    if (query.q === "*") {
      documents = vectorMatches
      for (const document of documents) {
        scores.set(String(document.id), 1 - vectorDistances.get(String(document.id))! / 2)
      }
    } else {
      const keywordRanks = reciprocalRanks(keywordMatches)
      const vectorRanks = reciprocalRanks(vectorMatches)
      const candidates = new Map<string, Record<string, unknown>>()
      for (const document of [...keywordMatches, ...vectorMatches]) {
        candidates.set(String(document.id), document)
      }
      for (const id of candidates.keys()) {
        scores.set(
          id,
          (1 - vectorQuery.alpha) * (keywordRanks.get(id) ?? 0) +
            vectorQuery.alpha * (vectorRanks.get(id) ?? 0),
        )
      }
      documents = [...candidates.values()].sort(
        (left, right) => (scores.get(String(right.id)) ?? 0) - (scores.get(String(left.id)) ?? 0),
      )
    }
  } else if (query.q !== "*") {
    documents = documents.filter((document) =>
      matchesTypesenseKeyword(document, keyword, queryFields),
    )
  }
  if (query.sort_by) {
    const [field, direction] = query.sort_by.split(":")
    const multiplier = direction === "desc" ? -1 : 1
    documents.sort(
      (left, right) => multiplier * (Number(left[field ?? ""]) - Number(right[field ?? ""])),
    )
  }

  const found = documents.length
  const page = query.page ?? 1
  const perPage = query.per_page ?? 10
  const pageDocuments = documents.slice((page - 1) * perPage, page * perPage)
  const excluded = new Set(query.exclude_fields?.split(",") ?? [])
  const facetCounts = query.facet_by
    ? query.facet_by.split(",").map((field) => ({
        field_name: field,
        counts: countFacetValues(documents, field).slice(0, query.max_facet_values),
      }))
    : undefined

  return {
    hits: pageDocuments.map((document) => {
      const id = String(document.id)
      const isKeywordMatch =
        query.q !== "*" && matchesTypesenseKeyword(document, keyword, queryFields)
      return {
        document: Object.fromEntries(
          Object.entries(document).filter(([field]) => !excluded.has(field)),
        ),
        text_match: isKeywordMatch ? 100 : 0,
        ...(vectorDistances.has(id) ? { vector_distance: vectorDistances.get(id) } : {}),
        ...(vectorQuery && query.q !== "*" && !options.omitHybridSearchInfo
          ? { hybrid_search_info: { rank_fusion_score: scores.get(id) ?? 0 } }
          : {}),
      }
    }),
    found,
    facet_counts: facetCounts,
  }
}

function reciprocalRanks(documents: Record<string, unknown>[]): Map<string, number> {
  return new Map(documents.map((document, index) => [String(document.id), 1 / (index + 1)]))
}

interface DeterministicVectorQuery {
  field: string
  embedding: number[]
  alpha: number
  distanceThreshold?: number
  k: number
}

function parseDeterministicVectorQuery(value: string): DeterministicVectorQuery {
  const parsed = value.match(/^([^:]+):\(\[([^\]]*)\],\s*(.*)\)$/)
  if (!parsed) throw new Error(`Unsupported deterministic vector query: ${value}`)
  const options = new Map(
    (parsed[3] ?? "").split(",").map((option) => {
      const [name, rawValue] = option.trim().split(":")
      return [name, Number(rawValue)]
    }),
  )
  const distanceThreshold = options.get("distance_threshold")
  return {
    field: parsed[1]!,
    embedding: (parsed[2] ?? "").split(",").map(Number),
    alpha: options.get("alpha") ?? 0.3,
    ...(distanceThreshold === undefined ? {} : { distanceThreshold }),
    k: options.get("k") ?? 100,
  }
}

function matchesTypesenseKeyword(
  document: Record<string, unknown>,
  keyword: string,
  queryFields: string[],
): boolean {
  return queryFields.some((field) =>
    valuesOf(document[field]).some(
      (value) => typeof value === "string" && value.toLocaleLowerCase().includes(keyword),
    ),
  )
}

function cosineDistance(left: number[], right: number[]): number {
  const dot = left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0)
  const leftMagnitude = Math.sqrt(left.reduce((sum, value) => sum + value * value, 0))
  const rightMagnitude = Math.sqrt(right.reduce((sum, value) => sum + value * value, 0))
  if (leftMagnitude === 0 || rightMagnitude === 0) return 2
  return 1 - dot / (leftMagnitude * rightMagnitude)
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number")
}

function validateDeterministicTypesenseDocument(
  schema: TypesenseCollectionSchema,
  document: Record<string, unknown>,
): string | undefined {
  const fields = new Map(schema.fields.map((field) => [field.name, field]))
  for (const [name, value] of Object.entries(document)) {
    if (name === "id") continue
    const field = fields.get(name)
    if (!field) return `Field "${name}" is not declared in collection "${schema.name}"`
    if (!matchesDeterministicTypesenseType(value, field.type)) {
      return `Field "${name}" does not match declared type "${field.type}"`
    }
  }
  return undefined
}

function matchesDeterministicTypesenseType(
  value: unknown,
  type: TypesenseCollectionSchema["fields"][number]["type"],
): boolean {
  if (value === undefined) return true
  if (type === "string") return typeof value === "string"
  if (type === "string[]") {
    return Array.isArray(value) && value.every((item) => typeof item === "string")
  }
  if (type === "int32" || type === "int64" || type === "float") {
    return typeof value === "number" && Number.isFinite(value)
  }
  if (type === "bool") return typeof value === "boolean"
  if (type === "float[]") {
    return Array.isArray(value) && value.every((item) => typeof item === "number")
  }
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function matchesTypesenseFilter(document: Record<string, unknown>, expression: string): boolean {
  const filter = stripOuterParentheses(expression.trim())
  const orClauses = splitTopLevel(filter, " || ")
  if (orClauses.length > 1) {
    return orClauses.some((clause) => matchesTypesenseFilter(document, clause))
  }
  const andClauses = splitTopLevel(filter, " && ")
  if (andClauses.length > 1) {
    return andClauses.every((clause) => matchesTypesenseFilter(document, clause))
  }

  const list = filter.match(/^([^:]+):\[(.*)]$/)
  if (list) {
    const accepted = splitTopLevel(list[2] ?? "", ",").map(parseTypesenseScalar)
    return valuesOf(document[list[1] ?? ""]).some((value) => accepted.includes(value))
  }
  const comparison = filter.match(/^([^:]+):(=|>=|<=)(.*)$/)
  if (!comparison) throw new Error(`Unsupported deterministic filter: ${filter}`)
  const values = valuesOf(document[comparison[1] ?? ""])
  const expected = parseTypesenseScalar(comparison[3] ?? "")
  if (comparison[2] === "=") return values.includes(expected)
  if (comparison[2] === ">=") return values.some((value) => Number(value) >= Number(expected))
  return values.some((value) => Number(value) <= Number(expected))
}

function countFacetValues(documents: Record<string, unknown>[], field: string) {
  const counts = new Map<string | number, number>()
  for (const document of documents) {
    for (const value of valuesOf(document[field])) {
      if (typeof value !== "string" && typeof value !== "number") continue
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort(
      (left, right) =>
        right.count - left.count || String(left.value).localeCompare(String(right.value)),
    )
}

function valuesOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value]
}

function parseTypesenseScalar(value: string): unknown {
  const trimmed = value.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
}

function stripOuterParentheses(value: string): string {
  return value.startsWith("(") && value.endsWith(")") ? value.slice(1, -1) : value
}

function splitTopLevel(value: string, separator: string): string[] {
  const parts: string[] = []
  let start = 0
  let depth = 0
  let quoted = false
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character === '"' && value[index - 1] !== "\\") quoted = !quoted
    if (quoted) continue
    if (character === "(" || character === "[") depth += 1
    if (character === ")" || character === "]") depth -= 1
    if (depth === 0 && value.startsWith(separator, index)) {
      parts.push(value.slice(start, index))
      start = index + separator.length
      index += separator.length - 1
    }
  }
  parts.push(value.slice(start))
  return parts
}
