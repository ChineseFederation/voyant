import {
  type BookingActionProjectionRuntime,
  bookingActionProjectionRuntimePort,
} from "@voyant-travel/bookings/runtime-port"
import { catalogOperationsRuntimeExtensionPort } from "@voyant-travel/catalog/runtime-contracts"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import {
  type InquiryTargetAuthorityRuntime,
  inquiryTargetAuthorityRuntimePort,
} from "@voyant-travel/relationships-contracts/inquiry-target-authority/runtime-port"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { availabilityService } from "./availability/service.js"
import { configureAvailabilityHoldExpiryWake } from "./availability/hold-expiry-wake.js"
import { createBookingActionProjectionService } from "./booking-actions/service.js"
import { catalogOperationsRuntimeExtension } from "./catalog-runtime-extension.js"
import {
  type OperationsExpiredHoldsJobRuntime,
  operationsExpiredHoldsJobRuntimePort,
} from "./expired-holds-job-runtime-port.js"

export interface OperationsRuntimeContributorHost {
  primitives: VoyantRuntimeHostPrimitives
}

export function createOperationsRuntimePortContribution(
  host: OperationsRuntimeContributorHost,
): Readonly<Record<string, unknown>> {
  // Hold expiry is known at write time, so the reaper is woken rather than
  // polled. The host owns the timer; this only hands the domain a way to ask.
  configureAvailabilityHoldExpiryWake((jobId, at) => host.primitives.jobs.wakeAt(jobId, at))

  const bookingActions: BookingActionProjectionRuntime = {
    create: createBookingActionProjectionService,
    async synchronize(sources, mode) {
      const db = await host.primitives.database.resolve<PostgresJsDatabase>(undefined)
      return createBookingActionProjectionService(db).synchronize(sources, mode)
    },
  }
  return {
    [inquiryTargetAuthorityRuntimePort.id]: {
      kind: "option_unit",
      targetExists: async (db, targetId) =>
        (await availabilityService.getSlotById(db as PostgresJsDatabase, targetId)) != null,
    } satisfies InquiryTargetAuthorityRuntime,
    [catalogOperationsRuntimeExtensionPort.id]: catalogOperationsRuntimeExtension,
    [operationsExpiredHoldsJobRuntimePort.id]: {
      resolveDb: () => host.primitives.database.resolve<PostgresJsDatabase>(undefined),
    } satisfies OperationsExpiredHoldsJobRuntime,
    [bookingActionProjectionRuntimePort.id]: bookingActions,
  }
}
