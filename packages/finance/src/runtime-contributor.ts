import {
  type ActionLedgerFinanceDriftRuntime,
  actionLedgerFinanceDriftRuntimePort,
} from "@voyant-travel/action-ledger/runtime-port"
import {
  type BookingActionSourceRuntime,
  type BookingsFinanceRuntime,
  bookingActionSourceRuntimePort,
  bookingsFinanceRuntimePort,
} from "@voyant-travel/bookings/runtime-port"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { VoyantPort } from "@voyant-travel/core/project"
import { financeAppApiRuntimePort } from "@voyant-travel/finance-contracts/app-api"
import {
  type FinanceDepartureProfitabilityRuntime,
  financeDepartureProfitabilityRuntimePort,
} from "@voyant-travel/finance-contracts/runtime-port"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { checkFinanceActionLedgerDrift } from "./action-ledger-drift.js"
import { createFinanceAppApiRuntime } from "./app-api-runtime.js"
import { financeBookingActionSource } from "./booking-action-source.js"
import { createBookingAmendmentFinanceRuntime } from "./booking-amendment-runtime.js"
import {
  type FinanceOperatorSettingsRuntime,
  financeHostRuntimePort,
  financeOperatorSettingsRuntimePort,
} from "./runtime-port.js"
import { getDepartureProfitability } from "./service-profitability.js"

export interface FinanceRuntimeContributorHost {
  primitives: VoyantRuntimeHostPrimitives
  hasRuntimePort?(port: Pick<VoyantPort<unknown>, "id">): boolean
  getRuntimePort<T>(port: Pick<VoyantPort<T>, "id">): T | Promise<T>
}

/** Provide Finance's generic host input and its narrow Bookings integration. */
export function createFinanceRuntimePortContribution(
  host: FinanceRuntimeContributorHost,
): Readonly<Record<string, unknown>> {
  const amendmentRuntime = createBookingAmendmentFinanceRuntime({
    resolveBookingTaxSettings: async (db) =>
      (
        await host.getRuntimePort<FinanceOperatorSettingsRuntime>(
          financeOperatorSettingsRuntimePort,
        )
      ).resolveBookingTaxSettings(db),
  })
  return {
    [bookingActionSourceRuntimePort.id]:
      financeBookingActionSource satisfies BookingActionSourceRuntime,
    [financeAppApiRuntimePort.id]: createFinanceAppApiRuntime(host.primitives),
    [actionLedgerFinanceDriftRuntimePort.id]: {
      checkFinanceDrift: checkFinanceActionLedgerDrift,
    } satisfies ActionLedgerFinanceDriftRuntime,
    [financeHostRuntimePort.id]: { primitives: host.primitives },
    // Read-only P&L for one departure. FX settings are resolved inside
    // `getDepartureProfitability` from the same database the caller hands in,
    // so the seam carries no FX options and Finance stays the authority on
    // what a departure is worth.
    [financeDepartureProfitabilityRuntimePort.id]: {
      getDepartureProfitability: (db, query) => getDepartureProfitability(db, query),
    } satisfies FinanceDepartureProfitabilityRuntime<PostgresJsDatabase>,
    [bookingsFinanceRuntimePort.id]: {
      ...amendmentRuntime,
    } satisfies BookingsFinanceRuntime,
  }
}
