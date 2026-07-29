import type {
  CreateInvoiceInput,
  FinanceServiceRuntime,
  InvoiceListQuery,
  InvoiceVoidedEvent,
  PostgresJsDatabase,
  UpdateInvoiceInput,
  VoidInvoiceInput,
} from "./service-shared.js"
import {
  and,
  appendActionLedgerMutation,
  asc,
  bookings,
  buildInvoiceDeleteActionLedgerInput,
  buildInvoiceUpdateActionLedgerInput,
  creditNotes,
  desc,
  eq,
  gte,
  InvoiceNumberConflictError,
  InvoiceValidationError,
  ilike,
  inArray,
  invoiceLineItems,
  invoices,
  isInvoiceNumberUniqueConstraintError,
  isNotNull,
  lte,
  ne,
  or,
  payments,
  sql,
  toRows,
  touchLinkedBookingUpdatedAt,
  withBookingFinanceInsertionFence,
} from "./service-shared.js"

async function assertOptionalTableReference(
  db: PostgresJsDatabase,
  tableName: "people" | "organizations",
  id: string | null | undefined,
) {
  if (!id) return
  const label = tableName === "people" ? "Person" : "Organization"
  const code = tableName === "people" ? "person_not_found" : "organization_not_found"

  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
    ) AS table_exists
  `)
  const tableExists = Boolean(toRows<{ table_exists: boolean }>(result)[0]?.table_exists)
  if (!tableExists) {
    throw new InvoiceValidationError(
      `${label} not found`,
      { table: tableName, id },
      {
        status: 404,
        code,
      },
    )
  }

  const rowResult =
    tableName === "people"
      ? await db.execute(sql`SELECT id FROM people WHERE id = ${id} LIMIT 1`)
      : await db.execute(sql`SELECT id FROM organizations WHERE id = ${id} LIMIT 1`)
  if (toRows<{ id: string }>(rowResult).length === 0) {
    throw new InvoiceValidationError(
      `${label} not found`,
      { table: tableName, id },
      {
        status: 404,
        code,
      },
    )
  }
}

async function assertInvoiceReferencesExist(db: PostgresJsDatabase, data: CreateInvoiceInput) {
  const [booking] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.id, data.bookingId))
    .limit(1)

  if (!booking) {
    throw new InvoiceValidationError(
      "Booking not found",
      { bookingId: data.bookingId },
      { status: 404, code: "booking_not_found" },
    )
  }

  await assertOptionalTableReference(db, "people", data.personId)
  await assertOptionalTableReference(db, "organizations", data.organizationId)
}

export const financeInvoiceCoreService = {
  async listInvoices(db: PostgresJsDatabase, query: InvoiceListQuery) {
    const conditions = []

    if (query.status) {
      conditions.push(eq(invoices.status, query.status))
    }

    if (query.bookingId) {
      conditions.push(eq(invoices.bookingId, query.bookingId))
    }

    if (query.personId) {
      conditions.push(eq(invoices.personId, query.personId))
    }

    if (query.organizationId) {
      conditions.push(eq(invoices.organizationId, query.organizationId))
    }

    if (query.currency) {
      conditions.push(eq(invoices.currency, query.currency))
    }

    if (query.dueDateFrom) {
      conditions.push(gte(invoices.dueDate, query.dueDateFrom))
    }

    if (query.dueDateTo) {
      conditions.push(lte(invoices.dueDate, query.dueDateTo))
    }

    if (query.search) {
      const term = `%${query.search}%`
      conditions.push(or(ilike(invoices.invoiceNumber, term), ilike(invoices.notes, term)))
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const sortColumn = (() => {
      switch (query.sortBy) {
        case "invoiceNumber":
          return invoices.invoiceNumber
        case "status":
          return invoices.status
        case "totalCents":
          return invoices.totalCents
        case "paidCents":
          return invoices.paidCents
        case "balanceDueCents":
          return invoices.balanceDueCents
        case "issueDate":
          return invoices.issueDate
        case "dueDate":
          return invoices.dueDate
        default:
          return invoices.createdAt
      }
    })()
    const sortFn = query.sortDir === "asc" ? asc : desc

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(invoices)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(sortFn(sortColumn), desc(invoices.createdAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(invoices).where(where),
    ])

    // For each returned invoice, surface the distinct
    // `bookingPaymentScheduleId`s referenced by its line items so the
    // booking-detail payment-schedule table can link rows to invoices
    // without a second roundtrip. Returns `[]` when an invoice covers
    // booking items directly (no schedule link).
    const invoiceIds = rows.map((row) => row.id)
    const scheduleLinks = invoiceIds.length
      ? await db
          .select({
            invoiceId: invoiceLineItems.invoiceId,
            bookingPaymentScheduleId: invoiceLineItems.bookingPaymentScheduleId,
          })
          .from(invoiceLineItems)
          .where(
            and(
              inArray(invoiceLineItems.invoiceId, invoiceIds),
              isNotNull(invoiceLineItems.bookingPaymentScheduleId),
            ),
          )
      : []
    const scheduleIdsByInvoice = new Map<string, string[]>()
    for (const link of scheduleLinks) {
      const scheduleId = link.bookingPaymentScheduleId
      if (!scheduleId) continue
      const existing = scheduleIdsByInvoice.get(link.invoiceId)
      if (!existing) {
        scheduleIdsByInvoice.set(link.invoiceId, [scheduleId])
      } else if (!existing.includes(scheduleId)) {
        existing.push(scheduleId)
      }
    }
    const data = rows.map((row) => ({
      ...row,
      bookingPaymentScheduleIds: scheduleIdsByInvoice.get(row.id) ?? [],
    }))

    return {
      data,
      total: countResult[0]?.count ?? 0,
      limit: query.limit,
      offset: query.offset,
    }
  },

  async createInvoice(db: PostgresJsDatabase, data: CreateInvoiceInput) {
    await assertInvoiceReferencesExist(db, data)

    try {
      const [row] = await withBookingFinanceInsertionFence(db, data.bookingId, (tx) =>
        tx.insert(invoices).values(data).returning(),
      )
      await touchLinkedBookingUpdatedAt(db, row?.bookingId)
      return row
    } catch (error) {
      if (isInvoiceNumberUniqueConstraintError(error)) {
        throw new InvoiceNumberConflictError(data.invoiceNumber)
      }
      throw error
    }
  },
  async getInvoiceById(db: PostgresJsDatabase, id: string) {
    const [row] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1)
    if (!row) return null
    // Surface the proforma → final-invoice link so the UI can show
    // "Invoiced" instead of "Void" for proformas that were converted.
    // The reverse direction (`convertedFromInvoiceId`) already lives on
    // the row; this looks up the inverse via the unique
    // `idx_invoices_converted_from` index.
    const [convertedTo] = await db
      .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber })
      .from(invoices)
      .where(and(eq(invoices.convertedFromInvoiceId, id), ne(invoices.status, "void")))
      .limit(1)
    return {
      ...row,
      convertedToInvoiceId: convertedTo?.id ?? null,
      convertedToInvoiceNumber: convertedTo?.invoiceNumber ?? null,
    }
  },

  async updateInvoice(
    db: PostgresJsDatabase,
    id: string,
    data: UpdateInvoiceInput,
    runtime: FinanceServiceRuntime = {},
  ) {
    const readExistingBookingId = async (reader: PostgresJsDatabase) => {
      const [existing] = await reader
        .select({ bookingId: invoices.bookingId })
        .from(invoices)
        .where(eq(invoices.id, id))
        .limit(1)
      return existing?.bookingId ?? null
    }
    const updateInvoiceRow = (writer: PostgresJsDatabase) =>
      writer
        .update(invoices)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(invoices.id, id))
        .returning()

    try {
      const actionLedgerContext = runtime.actionLedgerContext
      if (actionLedgerContext) {
        return await db.transaction(async (tx) => {
          const previousBookingId = await readExistingBookingId(tx)
          const [row] = await updateInvoiceRow(tx)

          if (row) {
            await touchInvoiceBookingLinks(tx, previousBookingId, row.bookingId)
            await appendActionLedgerMutation(
              tx,
              buildInvoiceUpdateActionLedgerInput(
                actionLedgerContext,
                { invoice: row, changes: data },
                { authorizationSource: runtime.actionLedgerAuthorizationSource },
              ),
            )
          }

          return row ?? null
        })
      }

      const previousBookingId = await readExistingBookingId(db)
      const [row] = await updateInvoiceRow(db)
      await touchInvoiceBookingLinks(db, previousBookingId, row?.bookingId)
      return row ?? null
    } catch (error) {
      if (data.invoiceNumber && isInvoiceNumberUniqueConstraintError(error)) {
        throw new InvoiceNumberConflictError(data.invoiceNumber)
      }
      throw error
    }
  },

  async deleteInvoice(db: PostgresJsDatabase, id: string, runtime: FinanceServiceRuntime = {}) {
    const actionLedgerContext = runtime.actionLedgerContext
    if (actionLedgerContext) {
      return db.transaction(async (tx) => {
        const [existing] = await tx.select().from(invoices).where(eq(invoices.id, id)).limit(1)

        if (!existing) {
          return { status: "not_found" as const }
        }

        if (existing.status !== "draft") {
          return { status: "not_draft" as const }
        }

        await tx.delete(invoices).where(eq(invoices.id, id))
        await touchLinkedBookingUpdatedAt(tx, existing.bookingId)
        await appendActionLedgerMutation(
          tx,
          buildInvoiceDeleteActionLedgerInput(
            actionLedgerContext,
            { invoice: existing },
            { authorizationSource: runtime.actionLedgerAuthorizationSource },
          ),
        )
        return { status: "deleted" as const }
      })
    }

    const [existing] = await db
      .select({ id: invoices.id, status: invoices.status, bookingId: invoices.bookingId })
      .from(invoices)
      .where(eq(invoices.id, id))
      .limit(1)

    if (!existing) {
      return { status: "not_found" as const }
    }

    if (existing.status !== "draft") {
      return { status: "not_draft" as const }
    }

    await db.delete(invoices).where(eq(invoices.id, id))
    await touchLinkedBookingUpdatedAt(db, existing.bookingId)
    return { status: "deleted" as const }
  },

  async voidInvoice(
    db: PostgresJsDatabase,
    id: string,
    input: VoidInvoiceInput = {},
    runtime: FinanceServiceRuntime = {},
  ) {
    const reason = input.reason?.trim() || null
    const voidedAt = new Date()
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(invoices).where(eq(invoices.id, id)).limit(1)

      if (!existing) {
        return { status: "not_found" as const }
      }

      if (existing.status === "void") {
        return { status: "already_void" as const, invoice: existing }
      }

      if (existing.status === "draft") {
        return { status: "draft" as const, invoice: existing }
      }

      const voidableStatuses = new Set<typeof existing.status>([
        "pending_external_allocation",
        "issued",
        "partially_paid",
        "overdue",
      ])

      if (!voidableStatuses.has(existing.status)) {
        return { status: "invalid_status" as const, invoice: existing }
      }

      const [payment] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.invoiceId, id))
        .limit(1)

      if (payment) {
        return { status: "has_payments" as const, invoice: existing }
      }

      const [creditNote] = await tx
        .select({ id: creditNotes.id })
        .from(creditNotes)
        .where(eq(creditNotes.invoiceId, id))
        .limit(1)

      if (creditNote) {
        return { status: "has_credit_notes" as const, invoice: existing }
      }

      const changes = {
        status: "void" as const,
        voidedAt,
        voidReason: reason,
        balanceDueCents: 0,
        baseBalanceDueCents: existing.baseBalanceDueCents == null ? null : 0,
        updatedAt: voidedAt,
      }
      const actionLedgerChanges: UpdateInvoiceInput = {
        status: "void",
        balanceDueCents: changes.balanceDueCents,
        baseBalanceDueCents: changes.baseBalanceDueCents,
      }
      const [invoice] = await tx
        .update(invoices)
        .set(changes)
        .where(eq(invoices.id, id))
        .returning()

      if (!invoice) {
        return { status: "not_found" as const }
      }

      await touchLinkedBookingUpdatedAt(tx, invoice.bookingId)

      const actionLedgerContext = runtime.actionLedgerContext
      if (actionLedgerContext) {
        await appendActionLedgerMutation(
          tx,
          buildInvoiceUpdateActionLedgerInput(
            actionLedgerContext,
            { invoice, changes: actionLedgerChanges },
            { authorizationSource: runtime.actionLedgerAuthorizationSource },
          ),
        )
      }

      return { status: "voided" as const, invoice }
    })

    if (result.status === "voided" && runtime.eventBus) {
      const occurredAt = result.invoice.voidedAt?.toISOString() ?? voidedAt.toISOString()
      const event: InvoiceVoidedEvent = {
        invoiceId: result.invoice.id,
        invoiceNumber: result.invoice.invoiceNumber,
        invoiceType: result.invoice.invoiceType,
        bookingId: result.invoice.bookingId,
        totalCents: result.invoice.totalCents,
        currency: result.invoice.currency,
        reason,
        voidedAt: occurredAt,
        occurredAt,
      }
      await runtime.eventBus.emit("invoice.voided", event)
    }

    return result
  },
}

async function touchInvoiceBookingLinks(
  db: PostgresJsDatabase,
  previousBookingId: string | null | undefined,
  nextBookingId: string | null | undefined,
) {
  await touchLinkedBookingUpdatedAt(db, nextBookingId)
  if (previousBookingId && previousBookingId !== nextBookingId) {
    await touchLinkedBookingUpdatedAt(db, previousBookingId)
  }
}
