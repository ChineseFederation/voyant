import {
  bookingActionProjectionRuntimePort,
  bookingActionSourceRuntimePort,
} from "@voyant-travel/bookings/runtime-port"
import type { Module } from "@voyant-travel/core"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import type { ApiModule } from "@voyant-travel/hono/module"

import { availabilityLinkable } from "./availability/index.js"
import { placesLinkable } from "./places/index.js"
import { createOperationsAdminRoutes, operationsAdminRoutes } from "./routes.js"
import {
  checkOperationalAvailability,
  confirmResourceHold,
  createResourceHold,
  operationsService,
  releaseResourceHold,
} from "./service.js"

export const operationsModule: Module = {
  name: "operations",
  requiresTransactionalDb: true,
  linkable: { ...availabilityLinkable, ...placesLinkable },
}

export const operationsApiModule: ApiModule = {
  module: operationsModule,
  adminRoutes: operationsAdminRoutes,
}

export const operationsApiModules = [operationsApiModule] as const

export const createOperationsVoyantRuntime = defineGraphRuntimeFactory(
  async ({ getPort, getPorts }) => ({
    module: operationsModule,
    adminRoutes: createOperationsAdminRoutes({
      projection: await getPort(bookingActionProjectionRuntimePort),
      sources: await getPorts(bookingActionSourceRuntimePort),
    }),
  }),
)

export * from "./availability/index.js"
export * from "./availability/rrule.js"
export * from "./availability/service-catalog-plane-departures.js"
export * from "./availability/service-holds.js"
export * from "./booking-actions/index.js"
export * from "./ground/index.js"
export * from "./places/index.js"
export * from "./resources/index.js"
export type { OperationsAdminRoutes, OperationsRoutes } from "./routes.js"

export type {
  CheckOperationalAvailabilityInput,
  CheckOperationalAvailabilityOutcome,
  ConfirmResourceHoldInput,
  ConfirmResourceHoldOutcome,
  CreateResourceHoldInput,
  CreateResourceHoldOutcome,
  ReleaseResourceHoldInput,
} from "./service.js"
export {
  checkOperationalAvailability,
  confirmResourceHold,
  createResourceHold,
  operationsService,
  releaseResourceHold,
}
