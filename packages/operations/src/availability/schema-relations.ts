import { relations } from "drizzle-orm"
import {
  type allocationAuditLog,
  allocationResources,
  availabilityCloseouts,
  availabilityRules,
  availabilitySlots,
  availabilityStartTimes,
  productOptionResourceTemplates,
  type sharingGroupLabels,
} from "./schema-core.js"
import {
  availabilityPickupPoints,
  availabilitySlotPickups,
  customPickupAreas,
  locationPickupTimes,
  pickupGroups,
  pickupLocations,
  productMeetingConfigs,
} from "./schema-pickups.js"

export type AvailabilityRule = typeof availabilityRules.$inferSelect
export type NewAvailabilityRule = typeof availabilityRules.$inferInsert
export type AvailabilityStartTime = typeof availabilityStartTimes.$inferSelect
export type NewAvailabilityStartTime = typeof availabilityStartTimes.$inferInsert
export type AvailabilitySlot = typeof availabilitySlots.$inferSelect
export type NewAvailabilitySlot = typeof availabilitySlots.$inferInsert
export type AvailabilityCloseout = typeof availabilityCloseouts.$inferSelect
export type NewAvailabilityCloseout = typeof availabilityCloseouts.$inferInsert
export type AllocationResource = typeof allocationResources.$inferSelect
export type NewAllocationResource = typeof allocationResources.$inferInsert
export type SharingGroupLabel = typeof sharingGroupLabels.$inferSelect
export type NewSharingGroupLabel = typeof sharingGroupLabels.$inferInsert
export type AllocationAuditLog = typeof allocationAuditLog.$inferSelect
export type NewAllocationAuditLog = typeof allocationAuditLog.$inferInsert
export type ProductOptionResourceTemplate = typeof productOptionResourceTemplates.$inferSelect
export type NewProductOptionResourceTemplate = typeof productOptionResourceTemplates.$inferInsert
export type AvailabilityPickupPoint = typeof availabilityPickupPoints.$inferSelect
export type NewAvailabilityPickupPoint = typeof availabilityPickupPoints.$inferInsert
export type AvailabilitySlotPickup = typeof availabilitySlotPickups.$inferSelect
export type NewAvailabilitySlotPickup = typeof availabilitySlotPickups.$inferInsert
export type ProductMeetingConfig = typeof productMeetingConfigs.$inferSelect
export type NewProductMeetingConfig = typeof productMeetingConfigs.$inferInsert
export type PickupGroup = typeof pickupGroups.$inferSelect
export type NewPickupGroup = typeof pickupGroups.$inferInsert
export type PickupLocation = typeof pickupLocations.$inferSelect
export type NewPickupLocation = typeof pickupLocations.$inferInsert
export type LocationPickupTime = typeof locationPickupTimes.$inferSelect
export type NewLocationPickupTime = typeof locationPickupTimes.$inferInsert
export type CustomPickupArea = typeof customPickupAreas.$inferSelect
export type NewCustomPickupArea = typeof customPickupAreas.$inferInsert

export const availabilityRulesRelations = relations(availabilityRules, ({ many }) => ({
  slots: many(availabilitySlots),
}))

export const availabilityStartTimesRelations = relations(availabilityStartTimes, ({ many }) => ({
  slots: many(availabilitySlots),
  locationPickupTimes: many(locationPickupTimes),
}))

export const availabilitySlotsRelations = relations(availabilitySlots, ({ one, many }) => ({
  rule: one(availabilityRules, {
    fields: [availabilitySlots.availabilityRuleId],
    references: [availabilityRules.id],
  }),
  startTime: one(availabilityStartTimes, {
    fields: [availabilitySlots.startTimeId],
    references: [availabilityStartTimes.id],
  }),
  pickups: many(availabilitySlotPickups),
  closeouts: many(availabilityCloseouts),
  locationPickupTimes: many(locationPickupTimes),
  allocationResources: many(allocationResources),
}))

export const availabilityCloseoutsRelations = relations(availabilityCloseouts, ({ one }) => ({
  slot: one(availabilitySlots, {
    fields: [availabilityCloseouts.slotId],
    references: [availabilitySlots.id],
  }),
}))

export const allocationResourcesRelations = relations(allocationResources, ({ one }) => ({
  slot: one(availabilitySlots, {
    fields: [allocationResources.slotId],
    references: [availabilitySlots.id],
  }),
}))

export const productOptionResourceTemplatesRelations = relations(
  productOptionResourceTemplates,
  () => ({}),
)

export const availabilityPickupPointsRelations = relations(
  availabilityPickupPoints,
  ({ many }) => ({
    slotPickups: many(availabilitySlotPickups),
  }),
)

export const availabilitySlotPickupsRelations = relations(availabilitySlotPickups, ({ one }) => ({
  slot: one(availabilitySlots, {
    fields: [availabilitySlotPickups.slotId],
    references: [availabilitySlots.id],
  }),
  pickupPoint: one(availabilityPickupPoints, {
    fields: [availabilitySlotPickups.pickupPointId],
    references: [availabilityPickupPoints.id],
  }),
}))

export const productMeetingConfigsRelations = relations(productMeetingConfigs, ({ many }) => ({
  pickupGroups: many(pickupGroups),
  customPickupAreas: many(customPickupAreas),
}))

export const pickupGroupsRelations = relations(pickupGroups, ({ one, many }) => ({
  meetingConfig: one(productMeetingConfigs, {
    fields: [pickupGroups.meetingConfigId],
    references: [productMeetingConfigs.id],
  }),
  locations: many(pickupLocations),
}))

export const pickupLocationsRelations = relations(pickupLocations, ({ one, many }) => ({
  group: one(pickupGroups, {
    fields: [pickupLocations.groupId],
    references: [pickupGroups.id],
  }),
  pickupTimes: many(locationPickupTimes),
}))

export const locationPickupTimesRelations = relations(locationPickupTimes, ({ one }) => ({
  pickupLocation: one(pickupLocations, {
    fields: [locationPickupTimes.pickupLocationId],
    references: [pickupLocations.id],
  }),
  slot: one(availabilitySlots, {
    fields: [locationPickupTimes.slotId],
    references: [availabilitySlots.id],
  }),
  startTime: one(availabilityStartTimes, {
    fields: [locationPickupTimes.startTimeId],
    references: [availabilityStartTimes.id],
  }),
}))

export const customPickupAreasRelations = relations(customPickupAreas, ({ one }) => ({
  meetingConfig: one(productMeetingConfigs, {
    fields: [customPickupAreas.meetingConfigId],
    references: [productMeetingConfigs.id],
  }),
}))
