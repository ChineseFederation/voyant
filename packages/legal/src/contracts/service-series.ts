import { and, desc, eq, ne, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { contractNumberSeries } from "./schema.js"
import type {
  ContractNumberSeriesListQuery,
  CreateContractNumberSeriesInput,
  UpdateContractNumberSeriesInput,
} from "./service-shared.js"

type ContractScope = (typeof contractNumberSeries.scope.enumValues)[number]

export class ContractSeriesAmbiguousError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ContractSeriesAmbiguousError"
  }
}

export const contractSeriesService = {
  async listSeries(db: PostgresJsDatabase, query: ContractNumberSeriesListQuery = {}) {
    const conditions = []
    if (query.scope) conditions.push(eq(contractNumberSeries.scope, query.scope))
    if (query.active !== undefined) conditions.push(eq(contractNumberSeries.active, query.active))
    const where = conditions.length ? and(...conditions) : undefined

    return db
      .select()
      .from(contractNumberSeries)
      .where(where)
      .orderBy(desc(contractNumberSeries.updatedAt))
  },
  async getSeriesById(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .select()
      .from(contractNumberSeries)
      .where(eq(contractNumberSeries.id, id))
      .limit(1)
    return row ?? null
  },
  /**
   * Resolve the single active series for a (prefix, scope) pair. Throws
   * if the partial unique index has been bypassed and >1 active row
   * exists. `(prefix, scope)` is the natural key for the generated number;
   * `name` is only a display label.
   */
  async findActiveByPrefixScope(db: PostgresJsDatabase, prefix: string, scope: ContractScope) {
    const rows = await db
      .select()
      .from(contractNumberSeries)
      .where(
        and(
          eq(contractNumberSeries.prefix, prefix),
          eq(contractNumberSeries.scope, scope),
          eq(contractNumberSeries.active, true),
        ),
      )
      .limit(2)
    if (rows.length > 1) {
      throw new ContractSeriesAmbiguousError(
        `Multiple active contract_number_series rows match prefix=${prefix}, scope=${scope}. The partial unique index is missing or has been bypassed.`,
      )
    }
    return rows[0] ?? null
  },
  /**
   * Resolve the default active series for a scope. If no explicit default
   * exists, fall back to the legacy sole-active behavior for backwards
   * compatibility.
   */
  async findDefaultActiveByScope(db: PostgresJsDatabase, scope: ContractScope) {
    const defaultRows = await db
      .select()
      .from(contractNumberSeries)
      .where(
        and(
          eq(contractNumberSeries.scope, scope),
          eq(contractNumberSeries.active, true),
          eq(contractNumberSeries.isDefault, true),
        ),
      )
      .orderBy(desc(contractNumberSeries.updatedAt))
      .limit(2)
    if (defaultRows.length > 1) {
      throw new ContractSeriesAmbiguousError(
        `Multiple default active contract_number_series rows match scope=${scope}. The partial unique index is missing or has been bypassed.`,
      )
    }
    if (defaultRows[0]) {
      return defaultRows[0]
    }

    const activeRows = await db
      .select()
      .from(contractNumberSeries)
      .where(and(eq(contractNumberSeries.scope, scope), eq(contractNumberSeries.active, true)))
      .orderBy(desc(contractNumberSeries.updatedAt))
      .limit(2)
    if (activeRows.length > 1) {
      throw new ContractSeriesAmbiguousError(
        `Multiple active contract_number_series rows match scope=${scope}. Mark one as is_default=true, archive duplicates, or pass an explicit series.`,
      )
    }
    return activeRows[0] ?? null
  },
  async createSeries(db: PostgresJsDatabase, data: CreateContractNumberSeriesInput) {
    return db.transaction(async (tx) => {
      const scope = data.scope ?? "customer"
      const active = data.active ?? true
      const isDefault = active === false ? false : (data.isDefault ?? false)

      if (isDefault) {
        await tx
          .update(contractNumberSeries)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(contractNumberSeries.scope, scope))
      }

      const [row] = await tx
        .insert(contractNumberSeries)
        .values({ ...data, scope, active, isDefault })
        .returning()
      return row ?? null
    })
  },
  /**
   * Idempotent create-or-update against the `(prefix, scope) WHERE active`
   * partial unique index. Lets consumer seed scripts converge the row
   * without tracking ids.
   */
  async upsertByPrefixScope(db: PostgresJsDatabase, data: CreateContractNumberSeriesInput) {
    return db.transaction(async (tx) => {
      const scope = data.scope ?? "customer"
      const active = data.active ?? true
      const isDefault = active === false ? false : (data.isDefault ?? false)

      if (isDefault) {
        await tx
          .update(contractNumberSeries)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(contractNumberSeries.scope, scope))
      }

      const [row] = await tx
        .insert(contractNumberSeries)
        .values({ ...data, scope, active, isDefault })
        .onConflictDoUpdate({
          target: [contractNumberSeries.prefix, contractNumberSeries.scope],
          // agent-quality: raw-sql reviewed -- owner: legal; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
          targetWhere: sql`${contractNumberSeries.active} = true`,
          set: {
            name: data.name,
            separator: data.separator,
            padLength: data.padLength,
            resetStrategy: data.resetStrategy,
            isDefault,
            externalProvider: data.externalProvider ?? null,
            externalConfigKey: data.externalConfigKey ?? null,
            updatedAt: new Date(),
          },
        })
        .returning()
      return row ?? null
    })
  },
  async updateSeries(db: PostgresJsDatabase, id: string, data: UpdateContractNumberSeriesInput) {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(contractNumberSeries)
        .where(eq(contractNumberSeries.id, id))
        .limit(1)
      if (!existing) return null

      const nextScope = data.scope ?? existing.scope
      const nextActive = data.active ?? existing.active
      const nextIsDefault = nextActive === false ? false : (data.isDefault ?? existing.isDefault)

      if (nextIsDefault) {
        await tx
          .update(contractNumberSeries)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(eq(contractNumberSeries.scope, nextScope), ne(contractNumberSeries.id, id)))
      }

      const [row] = await tx
        .update(contractNumberSeries)
        .set({ ...data, isDefault: nextIsDefault, updatedAt: new Date() })
        .where(eq(contractNumberSeries.id, id))
        .returning()
      return row ?? null
    })
  },
  async deleteSeries(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(contractNumberSeries)
      .where(eq(contractNumberSeries.id, id))
      .returning({ id: contractNumberSeries.id })
    return row ?? null
  },
}
