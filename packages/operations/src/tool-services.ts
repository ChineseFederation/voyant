import type { BookingActionSyncSummary } from "@voyant-travel/bookings-contracts/booking-actions"
import type { ToolContext, ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import type { z } from "zod"

import type {
  availabilityAggregatesQuerySchema,
  availabilityCloseoutListQuerySchema,
  availabilityOverviewQuerySchema,
  availabilityRuleListQuerySchema,
  availabilitySlotCoreSchema,
  availabilitySlotListQuerySchema,
  availabilityStartTimeListQuerySchema,
} from "./availability/validation.js"

/** Availability services contributed by an Operations runtime. */
export interface OperationsToolServices {
  createDeparture(
    input: z.infer<typeof availabilitySlotCoreSchema> & { idempotencyKey?: string },
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
  updateDeparture(
    id: string,
    patch: Partial<z.infer<typeof availabilitySlotCoreSchema>> & { updatedAt?: string },
  ): Promise<unknown>
  rebuildBookingActions(): Promise<BookingActionSyncSummary>
  getAvailabilityOverview(query: z.infer<typeof availabilityOverviewQuerySchema>): Promise<unknown>
  getAvailabilityAggregates(
    query: z.infer<typeof availabilityAggregatesQuerySchema>,
  ): Promise<unknown>
  listAvailabilityRules(query: z.infer<typeof availabilityRuleListQuerySchema>): Promise<unknown>
  getAvailabilityRule(id: string): Promise<unknown>
  listAvailabilityStartTimes(
    query: z.infer<typeof availabilityStartTimeListQuerySchema>,
  ): Promise<unknown>
  listDepartures(query: z.infer<typeof availabilitySlotListQuerySchema>): Promise<unknown>
  getDeparture(id: string): Promise<unknown>
  listAvailabilityCloseouts(
    query: z.infer<typeof availabilityCloseoutListQuerySchema>,
  ): Promise<unknown>
}

export type OperationsToolContext = ToolContext & { operations?: OperationsToolServices }
