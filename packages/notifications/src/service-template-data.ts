function centsToAmount(value: unknown) {
  if (typeof value !== "number") return null
  return value / 100
}

function buildFullName(firstName: unknown, lastName: unknown) {
  return [firstName, lastName]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" ")
}

function parseDate(value: unknown) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value
  }
  return null
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function dateDiffInDays(from: Date, to: Date) {
  const diff = to.getTime() - from.getTime()
  return Math.ceil(diff / (24 * 60 * 60 * 1000))
}

function enrichTraveler(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value
  const traveler = value as Record<string, unknown>
  const fullName = buildFullName(traveler.firstName, traveler.lastName)
  return {
    ...traveler,
    fullName: fullName || null,
    name: fullName || null,
    role: traveler.participantType ?? null,
  }
}

function enrichBooking(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value
  const booking = value as Record<string, unknown>
  const bookingNumber =
    typeof booking.bookingNumber === "string"
      ? booking.bookingNumber
      : typeof booking.reference === "string"
        ? booking.reference
        : typeof booking.code === "string"
          ? booking.code
          : typeof booking.number === "string"
            ? booking.number
            : null
  const currency =
    typeof booking.currency === "string"
      ? booking.currency
      : typeof booking.sellCurrency === "string"
        ? booking.sellCurrency
        : null
  const totalAmount =
    centsToAmount(booking.totalAmountCents) ??
    centsToAmount(booking.sellAmountCents) ??
    (typeof booking.totalAmount === "number" ? booking.totalAmount : null)
  const startDate = parseDate(booking.startDate)
  const endDate = parseDate(booking.endDate)
  const dateRange =
    startDate && endDate
      ? `${startDate.toISOString().slice(0, 10)} - ${endDate.toISOString().slice(0, 10)}`
      : null

  return {
    ...booking,
    code: bookingNumber,
    number: bookingNumber,
    reference: bookingNumber,
    currency,
    total: totalAmount,
    totalAmount,
    totalPrice: totalAmount,
    dateRange,
  }
}

function enrichInvoice(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value
  const invoice = value as Record<string, unknown>
  return {
    ...invoice,
    number:
      typeof invoice.number === "string"
        ? invoice.number
        : typeof invoice.invoiceNumber === "string"
          ? invoice.invoiceNumber
          : null,
    type:
      typeof invoice.type === "string"
        ? invoice.type
        : typeof invoice.invoiceType === "string"
          ? invoice.invoiceType
          : null,
    subtotalAmount:
      centsToAmount(invoice.subtotalCents) ??
      (typeof invoice.subtotalAmount === "number" ? invoice.subtotalAmount : null),
    taxAmount:
      centsToAmount(invoice.taxCents) ??
      (typeof invoice.taxAmount === "number" ? invoice.taxAmount : null),
    totalAmount:
      centsToAmount(invoice.totalCents) ??
      (typeof invoice.totalAmount === "number" ? invoice.totalAmount : null),
    paidAmount:
      centsToAmount(invoice.paidCents) ??
      (typeof invoice.paidAmount === "number" ? invoice.paidAmount : null),
    balanceDueAmount:
      centsToAmount(invoice.balanceDueCents) ??
      (typeof invoice.balanceDueAmount === "number" ? invoice.balanceDueAmount : null),
  }
}

function enrichPaymentSession(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value
  const session = value as Record<string, unknown>
  return {
    ...session,
    amount:
      centsToAmount(session.amountCents) ??
      (typeof session.amount === "number" ? session.amount : null),
    paymentUrl:
      typeof session.paymentUrl === "string"
        ? session.paymentUrl
        : typeof session.redirectUrl === "string"
          ? session.redirectUrl
          : null,
    reference:
      typeof session.reference === "string"
        ? session.reference
        : typeof session.externalReference === "string"
          ? session.externalReference
          : null,
    method:
      typeof session.method === "string"
        ? session.method
        : typeof session.paymentMethod === "string"
          ? session.paymentMethod
          : null,
    isPaid:
      session.status === "paid" ||
      session.status === "completed" ||
      session.status === "succeeded" ||
      Boolean(session.completedAt),
  }
}

function enrichPaymentSchedule(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value
  const schedule = value as Record<string, unknown>
  const dueDate = parseDate(schedule.dueDate)
  const today = new Date()
  return {
    ...schedule,
    amountDue:
      centsToAmount(schedule.amountCents) ??
      (typeof schedule.amountDue === "number" ? schedule.amountDue : null),
    type:
      typeof schedule.type === "string"
        ? schedule.type
        : typeof schedule.scheduleType === "string"
          ? schedule.scheduleType
          : null,
    daysLeft: dueDate ? dateDiffInDays(today, dueDate) : null,
  }
}

function enrichDocument(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value
  return value
}

export function enrichBookingItem(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value
  const item = value as Record<string, unknown>
  return {
    ...item,
    description:
      typeof item.description === "string" && item.description.trim().length > 0
        ? item.description
        : typeof item.title === "string"
          ? item.title
          : null,
    currency:
      typeof item.currency === "string"
        ? item.currency
        : typeof item.sellCurrency === "string"
          ? item.sellCurrency
          : null,
    unitPrice:
      centsToAmount(item.unitSellAmountCents) ??
      (typeof item.unitPrice === "number" ? item.unitPrice : null),
    total:
      centsToAmount(item.totalSellAmountCents) ??
      (typeof item.total === "number" ? item.total : null),
  }
}

export function normalizeNotificationTemplateData(data: Record<string, unknown>) {
  const traveler = enrichTraveler(data.traveler)
  const travelers = Array.isArray(data.travelers)
    ? data.travelers.map((entry) => enrichTraveler(entry))
    : traveler
      ? [traveler]
      : []
  const booking = enrichBooking(data.booking)
  const invoice = enrichInvoice(data.invoice)
  const paymentSession = enrichPaymentSession(data.paymentSession)
  const paymentSchedule = enrichPaymentSchedule(data.paymentSchedule)
  const bookingRecord = toRecord(booking)
  const invoiceRecord = toRecord(invoice)
  const paymentSessionRecord = toRecord(paymentSession)
  const paymentScheduleRecord = toRecord(paymentSchedule)
  const suppliedPayment =
    data.payment && typeof data.payment === "object" && !Array.isArray(data.payment)
      ? (data.payment as Record<string, unknown>)
      : null
  const documents = Array.isArray(data.documents)
    ? data.documents.map((document) => enrichDocument(document))
    : []
  const items = Array.isArray(data.items) ? data.items.map((item) => enrichBookingItem(item)) : []

  const derivedPayment = paymentScheduleRecord
    ? {
        amount: paymentScheduleRecord.amountDue ?? null,
        currency:
          paymentScheduleRecord.currency ??
          invoiceRecord?.currency ??
          paymentSessionRecord?.currency ??
          bookingRecord?.currency ??
          null,
        dueDate: paymentScheduleRecord.dueDate ?? null,
        daysLeft: paymentScheduleRecord.daysLeft ?? null,
        reference: bookingRecord?.reference ?? invoiceRecord?.number ?? null,
        method: paymentSessionRecord?.method ?? paymentSessionRecord?.provider ?? null,
        link: paymentSessionRecord?.paymentUrl ?? null,
        payMode: paymentScheduleRecord.type ?? null,
        paidAmount:
          invoiceRecord?.paidAmount ??
          (paymentSessionRecord?.isPaid ? paymentSessionRecord.amount : null),
        balanceDue: invoiceRecord?.balanceDueAmount ?? paymentScheduleRecord.amountDue ?? null,
        isPaidInFull: (invoiceRecord?.balanceDueAmount as number | null) === 0,
      }
    : paymentSessionRecord
      ? {
          amount: paymentSessionRecord.amount ?? null,
          currency: paymentSessionRecord.currency ?? null,
          dueDate: null,
          daysLeft: null,
          reference: paymentSessionRecord.reference ?? null,
          method: paymentSessionRecord.method ?? null,
          link: paymentSessionRecord.paymentUrl ?? null,
          payMode: null,
          paidAmount: null,
          balanceDue: invoiceRecord?.balanceDueAmount ?? null,
          isPaidInFull: (invoiceRecord?.balanceDueAmount as number | null) === 0,
        }
      : invoiceRecord
        ? {
            amount: invoiceRecord.balanceDueAmount ?? null,
            currency: invoiceRecord.currency ?? null,
            dueDate: invoiceRecord.dueDate ?? null,
            daysLeft: null,
            reference: bookingRecord?.reference ?? invoiceRecord.number ?? null,
            method: null,
            link: null,
            payMode: null,
            paidAmount: invoiceRecord.paidAmount ?? null,
            balanceDue: invoiceRecord.balanceDueAmount ?? null,
            isPaidInFull: (invoiceRecord.balanceDueAmount as number | null) === 0,
          }
        : null
  const payment = derivedPayment
    ? {
        ...derivedPayment,
        ...suppliedPayment,
      }
    : suppliedPayment

  const suppliedProduct = toRecord(data.product)
  const primaryItem = toRecord(items[0])
  // `title` on a booking item is a unit/option label ("Adult", "Single") and
  // can be caller-supplied free text; `productNameSnapshot` is stamped from
  // the catalog at creation time. Prefer the snapshot, as the legal and
  // storefront packages already do for the same variable.
  const derivedProduct = primaryItem
    ? {
        title: firstNonEmptyString(
          primaryItem.productNameSnapshot,
          primaryItem.title,
          primaryItem.description,
        ),
      }
    : null
  const product = derivedProduct ? { ...derivedProduct, ...suppliedProduct } : suppliedProduct

  return {
    ...data,
    traveler,
    travelers,
    billingPerson: traveler,
    billing: traveler,
    booking,
    invoice,
    paymentSession,
    paymentSchedule,
    payment,
    documents,
    documentsCount: documents.length,
    items,
    product,
  }
}
