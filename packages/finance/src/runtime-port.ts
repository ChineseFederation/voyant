import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import { definePort } from "@voyant-travel/core/project"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import type { PaymentAdapter } from "@voyant-travel/payments"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { BookingTaxRouteOptions } from "./booking-tax.js"
import type { CheckoutRoutesOptions } from "./checkout-routes.js"
import type { CheckoutPaymentStarter } from "./checkout-service.js"
import type { ResolveInvoiceFxSettings, UpdateInvoiceFxSettings } from "./invoice-fx.js"
import type { PaymentLinkRoutesOptions } from "./payment-link-routes.js"
import type { PaymentPolicy } from "./payment-policy.js"
import type { PaymentPolicyEntityContext } from "./payment-policy-cascade.js"
import type { BookingScheduleRoutesOptions } from "./payment-schedule/routes.js"
import type { InvoiceSettlementPoller } from "./service-settlement.js"

type PolicyReader = (db: PostgresJsDatabase, bookingId: string) => Promise<PaymentPolicy | null>
type EntityPolicyReader = (
  db: PostgresJsDatabase,
  context: PaymentPolicyEntityContext,
) => Promise<PaymentPolicy | null>

function objectPort<T extends object>(id: string, methods: readonly string[] = []) {
  return definePort<T>({
    id,
    test(provider) {
      if (provider === null || typeof provider !== "object") {
        throw new Error(`${id} provider must be an object.`)
      }
      for (const method of methods) {
        if (typeof Reflect.get(provider, method) !== "function") {
          throw new Error(`${id} provider must implement ${method}().`)
        }
      }
    },
  })
}

export interface FinanceHostRuntime {
  primitives: VoyantRuntimeHostPrimitives
}

export interface FinanceOperatorSettingsRuntime {
  resolveOperatorDefaultPaymentPolicy: BookingScheduleRoutesOptions["resolveOperatorDefaultPaymentPolicy"]
  resolveInvoicePayUrlTemplate: (db: PostgresJsDatabase) => Promise<string | null>
  resolveBookingTaxSettings: NonNullable<BookingTaxRouteOptions["resolveBookingTaxSettings"]>
  updateBookingTaxSettings: NonNullable<BookingTaxRouteOptions["updateBookingTaxSettings"]>
  /**
   * Resolve the operator's invoicing mode (`direct` | `proforma-first`).
   * Defaults to `direct` when unconfigured. The finance
   * proforma-conversion subscriber reads this to decide whether a
   * settled proforma should be auto-converted to a fiscal invoice.
   */
  resolveInvoicingMode: (db: PostgresJsDatabase) => Promise<"direct" | "proforma-first">
  /** Resolve the operator's invoice-FX settings (base currency, commission). */
  resolveInvoiceFxSettings: ResolveInvoiceFxSettings
  /** Persist the operator's invoice-FX settings. */
  updateInvoiceFxSettings: UpdateInvoiceFxSettings
}

export interface FinanceNotificationsRuntime {
  resolveNotificationDispatcher: NonNullable<CheckoutRoutesOptions["resolveNotificationDispatcher"]>
  listBookingReminderRuns: NonNullable<CheckoutRoutesOptions["listBookingReminderRuns"]>
}

/**
 * Label for the official source that published a resolved reference rate
 * (e.g. `ecb`, `bnr`). This is an OUTPUT annotation only — the operator
 * does not pick a source; the host adapter knows its own. Free-form so a
 * host can report whatever series it drew from.
 */
export type FxReferenceSource = string

/** Request for one official FX reference rate on a given date. */
export interface FxReferenceRateRequest {
  /** Currency to convert from, e.g. `EUR` (ISO 4217). */
  base: string
  /** Currency to convert into, e.g. `RON` (ISO 4217). */
  quote: string
  /** Reference date in `YYYY-MM-DD`. Defaults to the host's latest published rate. */
  date?: string
}

/** One resolved official FX reference rate. */
export interface FxReferenceRate {
  /** Units of `quote` per one unit of `base`. */
  rate: number
  /** The reference source that published the rate, e.g. `ecb` or `bnr`. */
  source: FxReferenceSource
  /** Date the returned rate was published (`YYYY-MM-DD`). */
  asOf: string
}

/**
 * Host-provided official FX reference-rate source. Finance defines the
 * seam only; hosts/deployments wire it to their own FX data source. No
 * HTTP client or API key lives inside finance. The operator does not pick
 * a source — the host adapter knows its own (managed FX on Voyant Cloud;
 * a self-hoster's own adapter otherwise; a legally mandated source such
 * as BNR for RO). The chosen source is reported back on the rate.
 */
export interface FinanceFxReferenceRuntime {
  /** Resolve one official reference rate for the host's own source. */
  resolveReferenceRate(request: FxReferenceRateRequest): Promise<FxReferenceRate>
}

/** One published rate, ready to be captured against a day. */
export interface FxRateCaptureQuote {
  /** Foreign currency being converted from, e.g. `EUR`. */
  currency: string
  /** Units of the reporting currency per one unit of `currency`, as published. */
  rate: number
}

export interface FxRateCaptureRequest {
  /** The operator's reporting currency, e.g. `RON`. */
  reportingCurrency: string
  /** The document's own day, `YYYY-MM-DD`. */
  date: string
  /** The source that published the rates, e.g. `bnr`. */
  source: string
  sourceReference?: string | null
  /** The operator's currency-risk margin in basis points. */
  commissionBps: number
  quotes: readonly FxRateCaptureQuote[]
}

export interface CapturedFxRateSetRate {
  currency: string
  /** The rate as published, before the margin. */
  rate: number
  /** The rate documents dated `date` are converted at, margin included. */
  effectiveRate: number
  commissionBps: number
}

export interface FxRateCaptureResult {
  /** Identity a document is stamped with; the rates behind it never change. */
  fxRateSetId: string
  /**
   * The rates that stand for the day after capture — which may differ from
   * the submitted quotes, because a rate already captured for that day wins.
   */
  rates: readonly CapturedFxRateSetRate[]
}

/**
 * Persist a day's official rates and hand back the rate-set identity a
 * document is stamped with (voyant#4703). Finance reads `exchange_rates` but
 * does not own it, so capture is a seam the owning module fills.
 */
export type CaptureFxRates = (
  db: PostgresJsDatabase,
  request: FxRateCaptureRequest,
) => Promise<FxRateCaptureResult | null>

/**
 * Persist an official rate for one day so a document can be stamped with an
 * `fx_rate_set_id` that still resolves years later (voyant#4703). Finance
 * reads `exchange_rates` but does not own it — the module that does provides
 * this port, which is also why capture is a seam rather than a direct write.
 *
 * Absent on a deployment without the owning module: finance then resolves
 * rates without persisting them, exactly as it did before.
 */
export interface FinanceFxRateCaptureRuntime {
  captureFxRates: CaptureFxRates
}

export interface FinanceDistributionPaymentPolicyRuntime {
  resolveSupplierPolicy: PolicyReader
  resolveSupplierPolicyById(
    db: PostgresJsDatabase,
    supplierId: string,
  ): Promise<PaymentPolicy | null>
}

export interface FinanceAccommodationsPaymentPolicyRuntime {
  resolveBookingPolicy: PolicyReader
  resolveEntityPolicy: EntityPolicyReader
}

/**
 * Terms carried by the accepted Proposal Version a booking came from.
 *
 * Optional in the graph: a deployment without the proposals module simply has
 * no proposal layer, and the cascade falls through to the catalog layers as it
 * always did.
 */
export interface FinanceProposalsPaymentPolicyRuntime {
  resolveProposalVersionPolicy(
    db: PostgresJsDatabase,
    proposalVersionId: string,
  ): Promise<PaymentPolicy | null>
}

export interface FinanceCruisesPaymentPolicyRuntime {
  resolveBookingPolicy: PolicyReader
  resolveEntityPolicy: EntityPolicyReader
  resolveSupplierId(
    db: PostgresJsDatabase,
    context: PaymentPolicyEntityContext,
  ): Promise<string | null>
}

export interface FinanceInventoryPaymentPolicyRuntime {
  createPaymentPolicyRuntime(options: {
    resolveSupplierPolicy: PolicyReader
    resolveSupplierPolicyById: FinanceDistributionPaymentPolicyRuntime["resolveSupplierPolicyById"]
    resolveVerticalListingPolicy: PolicyReader
    resolveVerticalListingPolicyForEntity: EntityPolicyReader
    resolveVerticalSupplierPolicyForEntity: EntityPolicyReader
  }): Pick<
    BookingScheduleRoutesOptions,
    | "resolveSupplierPolicy"
    | "resolveCategoryPolicy"
    | "resolveListingPolicy"
    | "resolveSupplierPolicyForEntity"
    | "resolveCategoryPolicyForEntity"
    | "resolveListingPolicyForEntity"
  >
  stampPolicySourceOnBooking: BookingScheduleRoutesOptions["stampPolicySourceOnBooking"]
  readPolicySourceFromInternalNotes: BookingScheduleRoutesOptions["readPolicySourceFromInternalNotes"]
}

/**
 * An instrument a payment provider stored, on its way from the payment path to
 * whatever module keeps customer records.
 *
 * Deliberately its own shape rather than `PaymentStoredInstrument` re-exported:
 * this is a seam between two modules that do not depend on each other, and
 * pinning it to the payment port's revision would make the CRM's contract move
 * whenever an adapter's did.
 */
export interface FinanceStoredInstrumentRecord {
  /** The person the payment session named as payer. */
  personId: string
  /** The adapter that issued `token`. Without it the token can charge nothing. */
  providerId: string
  token: string
  /** `PaymentInstrumentReuse` values the customer authorized. Empty is meaningful. */
  authorizedReuses: readonly string[]
  status?: "usable" | "requires_new_agreement" | "expired" | "revoked"
  providerCustomerReference?: string | null
  fingerprint?: string | null
  brand?: string | null
  last4?: string | null
  holderName?: string | null
  expMonth?: number | null
  expYear?: number | null
  /** The record of the agreement authorizing merchant-initiated reuse. */
  agreementReference?: string | null
}

/**
 * Where a stored instrument goes once a payment produced one.
 *
 * Finance owns the payment and learns the instrument; it does not own the
 * customer record and must not reach into one. A deployment without this port
 * wired still takes payments perfectly — instruments simply go unrecorded,
 * which is the behavior every deployment had before the seam existed.
 */
export interface FinanceStoredInstrumentRuntime {
  recordStoredInstrument(
    db: PostgresJsDatabase,
    instrument: FinanceStoredInstrumentRecord,
  ): Promise<void>
}

export interface FinanceCheckoutPaymentStartersRuntime {
  resolvePaymentStarters(bindings: Record<string, unknown>): Record<string, CheckoutPaymentStarter>
}

export interface FinanceInvoiceSettlementPollerProvider {
  provider: string
  poller: InvoiceSettlementPoller
}

export interface FinanceBookingScheduleRuntime {
  options: BookingScheduleRoutesOptions
  withDb<T>(bindings: unknown, operation: (db: AnyDrizzleDb) => Promise<T>): Promise<T>
}

export const financeHostRuntimePort = objectPort<FinanceHostRuntime>("finance.host.runtime")
export const financeOperatorSettingsRuntimePort = objectPort<FinanceOperatorSettingsRuntime>(
  "finance.operator-settings.runtime",
  [
    "resolveOperatorDefaultPaymentPolicy",
    "resolveInvoicePayUrlTemplate",
    "resolveBookingTaxSettings",
    "updateBookingTaxSettings",
    "resolveInvoicingMode",
    "resolveInvoiceFxSettings",
    "updateInvoiceFxSettings",
  ],
)
export const financeNotificationsRuntimePort = objectPort<FinanceNotificationsRuntime>(
  "finance.notifications.runtime",
  ["resolveNotificationDispatcher", "listBookingReminderRuns"],
)
export const financeFxReferenceRuntimePort = objectPort<FinanceFxReferenceRuntime>(
  "finance.fx-reference.runtime",
  ["resolveReferenceRate"],
)
export const financeFxRateCaptureRuntimePort = objectPort<FinanceFxRateCaptureRuntime>(
  "finance.fx-rate-capture.runtime",
  ["captureFxRates"],
)

/**
 * Raised when a caller explicitly requests an official FX reference
 * rate but no `finance.fx-reference.runtime` provider is wired. Callers
 * that never request a reference rate are unaffected — the seam is
 * inert until used.
 */
export class FinanceFxReferenceSourceUnavailableError extends Error {
  readonly code = "finance_fx_reference_source_unavailable"

  constructor() {
    super(
      "No FX reference-rate source is configured. A host must provide the finance.fx-reference.runtime port.",
    )
    this.name = "FinanceFxReferenceSourceUnavailableError"
  }
}

export interface ResolveReferenceRateHelperInput {
  base: string
  quote: string
  date?: string
  /** Host-provided implementation. Absent → typed unavailable error. */
  provider?: FinanceFxReferenceRuntime | null
}

/**
 * Typed helper that resolves an official FX reference rate by delegating
 * to the host-provided `finance.fx-reference.runtime` implementation. The
 * source is the host adapter's own — the operator does not pick one. When
 * no provider is wired, throws {@link FinanceFxReferenceSourceUnavailableError}
 * — a clear, typed signal rather than a silent fallback. Finance holds no
 * FX data itself.
 */
export function resolveReferenceRate(
  input: ResolveReferenceRateHelperInput,
): Promise<FxReferenceRate> {
  const { provider, base, quote, date } = input
  if (!provider) {
    throw new FinanceFxReferenceSourceUnavailableError()
  }
  return provider.resolveReferenceRate({ base, quote, date })
}
export const financeDistributionPaymentPolicyRuntimePort =
  objectPort<FinanceDistributionPaymentPolicyRuntime>(
    "finance.distribution-payment-policy.runtime",
    ["resolveSupplierPolicy", "resolveSupplierPolicyById"],
  )
export const financeProposalsPaymentPolicyRuntimePort =
  objectPort<FinanceProposalsPaymentPolicyRuntime>("finance.proposals-payment-policy.runtime", [
    "resolveProposalVersionPolicy",
  ])
export const financeAccommodationsPaymentPolicyRuntimePort =
  objectPort<FinanceAccommodationsPaymentPolicyRuntime>(
    "finance.accommodations-payment-policy.runtime",
    ["resolveBookingPolicy", "resolveEntityPolicy"],
  )
export const financeCruisesPaymentPolicyRuntimePort =
  objectPort<FinanceCruisesPaymentPolicyRuntime>("finance.cruises-payment-policy.runtime", [
    "resolveBookingPolicy",
    "resolveEntityPolicy",
    "resolveSupplierId",
  ])
export const financeInventoryPaymentPolicyRuntimePort =
  objectPort<FinanceInventoryPaymentPolicyRuntime>("finance.inventory-payment-policy.runtime", [
    "createPaymentPolicyRuntime",
    "stampPolicySourceOnBooking",
    "readPolicySourceFromInternalNotes",
  ])
export const financeStoredInstrumentRuntimePort = objectPort<FinanceStoredInstrumentRuntime>(
  "finance.stored-instrument.runtime",
  ["recordStoredInstrument"],
)
export const financeCheckoutPaymentStartersRuntimePort =
  objectPort<FinanceCheckoutPaymentStartersRuntime>("finance.checkout-payment-starters.runtime", [
    "resolvePaymentStarters",
  ])
export const financeInvoiceSettlementPollerRuntimePort =
  definePort<FinanceInvoiceSettlementPollerProvider>({
    id: "finance.invoice-settlement-poller",
    test(provider) {
      if (
        provider === null ||
        typeof provider !== "object" ||
        typeof provider.provider !== "string" ||
        provider.provider.trim() !== provider.provider ||
        provider.provider.length === 0 ||
        typeof provider.poller !== "function"
      ) {
        throw new Error(
          "finance.invoice-settlement-poller provider must declare a canonical provider name and poller function.",
        )
      }
    },
  })

/**
 * Options-shaped ports: the provider IS the options object the routes or job
 * need, so the only invariant worth asserting is that one was supplied.
 */
function optionsPort<T extends object>(id: string) {
  return definePort<T>({
    id,
    test(provider) {
      if (provider === null || typeof provider !== "object") {
        throw new Error(`${id} provider must be an options object.`)
      }
    },
  })
}

export interface PaymentReconciliationJobRuntime {
  resolveDb(bindings: unknown): PostgresJsDatabase | Promise<PostgresJsDatabase>
  resolveAdapter(): PaymentAdapter | null | Promise<PaymentAdapter | null>
  resolveEnv(bindings: unknown): Readonly<Record<string, unknown>>
  warn?(message: string, detail?: unknown): void
}

export const financePaymentLinkRuntimePort = optionsPort<PaymentLinkRoutesOptions>(
  "finance.payment-link.runtime",
)
export const financePaymentReconciliationJobRuntimePort =
  optionsPort<PaymentReconciliationJobRuntime>("finance.payment-reconciliation-job.runtime")
