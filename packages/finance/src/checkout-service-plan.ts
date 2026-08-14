import type { bookingItems, bookings, bookingTravelers } from "@voyant-travel/bookings"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type {
  BootstrapCheckoutCollectionInput,
  CheckoutBankTransferInstructionsRecord,
  CheckoutInvoiceNotificationInput,
  CheckoutPaymentSessionNotificationInput,
  CheckoutProviderStartInput,
  InitiateCheckoutCollectionInput,
} from "./checkout-validation.js"
import type { bookingPaymentSchedules, invoices, PaymentSession } from "./schema.js"

export interface CheckoutPolicyOptions {
  defaultCardCollectionTarget?: "schedule" | "invoice"
  defaultReminderCardCollectionTarget?: "schedule" | "invoice"
  defaultBankTransferDocumentType?: "proforma" | "invoice"
  defaultCardCollectionDocumentType?: "proforma" | "invoice"
  defaultPaymentPlan?: {
    depositMode: "none" | "percentage" | "fixed_amount"
    depositValue: number
    balanceDueDaysBeforeStart: number
    clearExistingPending: boolean
    createGuarantee: boolean
    guaranteeType:
      | "deposit"
      | "credit_card"
      | "preauth"
      | "card_on_file"
      | "bank_transfer"
      | "voucher"
      | "agency_letter"
    notes?: string | null
  }
}

export type LoadedBookingContext = {
  booking: typeof bookings.$inferSelect
  items: Array<typeof bookingItems.$inferSelect>
  participants: Array<typeof bookingTravelers.$inferSelect>
  schedules: Array<typeof bookingPaymentSchedules.$inferSelect>
  outstandingInvoices: Array<typeof invoices.$inferSelect>
}

export interface CheckoutCollectionPlan {
  bookingId: string
  method: "card" | "bank_transfer"
  stage: "initial" | "reminder" | "manual"
  paymentSessionTarget: "schedule" | "invoice" | null
  documentType: "proforma" | "invoice" | null
  willCreateDefaultPaymentPlan: boolean
  selectedSchedule: typeof bookingPaymentSchedules.$inferSelect | null
  selectedInvoice: typeof invoices.$inferSelect | null
  amountCents: number
  currency: string
  recommendedAction:
    | "create_bank_transfer_document"
    | "create_payment_session"
    | "create_invoice_then_payment_session"
    | "none"
}

export interface CheckoutBankTransferDetails {
  provider?: string | null
  beneficiary: string
  iban: string
  bankName?: string | null
  /**
   * Deploy-wide instructions appended to every bank-transfer block (e.g.
   * "Please reference your invoice number in the wire memo"). Per-call
   * notes from `initiateCheckoutCollection({ notes })` take precedence -
   * use this slot for boilerplate, not booking-specific content.
   */
  notes?: string | null
}

export interface CheckoutProviderStartResult {
  provider: string
  paymentSessionId: string
  redirectUrl: string | null
  externalReference: string | null
  providerSessionId: string | null
  providerPaymentId: string | null
  response: Record<string, unknown> | null
}

export interface CheckoutPaymentStarterContext {
  db: PostgresJsDatabase
  bookingId: string
  plan: CheckoutCollectionPlan
  invoice: typeof invoices.$inferSelect | null
  paymentSession: PaymentSession
  input: InitiateCheckoutCollectionInput
  startProvider: CheckoutProviderStartInput
  bindings: Record<string, unknown>
}

export type CheckoutPaymentStarter = (
  context: CheckoutPaymentStarterContext,
) => Promise<CheckoutProviderStartResult>

export interface CheckoutNotificationDelivery {
  id: string
  templateSlug: string | null
  channel: "email" | "sms"
  provider: string
  status: "pending" | "sent" | "failed" | "cancelled"
  toAddress: string
  subject: string | null
  sentAt: string | null
  failedAt: string | null
  errorMessage: string | null
}

export interface CheckoutNotificationDispatcher {
  sendInvoiceNotification?: (
    db: PostgresJsDatabase,
    invoiceId: string,
    input: CheckoutInvoiceNotificationInput,
    options?: {
      paymentLinkBaseUrl?: string | null
      paymentLinkUrlTemplate?: string | null
    },
  ) => Promise<CheckoutNotificationDelivery | null>
  sendPaymentSessionNotification?: (
    db: PostgresJsDatabase,
    paymentSessionId: string,
    input: CheckoutPaymentSessionNotificationInput,
    options?: {
      paymentLinkBaseUrl?: string | null
      paymentLinkUrlTemplate?: string | null
    },
  ) => Promise<CheckoutNotificationDelivery | null>
}

export interface InitiatedCheckoutCollection {
  plan: CheckoutCollectionPlan
  invoice: typeof invoices.$inferSelect | null
  paymentSession: PaymentSession | null
  invoiceNotification: CheckoutNotificationDelivery | null
  paymentSessionNotification: CheckoutNotificationDelivery | null
  bankTransferInstructions: CheckoutBankTransferInstructionsRecord | null
  providerStart: CheckoutProviderStartResult | null
  paymentLinkUrl: string | null
}

export interface BootstrappedCheckoutCollection extends InitiatedCheckoutCollection {
  bookingId: string
  sessionId: string
  sourceType: "booking" | "session"
  intent: "deposit" | "balance" | "custom"
}

export interface CheckoutRuntimeOptions {
  bindings?: Record<string, unknown>
  bankTransferDetails?: CheckoutBankTransferDetails | null
  notificationDispatcher?: CheckoutNotificationDispatcher | null
  /** Deployment-selected PaymentAdapter bridge. Takes precedence over legacy keyed starters. */
  selectedPaymentStarter?: CheckoutPaymentStarter | null
  paymentStarters?: Record<string, CheckoutPaymentStarter>
  publicCheckoutBaseUrl?: string | null
  paymentLinkUrlTemplate?: string | null
}

export const OUTSTANDING_SCHEDULE_STATUSES: Array<
  (typeof bookingPaymentSchedules.$inferSelect)["status"]
> = ["pending", "due"]

export const OUTSTANDING_INVOICE_STATUSES: Array<(typeof invoices.$inferSelect)["status"]> = [
  "draft",
  "issued",
  "partially_paid",
  "overdue",
]

export function defaultPaymentPlan(options: CheckoutPolicyOptions) {
  return {
    depositMode: options.defaultPaymentPlan?.depositMode ?? "percentage",
    depositValue: options.defaultPaymentPlan?.depositValue ?? 30,
    balanceDueDaysBeforeStart: options.defaultPaymentPlan?.balanceDueDaysBeforeStart ?? 30,
    clearExistingPending: options.defaultPaymentPlan?.clearExistingPending ?? true,
    createGuarantee: options.defaultPaymentPlan?.createGuarantee ?? false,
    guaranteeType: options.defaultPaymentPlan?.guaranteeType ?? "deposit",
    notes: options.defaultPaymentPlan?.notes ?? null,
  } as const
}

export function resolvePaymentSessionTarget(
  method: "card" | "bank_transfer",
  stage: "initial" | "reminder" | "manual",
  override: "schedule" | "invoice" | undefined,
  options: CheckoutPolicyOptions,
) {
  if (method === "bank_transfer") return "invoice" as const
  if (override) return override
  if (stage === "reminder") return options.defaultReminderCardCollectionTarget ?? "schedule"
  return options.defaultCardCollectionTarget ?? "schedule"
}

export function resolveDocumentType(
  method: "card" | "bank_transfer",
  target: "schedule" | "invoice" | null,
  options: CheckoutPolicyOptions,
) {
  if (method === "bank_transfer") {
    return options.defaultBankTransferDocumentType ?? "proforma"
  }
  if (target === "invoice") {
    return options.defaultCardCollectionDocumentType ?? "invoice"
  }
  return null
}

export function fallbackInvoiceNumber(
  bookingNumber: string,
  documentType: "proforma" | "invoice",
  amountCents: number,
) {
  const stamp = Date.now().toString(36).toUpperCase()
  const suffix = documentType === "proforma" ? "PF" : "INV"
  return `${bookingNumber}-${suffix}-${amountCents}-${stamp}`
}

export function lineDescription(
  booking: typeof bookings.$inferSelect,
  schedule: typeof bookingPaymentSchedules.$inferSelect | null,
  stage: "initial" | "reminder" | "manual",
) {
  if (!schedule) {
    return `Booking ${booking.bookingNumber}`
  }
  const kind = schedule.scheduleType === "deposit" ? "deposit" : schedule.scheduleType
  if (stage === "reminder") {
    return `Booking ${booking.bookingNumber} ${kind} reminder`
  }
  return `Booking ${booking.bookingNumber} ${kind}`
}

export function normalizeExactAmountCents(amountCents: number | undefined) {
  return typeof amountCents === "number" && Number.isFinite(amountCents) && amountCents > 0
    ? Math.round(amountCents)
    : null
}

export function resolveCheckoutIntent(
  input:
    | Pick<BootstrapCheckoutCollectionInput, "intent" | "stage" | "amountCents">
    | Pick<InitiateCheckoutCollectionInput, "stage" | "amountCents">,
) {
  if ("intent" in input && input.intent) {
    return input.intent
  }

  if (
    typeof input.amountCents === "number" &&
    Number.isFinite(input.amountCents) &&
    input.amountCents > 0
  ) {
    return "custom" as const
  }

  if (input.stage === "initial") {
    return "deposit" as const
  }

  if (input.stage === "reminder") {
    return "balance" as const
  }

  return "custom" as const
}

export function resolveCheckoutSubject(input: BootstrapCheckoutCollectionInput) {
  if (input.bookingId && input.sessionId && input.bookingId !== input.sessionId) {
    throw new Error("bookingId and sessionId must refer to the same booking session")
  }

  if (input.bookingId) {
    return {
      bookingId: input.bookingId,
      sessionId: input.sessionId ?? input.bookingId,
      sourceType: "booking" as const,
    }
  }

  if (input.sessionId) {
    return {
      bookingId: input.sessionId,
      sessionId: input.sessionId,
      sourceType: "session" as const,
    }
  }

  throw new Error("Provide a bookingId or sessionId")
}

function toInvoiceDueDateTime(value: string | null | undefined) {
  return value ? `${value}T00:00:00.000Z` : null
}

export function buildBankTransferInstructions(
  invoice: typeof invoices.$inferSelect,
  details: CheckoutBankTransferDetails | null | undefined,
  callNotes?: string | null,
): CheckoutBankTransferInstructionsRecord | null {
  if (!details) {
    return null
  }

  return {
    provider: details.provider ?? null,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    documentType: invoice.invoiceType === "proforma" ? "proforma" : "invoice",
    amountCents: invoice.balanceDueCents,
    // Currency always tracks the invoice - the deploy-wide bank-transfer
    // block can't predict what the customer is buying. EUR booking +
    // RON-default env would have shown the wrong currency to the customer.
    currency: invoice.currency,
    dueDate: toInvoiceDueDateTime(invoice.dueDate),
    beneficiary: details.beneficiary,
    iban: details.iban,
    bankName: details.bankName ?? null,
    // Per-call notes win over deploy-wide boilerplate - the caller knows
    // booking context (invoice number, due date, etc.) the env can't.
    notes: callNotes ?? details.notes ?? null,
  }
}
