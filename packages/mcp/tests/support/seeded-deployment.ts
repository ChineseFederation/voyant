/**
 * The seeded MCP deployment both eval lanes drive (voyant#3936).
 *
 * Extracted from `agent-journey-eval.test.ts` when the live-client lane landed:
 * a scripted transcript and a real LLM are only comparable if they are pointed at
 * the SAME server, and duplicating the fixture would let the two drift into
 * measuring different surfaces without anyone noticing.
 *
 * Read tools carry the REAL underlying names the surface serves (`list_products`,
 * `get_product`, `get_product_content`, `list_bookings` — each verified against
 * its owning package's `defineTool`) backed by a small in-memory fixture, so a
 * journey needs no database. Discovery of those same names on the REAL selected
 * graph is grounded separately in the operator application test.
 */
import {
  createToolRegistry,
  defineTool,
  READ_ONLY_RISK,
  type ToolContext,
  ToolError,
} from "@voyant-travel/tools"
import { Hono } from "hono"
import { z } from "zod"

import { createMcpApiRoutes } from "../../src/index.js"

// --- Seeded fixture: a tiny catalog and booking set the read tools serve. ------

export const SEED_PRODUCTS = [
  {
    id: "prod_seed_1",
    slug: "kyoto-cherry-blossom",
    name: "Kyoto Cherry Blossom Tour",
    status: "active",
    bookingMode: "date",
  },
  {
    id: "prod_seed_2",
    slug: "andes-high-trek",
    name: "Andes High Trek",
    status: "active",
    bookingMode: "itinerary",
  },
  {
    id: "prod_seed_3",
    slug: "nile-luxury-cruise",
    name: "Nile Luxury Cruise",
    status: "draft",
    bookingMode: "date_time",
  },
] as const

export const SEED_CONTENT: Record<string, { id: string; name: string; itinerary: string[] }> = {
  prod_seed_1: {
    id: "prod_seed_1",
    name: "Kyoto Cherry Blossom Tour",
    itinerary: ["Arrive Kyoto", "Philosopher's Path", "Arashiyama bamboo grove"],
  },
}

export const SEED_BOOKINGS = [
  { id: "bk_1", status: "confirmed", productId: "prod_seed_1" },
  { id: "bk_2", status: "held", productId: "prod_seed_2" },
  { id: "bk_3", status: "confirmed", productId: "prod_seed_1" },
] as const

const productSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: z.string(),
  bookingMode: z.string(),
})

const OWNER = "@voyant-travel/inventory"
const BOOKINGS_OWNER = "@voyant-travel/bookings"

// Read tools mirror the real surface's names, scopes, and read-only risk. The
// handlers read the seeded fixture instead of a provider so the journey is
// deterministic and needs no database.
const listProductsTool = defineTool({
  capabilityId: `${OWNER}#tool.list-products`,
  owner: OWNER,
  capabilityVersion: "v1",
  name: "list_products",
  description:
    "List products with optional filters (status, search) and pagination. Returns " +
    "{ data, total, limit, offset }. Read-only.",
  // `search` mirrors the real tool, which filters by (status, booking mode,
  // category, tag, SEARCH, date range, price/pax bounds). The fixture carried
  // only `status` and was therefore unfaithful on the one axis the live-client
  // eval exercises hardest — finding a record by name. A journey that is
  // impossible here but routine in production makes the harness measure the
  // fixture rather than the surface.
  inputSchema: z.object({
    status: z.string().optional(),
    search: z
      .string()
      .optional()
      .describe("Case-insensitive substring match against the product name."),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
  }),
  outputSchema: z.object({
    data: z.array(productSchema),
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
  }),
  requiredScopes: ["products:read"],
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  annotations: { idempotentHint: true },
  async handler({ status, search, limit = 25, offset = 0 }) {
    const needle = search?.toLowerCase().trim()
    const filtered = SEED_PRODUCTS.filter(
      (p) =>
        (status ? p.status === status : true) &&
        (needle ? p.name.toLowerCase().includes(needle) : true),
    )
    return {
      data: filtered.slice(offset, offset + limit).map((p) => ({ ...p })),
      total: filtered.length,
      limit,
      offset,
    }
  },
})

const getProductTool = defineTool({
  capabilityId: `${OWNER}#tool.get-product`,
  owner: OWNER,
  capabilityVersion: "v1",
  name: "get_product",
  description: "Read a single product by id or by its catalog slug. Returns null when not found.",
  inputSchema: z.object({ id: z.string().min(1).optional(), slug: z.string().min(1).optional() }),
  outputSchema: z.object({ product: productSchema.nullable() }),
  requiredScopes: ["products:read"],
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  async handler({ id, slug }) {
    if (!id && !slug) throw new ToolError("Provide either id or slug.", "INVALID_INPUT")
    const product = SEED_PRODUCTS.find((p) => (id ? p.id === id : p.slug === slug)) ?? null
    return { product: product ? { ...product } : null }
  },
})

const getProductContentTool = defineTool({
  capabilityId: `${OWNER}#content-extension.tool.get-product-content`,
  owner: OWNER,
  capabilityVersion: "v1",
  name: "get_product_content",
  description: "Resolve composed product content (options, itinerary, media, policies). Read-only.",
  inputSchema: z.object({ id: z.string().min(1) }),
  outputSchema: z
    .object({ id: z.string(), name: z.string(), itinerary: z.array(z.string()) })
    .nullable(),
  requiredScopes: ["products:read"],
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  async handler({ id }) {
    return SEED_CONTENT[id] ?? null
  },
})

const listBookingsTool = defineTool({
  capabilityId: `${BOOKINGS_OWNER}#tool.list-bookings`,
  owner: BOOKINGS_OWNER,
  capabilityVersion: "v1",
  name: "list_bookings",
  description: "List bookings with an optional status filter. Returns { data, total }. Read-only.",
  inputSchema: z.object({ status: z.string().optional() }),
  outputSchema: z.object({
    data: z.array(z.object({ id: z.string(), status: z.string(), productId: z.string() })),
    total: z.number(),
  }),
  requiredScopes: ["bookings:read"],
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  annotations: { idempotentHint: true },
  async handler({ status }) {
    const filtered = SEED_BOOKINGS.filter((b) => (status ? b.status === status : true))
    return { data: filtered.map((b) => ({ ...b })), total: filtered.length }
  },
})

const accessCatalog = {
  resources: [
    {
      id: "products",
      unitId: OWNER,
      resource: "products",
      label: "Products",
      description: "Catalog products",
      wildcard: "allow" as const,
      actions: [{ action: "read", label: "Read", description: "Read products" }],
    },
    {
      id: "bookings",
      unitId: BOOKINGS_OWNER,
      resource: "bookings",
      label: "Bookings",
      description: "Bookings",
      wildcard: "allow" as const,
      actions: [{ action: "read", label: "Read", description: "Read bookings" }],
    },
  ],
  presets: [],
}

function buildContext(): ToolContext {
  return {
    db: {},
    actor: "staff",
    audience: "staff",
    tenantId: "t1",
    resolverScope: { locale: "en-GB", audience: "staff", market: "default", actor: "staff" },
  }
}

/** Mount the seeded MCP surface behind a read-scoped staff key. */
export function seededMcpApp(): Hono {
  const registry = createToolRegistry()
  registry.register(listProductsTool)
  registry.register(getProductTool)
  registry.register(getProductContentTool)
  registry.register(listBookingsTool)
  const mcp = createMcpApiRoutes({ accessCatalog, registry, buildContext })
  const outer = new Hono()
  outer.use("*", async (c, next) => {
    c.set("scopes", ["products:read", "bookings:read"])
    await next()
  })
  outer.route("/", mcp)
  return outer
}
