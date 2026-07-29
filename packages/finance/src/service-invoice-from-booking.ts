import { financeInvoiceNumberingService } from "./service-invoice-numbering.js"
import type {
  CreateInvoiceFromBookingInput,
  FinanceServiceRuntime,
  InvoiceFromBookingData,
  InvoiceFromBookingPaymentScheduleData,
  PostgresJsDatabase,
} from "./service-shared.js"
import {
  asc,
  assertInvoiceFromBookingOverrideTotals,
  bookingItemCommissions,
  bookingItemTaxLines,
  bookingItemToInvoiceLine,
  bookingPaymentSchedules,
  bookingPaymentScheduleToInvoiceLine,
  eq,
  InvoiceFromBookingValidationError,
  InvoiceLineItemsPersistenceError,
  InvoiceNumberAllocationError,
  InvoiceNumberConflictError,
  invoiceExternalRefs,
  invoiceFromBookingExternalRefValues,
  invoiceFromBookingOverrideLineItems,
  invoiceLineItems,
  invoiceScopeForType,
  invoices,
  isInvoiceNumberUniqueConstraintError,
  normalizeCurrencyCode,
  or,
  pendingExternalInvoiceNumber,
  resolveBookingInvoiceBaseAmount,
  resolveFxMoneyBaseAmount,
  resolveInvoiceFromBookingDueDate,
  resolveInvoiceLineDescriptions,
  resolvePaymentScheduleDisplayItem,
  touchLinkedBookingUpdatedAt,
  withBookingFinanceInsertionFence,
} from "./service-shared.js"

function allocateScheduleAmountCents(
  totalAmountCents: number,
  schedules: InvoiceFromBookingPaymentScheduleData[],
  selectedScheduleId: string,
): number {
  const weightedSchedules = schedules
    .filter((schedule) => schedule.amountCents > 0)
    .map((schedule) => ({ schedule, weight: BigInt(schedule.amountCents) }))
  const selected = weightedSchedules.find(({ schedule }) => schedule.id === selectedScheduleId)
  const totalWeight = weightedSchedules.reduce((sum, entry) => sum + entry.weight, 0n)
  if (!selected || totalWeight <= 0n || totalAmountCents === 0) return 0

  const sign = totalAmountCents < 0 ? -1 : 1
  const unsignedTotal = BigInt(Math.abs(totalAmountCents))
  const allocations = weightedSchedules.map(({ schedule, weight }) => {
    const numerator = unsignedTotal * weight
    return {
      schedule,
      amount: numerator / totalWeight,
      remainder: numerator % totalWeight,
    }
  })
  let undistributed = Number(
    unsignedTotal - allocations.reduce((sum, allocation) => sum + allocation.amount, 0n),
  )
  allocations.sort((left, right) => {
    if (left.remainder !== right.remainder) {
      return left.remainder > right.remainder ? -1 : 1
    }
    return left.schedule.id.localeCompare(right.schedule.id)
  })
  for (const allocation of allocations) {
    if (undistributed <= 0) break
    allocation.amount += 1n
    undistributed -= 1
  }

  const allocation = allocations.find(({ schedule }) => schedule.id === selectedScheduleId)
  return sign * Number(allocation?.amount ?? 0n)
}

async function resolveInvoiceNumberForBooking(
  db: PostgresJsDatabase,
  data: CreateInvoiceFromBookingInput,
): Promise<{
  invoiceNumber: string
  seriesId: string | null
  sequence: number | null
  status: "draft" | "pending_external_allocation"
}> {
  const scope = invoiceScopeForType(data.invoiceType)
  if (data.invoiceNumber) {
    return {
      invoiceNumber: data.invoiceNumber,
      seriesId: data.seriesId ?? null,
      sequence: null,
      status: "draft",
    }
  }

  const series = data.seriesId
    ? await financeInvoiceNumberingService.getInvoiceNumberSeriesById(db, data.seriesId)
    : await financeInvoiceNumberingService.resolveDefaultInvoiceNumberSeries(db, scope)

  if (!series) {
    throw new InvoiceNumberAllocationError(
      data.seriesId ? "invoice_number_series_not_found" : "no_active_series_for_scope",
      { scope, seriesId: data.seriesId },
    )
  }
  if (!series.active) {
    throw new InvoiceNumberAllocationError("invoice_number_series_inactive", {
      scope,
      seriesId: series.id,
    })
  }
  if (series.scope !== scope) {
    throw new InvoiceNumberAllocationError("invoice_number_series_scope_mismatch", {
      scope,
      seriesId: series.id,
    })
  }

  if (series.externalProvider) {
    return {
      invoiceNumber: pendingExternalInvoiceNumber(scope),
      seriesId: series.id,
      sequence: null,
      status: "pending_external_allocation",
    }
  }

  const allocated = await financeInvoiceNumberingService.allocateInvoiceNumber(db, series.id)
  if (allocated.status === "not_found") {
    throw new InvoiceNumberAllocationError("invoice_number_series_not_found", {
      scope,
      seriesId: series.id,
    })
  }
  if (allocated.status === "inactive") {
    throw new InvoiceNumberAllocationError("invoice_number_series_inactive", {
      scope,
      seriesId: series.id,
    })
  }

  return {
    invoiceNumber: allocated.formattedNumber,
    seriesId: allocated.seriesId,
    sequence: allocated.sequence,
    status: "draft",
  }
}

export const financeInvoiceFromBookingService = {
  async createInvoiceFromBooking(
    db: PostgresJsDatabase,
    data: CreateInvoiceFromBookingInput,
    bookingData: InvoiceFromBookingData,
    runtime: FinanceServiceRuntime = {},
  ) {
    const { booking, items, paymentSchedule } = bookingData
    const invoiceDueDate = await resolveInvoiceFromBookingDueDate(data, bookingData, runtime)
    const requestedCurrency = normalizeCurrencyCode(data.currency)
    const bookingSellCurrency = normalizeCurrencyCode(booking.sellCurrency) ?? booking.sellCurrency
    const invoiceCurrency =
      requestedCurrency ?? normalizeCurrencyCode(paymentSchedule?.currency) ?? bookingSellCurrency
    const requestedBaseCurrency = normalizeCurrencyCode(data.baseCurrency)
    const hasCrossCurrencyOverride =
      requestedCurrency !== null && requestedCurrency !== bookingSellCurrency

    if (
      hasCrossCurrencyOverride &&
      (!requestedBaseCurrency || requestedBaseCurrency !== bookingSellCurrency)
    ) {
      throw new InvoiceFromBookingValidationError(
        "Cross-currency invoice overrides require baseCurrency to match the booking sell currency",
        {
          currency: invoiceCurrency,
          baseCurrency: requestedBaseCurrency,
          bookingSellCurrency,
        },
      )
    }

    const overrideLineItems = data.lineItems
      ? invoiceFromBookingOverrideLineItems(data.lineItems)
      : null

    if (hasCrossCurrencyOverride && !overrideLineItems) {
      throw new InvoiceFromBookingValidationError(
        "Cross-currency invoice overrides require replacement line items",
        {
          currency: invoiceCurrency,
          baseCurrency: requestedBaseCurrency,
          bookingSellCurrency,
          fields: ["lineItems"],
        },
      )
    }

    const shouldUseBookingItems = overrideLineItems === null && !paymentSchedule
    const invoiceItems = shouldUseBookingItems ? items : []
    const taxSourceItems = overrideLineItems ? [] : paymentSchedule ? items : invoiceItems
    const itemIds = taxSourceItems.map((item) => item.id)
    const commissionItemIds = invoiceItems.map((item) => item.id)

    const taxes =
      itemIds.length === 0
        ? []
        : await db
            .select()
            .from(bookingItemTaxLines)
            .where(or(...itemIds.map((id) => eq(bookingItemTaxLines.bookingItemId, id))))
            .orderBy(
              asc(bookingItemTaxLines.bookingItemId),
              asc(bookingItemTaxLines.sortOrder),
              asc(bookingItemTaxLines.createdAt),
              asc(bookingItemTaxLines.id),
            )

    const commissions =
      commissionItemIds.length === 0
        ? []
        : await db
            .select()
            .from(bookingItemCommissions)
            .where(
              or(...commissionItemIds.map((id) => eq(bookingItemCommissions.bookingItemId, id))),
            )

    const taxesByBookingItemId = new Map<string, typeof taxes>()
    for (const tax of taxes) {
      const existing = taxesByBookingItemId.get(tax.bookingItemId) ?? []
      existing.push(tax)
      taxesByBookingItemId.set(tax.bookingItemId, existing)
    }

    const scheduleItem = paymentSchedule
      ? resolvePaymentScheduleDisplayItem(paymentSchedule, items)
      : undefined
    const paymentScheduleLineDescriptionFormat =
      data.paymentScheduleLineDescriptionFormat ??
      runtime.paymentScheduleLineDescriptionFormat ??
      "schedule_first"
    const resolvedLineItems =
      overrideLineItems ??
      (paymentSchedule
        ? [
            bookingPaymentScheduleToInvoiceLine(
              booking,
              paymentSchedule,
              scheduleItem,
              paymentScheduleLineDescriptionFormat,
            ),
          ]
        : invoiceItems.length > 0
          ? invoiceItems.map((item, sortOrder) => ({
              ...bookingItemToInvoiceLine(item, taxesByBookingItemId.get(item.id) ?? [], sortOrder),
            }))
          : [
              {
                bookingItemId: null as string | null,
                bookingPaymentScheduleId: null as string | null,
                description: `Booking ${booking.bookingNumber}`,
                quantity: 1,
                unitPriceCents: booking.sellAmountCents ?? 0,
                totalCents: booking.sellAmountCents ?? 0,
                taxAmountCents: 0,
                taxRate: null,
                sortOrder: 0,
              },
            ])
    const lineItems = await resolveInvoiceLineDescriptions(resolvedLineItems, {
      booking,
      paymentSchedule,
      items,
      descriptionResolver: runtime.descriptionResolver,
    })

    const grossLineTotalCents = lineItems.reduce((sum, line) => sum + line.totalCents, 0)
    const scheduleAllocationRows = paymentSchedule
      ? (bookingData.paymentSchedules ??
        (await db
          .select()
          .from(bookingPaymentSchedules)
          .where(eq(bookingPaymentSchedules.bookingId, booking.id))
          .orderBy(
            asc(bookingPaymentSchedules.dueDate),
            asc(bookingPaymentSchedules.createdAt),
            asc(bookingPaymentSchedules.id),
          )))
      : []
    const scheduleRowsInBookingCurrency = paymentSchedule
      ? await Promise.all(
          scheduleAllocationRows.map(async (schedule) => {
            const scheduleCurrency = normalizeCurrencyCode(schedule.currency)
            if (scheduleCurrency === bookingSellCurrency) return schedule
            const converted = await resolveFxMoneyBaseAmount(
              db,
              {
                amountCents: schedule.amountCents,
                currency: scheduleCurrency,
                baseCurrency: bookingSellCurrency,
                baseAmountCents: null,
                fxRateSetId: data.fxRateSetId ?? booking.fxRateSetId ?? null,
              },
              {
                ...runtime,
                targetBaseCurrency: bookingSellCurrency,
                fallbackFxRateSetId: data.fxRateSetId ?? booking.fxRateSetId ?? null,
                date: data.issueDate,
                setBaseCurrencyWhenUnresolved: true,
              },
            )
            if (converted.baseAmountCents === null || converted.baseAmountCents === undefined) {
              throw new InvoiceFromBookingValidationError(
                "Mixed-currency payment schedule tax requires resolvable exchange rates",
                {
                  scheduleCurrency,
                  bookingSellCurrency,
                  fxRateSetId: data.fxRateSetId ?? booking.fxRateSetId ?? null,
                },
              )
            }
            return { ...schedule, amountCents: converted.baseAmountCents }
          }),
        )
      : []
    const allocateScheduleTaxInBookingCurrency = (amountCents: number) => {
      if (!paymentSchedule) return amountCents
      return allocateScheduleAmountCents(
        amountCents,
        scheduleRowsInBookingCurrency.length > 0
          ? scheduleRowsInBookingCurrency
          : [paymentSchedule],
        paymentSchedule.id,
      )
    }
    const convertBookingTaxToInvoiceCurrency = async (amountCents: number) => {
      if (amountCents === 0 || bookingSellCurrency === invoiceCurrency) return amountCents
      const converted = await resolveFxMoneyBaseAmount(
        db,
        {
          amountCents,
          currency: bookingSellCurrency,
          baseCurrency: invoiceCurrency,
          baseAmountCents: null,
          fxRateSetId: data.fxRateSetId ?? booking.fxRateSetId ?? null,
        },
        {
          ...runtime,
          targetBaseCurrency: invoiceCurrency,
          fallbackFxRateSetId: data.fxRateSetId ?? booking.fxRateSetId ?? null,
          date: data.issueDate,
          setBaseCurrencyWhenUnresolved: true,
        },
      )
      if (converted.baseAmountCents === null || converted.baseAmountCents === undefined) {
        throw new InvoiceFromBookingValidationError(
          "Cross-currency payment schedule tax requires a resolvable exchange rate",
          {
            bookingSellCurrency,
            invoiceCurrency,
            fxRateSetId: data.fxRateSetId ?? booking.fxRateSetId ?? null,
          },
        )
      }
      return converted.baseAmountCents
    }
    const bookingIncludedTaxCents = taxes.reduce((sum, tax) => {
      if (tax.scope === "withheld" || !tax.includedInPrice) return sum
      return sum + tax.amountCents
    }, 0)
    const bookingExcludedTaxCents = taxes.reduce((sum, tax) => {
      if (tax.scope === "withheld" || tax.includedInPrice) return sum
      return sum + tax.amountCents
    }, 0)
    const { includedTaxCents, excludedTaxCents } = overrideLineItems
      ? {
          includedTaxCents: 0,
          excludedTaxCents: overrideLineItems.reduce((sum, line) => sum + line.taxAmountCents, 0),
        }
      : paymentSchedule
        ? {
            // A schedule amount is already gross of both tax kinds. Convert and
            // allocate their combined amount once so indivisible cents cannot
            // be awarded twice to the same installment.
            includedTaxCents: await convertBookingTaxToInvoiceCurrency(
              allocateScheduleTaxInBookingCurrency(
                bookingIncludedTaxCents + bookingExcludedTaxCents,
              ),
            ),
            excludedTaxCents: 0,
          }
        : {
            includedTaxCents: await convertBookingTaxToInvoiceCurrency(bookingIncludedTaxCents),
            excludedTaxCents: await convertBookingTaxToInvoiceCurrency(bookingExcludedTaxCents),
          }
    // Payment schedule amounts are portions of the persisted booking total and
    // therefore already include excluded tax. Remove that tax from the schedule
    // line's gross amount before adding it back to the invoice total.
    const subtotalCents = Math.max(0, grossLineTotalCents - includedTaxCents)
    const taxCents = includedTaxCents + excludedTaxCents
    const totalCents = subtotalCents + taxCents
    assertInvoiceFromBookingOverrideTotals(data, { subtotalCents, taxCents, totalCents })
    const commissionAmountCents = overrideLineItems
      ? 0
      : commissions.reduce((sum, commission) => {
          return sum + (commission.amountCents ?? 0)
        }, 0)

    // The `ck_invoices_base_currency_amounts` constraint requires
    // that whenever ANY base_*_cents column is non-null, base_currency
    // must be set too. Resolve the base side once and propagate nulls
    // consistently when no booking/runtime base currency is available.
    const bookingBaseAmountCents = paymentSchedule
      ? resolveBookingInvoiceBaseAmount(booking, invoiceCurrency, paymentSchedule.amountCents)
      : (booking.baseSellAmountCents ?? null)
    const invoiceBaseCurrency = requestedBaseCurrency ?? booking.baseCurrency ?? null
    const invoiceFxRateSetId = data.fxRateSetId ?? booking.fxRateSetId ?? null
    const resolvedInvoiceBase = await resolveFxMoneyBaseAmount(
      db,
      {
        amountCents: totalCents,
        currency: invoiceCurrency,
        baseCurrency: invoiceBaseCurrency,
        baseAmountCents: hasCrossCurrencyOverride ? null : bookingBaseAmountCents,
        fxRateSetId: invoiceFxRateSetId,
      },
      {
        ...runtime,
        targetBaseCurrency: invoiceBaseCurrency,
        fallbackFxRateSetId: invoiceFxRateSetId,
        date: data.issueDate,
        setBaseCurrencyWhenUnresolved: Boolean(invoiceBaseCurrency),
      },
    )
    const resolvedBaseCurrency = resolvedInvoiceBase.baseCurrency ?? null
    const invoiceBaseAmountCents = resolvedInvoiceBase.baseAmountCents ?? null
    const hasBaseCurrency = Boolean(resolvedBaseCurrency)

    if (hasCrossCurrencyOverride && invoiceBaseAmountCents === null) {
      throw new InvoiceFromBookingValidationError(
        "Cross-currency invoice overrides require a resolvable base total",
        {
          currency: invoiceCurrency,
          baseCurrency: requestedBaseCurrency,
          fxRateSetId: invoiceFxRateSetId,
        },
      )
    }

    let attemptedInvoiceNumber = data.invoiceNumber ?? null

    try {
      return await withBookingFinanceInsertionFence(db, booking.id, async (tx) => {
        // Local series allocation must share the fenced insert transaction so
        // a rejected/failed invoice rolls the sequence advance back as well.
        const numberAssignment = await resolveInvoiceNumberForBooking(tx, data)
        attemptedInvoiceNumber = numberAssignment.invoiceNumber
        const [invoice] = await tx
          .insert(invoices)
          .values({
            invoiceNumber: numberAssignment.invoiceNumber,
            invoiceType: data.invoiceType,
            convertedFromInvoiceId: data.convertedFromInvoiceId ?? null,
            seriesId: numberAssignment.seriesId,
            sequence: numberAssignment.sequence,
            bookingId: booking.id,
            personId: booking.personId,
            organizationId: booking.organizationId,
            status: numberAssignment.status,
            currency: invoiceCurrency,
            baseCurrency: resolvedBaseCurrency,
            fxRateSetId: resolvedInvoiceBase.fxRateSetId ?? null,
            subtotalCents,
            baseSubtotalCents: hasBaseCurrency ? invoiceBaseAmountCents : null,
            taxCents,
            baseTaxCents: null,
            totalCents,
            baseTotalCents: hasBaseCurrency ? invoiceBaseAmountCents : null,
            paidCents: 0,
            basePaidCents: hasBaseCurrency ? 0 : null,
            balanceDueCents: totalCents,
            baseBalanceDueCents: hasBaseCurrency ? invoiceBaseAmountCents : null,
            commissionAmountCents: commissionAmountCents > 0 ? commissionAmountCents : null,
            issueDate: data.issueDate,
            dueDate: invoiceDueDate,
            notes: data.notes ?? null,
          })
          .returning()

        if (!invoice) {
          return null
        }

        if (data.externalRefs?.length) {
          await tx
            .insert(invoiceExternalRefs)
            .values(invoiceFromBookingExternalRefValues(invoice.id, data.externalRefs))
        }

        const lineItemValues = lineItems.map((line) => ({
          invoiceId: invoice.id,
          bookingItemId: line.bookingItemId,
          bookingPaymentScheduleId: line.bookingPaymentScheduleId,
          description: line.description,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          totalCents: line.totalCents,
          taxRate: line.taxRate,
          sortOrder: line.sortOrder,
        }))
        const insertedLineItems = await tx
          .insert(invoiceLineItems)
          .values(lineItemValues)
          .returning({ id: invoiceLineItems.id })
        if (insertedLineItems.length !== lineItemValues.length) {
          throw new InvoiceLineItemsPersistenceError(
            invoice.id,
            lineItemValues.length,
            insertedLineItems.length,
          )
        }

        await touchLinkedBookingUpdatedAt(tx, booking.id)

        return invoice
      })
    } catch (error) {
      if (isInvoiceNumberUniqueConstraintError(error)) {
        throw new InvoiceNumberConflictError(attemptedInvoiceNumber ?? "unknown")
      }
      throw error
    }
  },
}
