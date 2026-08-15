import type { CustomFieldsRuntime } from "@voyant-travel/core/custom-fields"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import type { PaymentAdapter } from "@voyant-travel/payments"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { resolvePaymentCallbackUrl, startPaymentAdapterCardPayment } from "./card-payment.js"
import type { CheckoutPaymentStarter } from "./checkout-service.js"
import type { FinanceInvoiceDocumentProvider } from "./contracts/invoice-document-provider.js"
import type { FinanceApiModuleOptions } from "./index.js"
import {
  createVoyantDataFxExchangeRateResolver,
  type ResolveInvoiceExchangeRate,
} from "./invoice-fx.js"
import { refreshPaymentAdapterStatus } from "./payment-adapter-status.js"
import { resolveEffectivePaymentLinkUrlTemplate } from "./payment-link.js"
import { executeAdapterRefundSettlement } from "./refund-settlement-execution.js"
import type {
  FinanceAccommodationsPaymentPolicyRuntime,
  FinanceBookingScheduleRuntime,
  FinanceCheckoutPaymentStartersRuntime,
  FinanceCruisesPaymentPolicyRuntime,
  FinanceDistributionPaymentPolicyRuntime,
  FinanceHostRuntime,
  FinanceInventoryPaymentPolicyRuntime,
  FinanceInvoiceSettlementPollerProvider,
  FinanceNotificationsRuntime,
  FinanceOperatorSettingsRuntime,
  FinanceProposalsPaymentPolicyRuntime,
} from "./runtime-port.js"
import { financeService } from "./service.js"
import {
  createInvoiceCustomFieldsResolver,
  createProviderBackedInvoiceDocumentGenerator,
} from "./service-documents.js"
import type { InvoiceSettlementPoller } from "./service-settlement.js"

/** Compose Finance's main HTTP runtime from generic host and selected providers. */
export function createFinanceRuntime(
  host: FinanceHostRuntime,
  customFields: CustomFieldsRuntime,
  notifications: FinanceNotificationsRuntime,
  operatorSettings: FinanceOperatorSettingsRuntime,
  checkoutPaymentStarters?: FinanceCheckoutPaymentStartersRuntime,
  invoiceSettlementPollerProviders: readonly FinanceInvoiceSettlementPollerProvider[] = [],
  selectedPaymentAdapter?: PaymentAdapter,
  invoiceDocumentProvider?: FinanceInvoiceDocumentProvider,
): FinanceApiModuleOptions {
  const { primitives } = host
  return {
    resolveDocumentDownloadUrl: primitives.storage.downloadUrl,
    // Both document paths run off the one selected provider: the on-demand
    // generate/regenerate routes through the generator adapter (they used to
    // answer 501 because nothing ever supplied one), and the requested-rendition
    // engine through the provider itself.
    ...(invoiceDocumentProvider
      ? {
          invoiceDocumentProvider,
          invoiceDocumentGenerator:
            createProviderBackedInvoiceDocumentGenerator(invoiceDocumentProvider),
        }
      : {}),
    resolveCustomFields: createInvoiceCustomFieldsResolver(customFields),
    resolveInvoiceExchangeRateResolver: (bindings) =>
      createExchangeRateResolver(primitives, bindings),
    invoiceSettlementPollers: aggregateFinanceInvoiceSettlementPollers(
      invoiceSettlementPollerProviders,
    ),
    invoiceDueDateResolver: ({ issueDate, dueDate, bookingPaymentSchedule }) =>
      bookingPaymentSchedule && dueDate < issueDate ? issueDate : dueDate,
    resolveNotificationDispatcher: notifications.resolveNotificationDispatcher,
    resolvePaymentStarters: (bindings) =>
      checkoutPaymentStarters?.resolvePaymentStarters(bindings) ?? {},
    resolveSelectedPaymentStarter: selectedPaymentAdapter
      ? (bindings) => createSelectedPaymentAdapterStarter(host, selectedPaymentAdapter, bindings)
      : undefined,
    resolveBankTransferDetails: (bindings) => resolveBankTransferDetails(primitives.env(bindings)),
    resolvePublicCheckoutBaseUrl: (bindings) =>
      resolvePublicCheckoutBaseUrl(primitives.env(bindings)),
    resolvePaymentLinkUrlTemplate: async (db, bindings) =>
      resolveEffectivePaymentLinkUrlTemplate(
        await operatorSettings.resolveInvoicePayUrlTemplate(db),
        nonEmpty(primitives.env(bindings).PUBLIC_PAYMENT_LINK_URL_TEMPLATE),
      ),
    refreshPaymentSessionStatus: selectedPaymentAdapter
      ? ({ bindings, db, paymentSessionId, eventBus }) =>
          refreshPaymentAdapterStatus(selectedPaymentAdapter, db, paymentSessionId, {
            context: {
              env: primitives.env(bindings as Record<string, unknown>),
            },
            runtime: { eventBus },
          })
      : undefined,
    // The money leg of a refund goes back through the same adapter that took it
    // (voyant#4303). Absent when no adapter is selected — every other refund
    // method is money the operator moves itself and needs nothing here.
    executeRefundSettlement: selectedPaymentAdapter
      ? ({ bindings, db, refundSettlementId, eventBus }) =>
          executeAdapterRefundSettlement(selectedPaymentAdapter, db, refundSettlementId, {
            context: { env: primitives.env(bindings as Record<string, unknown>) },
            runtime: { eventBus },
          })
      : undefined,
    listBookingReminderRuns: notifications.listBookingReminderRuns,
  }
}

function createSelectedPaymentAdapterStarter(
  host: FinanceHostRuntime,
  adapter: PaymentAdapter,
  bindings: Record<string, unknown>,
): CheckoutPaymentStarter {
  return async (checkout) => {
    const payload = checkout.startProvider.payload ?? {}
    const billing = readCardPaymentBilling(payload.billing)
    const env = host.primitives.env(bindings)
    const started = await startPaymentAdapterCardPayment(
      adapter,
      {
        db: checkout.db,
        sessionId: checkout.paymentSession.id,
        billing,
        description: stringValue(payload.description),
        returnUrl: stringValue(payload.returnUrl) ?? checkout.paymentSession.returnUrl ?? undefined,
        cancelUrl: stringValue(payload.cancelUrl) ?? checkout.paymentSession.cancelUrl ?? undefined,
        shipping: recordValue(payload.shipping),
        metadata: recordValue(payload.metadata),
      },
      {
        context: { env },
        notifyUrl: resolvePaymentCallbackUrl(env),
      },
    )
    const session =
      (await financeService.getPaymentSessionById(checkout.db, checkout.paymentSession.id)) ??
      checkout.paymentSession
    return {
      provider: adapter.id,
      paymentSessionId: session.id,
      redirectUrl: started?.redirectUrl ?? null,
      externalReference: session.externalReference,
      providerSessionId: session.providerSessionId,
      providerPaymentId: session.providerPaymentId,
      response: null,
    }
  }
}

function readCardPaymentBilling(value: unknown) {
  const billing = recordValue(value)
  const email = nonEmpty(billing.email)
  const firstName = nonEmpty(billing.firstName)
  if (!email || !firstName) {
    throw new Error("Card payment billing requires email and firstName")
  }
  const phone = nonEmpty(billing.phone)
  const lastName = nonEmpty(billing.lastName)
  const city = nonEmpty(billing.city)
  const country =
    typeof billing.country === "number" || typeof billing.country === "string"
      ? billing.country
      : undefined
  const state = nonEmpty(billing.state)
  const postalCode = nonEmpty(billing.postalCode)
  const details = nonEmpty(billing.details)
  return {
    email,
    firstName,
    ...(phone ? { phone } : {}),
    ...(lastName ? { lastName } : {}),
    ...(city ? { city } : {}),
    ...(country !== undefined ? { country } : {}),
    ...(state ? { state } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(details ? { details } : {}),
  }
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** Compose Finance's payment schedule from statically selected domain providers. */
export function createFinanceBookingScheduleRuntime(
  host: FinanceHostRuntime,
  settings: FinanceOperatorSettingsRuntime,
  distribution: FinanceDistributionPaymentPolicyRuntime,
  accommodations: FinanceAccommodationsPaymentPolicyRuntime,
  cruises: FinanceCruisesPaymentPolicyRuntime,
  inventory: FinanceInventoryPaymentPolicyRuntime,
  proposals?: FinanceProposalsPaymentPolicyRuntime | null,
): FinanceBookingScheduleRuntime {
  const paymentPolicy = inventory.createPaymentPolicyRuntime({
    resolveSupplierPolicy: distribution.resolveSupplierPolicy,
    resolveSupplierPolicyById: distribution.resolveSupplierPolicyById,
    resolveVerticalListingPolicy: async (db, bookingId) =>
      (await cruises.resolveBookingPolicy(db, bookingId)) ??
      accommodations.resolveBookingPolicy(db, bookingId),
    resolveVerticalListingPolicyForEntity: async (db, context) =>
      (await cruises.resolveEntityPolicy(db, context)) ??
      accommodations.resolveEntityPolicy(db, context),
    resolveVerticalSupplierPolicyForEntity: async (db, context) => {
      const supplierId = await cruises.resolveSupplierId(db, context)
      return supplierId ? distribution.resolveSupplierPolicyById(db, supplierId) : null
    },
  })
  return {
    options: {
      resolveDb: (context) => host.primitives.database.fromContext<PostgresJsDatabase>(context),
      resolveOperatorDefaultPaymentPolicy: settings.resolveOperatorDefaultPaymentPolicy,
      ...paymentPolicy,
      ...(proposals
        ? { resolveProposalVersionPolicy: proposals.resolveProposalVersionPolicy }
        : {}),
      stampPolicySourceOnBooking: inventory.stampPolicySourceOnBooking,
      readPolicySourceFromInternalNotes: inventory.readPolicySourceFromInternalNotes,
    },
    withDb: (bindings, operation) =>
      host.primitives.database.transaction(bindings, (database) =>
        operation(database as AnyDrizzleDb),
      ),
  }
}

export function createFinanceBookingTaxRuntime(
  settings: FinanceOperatorSettingsRuntime,
): FinanceApiModuleOptions {
  return {
    resolveBookingTaxSettings: settings.resolveBookingTaxSettings,
    updateBookingTaxSettings: settings.updateBookingTaxSettings,
  }
}

function createExchangeRateResolver(
  primitives: FinanceHostRuntime["primitives"],
  bindings: unknown,
): ResolveInvoiceExchangeRate | undefined {
  const env = primitives.env(bindings)
  const apiKey =
    nonEmpty(env.VOYANT_DATA_API_KEY) ??
    (env.VOYANT_ADMIN_AUTH_MODE === "voyant-cloud"
      ? (nonEmpty(env.VOYANT_API_KEY) ?? nonEmpty(env.VOYANT_CLOUD_API_KEY))
      : undefined)
  if (!apiKey) return undefined
  return createVoyantDataFxExchangeRateResolver({
    apiKey,
    baseUrl: nonEmpty(env.VOYANT_CLOUD_API_URL),
  })
}

export function aggregateFinanceInvoiceSettlementPollers(
  providers: readonly FinanceInvoiceSettlementPollerProvider[],
): Readonly<Record<string, InvoiceSettlementPoller>> {
  const pollers: Record<string, InvoiceSettlementPoller> = {}
  for (const provider of [...providers].sort((left, right) =>
    left.provider < right.provider ? -1 : left.provider > right.provider ? 1 : 0,
  )) {
    if (Object.hasOwn(pollers, provider.provider)) {
      throw new Error(
        `Finance invoice settlement poller provider "${provider.provider}" was selected more than once.`,
      )
    }
    pollers[provider.provider] = provider.poller
  }
  return Object.freeze(pollers)
}

function resolveBankTransferDetails(env: Readonly<Record<string, unknown>>) {
  const beneficiary = stringValue(env.BANK_TRANSFER_BENEFICIARY)
  const iban = stringValue(env.BANK_TRANSFER_IBAN)
  if (!beneficiary || !iban) return null
  return {
    provider: "bank-transfer" as const,
    beneficiary,
    iban,
    bankName: stringValue(env.BANK_TRANSFER_BANK_NAME) ?? null,
    notes: stringValue(env.BANK_TRANSFER_NOTES) ?? null,
  }
}

export function resolvePublicCheckoutBaseUrl(
  env: Readonly<Record<string, unknown>>,
): string | null {
  return nonEmpty(env.PUBLIC_CHECKOUT_BASE_URL) ?? null
}

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}
