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
import { checkFinanceActionLedgerDrift } from "./action-ledger-drift.js"
import { createFinanceAppApiRuntime } from "./app-api-runtime.js"
import { financeBookingActionSource } from "./booking-action-source.js"
import { createBookingAmendmentFinanceRuntime } from "./booking-amendment-runtime.js"
import {
  type FinanceOperatorSettingsRuntime,
  financeHostRuntimePort,
  financeOperatorSettingsRuntimePort,
} from "./runtime-port.js"

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
    [bookingsFinanceRuntimePort.id]: {
      ...amendmentRuntime,
    } satisfies BookingsFinanceRuntime,
  }
}
