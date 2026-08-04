import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { z } from "zod"
import {
  productDayServices,
  productDays,
  productItineraries,
  productMedia,
  products,
} from "./schema.js"
import {
  assertItineraryDayNumberAvailable,
  mapItineraryDayNumberWriteError,
} from "./service-itinerary-validation.js"
import { recalculateProductCost } from "./service-product-cost.js"
import type {
  insertDaySchema,
  insertDayServiceSchema,
  insertItinerarySchema,
  updateDaySchema,
  updateDayServiceSchema,
  updateItinerarySchema,
} from "./validation.js"

type CreateItineraryInput = z.infer<typeof insertItinerarySchema>
type UpdateItineraryInput = z.infer<typeof updateItinerarySchema>
type CreateDayInput = z.infer<typeof insertDaySchema>
type UpdateDayInput = z.infer<typeof updateDaySchema>
type CreateDayServiceInput = z.infer<typeof insertDayServiceSchema>
type UpdateDayServiceInput = z.infer<typeof updateDayServiceSchema>

async function ensureProductExists(db: PostgresJsDatabase, productId: string) {
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1)

  return product ?? null
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

async function getItineraryById(db: PostgresJsDatabase, itineraryId: string) {
  const [itinerary] = await db
    .select()
    .from(productItineraries)
    .where(eq(productItineraries.id, itineraryId))
    .limit(1)

  return itinerary ?? null
}

async function getDayById(
  db: PostgresJsDatabase,
  dayId: string,
): Promise<{ id: string; itineraryId: string; productId: string } | null> {
  const [day] = await db
    .select({
      id: productDays.id,
      itineraryId: productDays.itineraryId,
      productId: productItineraries.productId,
    })
    .from(productDays)
    .innerJoin(productItineraries, eq(productDays.itineraryId, productItineraries.id))
    .where(eq(productDays.id, dayId))
    .limit(1)

  return day ?? null
}

async function setDefaultItinerary(db: PostgresJsDatabase, productId: string, itineraryId: string) {
  await db
    .update(productItineraries)
    .set({
      // agent-quality: raw-sql reviewed -- owner: inventory; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      isDefault: sql`${productItineraries.id} = ${itineraryId}`,
      updatedAt: new Date(),
    })
    .where(eq(productItineraries.productId, productId))
}

async function promoteFallbackItinerary(db: PostgresJsDatabase, productId: string) {
  const [fallback] = await db
    .select({ id: productItineraries.id })
    .from(productItineraries)
    .where(eq(productItineraries.productId, productId))
    .orderBy(asc(productItineraries.sortOrder), asc(productItineraries.createdAt))
    .limit(1)

  if (!fallback) {
    return null
  }

  await setDefaultItinerary(db, productId, fallback.id)
  return fallback
}

export const itineraryProductsService = {
  listItineraries(db: PostgresJsDatabase, productId: string) {
    return db
      .select()
      .from(productItineraries)
      .where(eq(productItineraries.productId, productId))
      .orderBy(desc(productItineraries.isDefault), asc(productItineraries.sortOrder))
  },

  getItineraryById(db: PostgresJsDatabase, itineraryId: string) {
    return getItineraryById(db, itineraryId)
  },

  async createItinerary(db: PostgresJsDatabase, productId: string, data: CreateItineraryInput) {
    const product = await ensureProductExists(db, productId)
    if (!product) {
      return null
    }

    const [existingCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(productItineraries)
      .where(eq(productItineraries.productId, productId))

    const shouldBeDefault = (existingCount?.count ?? 0) === 0 || data.isDefault
    const insertAsDefault = (existingCount?.count ?? 0) === 0
    const [row] = await db
      .insert(productItineraries)
      .values({
        productId,
        name: data.name,
        isDefault: insertAsDefault,
        sortOrder: data.sortOrder,
      })
      .returning()

    if (!row) {
      throw new Error(`Failed to create itinerary for product ${productId}`)
    }

    if (shouldBeDefault && !insertAsDefault) {
      await setDefaultItinerary(db, productId, row.id)
    }

    return shouldBeDefault && !insertAsDefault ? ((await getItineraryById(db, row.id)) ?? row) : row
  },

  async updateItinerary(db: PostgresJsDatabase, itineraryId: string, data: UpdateItineraryInput) {
    const itinerary = await getItineraryById(db, itineraryId)
    if (!itinerary) {
      return null
    }

    const { isDefault, ...rest } = data
    const [row] = await db
      .update(productItineraries)
      .set({
        ...rest,
        ...(isDefault === false ? { isDefault: false } : {}),
        updatedAt: new Date(),
      })
      .where(eq(productItineraries.id, itineraryId))
      .returning()

    if (!row) {
      return null
    }

    if (isDefault === true) {
      await setDefaultItinerary(db, itinerary.productId, itineraryId)
      return (await getItineraryById(db, itineraryId)) as typeof row
    }

    if (isDefault === false && itinerary.isDefault) {
      const [fallback] = await db
        .select({ id: productItineraries.id })
        .from(productItineraries)
        .where(
          and(
            eq(productItineraries.productId, itinerary.productId),
            // agent-quality: raw-sql reviewed -- owner: inventory; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
            sql`${productItineraries.id} <> ${itineraryId}`,
          ),
        )
        .orderBy(asc(productItineraries.sortOrder), asc(productItineraries.createdAt))
        .limit(1)

      if (fallback) {
        await setDefaultItinerary(db, itinerary.productId, fallback.id)
      } else {
        await setDefaultItinerary(db, itinerary.productId, itineraryId)
      }

      return (await getItineraryById(db, itineraryId)) as typeof row
    }

    return row
  },

  async deleteItinerary(db: PostgresJsDatabase, itineraryId: string) {
    const itinerary = await getItineraryById(db, itineraryId)
    if (!itinerary) {
      return null
    }

    const [row] = await db
      .delete(productItineraries)
      .where(eq(productItineraries.id, itineraryId))
      .returning({ id: productItineraries.id })

    if (!row) {
      return null
    }

    if (itinerary.isDefault) {
      await promoteFallbackItinerary(db, itinerary.productId)
    }

    return row
  },

  async duplicateItinerary(
    db: PostgresJsDatabase,
    itineraryId: string,
    options?: { name?: string },
  ) {
    const source = await getItineraryById(db, itineraryId)
    if (!source) {
      return null
    }

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(productItineraries)
      .where(eq(productItineraries.productId, source.productId))

    const name = options?.name?.trim() || `${source.name} (Copy)`
    const sortOrder = countRow?.count ?? 0

    const [created] = await db
      .insert(productItineraries)
      .values({
        productId: source.productId,
        name,
        isDefault: false,
        sortOrder,
      })
      .returning()

    if (!created) {
      throw new Error(`Failed to duplicate itinerary ${itineraryId}`)
    }

    const sourceDays = await db
      .select()
      .from(productDays)
      .where(eq(productDays.itineraryId, source.id))
      .orderBy(asc(productDays.dayNumber))

    if (sourceDays.length === 0) {
      return created
    }

    const dayIdMap = new Map<string, string>()
    const insertedDays = await db
      .insert(productDays)
      .values(
        sourceDays.map((day) => ({
          itineraryId: created.id,
          dayNumber: day.dayNumber,
          title: day.title,
          description: day.description,
          location: day.location,
        })),
      )
      .returning({ id: productDays.id, dayNumber: productDays.dayNumber })

    for (const sourceDay of sourceDays) {
      const match = insertedDays.find((day) => day.dayNumber === sourceDay.dayNumber)
      if (match) {
        dayIdMap.set(sourceDay.id, match.id)
      }
    }

    const sourceDayIds = sourceDays.map((day) => day.id)
    const sourceServices = await db
      .select()
      .from(productDayServices)
      .where(inArray(productDayServices.dayId, sourceDayIds))
      .orderBy(asc(productDayServices.sortOrder))

    if (sourceServices.length > 0) {
      await db.insert(productDayServices).values(
        sourceServices
          .map((service) => {
            const newDayId = dayIdMap.get(service.dayId)
            if (!newDayId) return null
            return {
              dayId: newDayId,
              supplierServiceId: service.supplierServiceId,
              serviceType: service.serviceType,
              name: service.name,
              description: service.description,
              countryCode: service.countryCode,
              costCurrency: service.costCurrency,
              costAmountCents: service.costAmountCents,
              quantity: service.quantity,
              sortOrder: service.sortOrder,
              notes: service.notes,
            }
          })
          .filter((value): value is NonNullable<typeof value> => value !== null),
      )
    }

    const sourceDayMedia = await db
      .select()
      .from(productMedia)
      .where(inArray(productMedia.dayId, sourceDayIds))
      .orderBy(asc(productMedia.sortOrder))

    if (sourceDayMedia.length > 0) {
      await db.insert(productMedia).values(
        sourceDayMedia
          .map((media) => {
            const newDayId = media.dayId ? dayIdMap.get(media.dayId) : null
            if (!newDayId) return null
            return {
              productId: media.productId,
              dayId: newDayId,
              mediaType: media.mediaType,
              name: media.name,
              url: media.url,
              storageKey: media.storageKey,
              mimeType: media.mimeType,
              fileSize: media.fileSize,
              altText: media.altText,
              sortOrder: media.sortOrder,
              isCover: media.isCover,
              isBrochure: false,
              isBrochureCurrent: false,
              brochureVersion: null,
            }
          })
          .filter((value): value is NonNullable<typeof value> => value !== null),
      )
    }

    return created
  },

  async listDays(db: PostgresJsDatabase, productId: string) {
    const itinerary = await ensureDefaultItinerary(db, productId)
    return itineraryProductsService.listItineraryDays(db, itinerary.id)
  },

  listItineraryDays(db: PostgresJsDatabase, itineraryId: string) {
    return db
      .select()
      .from(productDays)
      .where(eq(productDays.itineraryId, itineraryId))
      .orderBy(asc(productDays.dayNumber))
  },

  async getDayForProductMutation(db: PostgresJsDatabase, dayId: string) {
    const dayRef = await getDayById(db, dayId)
    if (!dayRef) {
      return null
    }

    const [row] = await db.select().from(productDays).where(eq(productDays.id, dayId)).limit(1)
    return row ? { ...row, productId: dayRef.productId } : null
  },

  async createDay(db: PostgresJsDatabase, productId: string, data: CreateDayInput) {
    const itinerary = await ensureDefaultItinerary(db, productId)
    return itineraryProductsService.createItineraryDay(db, productId, itinerary.id, data)
  },

  async createItineraryDay(
    db: PostgresJsDatabase,
    productId: string,
    itineraryId: string,
    data: CreateDayInput,
  ) {
    const itinerary = await getItineraryById(db, itineraryId)
    if (!itinerary || itinerary.productId !== productId) {
      return null
    }

    await assertItineraryDayNumberAvailable(db, itineraryId, data.dayNumber)

    let row: typeof productDays.$inferSelect | undefined
    try {
      ;[row] = await db
        .insert(productDays)
        .values({ ...data, itineraryId })
        .returning()
    } catch (err) {
      mapItineraryDayNumberWriteError(err)
    }

    return row
  },

  async updateDay(db: PostgresJsDatabase, dayId: string, data: UpdateDayInput) {
    const existing = await getDayById(db, dayId)
    if (!existing) {
      return null
    }

    if (data.dayNumber !== undefined) {
      await assertItineraryDayNumberAvailable(db, existing.itineraryId, data.dayNumber, dayId)
    }

    let row: typeof productDays.$inferSelect | undefined
    try {
      ;[row] = await db
        .update(productDays)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(productDays.id, dayId))
        .returning()
    } catch (err) {
      mapItineraryDayNumberWriteError(err)
    }

    return row ?? null
  },

  async deleteDay(db: PostgresJsDatabase, dayId: string) {
    const [row] = await db
      .delete(productDays)
      .where(eq(productDays.id, dayId))
      .returning({ id: productDays.id })

    return row ?? null
  },

  listDayServices(db: PostgresJsDatabase, dayId: string) {
    return db
      .select()
      .from(productDayServices)
      .where(eq(productDayServices.dayId, dayId))
      .orderBy(asc(productDayServices.sortOrder))
  },

  async getDayServiceForProductMutation(db: PostgresJsDatabase, serviceId: string) {
    const [row] = await db
      .select()
      .from(productDayServices)
      .where(eq(productDayServices.id, serviceId))
      .limit(1)
    if (!row) {
      return null
    }

    const dayRef = await getDayById(db, row.dayId)
    return dayRef ? { ...row, productId: dayRef.productId } : null
  },

  async createDayService(
    db: PostgresJsDatabase,
    productId: string,
    dayId: string,
    data: CreateDayServiceInput,
  ) {
    const day = await getDayById(db, dayId)

    if (!day || day.productId !== productId) {
      return null
    }

    const [row] = await db
      .insert(productDayServices)
      .values({ ...data, dayId })
      .returning()

    await recalculateProductCost(db, productId)

    return row
  },

  async updateDayService(
    db: PostgresJsDatabase,
    productId: string,
    serviceId: string,
    data: UpdateDayServiceInput,
  ) {
    const [row] = await db
      .update(productDayServices)
      .set(data)
      .where(eq(productDayServices.id, serviceId))
      .returning()

    if (!row) {
      return null
    }

    await recalculateProductCost(db, productId)
    return row
  },

  async deleteDayService(db: PostgresJsDatabase, productId: string, serviceId: string) {
    const [row] = await db
      .delete(productDayServices)
      .where(eq(productDayServices.id, serviceId))
      .returning({ id: productDayServices.id })

    if (!row) {
      return null
    }

    await recalculateProductCost(db, productId)
    return row
  },
}
