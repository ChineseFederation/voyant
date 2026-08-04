import { asc, desc, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { z } from "zod"
import {
  optionUnits,
  productDayServices,
  productDays,
  productItineraries,
  productNotes,
  productOptions,
  products,
  productVersions,
} from "./schema.js"
import { type ProductCostFxOptions, recalculateProductCost } from "./service-product-cost.js"
import type { insertProductNoteSchema, insertVersionSchema } from "./validation.js"

type CreateVersionInput = z.infer<typeof insertVersionSchema>
type CreateProductNoteInput = z.infer<typeof insertProductNoteSchema>

/**
 * The frozen shape a Product Version stores: the product row plus the options,
 * units, itineraries, days and day-services needed to reproduce what was sold.
 * Building it is separate from persisting it so the publish path can compare a
 * candidate against the previous version before deciding to write one.
 */
async function buildProductVersionSnapshot(db: PostgresJsDatabase, productId: string) {
  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1)

  if (!product) {
    return null
  }

  const itineraries = await db
    .select()
    .from(productItineraries)
    .where(eq(productItineraries.productId, productId))
    .orderBy(desc(productItineraries.isDefault), asc(productItineraries.sortOrder))

  const defaultItinerary = itineraries.find((itinerary) => itinerary.isDefault) ?? null

  const options = await db
    .select()
    .from(productOptions)
    .where(eq(productOptions.productId, productId))
    .orderBy(asc(productOptions.sortOrder), asc(productOptions.createdAt))

  const optionsWithUnits = await Promise.all(
    options.map(async (option) => {
      const units = await db
        .select()
        .from(optionUnits)
        .where(eq(optionUnits.optionId, option.id))
        .orderBy(asc(optionUnits.sortOrder), asc(optionUnits.createdAt))

      return { ...option, units }
    }),
  )

  const itinerariesWithDays = await Promise.all(
    itineraries.map(async (itinerary) => {
      const days = await db
        .select()
        .from(productDays)
        .where(eq(productDays.itineraryId, itinerary.id))
        .orderBy(asc(productDays.dayNumber))

      const daysWithServices = await Promise.all(
        days.map(async (day) => {
          const services = await db
            .select()
            .from(productDayServices)
            .where(eq(productDayServices.dayId, day.id))
            .orderBy(asc(productDayServices.sortOrder))

          // Emit the declared, versioned planned-cost block (voyant#4037)
          // alongside the raw columns so a departure can restate this service's
          // cost against its own quantities without reading the mutable product.
          // Deterministic by construction — every field is a frozen column, so
          // an unchanged product still de-dupes on re-publish. `fxRates`/
          // `resolvedAt` are null: Finance restates at its issue-date rate.
          const servicesWithPlannedCost = services.map((service) => ({
            ...service,
            plannedCost: {
              version: 1 as const,
              basis: service.plannedCostBasis,
              driver: service.quantityDriver,
              quantity: service.quantity,
              rateCents: service.costAmountCents,
              currency: service.costCurrency,
              fxRates: null,
              resolvedAt: null,
            },
          }))

          return { ...day, services: servicesWithPlannedCost }
        }),
      )

      return { ...itinerary, days: daysWithServices }
    }),
  )

  const defaultDays =
    itinerariesWithDays.find((itinerary) => itinerary.id === defaultItinerary?.id)?.days ?? []

  return {
    ...product,
    options: optionsWithUnits,
    itineraries: itinerariesWithDays,
    days: defaultDays,
  }
}

export const itineraryHistoryProductsService = {
  listVersions(db: PostgresJsDatabase, productId: string) {
    return db
      .select()
      .from(productVersions)
      .where(eq(productVersions.productId, productId))
      .orderBy(desc(productVersions.versionNumber))
  },

  /**
   * Build the version snapshot for a product without persisting it. Split out
   * of `createVersion` so the publish path (#4030) can compare a candidate
   * snapshot against the previous one and decline to mint a duplicate version,
   * instead of writing one and deleting it again.
   *
   * Returns `null` when the product does not exist.
   */
  buildSnapshot: buildProductVersionSnapshot,

  async createVersion(
    db: PostgresJsDatabase,
    productId: string,
    userId: string,
    data: CreateVersionInput,
  ) {
    const snapshot = await buildProductVersionSnapshot(db, productId)

    if (!snapshot) {
      return null
    }

    const [maxVersion] = await db
      .select({ max: sql<number>`coalesce(max(${productVersions.versionNumber}), 0)` })
      .from(productVersions)
      .where(eq(productVersions.productId, productId))

    const [row] = await db
      .insert(productVersions)
      .values({
        productId,
        versionNumber: (maxVersion?.max ?? 0) + 1,
        snapshot,
        authorId: userId,
        notes: data.notes,
      })
      .returning()

    return row
  },

  listNotes(db: PostgresJsDatabase, productId: string) {
    return db
      .select()
      .from(productNotes)
      .where(eq(productNotes.productId, productId))
      .orderBy(productNotes.createdAt)
  },

  async createNote(
    db: PostgresJsDatabase,
    productId: string,
    userId: string,
    data: CreateProductNoteInput,
  ) {
    const [product] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1)

    if (!product) {
      return null
    }

    const [row] = await db
      .insert(productNotes)
      .values({
        productId,
        authorId: userId,
        content: data.content,
      })
      .returning()

    return row
  },

  /**
   * Recompute the product's rolled-up itinerary cost and margin. `options`
   * carries the FX runtime used to restate non-sell-currency service costs; with
   * none supplied the roll-up falls back to persisted `exchange_rates`.
   */
  recalculate(db: PostgresJsDatabase, productId: string, options: ProductCostFxOptions = {}) {
    return recalculateProductCost(db, productId, options)
  },
}
