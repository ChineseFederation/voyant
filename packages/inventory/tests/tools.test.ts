import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"

import {
  ARCHIVE_PRODUCT_HANDLER_POLICY,
  COMPOSE_PRODUCT_HANDLER_POLICY,
  CREATE_PRODUCT_HANDLER_POLICY,
  type InventoryAuthoringToolServices,
  type InventoryConfigurationToolServices,
  type InventoryContentToolServices,
  type InventoryToolServices,
  inventoryTools,
  PUBLISH_PRODUCT_HANDLER_POLICY,
  UNPUBLISH_PRODUCT_HANDLER_POLICY,
} from "../src/tools.js"

function admitted(
  expected:
    | typeof CREATE_PRODUCT_HANDLER_POLICY
    | typeof COMPOSE_PRODUCT_HANDLER_POLICY
    | typeof PUBLISH_PRODUCT_HANDLER_POLICY,
): ToolContext["handlerActionPolicy"] {
  return {
    capabilityId: expected.capabilityId,
    capabilityVersion: expected.capabilityVersion,
    canonicalName: expected.canonicalName,
    actionPolicy: {
      ...expected.actionPolicy,
      enforcement: "handler",
      invocation: {
        controlField: "_voyant",
        requiredFields: [],
        optionalFields: [],
        fingerprintAlgorithm: "action-ledger-command-v1",
      },
    },
    invocation: {},
  } as ToolContext["handlerActionPolicy"]
}

function ctxWith(
  services?: Partial<
    InventoryToolServices &
      InventoryContentToolServices &
      InventoryAuthoringToolServices &
      InventoryConfigurationToolServices
  >,
  overrides: Partial<ToolContext> = {},
): ToolContext & {
  inventory?: InventoryToolServices
  inventoryContent?: InventoryContentToolServices
  inventoryAuthoring?: InventoryAuthoringToolServices
  inventoryConfiguration?: InventoryConfigurationToolServices
} {
  const actor = overrides.actor ?? "customer"
  const audience = overrides.audience ?? actor
  return {
    db: {},
    actor,
    audience,
    tenantId: "default",
    resolverScope: {
      locale: "en-GB",
      audience,
      market: "default",
      actor,
      ...overrides.resolverScope,
    },
    ...overrides,
    inventory: services as InventoryToolServices | undefined,
    inventoryContent: services as InventoryContentToolServices | undefined,
    inventoryAuthoring: services as InventoryAuthoringToolServices | undefined,
    inventoryConfiguration: services as InventoryConfigurationToolServices | undefined,
  }
}

const UPDATE_PRODUCT_DAY_ACTION_POLICY = {
  id: "@voyant-travel/inventory#action.update-product-day",
  capabilityId: "@voyant-travel/inventory#action.update-product-day",
  version: "v1",
  kind: "execute" as const,
  targetType: "product",
  commandTargetField: "id",
  risk: "medium" as const,
  ledger: "required" as const,
  approval: "never" as const,
  reversible: true,
  allowedActorTypes: ["staff" as const],
}

function makeRegistry() {
  const registry = createToolRegistry()
  for (const tool of inventoryTools) {
    if (tool.name === "create_product") {
      registry.register(tool, { actionPolicy: CREATE_PRODUCT_HANDLER_POLICY.actionPolicy })
    } else if (tool.name === "compose_product") {
      registry.register(tool, { actionPolicy: COMPOSE_PRODUCT_HANDLER_POLICY.actionPolicy })
    } else if (tool.name === "update_product_day") {
      registry.register(tool, { actionPolicy: UPDATE_PRODUCT_DAY_ACTION_POLICY })
    } else if (tool.name === "publish_product") {
      registry.register(tool, { actionPolicy: PUBLISH_PRODUCT_HANDLER_POLICY.actionPolicy })
    } else if (tool.name === "unpublish_product") {
      registry.register(tool, { actionPolicy: UNPUBLISH_PRODUCT_HANDLER_POLICY.actionPolicy })
    } else if (tool.name === "archive_product") {
      registry.register(tool, { actionPolicy: ARCHIVE_PRODUCT_HANDLER_POLICY.actionPolicy })
    } else {
      registry.register(tool)
    }
  }
  return registry
}

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: "prod_1",
    name: "Cairo discovery",
    status: "draft",
    bookingMode: "date",
    capacityMode: "limited",
    visibility: "private",
    activated: false,
    sellCurrency: "EUR",
    sellAmountCents: 10000,
    startDate: "2026-09-01",
    endDate: "2026-09-07",
    pax: 2,
    productTypeId: null,
    createdAt: new Date("2026-07-15T10:00:00.000Z"),
    updatedAt: new Date("2026-07-15T10:00:00.000Z"),
    ...overrides,
  }
}

describe("inventory tools", () => {
  it("registers product reads, authoring, and lifecycle tools with exact posture", () => {
    const manifest = makeRegistry().list()
    expect(manifest.map((t) => t.name).sort()).toEqual([
      "archive_product",
      "compose_product",
      "create_product",
      "get_product",
      "get_product_content",
      "list_product_days",
      "list_products",
      "publish_product",
      "set_product_open_graph_image",
      "unpublish_product",
      "update_product",
      "update_product_day",
    ])
    for (const tool of manifest.filter(({ tier }) => tier === "read")) {
      expect(tool.requiredScopes).toEqual(["products:read"])
    }
    for (const tool of manifest.filter(({ tier }) => tier === "write")) {
      expect(tool.requiredScopes).toEqual(["products:write"])
      expect(tool.audience.allowed).toEqual(["staff"])
    }
    expect(manifest.find(({ name }) => name === "publish_product")?.riskPolicy).toMatchObject({
      confirmationRequired: true,
      reversible: true,
    })
  })

  it("sets or clears the explicit product Open Graph image", async () => {
    const calls: Array<{ productId: string; mediaId: string | null }> = []
    const context = ctxWith(
      {
        async setProductOpenGraphImage(productId, mediaId) {
          calls.push({ productId, mediaId })
          return mediaId ? { id: mediaId, productId, isOpenGraph: true } : null
        },
      },
      { actor: "staff", audience: "staff" },
    )

    await expect(
      makeRegistry().dispatch(
        "set_product_open_graph_image",
        { productId: "prod_1", mediaId: "pmed_1" },
        context,
      ),
    ).resolves.toMatchObject({ id: "pmed_1", productId: "prod_1", isOpenGraph: true })
    await expect(
      makeRegistry().dispatch(
        "set_product_open_graph_image",
        { productId: "prod_1", mediaId: null },
        context,
      ),
    ).resolves.toBeNull()
    expect(calls).toEqual([
      { productId: "prod_1", mediaId: "pmed_1" },
      { productId: "prod_1", mediaId: null },
    ])
  })

  // voyant#3921: the preview/apply unit-configuration TOOLS were removed, so the
  // Tool-dispatch test for them is gone with them. The SERVICES they wrapped are
  // untouched and still covered by
  // tests/integration/product-configuration.test.ts, which exercises the same
  // plan-unchanged-from-preview-to-apply property directly against them.

  it("composes an atomic product graph through the authoring service", async () => {
    const result = await makeRegistry().dispatch(
      "compose_product",
      {
        spec: {
          product: { name: "Cairo discovery", sellCurrency: "EUR" },
          options: [{ ref: "standard", name: "Standard" }],
        },
        idempotencyKey: "compose-cairo-v1",
      },
      ctxWith(
        {
          async composeProduct(input) {
            expect(input.idempotencyKey).toBe("compose-cairo-v1")
            return {
              status: "created",
              productId: "prod_1",
              reused: false,
              slug: "cairo-discovery",
            }
          },
        },
        {
          actor: "staff",
          audience: "staff",
          handlerActionPolicy: admitted(COMPOSE_PRODUCT_HANDLER_POLICY),
        },
      ),
    )
    expect(result).toMatchObject({
      status: "created",
      productId: "prod_1",
      reused: false,
      slug: "cairo-discovery",
    })
  })

  it("lists and updates product itinerary days", async () => {
    const day = {
      id: "pday_1",
      itineraryId: "itin_1",
      dayNumber: 2,
      title: "Alfama + viewpoints",
      description: "Explore Alfama.",
      location: "Lisbon",
      createdAt: new Date("2026-07-15T10:00:00.000Z"),
      updatedAt: new Date("2026-07-15T10:00:00.000Z"),
    }
    let updated: unknown
    const listed = await makeRegistry().dispatch<{ data: unknown[] }>(
      "list_product_days",
      { id: "prod_1" },
      ctxWith(
        {
          async listProductDays(productId) {
            expect(productId).toBe("prod_1")
            return [day]
          },
        },
        { actor: "staff", audience: "staff" },
      ),
    )
    expect(listed.data).toEqual([
      {
        ...day,
        createdAt: "2026-07-15T10:00:00.000Z",
        updatedAt: "2026-07-15T10:00:00.000Z",
      },
    ])

    const result = await makeRegistry().dispatch(
      "update_product_day",
      {
        id: "prod_1",
        dayNumber: 2,
        description: "Morning at Miradouro da Senhora do Monte, then explore Alfama.",
      },
      ctxWith(
        {
          async updateProductDay(input) {
            updated = input
            return {
              ...day,
              description: "Morning at Miradouro da Senhora do Monte, then explore Alfama.",
            }
          },
        },
        { actor: "staff", audience: "staff" },
      ),
    )
    expect(updated).toMatchObject({
      id: "prod_1",
      dayNumber: 2,
      description: "Morning at Miradouro da Senhora do Monte, then explore Alfama.",
    })
    expect(result).toMatchObject({
      id: "pday_1",
      dayNumber: 2,
      description: "Morning at Miradouro da Senhora do Monte, then explore Alfama.",
    })

    let dayIdOnly: unknown
    await makeRegistry().dispatch(
      "update_product_day",
      {
        dayId: "pday_1",
        title: "Alfama viewpoints + stress-test",
      },
      ctxWith(
        {
          async resolveProductIdForDay(dayId) {
            expect(dayId).toBe("pday_1")
            return "prod_1"
          },
          async updateProductDay(input) {
            dayIdOnly = input
            return { ...day, title: "Alfama viewpoints + stress-test" }
          },
        },
        { actor: "staff", audience: "staff" },
      ),
    )
    expect(dayIdOnly).toMatchObject({
      dayId: "pday_1",
      title: "Alfama viewpoints + stress-test",
    })
    expect(dayIdOnly).not.toHaveProperty("id")
  })

  it("lists products through the injected service", async () => {
    const registry = makeRegistry()
    const result = await registry.dispatch<{ data: unknown[]; total: number }>(
      "list_products",
      { limit: 10 },
      ctxWith({
        async listProducts() {
          return {
            data: [product(), product({ id: "prod_2" })],
            total: 2,
            limit: 10,
            offset: 0,
          }
        },
        async getProductById() {
          return null
        },
      }),
    )
    expect(result.data).toHaveLength(2)
    expect(result.total).toBe(2)
  })

  it("forces public active filters for non-staff product lists", async () => {
    const registry = makeRegistry()
    let forwarded: unknown
    await registry.dispatch(
      "list_products",
      { status: "draft", visibility: "hidden", activated: "false", limit: 10 },
      ctxWith({
        async listProducts(query) {
          forwarded = query
          return { data: [], total: 0, limit: query.limit, offset: query.offset }
        },
        async getProductById() {
          return null
        },
      }),
    )
    expect(forwarded).toMatchObject({ status: "active", visibility: "public", activated: true })
  })

  it("allows staff product lists to keep explicit filters", async () => {
    const registry = makeRegistry()
    let forwarded: unknown
    await registry.dispatch(
      "list_products",
      { status: "draft", visibility: "hidden", activated: "false", limit: 10 },
      ctxWith(
        {
          async listProducts(query) {
            forwarded = query
            return { data: [], total: 0, limit: query.limit, offset: query.offset }
          },
          async getProductById() {
            return null
          },
        },
        {
          actor: "staff",
          audience: "staff",
          handlerActionPolicy: admitted(CREATE_PRODUCT_HANDLER_POLICY),
        },
      ),
    )
    expect(forwarded).toMatchObject({ status: "draft", visibility: "hidden", activated: false })
  })

  it("reads a single product and normalizes not-found to null", async () => {
    const registry = makeRegistry()
    const result = await registry.dispatch<{ product: unknown }>(
      "get_product",
      { id: "missing" },
      ctxWith({
        async listProducts() {
          return { data: [], total: 0, limit: 24, offset: 0 }
        },
        async getProductById() {
          return null
        },
      }),
    )
    expect(result.product).toBeNull()
  })

  it("resolves a product by its human-readable slug alongside the id", async () => {
    const registry = makeRegistry()
    let resolvedSlug: string | undefined
    const result = await registry.dispatch<{ product: { id: string; name: string } | null }>(
      "get_product",
      { slug: "cairo-discovery" },
      ctxWith({
        async getProductById() {
          throw new Error("getProductById must not be called when a slug is supplied")
        },
        async getProductBySlug(slug) {
          resolvedSlug = slug
          return product({ status: "active", visibility: "public", activated: true, slug })
        },
      }),
    )
    expect(resolvedSlug).toBe("cairo-discovery")
    expect(result.product).toMatchObject({ id: "prod_1", name: "Cairo discovery" })
  })

  it("rejects get_product when neither id nor slug is supplied", async () => {
    await expect(makeRegistry().dispatch("get_product", {}, ctxWith({}))).rejects.toMatchObject({
      code: "INVALID_INPUT",
    })
  })

  it("hides non-public products by id for non-staff actors", async () => {
    const registry = makeRegistry()
    const result = await registry.dispatch<{ product: unknown }>(
      "get_product",
      { id: "prod_draft" },
      ctxWith({
        async listProducts() {
          return { data: [], total: 0, limit: 24, offset: 0 }
        },
        async getProductById() {
          return { id: "prod_draft", status: "draft", visibility: "private", activated: false }
        },
      }),
    )
    expect(result.product).toBeNull()
  })

  it("throws MISSING_SERVICE when inventory is not wired", async () => {
    const registry = makeRegistry()
    await expect(
      registry.dispatch("list_products", { limit: 10 }, ctxWith(undefined)),
    ).rejects.toMatchObject({ code: "MISSING_SERVICE" })
  })

  it("creates a private draft before any publication operation", async () => {
    let forwarded: unknown
    const result = await makeRegistry().dispatch<{ productId: string }>(
      "create_product",
      { name: "Cairo discovery", sellCurrency: "EUR", idempotencyKey: "product-create-1" },
      ctxWith(
        {
          async createProduct(input) {
            forwarded = input
            return { productId: "prod_1" }
          },
        },
        {
          actor: "staff",
          audience: "staff",
          handlerActionPolicy: admitted(CREATE_PRODUCT_HANDLER_POLICY),
        },
      ),
    )
    expect(forwarded).toMatchObject({ idempotencyKey: "product-create-1" })
    expect(result).toEqual({ productId: "prod_1" })
  })

  it("publishes only through the readiness-enforcing update service", async () => {
    let forwarded: unknown
    await makeRegistry().dispatch(
      "publish_product",
      { id: "prod_1" },
      ctxWith(
        {
          async updateProductLifecycle(_id, input) {
            forwarded = input
            return product(input)
          },
        },
        {
          actor: "staff",
          audience: "staff",
          handlerActionPolicy: admitted(PUBLISH_PRODUCT_HANDLER_POLICY),
        },
      ),
    )
    expect(forwarded).toEqual({ status: "active" })
  })

  it("defaults composed content resolution to the grant locale and market", async () => {
    let forwarded: unknown
    const content = await makeRegistry().dispatch(
      "get_product_content",
      { id: "prod_1" },
      ctxWith(
        {
          async getProductContent(input) {
            forwarded = input
            return null
          },
        },
        { resolverScope: { locale: "ro-RO", market: "RO" } as never },
      ),
    )
    expect(forwarded).toMatchObject({ preferredLocales: ["ro-RO"], market: "RO" })
    expect(content).toBeNull()
  })

  /**
   * The readiness evaluator already produces a `fix` per issue, written as an
   * instruction. None of it used to reach the caller: `ProductPublishReadinessError`
   * is a plain Error, so the registry's unknown-throw wrapper turned it into
   * `[PROVIDER_ERROR] ... Product is not ready to publish` — terminal, blameless,
   * and stripped of every issue. Measured consequence: nothing the capability
   * harness created ever reached `active`.
   */
  it("surfaces publish readiness issues as actionable next steps", async () => {
    const readinessError = Object.assign(new Error("Product is not ready to publish"), {
      code: "product_not_ready_to_publish",
      issues: [
        {
          code: "no_future_open_departure",
          severity: "blocking",
          field: "availabilitySlots",
          message: "The product has no future departure that is open for sale.",
          fix: "Create a future availability slot with status 'open', then publish the product again.",
        },
      ],
    })

    const error = await makeRegistry()
      .dispatch(
        "publish_product",
        { id: "prod_1" },
        ctxWith(
          {
            async updateProductLifecycle() {
              throw readinessError
            },
          } as never,
          {
            actor: "staff",
            audience: "staff",
            handlerActionPolicy: admitted(PUBLISH_PRODUCT_HANDLER_POLICY),
          },
        ),
      )
      .catch((thrown: unknown) => thrown as { code?: string; nextSteps?: string[] })

    // INVALID_INPUT, not PROVIDER_ERROR: the caller can fix this, and telling it
    // otherwise is telling it to give up.
    expect(error.code).toBe("INVALID_INPUT")
    expect(error.nextSteps).toEqual([
      "1. Create a future availability slot with status 'open', then publish the product again.",
    ])
  })

  it("refuses a missing lifecycle target instead of reporting null success", async () => {
    const error = await makeRegistry()
      .dispatch(
        "publish_product",
        { id: "8014752" },
        ctxWith(
          {
            async updateProductLifecycle() {
              return null
            },
          } as never,
          {
            actor: "staff",
            audience: "staff",
            handlerActionPolicy: admitted(PUBLISH_PRODUCT_HANDLER_POLICY),
          },
        ),
      )
      .catch((thrown: unknown) => thrown as { code?: string; message?: string })

    expect(error.code).toBe("NOT_FOUND")
    expect(error.message).toContain("inventory_query")
    expect(error.message).toContain("8014752")
  })

  it("leaves a non-readiness failure from the same handler untouched", async () => {
    // The converter must not swallow unrelated throws — that would replace a real
    // failure with a confident, wrong remediation.
    const other = new Error("connection reset")
    await expect(
      makeRegistry().dispatch(
        "publish_product",
        { id: "prod_1" },
        ctxWith(
          {
            async updateProductLifecycle() {
              throw other
            },
          } as never,
          {
            actor: "staff",
            audience: "staff",
            handlerActionPolicy: admitted(PUBLISH_PRODUCT_HANDLER_POLICY),
          },
        ),
      ),
    ).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: 'Tool "publish_product" failed: connection reset',
    })
  })
})
