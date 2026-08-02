import {
  type ActionLedgerFinanceDriftRuntime,
  actionLedgerFinanceDriftRuntimePort,
} from "@voyant-travel/action-ledger/runtime-port"
import {
  type BookingActionSourceRuntime,
  type BookingsFinanceRuntime,
  bookingActionSourceRuntimePort,
  bookingsFinanceRuntimePort,
  bookingsSelfServiceCreateRuntimePort,
} from "@voyant-travel/bookings/runtime-port"
import { bookings } from "@voyant-travel/bookings/schema"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { VoyantPort } from "@voyant-travel/core/project"
import { financeAppApiRuntimePort } from "@voyant-travel/finance-contracts/app-api"
import { createRouteActionRegistry } from "@voyant-travel/tools"
import { eq } from "drizzle-orm"
import { checkFinanceActionLedgerDrift } from "./action-ledger-drift.js"
import { createFinanceAppApiRuntime } from "./app-api-runtime.js"
import { financeBookingActionSource } from "./booking-action-source.js"
import { createBookingAmendmentFinanceRuntime } from "./booking-amendment-runtime.js"
import { FINANCE_BOOKING_CREATE_SELF_SERVICE_ROUTE_ACTION } from "./booking-create-policy.js"
import {
  type FinanceOperatorSettingsRuntime,
  financeHostRuntimePort,
  financeOperatorSettingsRuntimePort,
} from "./runtime-port.js"
import type { SelfServiceBookingSourceRuntime } from "./self-service-booking-source.js"
import { financeSelfServiceBookingSourceRuntimePort } from "./self-service-booking-source.js"
import { createSelfServiceCreateRuntime } from "./self-service-create-runtime.js"
import { createFinanceStaleBookingHoldsJobRuntime } from "./stale-booking-holds-runtime.js"

export interface FinanceRuntimeContributorHost {
  primitives: VoyantRuntimeHostPrimitives
  hasRuntimePort?(port: Pick<VoyantPort<unknown>, "id">): boolean
  getRuntimePort<T>(port: Pick<VoyantPort<T>, "id">): T | Promise<T>
}

/** Provide Finance's generic host input and its narrow Bookings integration. */
export function createFinanceRuntimePortContribution(
  host: FinanceRuntimeContributorHost,
): Readonly<Record<string, unknown>> {
  const hasSource = host.hasRuntimePort?.(financeSelfServiceBookingSourceRuntimePort) === true
  const routeActions = createRouteActionRegistry()
  const amendmentRuntime = createBookingAmendmentFinanceRuntime({
    resolveBookingTaxSettings: async (db) =>
      (
        await host.getRuntimePort<FinanceOperatorSettingsRuntime>(
          financeOperatorSettingsRuntimePort,
        )
      ).resolveBookingTaxSettings(db),
  })
  if (hasSource) routeActions.register(FINANCE_BOOKING_CREATE_SELF_SERVICE_ROUTE_ACTION)
  return {
    [bookingActionSourceRuntimePort.id]:
      financeBookingActionSource satisfies BookingActionSourceRuntime,
    [financeAppApiRuntimePort.id]: createFinanceAppApiRuntime(host.primitives),
    [actionLedgerFinanceDriftRuntimePort.id]: {
      checkFinanceDrift: checkFinanceActionLedgerDrift,
    } satisfies ActionLedgerFinanceDriftRuntime,
    [financeHostRuntimePort.id]: { primitives: host.primitives },
    [bookingsFinanceRuntimePort.id]: {
      createStaleBookingHoldsJobRuntime: createFinanceStaleBookingHoldsJobRuntime,
      ...amendmentRuntime,
    } satisfies BookingsFinanceRuntime,
    // The public create route lives in Bookings; Finance supplies the durable
    // command. Only contributed when a source provider is selected, so the
    // route reports 501 rather than half-working.
    ...(hasSource
      ? {
          [bookingsSelfServiceCreateRuntimePort.id]: createSelfServiceCreateRuntime({
            resolveSource: () =>
              host.getRuntimePort<SelfServiceBookingSourceRuntime>(
                financeSelfServiceBookingSourceRuntimePort,
              ),
            // Minted by the runtime boundary against the graph-registered
            // action, never fabricated by the route.
            admit: (actor, idempotencyKey) =>
              routeActions.admit(FINANCE_BOOKING_CREATE_SELF_SERVICE_ROUTE_ACTION.actionPolicy.id, {
                actor,
                invocation: { idempotencyKey },
              }),
            async readBookingSummary(db, bookingId) {
              const [row] = await db
                .select({ bookingNumber: bookings.bookingNumber, status: bookings.status })
                .from(bookings)
                .where(eq(bookings.id, bookingId))
                .limit(1)
              return row ? { bookingNumber: row.bookingNumber, status: row.status } : null
            },
          }),
        }
      : {}),
  }
}
