import { defineToolContextContribution } from "@voyant-travel/tools"

import { availabilityService } from "./availability/service.js"

export * from "./tools.js"

export const voyantToolContextContribution = defineToolContextContribution({
  context: ["operations"],
  contribute: ({ context }) => {
    const db = context.db as Parameters<typeof availabilityService.listSlots>[0]
    return {
      operations: {
        createDeparture: (input: Parameters<typeof availabilityService.createSlot>[1]) =>
          availabilityService.createSlot(db, input),
        updateDeparture: (
          id: string,
          patch: Parameters<typeof availabilityService.updateSlot>[2],
        ) => availabilityService.updateSlot(db, id, patch),
        getAvailabilityOverview: (
          query: Parameters<typeof availabilityService.getAvailabilityOverview>[1],
        ) => availabilityService.getAvailabilityOverview(db, query),
        getAvailabilityAggregates: (
          query: Parameters<typeof availabilityService.getAvailabilityAggregates>[1],
        ) => availabilityService.getAvailabilityAggregates(db, query),
        listAvailabilityRules: (query: Parameters<typeof availabilityService.listRules>[1]) =>
          availabilityService.listRules(db, query),
        getAvailabilityRule: (id: string) => availabilityService.getRuleById(db, id),
        listAvailabilityStartTimes: (
          query: Parameters<typeof availabilityService.listStartTimes>[1],
        ) => availabilityService.listStartTimes(db, query),
        listDepartures: (query: Parameters<typeof availabilityService.listSlots>[1]) =>
          availabilityService.listSlots(db, query),
        getDeparture: (id: string) => availabilityService.getSlotById(db, id),
        listAvailabilityCloseouts: (
          query: Parameters<typeof availabilityService.listCloseouts>[1],
        ) => availabilityService.listCloseouts(db, query),
      },
    }
  },
})
