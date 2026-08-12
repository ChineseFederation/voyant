import type {
  CreateInvoiceNumberSeriesInput,
  EnsureExternalInvoiceNumberSeriesInput,
  InvoiceNumberScope,
  InvoiceNumberSeriesListQuery,
  PostgresJsDatabase,
  UpdateInvoiceNumberSeriesInput,
} from "./service-shared.js"
import {
  and,
  currentPeriodBoundary,
  desc,
  ExternalInvoiceNumberSeriesCollisionError,
  eq,
  formatNumber,
  InvoiceNumberConflictError,
  invoiceNumberSeries,
  invoices,
  isInvoiceNumberUniqueConstraintError,
  ne,
  paginate,
  sql,
  toTimestamp,
} from "./service-shared.js"

type InvoiceNumberSeriesLockRow = {
  id: string
  prefix: string
  separator: string
  pad_length: number
  current_sequence: number
  reset_strategy: "never" | "annual" | "monthly"
  reset_at: Date | null
  active: boolean
}

function firstRawExecuteRow<T>(result: unknown): T | undefined {
  if (Array.isArray(result)) return result[0] as T | undefined
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows
    if (Array.isArray(rows)) return rows[0] as T | undefined
  }
  return undefined
}

export const financeInvoiceNumberingService = {
  async listInvoiceNumberSeries(db: PostgresJsDatabase, query: InvoiceNumberSeriesListQuery) {
    const conditions = []
    if (query.scope) conditions.push(eq(invoiceNumberSeries.scope, query.scope))
    if (typeof query.active === "boolean")
      conditions.push(eq(invoiceNumberSeries.active, query.active))
    const where = conditions.length ? and(...conditions) : undefined
    return paginate(
      db
        .select()
        .from(invoiceNumberSeries)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(desc(invoiceNumberSeries.updatedAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(invoiceNumberSeries).where(where),
      query.limit,
      query.offset,
    )
  },

  async getInvoiceNumberSeriesById(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .select()
      .from(invoiceNumberSeries)
      .where(eq(invoiceNumberSeries.id, id))
      .limit(1)
    return row ?? null
  },

  async resolveDefaultInvoiceNumberSeries(db: PostgresJsDatabase, scope: InvoiceNumberScope) {
    const [row] = await db
      .select()
      .from(invoiceNumberSeries)
      .where(and(eq(invoiceNumberSeries.scope, scope), eq(invoiceNumberSeries.active, true)))
      .orderBy(
        desc(invoiceNumberSeries.isDefault),
        desc(invoiceNumberSeries.updatedAt),
        desc(invoiceNumberSeries.createdAt),
      )
      .limit(1)
    return row ?? null
  },

  async ensureExternalInvoiceNumberSeries(
    db: PostgresJsDatabase,
    inputs: EnsureExternalInvoiceNumberSeriesInput[],
  ) {
    return db.transaction(async (tx) => {
      const rows: Array<typeof invoiceNumberSeries.$inferSelect> = []

      for (const input of inputs) {
        const now = new Date()
        const code = input.code ?? `${input.provider}-${input.scope}`
        const active = input.active ?? true
        const isDefault = active === false ? false : (input.isDefault ?? true)

        const [existingExternal] = await tx
          .select()
          .from(invoiceNumberSeries)
          .where(
            and(
              eq(invoiceNumberSeries.scope, input.scope),
              eq(invoiceNumberSeries.externalProvider, input.provider),
            ),
          )
          .orderBy(
            desc(invoiceNumberSeries.isDefault),
            desc(invoiceNumberSeries.updatedAt),
            desc(invoiceNumberSeries.createdAt),
          )
          .limit(1)

        const [existingByCode] = existingExternal
          ? [null]
          : await tx
              .select()
              .from(invoiceNumberSeries)
              .where(eq(invoiceNumberSeries.code, code))
              .limit(1)
        if (
          existingByCode &&
          (existingByCode.scope !== input.scope ||
            existingByCode.externalProvider !== input.provider)
        ) {
          throw new ExternalInvoiceNumberSeriesCollisionError({
            seriesCode: code,
            provider: input.provider,
            scope: input.scope,
            existingProvider: existingByCode.externalProvider,
            existingScope: existingByCode.scope,
          })
        }
        const existing = existingExternal ?? existingByCode
        const nextCode = existingExternal ? existingExternal.code : code

        if (isDefault) {
          const defaultScopeWhere = existing
            ? and(
                eq(invoiceNumberSeries.scope, input.scope),
                ne(invoiceNumberSeries.id, existing.id),
              )
            : eq(invoiceNumberSeries.scope, input.scope)
          await tx
            .update(invoiceNumberSeries)
            .set({ isDefault: false, updatedAt: now })
            .where(defaultScopeWhere)
        }

        if (existing) {
          const [row] = await tx
            .update(invoiceNumberSeries)
            .set({
              code: nextCode,
              name: input.name,
              prefix: input.prefix ?? existing.prefix,
              separator: input.separator ?? existing.separator,
              padLength: input.padLength ?? existing.padLength,
              resetStrategy: input.resetStrategy ?? existing.resetStrategy,
              scope: input.scope,
              isDefault,
              externalProvider: input.provider,
              externalConfigKey: input.externalConfigKey ?? null,
              active,
              updatedAt: now,
            })
            .where(eq(invoiceNumberSeries.id, existing.id))
            .returning()
          if (row) rows.push(row)
          continue
        }

        const [row] = await tx
          .insert(invoiceNumberSeries)
          .values({
            code,
            name: input.name,
            prefix: input.prefix ?? "",
            separator: input.separator ?? "",
            padLength: input.padLength ?? 0,
            currentSequence: 0,
            resetStrategy: input.resetStrategy ?? "never",
            resetAt: null,
            scope: input.scope,
            isDefault,
            externalProvider: input.provider,
            externalConfigKey: input.externalConfigKey ?? null,
            active,
          })
          .returning()
        if (row) rows.push(row)
      }

      return rows
    })
  },

  async createInvoiceNumberSeries(db: PostgresJsDatabase, data: CreateInvoiceNumberSeriesInput) {
    return db.transaction(async (tx) => {
      const isDefault = data.active === false ? false : data.isDefault

      if (isDefault) {
        await tx
          .update(invoiceNumberSeries)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(invoiceNumberSeries.scope, data.scope))
      }

      const [row] = await tx
        .insert(invoiceNumberSeries)
        .values({
          code: data.code,
          name: data.name,
          prefix: data.prefix,
          separator: data.separator,
          padLength: data.padLength,
          currentSequence: data.currentSequence,
          resetStrategy: data.resetStrategy,
          resetAt: toTimestamp(data.resetAt),
          scope: data.scope,
          isDefault,
          externalProvider: data.externalProvider ?? null,
          externalConfigKey: data.externalConfigKey ?? null,
          active: data.active,
        })
        .returning()
      return row ?? null
    })
  },

  async updateInvoiceNumberSeries(
    db: PostgresJsDatabase,
    id: string,
    data: UpdateInvoiceNumberSeriesInput,
  ) {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(invoiceNumberSeries)
        .where(eq(invoiceNumberSeries.id, id))
        .limit(1)
      if (!existing) return null

      const { resetAt, ...rest } = data
      const nextScope = rest.scope ?? existing.scope
      const nextActive = rest.active ?? existing.active
      const nextIsDefault = nextActive === false ? false : (rest.isDefault ?? existing.isDefault)

      if (nextIsDefault) {
        await tx
          .update(invoiceNumberSeries)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(eq(invoiceNumberSeries.scope, nextScope), ne(invoiceNumberSeries.id, id)))
      }

      const [row] = await tx
        .update(invoiceNumberSeries)
        .set({
          ...rest,
          isDefault: nextIsDefault,
          ...(resetAt !== undefined ? { resetAt: toTimestamp(resetAt) } : {}),
          updatedAt: new Date(),
        })
        .where(eq(invoiceNumberSeries.id, id))
        .returning()
      return row ?? null
    })
  },

  async deleteInvoiceNumberSeries(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(invoiceNumberSeries)
      .where(eq(invoiceNumberSeries.id, id))
      .returning({ id: invoiceNumberSeries.id })
    return row ?? null
  },

  /**
   * Transactionally allocate the next invoice number from a series. Uses a
   * `SELECT ... FOR UPDATE` row lock to ensure concurrent callers each receive
   * a distinct sequence. Honours the series' `resetStrategy` (annual/monthly)
   * by resetting `currentSequence` to 1 at period boundaries.
   */
  async allocateInvoiceNumber(db: PostgresJsDatabase, seriesId: string) {
    return db.transaction(async (tx) => {
      const lockResult = await tx.execute(
        // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
        sql`SELECT id, prefix, separator, pad_length, current_sequence, reset_strategy, reset_at, active FROM invoice_number_series WHERE id = ${seriesId} FOR UPDATE`,
      )
      const row = firstRawExecuteRow<InvoiceNumberSeriesLockRow>(lockResult)
      if (!row) return { status: "not_found" as const }
      if (!row.active) return { status: "inactive" as const }

      const now = new Date()
      const boundary = currentPeriodBoundary(row.reset_strategy, now)
      const shouldReset = boundary !== null && (row.reset_at === null || row.reset_at < boundary)

      const nextSequence = shouldReset ? 1 : row.current_sequence + 1
      const nextResetAt = boundary ?? row.reset_at

      await tx
        .update(invoiceNumberSeries)
        .set({
          currentSequence: nextSequence,
          resetAt: nextResetAt,
          updatedAt: now,
        })
        .where(eq(invoiceNumberSeries.id, seriesId))

      const formattedNumber = formatNumber(row.prefix, row.separator, row.pad_length, nextSequence)

      return {
        status: "allocated" as const,
        seriesId,
        sequence: nextSequence,
        formattedNumber,
      }
    })
  },

  async applyExternalInvoiceAllocation(
    db: PostgresJsDatabase,
    invoiceId: string,
    data: {
      invoiceNumber: string
      status?: "issued" | "draft"
      preserveProgressedStatus?: boolean
    },
  ) {
    const [existing] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1)
    if (!existing) return { status: "not_found" as const }
    const progressedStatus = ["issued", "partially_paid", "paid", "overdue"].includes(
      existing.status,
    )
    if (
      existing.status !== "pending_external_allocation" &&
      !(data.preserveProgressedStatus && progressedStatus)
    ) {
      return { status: "not_pending_external_allocation" as const, invoice: existing }
    }

    const nextStatus =
      existing.status === "pending_external_allocation"
        ? (data.status ?? "issued")
        : existing.status

    let invoice: typeof invoices.$inferSelect | undefined
    try {
      const [updatedInvoice] = await db
        .update(invoices)
        .set({
          invoiceNumber: data.invoiceNumber,
          status: nextStatus,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoiceId))
        .returning()
      invoice = updatedInvoice
    } catch (error) {
      if (isInvoiceNumberUniqueConstraintError(error)) {
        throw new InvoiceNumberConflictError(data.invoiceNumber)
      }
      throw error
    }

    return invoice ? { status: "applied" as const, invoice } : { status: "not_found" as const }
  },
}
