import { computePaymentSchedule, noDepositPolicy, type PaymentPolicy } from "./payment-policy.js"
import { resolveBookingPaymentPolicy } from "./payment-schedule/booking-policy.js"
import { financePaymentProcessingService } from "./service-payment-processing.js"
import type {
  ApplyDefaultBookingPaymentPlanInput,
  BookingGuaranteeRecord,
  CreateBookingPaymentScheduleInput,
  CreatePaymentSessionFromInvoiceInput,
  CreatePaymentSessionFromScheduleInput,
  FinanceServiceRuntime,
  PostgresJsDatabase,
  UpdateBookingPaymentScheduleInput,
} from "./service-shared.js"
import {
  and,
  appendActionLedgerMutation,
  asc,
  assertBookingPaymentScheduleHasPaymentCoverage,
  bookingGuarantees,
  bookingPaymentSchedules,
  bookings,
  buildBookingGuaranteeCreateActionLedgerInput,
  buildBookingPaymentScheduleCreateActionLedgerInput,
  buildBookingPaymentScheduleDeleteActionLedgerInput,
  buildBookingPaymentScheduleUpdateActionLedgerInput,
  eq,
  invoices,
  or,
  PaymentValidationError,
  parseDateString,
  settleCoveredBookingPaymentSchedules,
  startOfUtcDay,
  toDateString,
  withBookingFinanceInsertionFence,
} from "./service-shared.js"

export interface SettleBookingPaymentSchedulesResult {
  paidSchedules: Array<typeof bookingPaymentSchedules.$inferSelect>
}

type PlanBooking = Pick<
  typeof bookings.$inferSelect,
  "sellAmountCents" | "sellCurrency" | "startDate"
>

/**
 * True when the caller stated deposit terms of its own.
 *
 * Only the three fields that answer "how much, and when is the rest due"
 * count. `clearExistingPending` / `createGuarantee` / `guaranteeType` are about
 * how the rows are written, not about what the customer owes, so they carry
 * their own defaults and do not make a call an override.
 */
function statesDepositTerms(data: ApplyDefaultBookingPaymentPlanInput): boolean {
  return (
    data.depositMode !== undefined ||
    data.depositValue !== undefined ||
    data.balanceDueDaysBeforeStart !== undefined
  )
}

/** The operator's configured policy, via the same primitive checkout reads. */
function policyScheduleRows(
  data: ApplyDefaultBookingPaymentPlanInput,
  booking: PlanBooking,
  policy: PaymentPolicy,
  today: Date,
): CreateBookingPaymentScheduleInput[] {
  const entries = computePaymentSchedule(
    {
      totalCents: booking.sellAmountCents ?? 0,
      currency: booking.sellCurrency,
      departureDate: booking.startDate,
      today,
    },
    policy,
  )

  return entries.map((entry) => {
    const due = parseDateString(entry.dueDate) ?? today
    return {
      bookingItemId: null,
      // The policy primitive's `full` row collapses to `balance` — the DB enum
      // has no `full` variant, and the single full-payment row IS the balance.
      scheduleType: entry.scheduleType === "full" ? "balance" : entry.scheduleType,
      status: due <= today ? "due" : "pending",
      dueDate: entry.dueDate,
      dueTimeZone: "UTC",
      currency: entry.currency,
      amountCents: entry.amountCents,
      notes: data.notes ?? null,
    }
  })
}

/**
 * A plan the caller stated explicitly. Taken literally: no near-departure
 * deposit gate and no balance-due floor, because the caller asked for these
 * terms rather than for the operator's.
 */
function overrideScheduleRows(
  data: ApplyDefaultBookingPaymentPlanInput,
  booking: PlanBooking,
  today: Date,
): CreateBookingPaymentScheduleInput[] {
  const totalAmountCents = booking.sellAmountCents ?? 0
  const depositMode = data.depositMode ?? "none"
  const depositValue = data.depositValue ?? 0
  const balanceDueDaysBeforeStart = data.balanceDueDaysBeforeStart ?? 0

  const depositDueDate = data.depositDueDate ? parseDateString(data.depositDueDate) : today
  const startDate = booking.startDate ? parseDateString(booking.startDate) : null
  const rawBalanceDueDate = startDate
    ? new Date(startDate.getTime() - balanceDueDaysBeforeStart * 24 * 60 * 60 * 1000)
    : today
  const balanceDueDate = rawBalanceDueDate < today ? today : rawBalanceDueDate

  let depositAmountCents = 0
  if (depositMode === "fixed_amount") {
    depositAmountCents = Math.min(totalAmountCents, depositValue)
  } else if (depositMode === "percentage") {
    depositAmountCents = Math.min(
      totalAmountCents,
      Math.round((totalAmountCents * depositValue) / 100),
    )
  }

  if (depositAmountCents > 0 && depositAmountCents < totalAmountCents) {
    return [
      {
        bookingItemId: null,
        scheduleType: "deposit",
        status: (depositDueDate ?? today) <= today ? "due" : "pending",
        dueDate: toDateString(depositDueDate ?? today),
        dueTimeZone: "UTC",
        currency: booking.sellCurrency,
        amountCents: depositAmountCents,
        notes: data.notes ?? null,
      },
      {
        bookingItemId: null,
        scheduleType: "balance",
        status: balanceDueDate <= today ? "due" : "pending",
        dueDate: toDateString(balanceDueDate),
        dueTimeZone: "UTC",
        currency: booking.sellCurrency,
        amountCents: Math.max(0, totalAmountCents - depositAmountCents),
        notes: data.notes ?? null,
      },
    ]
  }

  const singleDueDate = balanceDueDate <= today ? today : balanceDueDate
  return [
    {
      bookingItemId: null,
      scheduleType: "balance",
      status: singleDueDate <= today ? "due" : "pending",
      dueDate: toDateString(singleDueDate),
      dueTimeZone: "UTC",
      currency: booking.sellCurrency,
      amountCents: totalAmountCents,
      notes: data.notes ?? null,
    },
  ]
}

export const financeBookingPaymentScheduleService = {
  listBookingPaymentSchedules(db: PostgresJsDatabase, bookingId: string) {
    return db
      .select()
      .from(bookingPaymentSchedules)
      .where(eq(bookingPaymentSchedules.bookingId, bookingId))
      .orderBy(asc(bookingPaymentSchedules.dueDate), asc(bookingPaymentSchedules.createdAt))
  },

  async createBookingPaymentSchedule(
    db: PostgresJsDatabase,
    bookingId: string,
    data: CreateBookingPaymentScheduleInput,
    runtime: FinanceServiceRuntime = {},
  ) {
    if (data.status === "paid") {
      throw new PaymentValidationError(
        "Create booking payment schedules as pending or due, then settle them through a payment session",
        { bookingId },
      )
    }

    const createSchedule = async (writer: PostgresJsDatabase) => {
      const [booking] = await writer
        .select({ id: bookings.id })
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .limit(1)

      if (!booking) {
        return null
      }

      const [row] = await withBookingFinanceInsertionFence(writer, bookingId, (tx) =>
        tx
          .insert(bookingPaymentSchedules)
          .values({ ...data, bookingId })
          .returning(),
      )

      return row ?? null
    }

    const actionLedgerContext = runtime.actionLedgerContext
    if (actionLedgerContext) {
      return db.transaction(async (tx) => {
        const row = await createSchedule(tx)

        if (row) {
          await appendActionLedgerMutation(
            tx,
            buildBookingPaymentScheduleCreateActionLedgerInput(
              actionLedgerContext,
              { schedule: row },
              { authorizationSource: runtime.actionLedgerAuthorizationSource },
            ),
          )
        }

        return row
      })
    }

    return createSchedule(db)
  },

  /**
   * Persist a payment schedule that was already computed elsewhere
   * (typically by `computePaymentSchedule()` from the policy primitive).
   *
   * Idempotency: when `replace: true` (the default), any existing
   * pending/due schedule rows on the booking are cleared first so a
   * re-fire of the same hook doesn't pile up duplicate rows. Set
   * `replace: false` to insert alongside existing rows (e.g. when
   * inserting a manually-added one-off installment).
   *
   * Skips silently when the booking row doesn't exist (returns
   * `null`) or when there are no entries to persist.
   */
  async applyComputedPaymentSchedule(
    db: PostgresJsDatabase,
    bookingId: string,
    entries: Array<{
      // `"full"` is accepted from the policy primitive and stored as
      // `"balance"` (the DB enum doesn't have a "full" variant).
      scheduleType: "deposit" | "balance" | "installment" | "hold" | "other" | "full"
      amountCents: number
      currency: string
      dueDate: string
      dueTimeZone?: string
      notes?: string | null
    }>,
    options: { replace?: boolean } = {},
  ) {
    if (entries.length === 0) return []

    const [booking] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1)
    if (!booking) return null

    const today = startOfUtcDay(new Date())
    const rows = entries.map((entry) => {
      const due = parseDateString(entry.dueDate) ?? today
      // The `full` schedule kind from the policy primitive collapses
      // to a `balance` row in the DB (the table only has
      // deposit/installment/balance/hold/other) — semantically the
      // single full-payment row IS the balance to settle.
      const persistedType =
        (entry.scheduleType as string) === "full" ? "balance" : entry.scheduleType
      return {
        bookingId,
        bookingItemId: null,
        scheduleType: persistedType as "deposit" | "balance" | "installment" | "hold" | "other",
        status: (due <= today ? "due" : "pending") as "pending" | "due",
        dueDate: entry.dueDate,
        dueTimeZone: entry.dueTimeZone ?? "UTC",
        currency: entry.currency,
        amountCents: Math.max(0, Math.round(entry.amountCents)),
        notes: entry.notes ?? null,
      }
    })

    return withBookingFinanceInsertionFence(db, bookingId, async (tx) => {
      if (options.replace ?? true) {
        await tx
          .delete(bookingPaymentSchedules)
          .where(
            and(
              eq(bookingPaymentSchedules.bookingId, bookingId),
              or(
                eq(bookingPaymentSchedules.status, "pending"),
                eq(bookingPaymentSchedules.status, "due"),
              ),
            ),
          )
      }
      return tx.insert(bookingPaymentSchedules).values(rows).returning()
    })
  },

  /**
   * Materialize a booking's payment plan.
   *
   * Two ways in, and which one applies is decided by what the caller stated:
   *
   *   - **Nothing stated** — the plan comes from the operator's configured
   *     `PaymentPolicy` (resolved through the cascade by the caller and handed
   *     over as `runtime.paymentPolicy`), run through `computePaymentSchedule`.
   *     That is the same primitive `generatePaymentScheduleForBooking` uses, so
   *     the near-departure deposit gate and the balance-due floor apply here
   *     too. An absent policy means `noDepositPolicy` — pay in full — because
   *     an unconfigured operator has not asked for a deposit.
   *   - **Deposit terms stated** — a deliberate per-call override. Kept exactly
   *     as it was: `depositDueDate` is honoured, and the split is taken
   *     literally with no gate and no floor, because the caller asked for this
   *     plan rather than the operator's.
   *
   * Before voyant#4744 there was no first branch: an unstated plan silently
   * meant 30% with the balance 30 days out, contradicting whatever the operator
   * had configured.
   */
  async applyDefaultBookingPaymentPlan(
    db: PostgresJsDatabase,
    bookingId: string,
    data: ApplyDefaultBookingPaymentPlanInput,
    runtime: FinanceServiceRuntime = {},
  ) {
    const applyPlan = (writer: PostgresJsDatabase) =>
      withBookingFinanceInsertionFence(writer, bookingId, async (tx) => {
        const [booking] = await tx
          .select()
          .from(bookings)
          .where(eq(bookings.id, bookingId))
          .limit(1)

        if (!booking) {
          return null
        }

        const totalAmountCents = booking.sellAmountCents ?? 0
        if (totalAmountCents <= 0) {
          return {
            createdSchedules: [],
            deletedSchedules: [],
            createdGuarantee: null,
          }
        }

        const today = startOfUtcDay(new Date())

        const clearableScheduleWhere = and(
          eq(bookingPaymentSchedules.bookingId, bookingId),
          or(
            eq(bookingPaymentSchedules.status, "pending"),
            eq(bookingPaymentSchedules.status, "due"),
          ),
        )

        const deletedSchedules = data.clearExistingPending
          ? await tx.select().from(bookingPaymentSchedules).where(clearableScheduleWhere)
          : []

        if (data.clearExistingPending) {
          await tx.delete(bookingPaymentSchedules).where(clearableScheduleWhere)
        }

        // A caller that stated no deposit terms gets the operator's configured
        // policy. Resolved from the booking row already in hand, through the
        // cascade readers the deployment injected (voyant#4744).
        const scheduleRows = statesDepositTerms(data)
          ? overrideScheduleRows(data, booking, today)
          : policyScheduleRows(
              data,
              booking,
              runtime.paymentPolicyCascade
                ? (await resolveBookingPaymentPolicy(tx, booking, runtime.paymentPolicyCascade))
                    .policy
                : noDepositPolicy,
              today,
            )

        const createdSchedules = await tx
          .insert(bookingPaymentSchedules)
          .values(
            scheduleRows.map((row) => ({
              ...row,
              bookingId,
              bookingItemId: row.bookingItemId ?? null,
              notes: row.notes ?? null,
            })),
          )
          .returning()

        let createdGuarantee: BookingGuaranteeRecord | null = null
        if (data.createGuarantee) {
          const depositSchedule = createdSchedules.find(
            (schedule) => schedule.scheduleType === "deposit",
          )
          if (depositSchedule) {
            const [guarantee] = await tx
              .insert(bookingGuarantees)
              .values({
                bookingId,
                bookingPaymentScheduleId: depositSchedule.id,
                bookingItemId: null,
                guaranteeType: data.guaranteeType,
                status: "pending",
                paymentInstrumentId: null,
                paymentAuthorizationId: null,
                currency: depositSchedule.currency,
                amountCents: depositSchedule.amountCents,
                provider: null,
                referenceNumber: null,
                guaranteedAt: null,
                expiresAt: null,
                releasedAt: null,
                notes: data.notes ?? null,
              })
              .returning()
            createdGuarantee = guarantee ?? null
          }
        }

        return { createdSchedules, deletedSchedules, createdGuarantee }
      })

    const actionLedgerContext = runtime.actionLedgerContext
    if (actionLedgerContext) {
      const result = await db.transaction(async (tx) => {
        const applied = await applyPlan(tx)

        if (!applied) {
          return null
        }

        for (const schedule of applied.deletedSchedules) {
          await appendActionLedgerMutation(
            tx,
            buildBookingPaymentScheduleDeleteActionLedgerInput(
              actionLedgerContext,
              { schedule },
              { authorizationSource: runtime.actionLedgerAuthorizationSource },
            ),
          )
        }

        for (const schedule of applied.createdSchedules) {
          await appendActionLedgerMutation(
            tx,
            buildBookingPaymentScheduleCreateActionLedgerInput(
              actionLedgerContext,
              { schedule },
              { authorizationSource: runtime.actionLedgerAuthorizationSource },
            ),
          )
        }

        if (applied.createdGuarantee) {
          await appendActionLedgerMutation(
            tx,
            await buildBookingGuaranteeCreateActionLedgerInput(
              actionLedgerContext,
              { guarantee: applied.createdGuarantee },
              { authorizationSource: runtime.actionLedgerAuthorizationSource },
            ),
          )
        }

        return applied.createdSchedules
      })

      return result
    }

    const result = await applyPlan(db)
    return result?.createdSchedules ?? null
  },

  async updateBookingPaymentSchedule(
    db: PostgresJsDatabase,
    scheduleId: string,
    data: UpdateBookingPaymentScheduleInput,
    runtime: FinanceServiceRuntime = {},
  ) {
    const updateSchedule = async (writer: PostgresJsDatabase) => {
      const [existing] = await writer
        .select()
        .from(bookingPaymentSchedules)
        .where(eq(bookingPaymentSchedules.id, scheduleId))
        .limit(1)

      if (!existing) {
        return []
      }

      const nextSchedule = {
        id: existing.id,
        bookingId: existing.bookingId,
        amountCents: data.amountCents ?? existing.amountCents,
        currency: data.currency ?? existing.currency,
      }
      const nextStatus = data.status ?? existing.status

      if (nextStatus === "paid") {
        await assertBookingPaymentScheduleHasPaymentCoverage(writer, nextSchedule)
      }

      return writer
        .update(bookingPaymentSchedules)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(bookingPaymentSchedules.id, scheduleId))
        .returning()
    }

    const actionLedgerContext = runtime.actionLedgerContext
    if (actionLedgerContext) {
      const [row] = await db.transaction(async (tx) => {
        const updated = await updateSchedule(tx)

        if (updated[0]) {
          await appendActionLedgerMutation(
            tx,
            buildBookingPaymentScheduleUpdateActionLedgerInput(
              actionLedgerContext,
              { schedule: updated[0], changes: data },
              { authorizationSource: runtime.actionLedgerAuthorizationSource },
            ),
          )
        }

        return updated
      })

      return row ?? null
    }

    const [row] = await updateSchedule(db)
    return row ?? null
  },

  async deleteBookingPaymentSchedule(
    db: PostgresJsDatabase,
    scheduleId: string,
    runtime: FinanceServiceRuntime = {},
  ) {
    const actionLedgerContext = runtime.actionLedgerContext
    if (actionLedgerContext) {
      return db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(bookingPaymentSchedules)
          .where(eq(bookingPaymentSchedules.id, scheduleId))
          .limit(1)

        if (!existing) {
          return null
        }

        await tx.delete(bookingPaymentSchedules).where(eq(bookingPaymentSchedules.id, scheduleId))
        await appendActionLedgerMutation(
          tx,
          buildBookingPaymentScheduleDeleteActionLedgerInput(
            actionLedgerContext,
            { schedule: existing },
            { authorizationSource: runtime.actionLedgerAuthorizationSource },
          ),
        )

        return { id: existing.id }
      })
    }

    const [row] = await db
      .delete(bookingPaymentSchedules)
      .where(eq(bookingPaymentSchedules.id, scheduleId))
      .returning({ id: bookingPaymentSchedules.id })

    return row ?? null
  },

  async createPaymentSessionFromBookingSchedule(
    db: PostgresJsDatabase,
    scheduleId: string,
    data: CreatePaymentSessionFromScheduleInput,
    runtime: FinanceServiceRuntime = {},
  ) {
    const [schedule] = await db
      .select()
      .from(bookingPaymentSchedules)
      .where(eq(bookingPaymentSchedules.id, scheduleId))
      .limit(1)

    if (!schedule) {
      return null
    }

    if (
      schedule.status === "paid" ||
      schedule.status === "waived" ||
      schedule.status === "cancelled"
    ) {
      throw new Error(`Cannot create payment session for schedule in status "${schedule.status}"`)
    }

    return financePaymentProcessingService.createPaymentSession(
      db,
      {
        targetType: "booking_payment_schedule",
        targetId: schedule.id,
        bookingId: schedule.bookingId,
        bookingPaymentScheduleId: schedule.id,
        status: "pending",
        provider: data.provider ?? null,
        externalReference: data.externalReference ?? null,
        idempotencyKey: data.idempotencyKey ?? null,
        clientReference: data.clientReference ?? schedule.id,
        currency: schedule.currency,
        amountCents: schedule.amountCents,
        paymentMethod: data.paymentMethod ?? null,
        payerPersonId: data.payerPersonId ?? null,
        payerOrganizationId: data.payerOrganizationId ?? null,
        payerEmail: data.payerEmail ?? null,
        payerName: data.payerName ?? null,
        returnUrl: data.returnUrl ?? null,
        cancelUrl: data.cancelUrl ?? null,
        callbackUrl: data.callbackUrl ?? null,
        expiresAt: data.expiresAt ?? null,
        notes: data.notes ?? schedule.notes ?? null,
        providerPayload: data.providerPayload ?? null,
        metadata: data.metadata ?? {
          scheduleType: schedule.scheduleType,
          dueDate: schedule.dueDate,
        },
      },
      runtime,
    )
  },

  async createPaymentSessionFromInvoice(
    db: PostgresJsDatabase,
    invoiceId: string,
    data: CreatePaymentSessionFromInvoiceInput,
    runtime: FinanceServiceRuntime = {},
  ) {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1)

    if (!invoice) {
      return null
    }

    if (invoice.status === "paid" || invoice.status === "void") {
      throw new Error(`Cannot create payment session for invoice in status "${invoice.status}"`)
    }

    if (invoice.balanceDueCents <= 0) {
      throw new Error("Invoice must have an outstanding balance before creating a payment session")
    }

    return financePaymentProcessingService.createPaymentSession(
      db,
      {
        targetType: "invoice",
        targetId: invoice.id,
        bookingId: invoice.bookingId,
        invoiceId: invoice.id,
        status: "pending",
        provider: data.provider ?? null,
        externalReference: data.externalReference ?? invoice.invoiceNumber,
        idempotencyKey: data.idempotencyKey ?? null,
        clientReference: data.clientReference ?? invoice.id,
        currency: invoice.currency,
        amountCents: invoice.balanceDueCents,
        paymentMethod: data.paymentMethod ?? null,
        payerPersonId: data.payerPersonId ?? invoice.personId ?? null,
        payerOrganizationId: data.payerOrganizationId ?? invoice.organizationId ?? null,
        payerEmail: data.payerEmail ?? null,
        payerName: data.payerName ?? null,
        returnUrl: data.returnUrl ?? null,
        cancelUrl: data.cancelUrl ?? null,
        callbackUrl: data.callbackUrl ?? null,
        expiresAt: data.expiresAt ?? null,
        notes: data.notes ?? invoice.notes ?? null,
        providerPayload: data.providerPayload ?? null,
        metadata: data.metadata ?? {
          invoiceNumber: invoice.invoiceNumber,
          invoiceType: invoice.invoiceType,
          dueDate: invoice.dueDate,
        },
      },
      runtime,
    )
  },

  async settleCoveredBookingPaymentSchedules(
    db: PostgresJsDatabase,
    bookingId: string,
  ): Promise<SettleBookingPaymentSchedulesResult> {
    return { paidSchedules: await settleCoveredBookingPaymentSchedules(db, bookingId) }
  },
}
