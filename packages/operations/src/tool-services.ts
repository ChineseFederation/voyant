import type { BookingActionSyncSummary } from "@voyant-travel/bookings-contracts/booking-actions"
import type { ToolContext, ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import type { z } from "zod"

import type {
  attachDepartureResourceSchema,
  availabilityAggregatesQuerySchema,
  availabilityCloseoutListQuerySchema,
  availabilityOverviewQuerySchema,
  availabilityRuleListQuerySchema,
  availabilitySlotCoreSchema,
  availabilitySlotListQuerySchema,
  availabilityStartTimeListQuerySchema,
  batchAssignTravelerAllocationsSchema,
  detachDepartureResourceQuerySchema,
  materializeFromRoomBlockSchema,
  updateTravelerRoomingPreferencesSchema,
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
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
  /**
   * Departure-planning writes. Each mirrors one leg of
   * `routes-allocation-planning.ts`; the runtime owns translating the
   * allocation services' status-coded failures into Tool errors.
   */
  attachDepartureFleetResource(
    departureId: string,
    input: z.infer<typeof attachDepartureResourceSchema>,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
  detachDepartureFleetResource(
    departureId: string,
    fleetResourceId: string,
    options: Omit<z.infer<typeof detachDepartureResourceQuerySchema>, "cascade"> & {
      cascade?: boolean
    },
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
  listDepartureFleetResources(departureId: string): Promise<unknown>
  setDepartureTravelerAssignments(
    departureId: string,
    input: z.infer<typeof batchAssignTravelerAllocationsSchema>,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
  /**
   * Room inventory drawn from a contracted accommodation block. Both legs go
   * through the single write path that keeps the departure's positions and the
   * block's nightly hold in one transaction.
   */
  materializeDepartureRoomBlock(
    departureId: string,
    input: z.infer<typeof materializeFromRoomBlockSchema>,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
  releaseDepartureRoomBlock(
    departureId: string,
    blockId: string,
    options: { kind?: string },
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
  setDepartureTravelerRoomingPreferences(
    departureId: string,
    travelerId: string,
    input: z.infer<typeof updateTravelerRoomingPreferencesSchema>,
    admitted: ToolHandlerActionPolicyContext,
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
