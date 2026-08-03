import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import { definePort } from "@voyant-travel/core/project"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { BookingTaxRouteOptions } from "./booking-tax.js"
import type { CheckoutRoutesOptions } from "./checkout-routes.js"
import type { CheckoutPaymentStarter } from "./checkout-service.js"
import type { ResolveInvoiceFxSettings, UpdateInvoiceFxSettings } from "./invoice-fx.js"
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
