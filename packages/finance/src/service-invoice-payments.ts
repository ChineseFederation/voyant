import type {
  CreatePaymentInput,
  FinanceServiceRuntime,
  InvoicePaymentRecordedEvent,
  PaymentListQuery,
  PostgresJsDatabase,
  RawUnifiedPaymentRow,
  UnifiedPaymentRow,
  UpdatePaymentInput,
} from "./service-shared.js"
import {
  and,
  appendActionLedgerMutation,
  assertInvoiceAcceptsNewPayment,
  assertPaymentCanSettleInvoice,
  buildPaymentDeleteActionLedgerInput,
  buildPaymentUpdateActionLedgerInput,
  buildRecordPaymentActionLedgerInput,
  desc,
  eq,
  getPaymentFromReplayedLedgerEntry,
  invoices,
  mapRawPayment,
  newId,
  PaymentValidationError,
  paymentSettlementAmountSql,
  payments,
  publishFinanceDomainEvent,
  recomputeInvoiceTotalsAfterPaymentChange,
  resolveFxMoneyBaseAmount,
  settleCoveredBookingPaymentSchedules,
  shouldNormalizeBaseAmount,
  sql,
  toRows,
  touchLinkedBookingUpdatedAt,
} from "./service-shared.js"

async function assertInvoicePaymentTotalDoesNotExceedInvoice(
  db: PostgresJsDatabase,
  invoice: typeof invoices.$inferSelect,
) {
  const [sumResult] = await db
    .select({ total: paymentSettlementAmountSql(invoice.currency) })
    .from(payments)
    .where(and(eq(payments.invoiceId, invoice.id), eq(payments.status, "completed")))

  const paidCents = sumResult?.total ?? 0
  if (paidCents <= invoice.totalCents) return paidCents

  throw new PaymentValidationError(
    "Completed payments cannot exceed the invoice total",
    {
      invoiceId: invoice.id,
      invoiceCurrency: invoice.currency,
      invoiceTotalCents: invoice.totalCents,
      attemptedPaidCents: paidCents,
      excessCents: paidCents - invoice.totalCents,
    },
    { status: 409, code: "invoice_overpaid" },
  )
}

export const financeInvoicePaymentService = {
  listPayments(db: PostgresJsDatabase, invoiceId: string) {
    return db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId))
      .orderBy(desc(payments.paymentDate))
  },

  async listAllPayments(db: PostgresJsDatabase, query: PaymentListQuery) {
    // The unified view UNIONs `payments` (customer-side, FK to invoices) and
    // `supplier_payments` (FK to bookings + suppliers). Filters that only make
    // sense for one side (invoiceId / supplierId) implicitly exclude the
    // other; the explicit `kind` filter takes precedence.
    const includeCustomer = (!query.kind || query.kind === "customer") && !query.supplierId
    const includeSupplier = (!query.kind || query.kind === "supplier") && !query.invoiceId

    if (!includeCustomer && !includeSupplier) {
      return { data: [] as UnifiedPaymentRow[], total: 0, limit: query.limit, offset: query.offset }
    }

    const customerConditions = [sql`true`]
    // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    if (query.status) customerConditions.push(sql`p.status = ${query.status}`)
    // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    if (query.paymentMethod) customerConditions.push(sql`p.payment_method = ${query.paymentMethod}`)
    // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    if (query.currency) customerConditions.push(sql`p.currency = ${query.currency}`)
    // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    if (query.invoiceId) customerConditions.push(sql`p.invoice_id = ${query.invoiceId}`)
    // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    if (query.bookingId) customerConditions.push(sql`i.booking_id = ${query.bookingId}`)
    if (query.paymentDateFrom)
      // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      customerConditions.push(sql`p.payment_date >= ${query.paymentDateFrom}`)
    // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    if (query.paymentDateTo) customerConditions.push(sql`p.payment_date <= ${query.paymentDateTo}`)
    // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    if (query.search) customerConditions.push(sql`p.reference_number ILIKE ${`%${query.search}%`}`)
    const customerWhere = sql.join(customerConditions, sql` AND `)

    const supplierConditions = [sql`true`]
    // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    if (query.status) supplierConditions.push(sql`sp.status = ${query.status}`)
    if (query.paymentMethod)
      // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      supplierConditions.push(sql`sp.payment_method = ${query.paymentMethod}`)
    // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    if (query.currency) supplierConditions.push(sql`sp.currency = ${query.currency}`)
    // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    if (query.bookingId) supplierConditions.push(sql`sp.booking_id = ${query.bookingId}`)
    // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    if (query.supplierId) supplierConditions.push(sql`sp.supplier_id = ${query.supplierId}`)
    if (query.paymentDateFrom)
      // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      supplierConditions.push(sql`sp.payment_date >= ${query.paymentDateFrom}`)
    // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    if (query.paymentDateTo) supplierConditions.push(sql`sp.payment_date <= ${query.paymentDateTo}`)
    // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    if (query.search) supplierConditions.push(sql`sp.reference_number ILIKE ${`%${query.search}%`}`)
    const supplierWhere = sql.join(supplierConditions, sql` AND `)

    const customerSelect = sql`
      SELECT
        'customer'::text AS kind,
        p.id AS id,
        p.invoice_id AS invoice_id,
        i.invoice_number AS invoice_number,
        NULL::text AS booking_id,
        NULL::text AS booking_number,
        NULL::text AS supplier_id,
        NULL::text AS supplier_name,
        i.person_id AS person_id,
        pe.first_name AS person_first_name,
        pe.last_name AS person_last_name,
        i.organization_id AS organization_id,
        o.name AS organization_name,
        p.amount_cents AS amount_cents,
        p.currency AS currency,
        p.base_currency AS base_currency,
        p.base_amount_cents AS base_amount_cents,
        p.payment_method::text AS payment_method,
        p.status::text AS status,
        p.reference_number AS reference_number,
        p.payment_date AS payment_date,
        p.notes AS notes,
        p.created_at AS created_at,
        p.updated_at AS updated_at
      FROM payments p
      LEFT JOIN invoices i ON i.id = p.invoice_id
      LEFT JOIN people pe ON pe.id = i.person_id
      LEFT JOIN organizations o ON o.id = i.organization_id
      WHERE ${customerWhere}
    `

    const supplierSelect = sql`
      SELECT
        'supplier'::text AS kind,
        sp.id AS id,
        NULL::text AS invoice_id,
        NULL::text AS invoice_number,
        sp.booking_id AS booking_id,
        b.booking_number AS booking_number,
        sp.supplier_id AS supplier_id,
        s.name AS supplier_name,
        NULL::text AS person_id,
        NULL::text AS person_first_name,
        NULL::text AS person_last_name,
        NULL::text AS organization_id,
        NULL::text AS organization_name,
        sp.amount_cents AS amount_cents,
        sp.currency AS currency,
        sp.base_currency AS base_currency,
        sp.base_amount_cents AS base_amount_cents,
        sp.payment_method::text AS payment_method,
        sp.status::text AS status,
        sp.reference_number AS reference_number,
        sp.payment_date AS payment_date,
        sp.notes AS notes,
        sp.created_at AS created_at,
        sp.updated_at AS updated_at
      FROM supplier_payments sp
      LEFT JOIN bookings b ON b.id = sp.booking_id
      LEFT JOIN suppliers s ON s.id = sp.supplier_id
      WHERE ${supplierWhere}
    `

    const unionParts: (typeof customerSelect)[] = []
    if (includeCustomer) unionParts.push(customerSelect)
    if (includeSupplier) unionParts.push(supplierSelect)
    const unioned = sql.join(unionParts, sql` UNION ALL `)

    const sortColumn = (() => {
      switch (query.sortBy) {
        case "amountCents":
          return sql.raw("amount_cents")
        case "status":
          return sql.raw("status")
        case "paymentDate":
          return sql.raw("payment_date")
        default:
          return sql.raw("created_at")
      }
    })()
    const sortDirSql = query.sortDir === "asc" ? sql.raw("ASC") : sql.raw("DESC")

    const dataResult = await db.execute(sql`
      SELECT * FROM (${unioned}) all_payments
      ORDER BY ${sortColumn} ${sortDirSql}, created_at DESC
      LIMIT ${query.limit}
      OFFSET ${query.offset}
    `)

    const countResult = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM (${unioned}) all_payments
    `)

    const rows = toRows<RawUnifiedPaymentRow>(dataResult)
    const total = toRows<{ count: number }>(countResult)[0]?.count ?? 0
    const data: UnifiedPaymentRow[] = rows.map(mapRawPayment)

    return {
      data,
      total,
      limit: query.limit,
      offset: query.offset,
    }
  },

  /**
   * Resolve a unified payment by id. Dispatches by typeid prefix:
   * `pay_*` lives in `payments` (customer side), `spay_*` in `supplier_payments`.
   * Returns the same enriched row shape as `listAllPayments` so callers can
   * share a single record schema.
   */
  async getPaymentById(db: PostgresJsDatabase, id: string): Promise<UnifiedPaymentRow | null> {
    if (id.startsWith("spay_")) {
      const result = await db.execute(sql`
        SELECT
          'supplier'::text AS kind,
          sp.id AS id,
          NULL::text AS invoice_id,
          NULL::text AS invoice_number,
          sp.booking_id AS booking_id,
          b.booking_number AS booking_number,
          sp.supplier_id AS supplier_id,
          s.name AS supplier_name,
          NULL::text AS person_id,
          NULL::text AS person_first_name,
          NULL::text AS person_last_name,
          NULL::text AS organization_id,
          NULL::text AS organization_name,
          sp.amount_cents AS amount_cents,
          sp.currency AS currency,
          sp.base_currency AS base_currency,
          sp.base_amount_cents AS base_amount_cents,
          sp.payment_method::text AS payment_method,
          sp.status::text AS status,
          sp.reference_number AS reference_number,
          sp.payment_date AS payment_date,
          sp.notes AS notes,
          sp.created_at AS created_at,
          sp.updated_at AS updated_at
        FROM supplier_payments sp
        LEFT JOIN bookings b ON b.id = sp.booking_id
        LEFT JOIN suppliers s ON s.id = sp.supplier_id
        WHERE sp.id = ${id}
        LIMIT 1
      `)
      const row = toRows<RawUnifiedPaymentRow>(result)[0]
      return row ? mapRawPayment(row) : null
    }

    const result = await db.execute(sql`
      SELECT
        'customer'::text AS kind,
        p.id AS id,
        p.invoice_id AS invoice_id,
        i.invoice_number AS invoice_number,
        NULL::text AS booking_id,
        NULL::text AS booking_number,
        NULL::text AS supplier_id,
        NULL::text AS supplier_name,
        i.person_id AS person_id,
        pe.first_name AS person_first_name,
        pe.last_name AS person_last_name,
        i.organization_id AS organization_id,
        o.name AS organization_name,
        p.amount_cents AS amount_cents,
        p.currency AS currency,
        p.base_currency AS base_currency,
        p.base_amount_cents AS base_amount_cents,
        p.payment_method::text AS payment_method,
        p.status::text AS status,
        p.reference_number AS reference_number,
        p.payment_date AS payment_date,
        p.notes AS notes,
        p.created_at AS created_at,
        p.updated_at AS updated_at
      FROM payments p
      LEFT JOIN invoices i ON i.id = p.invoice_id
      LEFT JOIN people pe ON pe.id = i.person_id
      LEFT JOIN organizations o ON o.id = i.organization_id
      WHERE p.id = ${id}
      LIMIT 1
    `)
    const row = toRows<RawUnifiedPaymentRow>(result)[0]
    return row ? mapRawPayment(row) : null
  },

  async createPayment(
    db: PostgresJsDatabase,
    invoiceId: string,
    data: CreatePaymentInput,
    runtime: FinanceServiceRuntime = {},
  ) {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1)

    if (!invoice) {
      return null
    }

    await assertInvoiceAcceptsNewPayment(db, invoice)

    const { idempotencyKey: requestedIdempotencyKey, ...paymentInput } = data
    const paymentData = await resolveFxMoneyBaseAmount(db, paymentInput, {
      ...runtime,
      targetBaseCurrency: invoice.currency,
      fallbackFxRateSetId: invoice.fxRateSetId ?? null,
      date: data.paymentDate,
    })

    assertPaymentCanSettleInvoice(invoice.currency, paymentData)

    const paymentId = newId("payments")

    // Returned from the transaction rather than closed over: a `let` assigned
    // only inside the callback reads as `null` to control-flow analysis
    // afterwards, which silently typed the event as `never` at its use site.
    const { payment, recordedPaymentEvent } = await db.transaction(async (tx) => {
      if (runtime.actionLedgerContext) {
        const ledgerResult = await appendActionLedgerMutation(
          tx,
          await buildRecordPaymentActionLedgerInput(
            runtime.actionLedgerContext,
            {
              invoice,
              payment: {
                ...paymentData,
                id: paymentId,
                invoiceId,
              } as typeof payments.$inferSelect,
            },
            {
              authorizationSource: runtime.actionLedgerAuthorizationSource,
              idempotencyKey: requestedIdempotencyKey,
            },
          ),
        )

        if (ledgerResult.replayed) {
          return {
            payment: await getPaymentFromReplayedLedgerEntry(tx, ledgerResult.entry.id),
            recordedPaymentEvent: null,
          }
        }
      }

      const [payment] = await tx
        .insert(payments)
        .values({
          id: paymentId,
          ...paymentData,
          invoiceId,
          paymentInstrumentId: paymentData.paymentInstrumentId ?? null,
          paymentAuthorizationId: paymentData.paymentAuthorizationId ?? null,
          paymentCaptureId: paymentData.paymentCaptureId ?? null,
        })
        .returning()

      if (!payment) {
        throw new Error("Failed to insert invoice payment")
      }

      const [sumResult] = await tx
        .select({ total: paymentSettlementAmountSql(invoice.currency) })
        .from(payments)
        .where(and(eq(payments.invoiceId, invoiceId), eq(payments.status, "completed")))

      const paidCents = sumResult?.total ?? 0
      if (paidCents > invoice.totalCents) {
        throw new PaymentValidationError(
          "Completed payments cannot exceed the invoice total",
          {
            invoiceId: invoice.id,
            invoiceCurrency: invoice.currency,
            invoiceTotalCents: invoice.totalCents,
            attemptedPaidCents: paidCents,
            excessCents: paidCents - invoice.totalCents,
          },
          { status: 409, code: "invoice_overpaid" },
        )
      }

      const balanceDueCents = Math.max(0, invoice.totalCents - paidCents)

      let newStatus = invoice.status
      if (paidCents >= invoice.totalCents) {
        newStatus = "paid"
      } else if (paidCents > 0) {
        newStatus = "partially_paid"
      }

      await tx
        .update(invoices)
        .set({ paidCents, balanceDueCents, status: newStatus, updatedAt: new Date() })
        .where(eq(invoices.id, invoiceId))
      await touchLinkedBookingUpdatedAt(tx, invoice.bookingId)

      const recordedPaymentEvent: InvoicePaymentRecordedEvent | null =
        payment.status !== "completed"
          ? null
          : {
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              invoiceType: invoice.invoiceType,
              bookingId: invoice.bookingId,
              invoiceCurrency: invoice.currency,
              invoiceTotalCents: invoice.totalCents,
              invoicePaidCents: paidCents,
              invoiceBalanceDueCents: balanceDueCents,
              paymentId: payment.id,
              amountCents: payment.amountCents,
              currency: payment.currency,
              baseCurrency: payment.baseCurrency ?? null,
              baseAmountCents: payment.baseAmountCents ?? null,
              paymentMethod: payment.paymentMethod,
              status: payment.status,
              referenceNumber: payment.referenceNumber ?? null,
              paymentDate: payment.paymentDate,
              occurredAt: new Date().toISOString(),
            }

      return { payment, recordedPaymentEvent }
    })

    if (payment?.status === "completed" && invoice.bookingId) {
      await settleCoveredBookingPaymentSchedules(db, invoice.bookingId)
    }

    if (recordedPaymentEvent) {
      // voyant#4653: booking create records the payments for already-paid
      // schedules on its own transaction and passed no runtime at all, so this
      // never fired and the accounting integration never learned a booking had
      // been paid. It now passes a `domainEventSink`, which lands the event in
      // the same outbox write as the booking.
      await publishFinanceDomainEvent(runtime, {
        name: "invoice.payment.recorded",
        data: recordedPaymentEvent,
        metadata: {
          category: "domain",
          source: "service",
          eventId: `evt_finance_invoice_payment_recorded_${recordedPaymentEvent.paymentId}`,
        },
      })
    }

    return payment
  },

  async updatePayment(
    db: PostgresJsDatabase,
    id: string,
    data: UpdatePaymentInput,
    runtime: FinanceServiceRuntime = {},
  ) {
    const [existing] = await db.select().from(payments).where(eq(payments.id, id)).limit(1)
    if (!existing) {
      return null
    }

    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, existing.invoiceId))
      .limit(1)
    if (!invoice) {
      return null
    }

    // Merge the patch onto the existing row so FX validation sees the
    // post-update settlement shape. Without this, a PATCH that flips a
    // completed payment to a non-invoice currency without supplying a
    // base amount would silently corrupt invoice totals (the row stays
    // "completed" but contributes 0 to paid_cents).
    const merged: UpdatePaymentInput & {
      amountCents: number
      currency: string
      status: typeof existing.status
      paymentDate: string
    } = {
      amountCents: data.amountCents ?? existing.amountCents,
      currency: data.currency ?? existing.currency,
      baseCurrency:
        data.baseCurrency !== undefined ? data.baseCurrency : (existing.baseCurrency ?? null),
      baseAmountCents:
        data.baseAmountCents !== undefined
          ? data.baseAmountCents
          : (existing.baseAmountCents ?? null),
      fxRateSetId:
        data.fxRateSetId !== undefined ? data.fxRateSetId : (existing.fxRateSetId ?? null),
      paymentMethod: data.paymentMethod ?? existing.paymentMethod,
      status: data.status ?? existing.status,
      paymentDate: data.paymentDate ?? existing.paymentDate,
    }

    const normalized = shouldNormalizeBaseAmount(data)
      ? await resolveFxMoneyBaseAmount(db, merged, {
          ...runtime,
          targetBaseCurrency: invoice.currency,
          fallbackFxRateSetId: invoice.fxRateSetId ?? null,
          date: merged.paymentDate,
        })
      : merged

    assertPaymentCanSettleInvoice(invoice.currency, normalized as CreatePaymentInput)

    return db.transaction(async (tx) => {
      const writePatch: Record<string, unknown> = { ...data, updatedAt: new Date() }
      // resolveFxMoneyBaseAmount may have filled in baseCurrency / baseAmountCents /
      // fxRateSetId — persist those even if the caller didn't include them.
      writePatch.baseCurrency = normalized.baseCurrency ?? null
      writePatch.baseAmountCents = normalized.baseAmountCents ?? null
      writePatch.fxRateSetId = normalized.fxRateSetId ?? null

      const [payment] = await tx
        .update(payments)
        .set(writePatch)
        .where(eq(payments.id, id))
        .returning()

      if (!payment) {
        return null
      }

      await assertInvoicePaymentTotalDoesNotExceedInvoice(tx, invoice)
      await recomputeInvoiceTotalsAfterPaymentChange(tx, invoice)
      await touchLinkedBookingUpdatedAt(tx, invoice.bookingId)

      if (runtime.actionLedgerContext) {
        await appendActionLedgerMutation(
          tx,
          buildPaymentUpdateActionLedgerInput(
            runtime.actionLedgerContext,
            { invoice, payment, changes: data },
            { authorizationSource: runtime.actionLedgerAuthorizationSource },
          ),
        )
      }

      return payment
    })
  },

  async deletePayment(db: PostgresJsDatabase, id: string, runtime: FinanceServiceRuntime = {}) {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(payments).where(eq(payments.id, id)).limit(1)
      if (!existing) {
        return null
      }

      const [invoice] = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.id, existing.invoiceId))
        .limit(1)
      if (!invoice) {
        return null
      }

      await tx.delete(payments).where(eq(payments.id, id))

      await recomputeInvoiceTotalsAfterPaymentChange(tx, invoice)
      await touchLinkedBookingUpdatedAt(tx, invoice.bookingId)

      if (runtime.actionLedgerContext) {
        await appendActionLedgerMutation(
          tx,
          buildPaymentDeleteActionLedgerInput(
            runtime.actionLedgerContext,
            { invoice, payment: existing },
            { authorizationSource: runtime.actionLedgerAuthorizationSource },
          ),
        )
      }

      return existing
    })
  },
}
