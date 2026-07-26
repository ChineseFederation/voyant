import { bookingItems, bookings, bookingTravelers } from "@voyant-travel/bookings"
import { and, asc, desc, eq, gt, inArray } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import {
  type BootstrappedCheckoutCollection,
  buildBankTransferInstructions,
  type CheckoutCollectionPlan,
  type CheckoutNotificationDelivery,
  type CheckoutPolicyOptions,
  type CheckoutProviderStartResult,
  type CheckoutRuntimeOptions,
  defaultPaymentPlan,
  fallbackInvoiceNumber,
  type InitiatedCheckoutCollection,
  type LoadedBookingContext,
  lineDescription,
  normalizeExactAmountCents,
  OUTSTANDING_INVOICE_STATUSES,
  OUTSTANDING_SCHEDULE_STATUSES,
  resolveCheckoutIntent,
  resolveCheckoutSubject,
  resolveDocumentType,
  resolvePaymentSessionTarget,
} from "./checkout-service-plan.js"
import type {
  BootstrapCheckoutCollectionInput,
  CheckoutBankTransferInstructionsRecord,
  InitiateCheckoutCollectionInput,
  PreviewCheckoutCollectionInput,
} from "./checkout-validation.js"
import {
  bookingPaymentSchedules,
  invoiceLineItems,
  invoiceNumberSeries,
  invoices,
  type PaymentSession,
  paymentSessions,
} from "./schema.js"
import { financeService } from "./service.js"

export {
  type BootstrappedCheckoutCollection,
  type CheckoutBankTransferDetails,
  type CheckoutCollectionPlan,
  type CheckoutNotificationDelivery,
  type CheckoutNotificationDispatcher,
  type CheckoutPaymentStarter,
  type CheckoutPaymentStarterContext,
  type CheckoutPolicyOptions,
  type CheckoutProviderStartResult,
  type CheckoutRuntimeOptions,
  type InitiatedCheckoutCollection,
  resolveDocumentType,
  resolvePaymentSessionTarget,
} from "./checkout-service-plan.js"
export type {
  BootstrapCheckoutCollectionInput,
  BootstrappedCheckoutCollectionRecord,
  CheckoutCollectionPlanRecord,
  InitiateCheckoutCollectionInput,
  InitiatedCheckoutCollectionRecord,
  PreviewCheckoutCollectionInput,
} from "./checkout-validation.js"

async function loadBookingContext(
  db: PostgresJsDatabase,
  bookingId: string,
): Promise<LoadedBookingContext | null> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1)
  if (!booking) return null

  const [items, participants, schedules, outstandingInvoices] = await Promise.all([
    db
      .select()
      .from(bookingItems)
      .where(eq(bookingItems.bookingId, bookingId))
      .orderBy(bookingItems.createdAt),
    db
      .select()
      .from(bookingTravelers)
      .where(eq(bookingTravelers.bookingId, bookingId))
      .orderBy(desc(bookingTravelers.isPrimary), bookingTravelers.createdAt),
    db
      .select()
      .from(bookingPaymentSchedules)
      .where(
        and(
          eq(bookingPaymentSchedules.bookingId, bookingId),
          inArray(bookingPaymentSchedules.status, OUTSTANDING_SCHEDULE_STATUSES),
        ),
      )
      .orderBy(asc(bookingPaymentSchedules.dueDate), asc(bookingPaymentSchedules.createdAt)),
    db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.bookingId, bookingId),
          inArray(invoices.status, OUTSTANDING_INVOICE_STATUSES),
          gt(invoices.balanceDueCents, 0),
        ),
      )
      .orderBy(desc(invoices.createdAt)),
  ])

  return {
    booking,
    items,
    participants,
    schedules,
    outstandingInvoices,
  }
}

async function ensurePaymentPlanIfNeeded(
  db: PostgresJsDatabase,
  bookingId: string,
  existingSchedules: Array<typeof bookingPaymentSchedules.$inferSelect>,
  input: PreviewCheckoutCollectionInput | InitiateCheckoutCollectionInput,
  options: CheckoutPolicyOptions,
) {
  if (existingSchedules.length > 0 || !input.ensureDefaultPaymentPlan) {
    return existingSchedules
  }

  const created = await financeService.applyDefaultBookingPaymentPlan(db, bookingId, {
    ...defaultPaymentPlan(options),
    ...(input.paymentPlan ?? {}),
  })

  return created ?? []
}

async function allocateDocumentNumber(
  db: PostgresJsDatabase,
  bookingNumber: string,
  documentType: "proforma" | "invoice",
  amountCents: number,
) {
  const [series] = await db
    .select()
    .from(invoiceNumberSeries)
    .where(eq(invoiceNumberSeries.scope, documentType))
    .orderBy(desc(invoiceNumberSeries.active), asc(invoiceNumberSeries.createdAt))
    .limit(1)

  if (!series) {
    return fallbackInvoiceNumber(bookingNumber, documentType, amountCents)
  }

  const allocated = await financeService.allocateInvoiceNumber(db, series.id)
  if (allocated.status === "allocated") {
    return allocated.formattedNumber
  }

  return fallbackInvoiceNumber(bookingNumber, documentType, amountCents)
}

function pickSchedule(
  schedules: Array<typeof bookingPaymentSchedules.$inferSelect>,
  scheduleId?: string,
) {
  if (scheduleId) {
    return schedules.find((schedule) => schedule.id === scheduleId) ?? null
  }
  return schedules[0] ?? null
}

function pickInvoice(outstandingInvoices: Array<typeof invoices.$inferSelect>, invoiceId?: string) {
  if (invoiceId) {
    return outstandingInvoices.find((invoice) => invoice.id === invoiceId) ?? null
  }
  return outstandingInvoices[0] ?? null
}

export async function previewCheckoutCollection(
  db: PostgresJsDatabase,
  bookingId: string,
  input: PreviewCheckoutCollectionInput,
  options: CheckoutPolicyOptions = {},
): Promise<CheckoutCollectionPlan | null> {
  const context = await loadBookingContext(db, bookingId)
  if (!context) return null

  const schedules = await ensurePaymentPlanIfNeeded(
    db,
    bookingId,
    context.schedules,
    input,
    options,
  )

  let paymentSessionTarget = resolvePaymentSessionTarget(
    input.method,
    input.stage,
    input.paymentSessionTarget,
    options,
  )
  let documentType = resolveDocumentType(input.method, paymentSessionTarget, options)
  let selectedSchedule = pickSchedule(schedules, input.scheduleId)
  let selectedInvoice = pickInvoice(context.outstandingInvoices, input.invoiceId)
  const requestedAmountCents = normalizeExactAmountCents(input.amountCents)

  let amountCents = 0
  if (requestedAmountCents !== null) {
    amountCents = requestedAmountCents

    if (
      paymentSessionTarget === "schedule" &&
      selectedSchedule &&
      selectedSchedule.amountCents === requestedAmountCents
    ) {
      selectedInvoice = null
    } else {
      paymentSessionTarget = "invoice"
      documentType = resolveDocumentType(input.method, paymentSessionTarget, options)
      selectedInvoice =
        selectedInvoice && selectedInvoice.balanceDueCents === requestedAmountCents
          ? selectedInvoice
          : null
      selectedSchedule = null
    }
  } else if (paymentSessionTarget === "invoice") {
    amountCents =
      selectedInvoice?.balanceDueCents ??
      selectedSchedule?.amountCents ??
      context.booking.sellAmountCents ??
      0
  } else if (paymentSessionTarget === "schedule") {
    amountCents = selectedSchedule?.amountCents ?? context.booking.sellAmountCents ?? 0
  }

  let recommendedAction: CheckoutCollectionPlan["recommendedAction"] = "none"
  if (input.method === "bank_transfer") {
    recommendedAction = "create_bank_transfer_document"
  } else if (paymentSessionTarget === "invoice") {
    recommendedAction = selectedInvoice
      ? "create_payment_session"
      : "create_invoice_then_payment_session"
  } else if (paymentSessionTarget === "schedule") {
    recommendedAction = "create_payment_session"
  }

  return {
    bookingId,
    method: input.method,
    stage: input.stage,
    paymentSessionTarget,
    documentType,
    willCreateDefaultPaymentPlan: context.schedules.length === 0 && schedules.length > 0,
    selectedSchedule,
    selectedInvoice,
    amountCents,
    currency: context.booking.sellCurrency,
    recommendedAction,
  }
}

async function createCollectionInvoice(
  db: PostgresJsDatabase,
  context: LoadedBookingContext,
  plan: CheckoutCollectionPlan,
  notes?: string | null,
) {
  const amountCents = plan.amountCents
  const currency = plan.currency
  // Base FX columns only make sense when the document is in the booking sell
  // currency. Schedule-targeted collections may charge a different currency;
  // leave base amounts null rather than stamping an incorrect FX equivalent.
  const alignsWithBookingSell = currency === context.booking.sellCurrency
  const issueDate = new Date().toISOString().slice(0, 10)
  const dueDate = plan.selectedSchedule?.dueDate ?? issueDate
  const documentType = plan.documentType ?? "invoice"
  const invoiceNumber = await allocateDocumentNumber(
    db,
    context.booking.bookingNumber,
    documentType,
    amountCents,
  )

  const [invoice] = await db
    .insert(invoices)
    .values({
      invoiceNumber,
      bookingId: context.booking.id,
      personId: context.booking.personId,
      organizationId: context.booking.organizationId,
      invoiceType: documentType,
      status: "issued",
      currency,
      baseCurrency: alignsWithBookingSell ? context.booking.baseCurrency : null,
      fxRateSetId: null,
      subtotalCents: amountCents,
      baseSubtotalCents: alignsWithBookingSell ? context.booking.baseSellAmountCents : null,
      taxCents: 0,
      baseTaxCents: null,
      totalCents: amountCents,
      baseTotalCents: alignsWithBookingSell ? context.booking.baseSellAmountCents : null,
      paidCents: 0,
      basePaidCents: alignsWithBookingSell && context.booking.baseCurrency != null ? 0 : null,
      balanceDueCents: amountCents,
      baseBalanceDueCents: alignsWithBookingSell ? context.booking.baseSellAmountCents : null,
      commissionAmountCents: null,
      issueDate,
      dueDate,
      notes: notes ?? plan.selectedSchedule?.notes ?? null,
    })
    .returning()

  if (!invoice) {
    throw new Error("Failed to create collection invoice")
  }

  await db.insert(invoiceLineItems).values({
    invoiceId: invoice.id,
    bookingItemId: plan.selectedSchedule?.bookingItemId ?? null,
    description: lineDescription(context.booking, plan.selectedSchedule, plan.stage),
    quantity: 1,
    unitPriceCents: amountCents,
    totalCents: amountCents,
    taxRate: null,
    sortOrder: 0,
  })

  return invoice
}

export async function initiateCheckoutCollection(
  db: PostgresJsDatabase,
  bookingId: string,
  input: InitiateCheckoutCollectionInput,
  options: CheckoutPolicyOptions = {},
  runtime: CheckoutRuntimeOptions = {},
): Promise<InitiatedCheckoutCollection | null> {
  let providerStarter: NonNullable<CheckoutRuntimeOptions["selectedPaymentStarter"]> | null = null

  if (input.startProvider) {
    if (input.method !== "card") {
      throw new Error("Provider start is only available for card collections")
    }

    // Resolve deployment-owned processor readiness before any checkout read
    // that may materialize a default payment plan. Processor selection is
    // exclusively deployment-owned. A missing adapter is a zero-mutation
    // failure.
    providerStarter = runtime.selectedPaymentStarter ?? null
    if (!providerStarter) {
      throw new Error("No payment adapter is selected for card collection")
    }
  }

  const context = await loadBookingContext(db, bookingId)
  if (!context) return null

  const plan = await previewCheckoutCollection(db, bookingId, input, options)
  if (!plan) return null
  if (plan.amountCents <= 0) {
    throw new Error("No outstanding amount available for collection")
  }

  let invoice = plan.selectedInvoice
  let paymentSession: PaymentSession | null = null
  let invoiceNotification: CheckoutNotificationDelivery | null = null
  let paymentSessionNotification: CheckoutNotificationDelivery | null = null
  let bankTransferInstructions: CheckoutBankTransferInstructionsRecord | null = null
  let providerStart: CheckoutProviderStartResult | null = null

  if (input.method === "bank_transfer") {
    invoice = await createCollectionInvoice(db, context, plan, input.notes ?? null)
    bankTransferInstructions = buildBankTransferInstructions(
      invoice,
      runtime.bankTransferDetails ?? null,
      input.notes ?? null,
    )

    if (runtime.notificationDispatcher?.sendInvoiceNotification && input.invoiceNotification) {
      invoiceNotification = await runtime.notificationDispatcher.sendInvoiceNotification(
        db,
        invoice.id,
        input.invoiceNotification,
        { paymentLinkBaseUrl: runtime.publicCheckoutBaseUrl },
      )
    }
  } else if (plan.paymentSessionTarget === "invoice") {
    if (!invoice) {
      invoice = await createCollectionInvoice(db, context, plan, input.notes ?? null)
    }

    paymentSession = await financeService.createPaymentSessionFromInvoice(db, invoice.id, {
      ...(input.paymentSession ?? {}),
      notes: input.notes ?? input.paymentSession?.notes ?? null,
    })

    if (!paymentSession) {
      throw new Error("Failed to create payment session from invoice")
    }

    if (runtime.notificationDispatcher?.sendInvoiceNotification && input.invoiceNotification) {
      invoiceNotification = await runtime.notificationDispatcher.sendInvoiceNotification(
        db,
        invoice.id,
        input.invoiceNotification,
        { paymentLinkBaseUrl: runtime.publicCheckoutBaseUrl },
      )
    }

    if (
      runtime.notificationDispatcher?.sendPaymentSessionNotification &&
      input.paymentSessionNotification
    ) {
      paymentSessionNotification =
        await runtime.notificationDispatcher.sendPaymentSessionNotification(
          db,
          paymentSession.id,
          input.paymentSessionNotification,
          { paymentLinkBaseUrl: runtime.publicCheckoutBaseUrl },
        )
    }
  } else {
    if (!plan.selectedSchedule) {
      throw new Error("No outstanding payment schedule available for collection")
    }

    // Create (or reuse) the schedule session first so idempotent retries return
    // the existing row before we materialize any new proforma.
    paymentSession = await financeService.createPaymentSessionFromBookingSchedule(
      db,
      plan.selectedSchedule.id,
      {
        ...(input.paymentSession ?? {}),
        notes: input.notes ?? input.paymentSession?.notes ?? null,
      },
    )

    if (!paymentSession) {
      throw new Error("Failed to create payment session from booking schedule")
    }

    if (paymentSession.invoiceId) {
      const [existingInvoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, paymentSession.invoiceId))
        .limit(1)
      if (!existingInvoice) {
        throw new Error(
          `Payment session ${paymentSession.id} references missing invoice ${paymentSession.invoiceId}`,
        )
      }
      invoice = existingInvoice
    } else {
      // Card settlement completion requires an outstanding booking invoice even
      // when the session is schedule-targeted. Materialize a proforma in the
      // schedule currency so status refresh can project paid without FX drift.
      invoice = await createCollectionInvoice(
        db,
        context,
        {
          ...plan,
          documentType: plan.documentType ?? "proforma",
          currency: plan.selectedSchedule.currency,
        },
        input.notes ?? null,
      )

      const [linkedSession] = await db
        .update(paymentSessions)
        .set({ invoiceId: invoice.id, updatedAt: new Date() })
        .where(eq(paymentSessions.id, paymentSession.id))
        .returning()
      paymentSession = linkedSession ?? { ...paymentSession, invoiceId: invoice.id }
    }

    if (
      runtime.notificationDispatcher?.sendPaymentSessionNotification &&
      input.paymentSessionNotification
    ) {
      paymentSessionNotification =
        await runtime.notificationDispatcher.sendPaymentSessionNotification(
          db,
          paymentSession.id,
          input.paymentSessionNotification,
          { paymentLinkBaseUrl: runtime.publicCheckoutBaseUrl },
        )
    }
  }

  if (input.startProvider) {
    if (!paymentSession) {
      throw new Error("No payment session available for provider start")
    }

    if (!providerStarter) {
      throw new Error("No payment adapter is selected for card collection")
    }

    providerStart = await providerStarter({
      db,
      bookingId,
      plan,
      invoice: invoice ?? null,
      paymentSession,
      input,
      startProvider: input.startProvider,
      bindings: runtime.bindings ?? {},
    })

    if (providerStart.paymentSessionId !== paymentSession.id) {
      const updatedSession = await financeService.getPaymentSessionById(
        db,
        providerStart.paymentSessionId,
      )
      paymentSession = updatedSession ?? paymentSession
    } else {
      const updatedSession = await financeService.getPaymentSessionById(db, paymentSession.id)
      paymentSession = updatedSession ?? paymentSession
    }
  }

  return {
    plan,
    invoice: invoice ?? null,
    paymentSession,
    invoiceNotification,
    paymentSessionNotification,
    bankTransferInstructions,
    providerStart,
  }
}

export async function bootstrapCheckoutCollection(
  db: PostgresJsDatabase,
  input: BootstrapCheckoutCollectionInput,
  options: CheckoutPolicyOptions = {},
  runtime: CheckoutRuntimeOptions = {},
): Promise<BootstrappedCheckoutCollection | null> {
  const subject = resolveCheckoutSubject(input)
  const initiated = await initiateCheckoutCollection(
    db,
    subject.bookingId,
    {
      method: input.method,
      stage: input.stage,
      scheduleId: input.scheduleId,
      invoiceId: input.invoiceId,
      amountCents: input.amountCents,
      ensureDefaultPaymentPlan: input.ensureDefaultPaymentPlan,
      paymentSessionTarget: input.paymentSessionTarget,
      paymentPlan: input.paymentPlan,
      paymentSession: input.paymentSession,
      paymentSessionNotification: input.paymentSessionNotification,
      invoiceNotification: input.invoiceNotification,
      startProvider: input.startProvider,
      notes: input.notes,
    },
    options,
    runtime,
  )

  if (!initiated) {
    return null
  }

  return {
    bookingId: subject.bookingId,
    sessionId: subject.sessionId,
    sourceType: subject.sourceType,
    intent: resolveCheckoutIntent(input),
    ...initiated,
  }
}
