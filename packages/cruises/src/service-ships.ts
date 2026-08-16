import { listResponse } from "@voyant-travel/types"
import { and, asc, count, eq, ilike, or } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { CruiseCabin, CruiseCabinCategory, CruiseDeck, CruiseShip } from "./schema-cabins.js"
import { cruiseCabinCategories, cruiseCabins, cruiseDecks, cruiseShips } from "./schema-cabins.js"
import { paginate, setUpdated } from "./service-shared.js"
import type {
  InsertCabin,
  InsertCabinCategory,
  InsertDeck,
  InsertShip,
  ShipListQuery,
  UpdateCabin,
  UpdateCabinCategory,
  UpdateDeck,
  UpdateShip,
} from "./validation-cabins.js"

export const cruiseShipService = {
  async listShips(db: PostgresJsDatabase, query: ShipListQuery) {
    const conditions = []
    if (query.lineSupplierId) conditions.push(eq(cruiseShips.lineSupplierId, query.lineSupplierId))
    if (query.shipType) conditions.push(eq(cruiseShips.shipType, query.shipType))
    if (typeof query.isActive === "boolean")
      conditions.push(eq(cruiseShips.isActive, query.isActive))
    // The operator-facing search box offers name *or* IMO, and an IMO is how a
    // vessel is identified unambiguously across cruise lines — matching only the
    // name would silently return nothing for the more precise of the two.
    if (query.search) {
      const term = `%${query.search}%`
      conditions.push(or(ilike(cruiseShips.name, term), ilike(cruiseShips.imo, term)))
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined
    const { limit, offset } = paginate(query)

    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(cruiseShips)
        .where(where)
        .orderBy(asc(cruiseShips.name))
        .limit(limit)
        .offset(offset),
      db.select({ value: count() }).from(cruiseShips).where(where),
    ])
    return listResponse(rows, { total: totalRows[0]?.value ?? 0, limit, offset })
  },

  async getShipById(db: PostgresJsDatabase, id: string): Promise<CruiseShip | null> {
    const [row] = await db.select().from(cruiseShips).where(eq(cruiseShips.id, id)).limit(1)
    return row ?? null
  },

  async createShip(db: PostgresJsDatabase, data: InsertShip): Promise<CruiseShip> {
    const [row] = await db.insert(cruiseShips).values(data).returning()
    if (!row) throw new Error("Failed to create ship")
    return row
  },

  async updateShip(
    db: PostgresJsDatabase,
    id: string,
    data: UpdateShip,
  ): Promise<CruiseShip | null> {
    const [row] = await db
      .update(cruiseShips)
      .set({ ...data, ...setUpdated })
      .where(eq(cruiseShips.id, id))
      .returning()
    return row ?? null
  },

  async listShipDecks(db: PostgresJsDatabase, shipId: string): Promise<CruiseDeck[]> {
    return db
      .select()
      .from(cruiseDecks)
      .where(eq(cruiseDecks.shipId, shipId))
      .orderBy(asc(cruiseDecks.level))
  },

  async upsertDeck(db: PostgresJsDatabase, data: InsertDeck): Promise<CruiseDeck> {
    const [existing] = await db
      .select()
      .from(cruiseDecks)
      .where(and(eq(cruiseDecks.shipId, data.shipId), eq(cruiseDecks.name, data.name)))
      .limit(1)
    if (existing) {
      const [row] = await db
        .update(cruiseDecks)
        .set({ ...data, ...setUpdated })
        .where(eq(cruiseDecks.id, existing.id))
        .returning()
      if (!row) throw new Error("Failed to update deck")
      return row
    }
    const [row] = await db.insert(cruiseDecks).values(data).returning()
    if (!row) throw new Error("Failed to insert deck")
    return row
  },

  async updateDeck(
    db: PostgresJsDatabase,
    id: string,
    data: UpdateDeck,
  ): Promise<CruiseDeck | null> {
    const [row] = await db
      .update(cruiseDecks)
      .set({ ...data, ...setUpdated })
      .where(eq(cruiseDecks.id, id))
      .returning()
    return row ?? null
  },

  async listShipCabinCategories(
    db: PostgresJsDatabase,
    shipId: string,
  ): Promise<CruiseCabinCategory[]> {
    return db
      .select()
      .from(cruiseCabinCategories)
      .where(eq(cruiseCabinCategories.shipId, shipId))
      .orderBy(asc(cruiseCabinCategories.code))
  },

  async upsertCabinCategory(
    db: PostgresJsDatabase,
    data: InsertCabinCategory,
  ): Promise<CruiseCabinCategory> {
    const [existing] = await db
      .select()
      .from(cruiseCabinCategories)
      .where(
        and(
          eq(cruiseCabinCategories.shipId, data.shipId),
          eq(cruiseCabinCategories.code, data.code),
        ),
      )
      .limit(1)
    if (existing) {
      const [row] = await db
        .update(cruiseCabinCategories)
        .set({ ...data, ...setUpdated })
        .where(eq(cruiseCabinCategories.id, existing.id))
        .returning()
      if (!row) throw new Error("Failed to update cabin category")
      return row
    }
    const [row] = await db.insert(cruiseCabinCategories).values(data).returning()
    if (!row) throw new Error("Failed to insert cabin category")
    return row
  },

  async updateCabinCategory(
    db: PostgresJsDatabase,
    id: string,
    data: UpdateCabinCategory,
  ): Promise<CruiseCabinCategory | null> {
    const [row] = await db
      .update(cruiseCabinCategories)
      .set({ ...data, ...setUpdated })
      .where(eq(cruiseCabinCategories.id, id))
      .returning()
    return row ?? null
  },

  async listCabinsByCategory(db: PostgresJsDatabase, categoryId: string): Promise<CruiseCabin[]> {
    return db
      .select()
      .from(cruiseCabins)
      .where(eq(cruiseCabins.categoryId, categoryId))
      .orderBy(asc(cruiseCabins.cabinNumber))
  },

  async upsertCabin(db: PostgresJsDatabase, data: InsertCabin): Promise<CruiseCabin> {
    const [existing] = await db
      .select()
      .from(cruiseCabins)
      .where(
        and(
          eq(cruiseCabins.categoryId, data.categoryId),
          eq(cruiseCabins.cabinNumber, data.cabinNumber),
        ),
      )
      .limit(1)
    if (existing) {
      const [row] = await db
        .update(cruiseCabins)
        .set({ ...data, ...setUpdated })
        .where(eq(cruiseCabins.id, existing.id))
        .returning()
      if (!row) throw new Error("Failed to update cabin")
      return row
    }
    const [row] = await db.insert(cruiseCabins).values(data).returning()
    if (!row) throw new Error("Failed to insert cabin")
    return row
  },

  async updateCabin(
    db: PostgresJsDatabase,
    id: string,
    data: UpdateCabin,
  ): Promise<CruiseCabin | null> {
    const [row] = await db
      .update(cruiseCabins)
      .set({ ...data, ...setUpdated })
      .where(eq(cruiseCabins.id, id))
      .returning()
    return row ?? null
  },

  // ---------- prices ----------
}
