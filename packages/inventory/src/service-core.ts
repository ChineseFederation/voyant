import { RequestValidationError } from "@voyant-travel/hono"
import { availabilitySlots } from "@voyant-travel/operations"
import { and, asc, desc, eq, getTableColumns, gte, ilike, lte, or, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { z } from "zod"
import { resolveProductClassification } from "./classification.js"
import {
  productCategoryProducts,
  productItineraries,
  productOptions,
  products,
  productTypes,
} from "./schema.js"
import { deriveProductSupplyModel, resolveItineraryDurationDays } from "./service-catalog-plane.js"
import type {
  insertProductSchema,
  productListQuerySchema,
  updateProductSchema,
} from "./validation.js"

type ProductListQuery = z.infer<typeof productListQuerySchema>
type CreateProductInput = z.infer<typeof insertProductSchema>
type UpdateProductInput = z.infer<typeof updateProductSchema>

type ProductDateRangeShape = {
  startDate?: string | null
  endDate?: string | null
}

export interface ProductReadinessIssue {
  code: string
  field: string
  message: string
  fix: string
}

export class ProductPublishReadinessError extends Error {
  readonly code = "product_not_ready_to_publish"
  readonly status = 422
  readonly issues: ProductReadinessIssue[]

  constructor(issues: ProductReadinessIssue[]) {
    super("Product is not ready to publish")
    this.name = "ProductPublishReadinessError"
    this.issues = issues
  }
}

const DYNAMIC_BOOKING_MODES = new Set(["open", "stay"])

type PublishableProductState = {
  id?: string
  bookingMode: string
  status: string
}

function isScheduledBookingMode(bookingMode: string) {
  return !DYNAMIC_BOOKING_MODES.has(bookingMode)
}

function isActiveLifecycleState(product: PublishableProductState) {
  return product.status === "active"
}

function assertProductDateRange(product: ProductDateRangeShape) {
  if (product.startDate && product.endDate && product.startDate > product.endDate) {
    throw new RequestValidationError("endDate must be on or after startDate", {
      issues: [{ path: ["endDate"], message: "endDate must be on or after startDate" }],
    })
  }
}

async function hasFutureOpenDeparture(db: PostgresJsDatabase, productId: string) {
  const [row] = await db
    .select({ id: availabilitySlots.id })
    .from(availabilitySlots)
    .where(
      and(
        eq(availabilitySlots.productId, productId),
        eq(availabilitySlots.status, "open"),
        gte(availabilitySlots.startsAt, new Date()),
      ),
    )
    .limit(1)

  return !!row
}

async function assertReadyToPublish(db: PostgresJsDatabase, product: PublishableProductState) {
  if (!isActiveLifecycleState(product) || !isScheduledBookingMode(product.bookingMode)) return

  if (!product.id || !(await hasFutureOpenDeparture(db, product.id))) {
    throw new ProductPublishReadinessError([
      {
        code: "no_future_open_departure",
        field: "availabilitySlots",
        message:
          "Scheduled products need at least one future open departure before they can be published.",
        fix: "Create a future availability slot with status 'open', then publish the product again.",
      },
    ])
  }
}

async function getDefaultItinerary(
  db: PostgresJsDatabase,
  productId: string,
): Promise<{ id: string } | null> {
  const [itinerary] = await db
    .select({ id: productItineraries.id })
    .from(productItineraries)
    .where(and(eq(productItineraries.productId, productId), eq(productItineraries.isDefault, true)))
    .orderBy(asc(productItineraries.sortOrder), asc(productItineraries.createdAt))
    .limit(1)

  return itinerary ?? null
}

async function ensureDefaultItinerary(db: PostgresJsDatabase, productId: string) {
  const existing = await getDefaultItinerary(db, productId)
  if (existing) {
    return existing
  }

  const [row] = await db
    .insert(productItineraries)
    .values({
      productId,
      name: "Main itinerary",
      isDefault: true,
      sortOrder: 0,
    })
    .returning({ id: productItineraries.id })

  if (!row) {
    throw new Error(`Failed to create default itinerary for product ${productId}`)
  }

  return row
}

// Every product needs at least one bookable option for the operator pricing
// grid to have something to attach inventory and prices to. Seed a single
// "Standard" default option on creation so a brand-new product opens straight

async function ensureDefaultOption(db: PostgresJsDatabase, productId: string) {
  const [existing] = await db
    .select({ id: productOptions.id })
    .from(productOptions)
    .where(eq(productOptions.productId, productId))
    .limit(1)
  if (existing) {
    return existing
  }

  const [row] = await db
    .insert(productOptions)
    .values({
      productId,
      name: "Standard",
      code: "standard",
      status: "active",
      isDefault: true,
      sortOrder: 0,
    })
    .returning({ id: productOptions.id })

  if (!row) {
    throw new Error(`Failed to create default option for product ${productId}`)
  }

  return row
}

export const coreProductsService = {
  async listProducts(db: PostgresJsDatabase, query: ProductListQuery) {
    const conditions = []

    if (query.status) {
      conditions.push(eq(products.status, query.status))
    }

    if (query.bookingMode) {
      conditions.push(eq(products.bookingMode, query.bookingMode))
    }

    if (query.visibility) {
      conditions.push(eq(products.visibility, query.visibility))
    }

    if (query.activated !== undefined) {
      conditions.push(eq(products.activated, query.activated))
    }

    if (query.facilityId) {
      conditions.push(eq(products.facilityId, query.facilityId))
    }

    if (query.supplierId) {
      conditions.push(eq(products.supplierId, query.supplierId))
    }

    if (query.productTypeId) {
      conditions.push(eq(products.productTypeId, query.productTypeId))
    }

    if (query.familyCode) {
      // Facet on the resolved family stable code — join through product_types.
      // agent-quality: raw-sql reviewed -- owner: inventory; parameter-bound.
      conditions.push(
        sql`exists (select 1 from ${productTypes}
          where ${productTypes.id} = ${products.productTypeId}
          and ${productTypes.code} = ${query.familyCode})`,
      )
    }

    if (query.productSubtypeCode) {
      conditions.push(eq(products.productSubtypeCode, query.productSubtypeCode))
    }

    if (query.contractTemplateId) {
      conditions.push(eq(products.contractTemplateId, query.contractTemplateId))
    }

    if (query.categoryId) {
      conditions.push(
        // agent-quality: raw-sql reviewed -- owner: inventory; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
        sql`exists (select 1 from ${productCategoryProducts}
          where ${productCategoryProducts.productId} = ${products.id}
          and ${productCategoryProducts.categoryId} = ${query.categoryId})`,
      )
    }

    if (query.tag) {
      // Postgres jsonb `@>` containment: does the array include this string?
      // Mirrors the pattern used in @voyant-travel/charters and @voyant-travel/cruises.
      // agent-quality: raw-sql reviewed -- owner: inventory; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      conditions.push(sql`${products.tags} @> ${JSON.stringify([query.tag])}::jsonb`)
    }

    if (query.search) {
      const term = `%${query.search}%`
      conditions.push(or(ilike(products.name, term), ilike(products.description, term)))
    }

    if (query.dateFrom) {
      conditions.push(gte(products.startDate, query.dateFrom))
    }

    if (query.dateTo) {
      conditions.push(lte(products.startDate, query.dateTo))
    }

    if (query.departureFrom || query.departureTo) {
      // Match products with at least one upcoming open departure whose date
      // falls in the requested window. Mirrors the `nextDeparture` subquery.
      const fromBound = query.departureFrom
        ? sql`and ${availabilitySlots.startsAt}::date >= ${query.departureFrom}::date`
        : sql``
      const toBound = query.departureTo
        ? sql`and ${availabilitySlots.startsAt}::date <= ${query.departureTo}::date`
        : sql``
      conditions.push(
        // agent-quality: raw-sql reviewed -- owner: inventory; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
        sql`exists (select 1 from ${availabilitySlots}
          where ${availabilitySlots.productId} = ${products.id}
            and ${availabilitySlots.status} = 'open'
            and ${availabilitySlots.startsAt} >= now()
            ${fromBound} ${toBound})`,
      )
    }

    if (query.paxMin !== undefined) {
      conditions.push(gte(products.pax, query.paxMin))
    }

    if (query.paxMax !== undefined) {
      conditions.push(lte(products.pax, query.paxMax))
    }

    if (query.sellAmountMin !== undefined) {
      conditions.push(gte(products.sellAmountCents, query.sellAmountMin))
    }

    if (query.sellAmountMax !== undefined) {
      conditions.push(lte(products.sellAmountCents, query.sellAmountMax))
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const sortColumn = (() => {
      switch (query.sortBy) {
        case "name":
          return products.name
        case "status":
          return products.status
        case "sellAmount":
          return products.sellAmountCents
        case "pax":
          return products.pax
        case "startDate":
          return products.startDate
        case "endDate":
          return products.endDate
        default:
          return products.createdAt
      }
    })()
    const sortFn = query.sortDir === "asc" ? asc : desc

    const [rows, countResult] = await Promise.all([
      db
        .select({
          ...getTableColumns(products),
          // Readable product-type name for the list view; `productTypeId`
          // still rides on the row via the spread above.
          productTypeName: productTypes.name,
          // Family stable code, resolved from product_types.
          familyCode: productTypes.code,
          // Legacy itinerary-derived duration (default itinerary, else first)
          // — identical to detail and catalog projection semantics.
          itineraryDurationDays: sql<number | null>`(
            select max(pd.day_number)
            from product_days pd
            where pd.itinerary_id = (
              select pi.id
              from product_itineraries pi
              where pi.product_id = ${products.id}
              order by pi.is_default desc, pi.sort_order asc
              limit 1
            )
          )`,
          // Earliest upcoming open departure (null when none is scheduled).
          nextDeparture: sql<Date | null>`(
            select min(${availabilitySlots.startsAt})
            from ${availabilitySlots}
            where ${availabilitySlots.productId} = ${products.id}
              and ${availabilitySlots.status} = 'open'
              and ${availabilitySlots.startsAt} >= now()
          )`,
        })
        .from(products)
        .leftJoin(productTypes, eq(productTypes.id, products.productTypeId))
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(sortFn(sortColumn), desc(products.createdAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(products).where(where),
    ])

    return {
      // Attach the resolved classification (family / subtype / duration /
      // review) using the shared resolver — identical semantics to the
      // catalog-plane projection and the legacy Catalog search document.
      data: rows.map((row) => ({
        ...row,
        supplyModel: deriveProductSupplyModel(row.bookingMode),
        classification: resolveProductClassification({
          family: row.familyCode ? { code: row.familyCode, name: row.productTypeName ?? "" } : null,
          subtypeCode: row.productSubtypeCode,
          durationMinutes: row.durationMinutes,
          itineraryDurationDays: row.itineraryDurationDays,
        }),
      })),
      total: countResult[0]?.count ?? 0,
      limit: query.limit,
      offset: query.offset,
    }
  },

  async getProductById(db: PostgresJsDatabase, id: string) {
    const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1)
    return row ?? null
  },

  /**
   * Same as `getProductById` but eagerly hydrates the `productType`
   * relation so consumers (slot detail page, etc.) can render a
   * category-style badge without a second round-trip. `productType` is
   * `null` when the product has no type assigned.
   */
  async getProductByIdWithType(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .select({
        product: products,
        productType: {
          id: productTypes.id,
          name: productTypes.name,
          code: productTypes.code,
        },
      })
      .from(products)
      .leftJoin(productTypes, eq(productTypes.id, products.productTypeId))
      .where(eq(products.id, id))
      .limit(1)
    if (!row) return null
    const itineraryDurationDays = await resolveItineraryDurationDays(db, id)
    const classification = resolveProductClassification({
      family: row.productType?.code
        ? { code: row.productType.code, name: row.productType.name }
        : null,
      subtypeCode: row.product.productSubtypeCode,
      durationMinutes: row.product.durationMinutes,
      itineraryDurationDays,
    })
    return {
      ...row.product,
      productType: row.productType?.id ? row.productType : null,
      supplyModel: deriveProductSupplyModel(row.product.bookingMode),
      classification,
    }
  },

  async createProduct(db: PostgresJsDatabase, data: CreateProductInput) {
    assertProductDateRange(data)
    await assertReadyToPublish(db, data)

    const [row] = await db.insert(products).values(data).returning()
    if (!row) {
      throw new Error("Failed to create product")
    }
    await ensureDefaultItinerary(db, row.id)
    await ensureDefaultOption(db, row.id)
    return row
  },

  async updateProduct(db: PostgresJsDatabase, id: string, data: UpdateProductInput) {
    const [current] = await db.select().from(products).where(eq(products.id, id)).limit(1)
    if (!current) return null

    const merged = { ...current, ...data }
    assertProductDateRange(merged)
    await assertReadyToPublish(db, merged)

    const [row] = await db
      .update(products)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning()

    return row ?? null
  },

  async deleteProduct(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(products)
      .where(eq(products.id, id))
      .returning({ id: products.id })

    return row ?? null
  },
}
