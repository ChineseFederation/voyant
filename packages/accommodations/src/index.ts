import type { Module } from "@voyant-travel/core"
import type { ApiModule } from "@voyant-travel/hono/module"

import { accommodationsLinkable } from "./linkables.js"
import { roomBlockAdminRoutes } from "./routes-room-blocks.js"

/**
 * Room blocks are the accommodations module's first linkable surface — a
 * standard, package-owned allotment primitive that any deployment can use
 * (the MICE spine merely links to it). See RFC voyant#1489.
 */
export { accommodationsLinkable, roomBlockLinkable } from "./linkables.js"

export const accommodationsModule: Module = {
  name: "accommodations",
  // Pickup / reversal / cutoff mutate per-night counters under a transaction.
  requiresTransactionalDb: true,
  linkable: accommodationsLinkable,
}

export const accommodationsApiModule: ApiModule = {
  module: accommodationsModule,
  adminRoutes: roomBlockAdminRoutes,
}

export const accommodationsApiModules = [accommodationsApiModule] as const

export * from "./booking-engine/index.js"
export * from "./catalog-policy.js"
export * from "./catalog-policy-properties.js"
export * from "./content-shape.js"
export * from "./requirements.js"
export type { RoomBlockAdminRoutes } from "./routes-room-blocks.js"
export { roomBlockAdminRoutes } from "./routes-room-blocks.js"
export * from "./service-catalog-plane.js"
export * from "./service-content.js"
export * from "./service-content-synthesizer.js"
export * from "./service-owned-stays.js"
export * from "./service-presentation-subjects.js"
export * from "./service-room-blocks.js"
export * from "./validation-room-blocks.js"
