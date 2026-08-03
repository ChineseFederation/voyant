import { relations } from "drizzle-orm"

import { bookings, bookingTravelers } from "./schema-core.js"
import { bookingGroupMembers, bookingGroups } from "./schema-groups.js"
import {
  bookingAllocations,
  bookingFulfillments,
  bookingItems,
  bookingItemTravelers,
  bookingRedemptionEvents,
} from "./schema-items.js"
import {
  bookingActivityLog,
  bookingDocuments,
  bookingNotes,
  bookingSupplierStatuses,
} from "./schema-operations.js"
import { bookingStaffAssignments } from "./schema-staff.js"

export const bookingsRelations = relations(bookings, ({ many }) => ({
  participants: many(bookingTravelers),
  staffAssignments: many(bookingStaffAssignments),
  supplierStatuses: many(bookingSupplierStatuses),
  activityLog: many(bookingActivityLog),
  notes: many(bookingNotes),
  documents: many(bookingDocuments),
  fulfillments: many(bookingFulfillments),
  redemptionEvents: many(bookingRedemptionEvents),
  items: many(bookingItems),
  allocations: many(bookingAllocations),
  groupMemberships: many(bookingGroupMembers),
}))

export const bookingGroupsRelations = relations(bookingGroups, ({ many }) => ({
  members: many(bookingGroupMembers),
}))

export const bookingGroupMembersRelations = relations(bookingGroupMembers, ({ one }) => ({
  group: one(bookingGroups, {
    fields: [bookingGroupMembers.groupId],
    references: [bookingGroups.id],
  }),
  booking: one(bookings, {
    fields: [bookingGroupMembers.bookingId],
    references: [bookings.id],
  }),
}))

export const bookingTravelersRelations = relations(bookingTravelers, ({ one, many }) => ({
  booking: one(bookings, { fields: [bookingTravelers.bookingId], references: [bookings.id] }),
  documents: many(bookingDocuments),
  fulfillments: many(bookingFulfillments),
  redemptionEvents: many(bookingRedemptionEvents),
  itemLinks: many(bookingItemTravelers),
}))

export const bookingParticipantsRelations = bookingTravelersRelations

export const bookingItemsRelations = relations(bookingItems, ({ one, many }) => ({
  booking: one(bookings, { fields: [bookingItems.bookingId], references: [bookings.id] }),
  participantLinks: many(bookingItemTravelers),
  staffAssignments: many(bookingStaffAssignments),
  allocations: many(bookingAllocations),
  fulfillments: many(bookingFulfillments),
  redemptionEvents: many(bookingRedemptionEvents),
}))

export const bookingAllocationsRelations = relations(bookingAllocations, ({ one }) => ({
  booking: one(bookings, { fields: [bookingAllocations.bookingId], references: [bookings.id] }),
  bookingItem: one(bookingItems, {
    fields: [bookingAllocations.bookingItemId],
    references: [bookingItems.id],
  }),
}))

export const bookingItemTravelersRelations = relations(bookingItemTravelers, ({ one }) => ({
  bookingItem: one(bookingItems, {
    fields: [bookingItemTravelers.bookingItemId],
    references: [bookingItems.id],
  }),
  traveler: one(bookingTravelers, {
    fields: [bookingItemTravelers.travelerId],
    references: [bookingTravelers.id],
  }),
}))

export const bookingItemParticipantsRelations = bookingItemTravelersRelations

export const bookingSupplierStatusesRelations = relations(bookingSupplierStatuses, ({ one }) => ({
  booking: one(bookings, {
    fields: [bookingSupplierStatuses.bookingId],
    references: [bookings.id],
  }),
}))

export const bookingFulfillmentsRelations = relations(bookingFulfillments, ({ one }) => ({
  booking: one(bookings, { fields: [bookingFulfillments.bookingId], references: [bookings.id] }),
  bookingItem: one(bookingItems, {
    fields: [bookingFulfillments.bookingItemId],
    references: [bookingItems.id],
  }),
  traveler: one(bookingTravelers, {
    fields: [bookingFulfillments.travelerId],
    references: [bookingTravelers.id],
  }),
}))

export const bookingRedemptionEventsRelations = relations(bookingRedemptionEvents, ({ one }) => ({
  booking: one(bookings, {
    fields: [bookingRedemptionEvents.bookingId],
    references: [bookings.id],
  }),
  bookingItem: one(bookingItems, {
    fields: [bookingRedemptionEvents.bookingItemId],
    references: [bookingItems.id],
  }),
  traveler: one(bookingTravelers, {
    fields: [bookingRedemptionEvents.travelerId],
    references: [bookingTravelers.id],
  }),
}))

export const bookingActivityLogRelations = relations(bookingActivityLog, ({ one }) => ({
  booking: one(bookings, { fields: [bookingActivityLog.bookingId], references: [bookings.id] }),
}))

export const bookingNotesRelations = relations(bookingNotes, ({ one }) => ({
  booking: one(bookings, { fields: [bookingNotes.bookingId], references: [bookings.id] }),
}))

export const bookingDocumentsRelations = relations(bookingDocuments, ({ one }) => ({
  booking: one(bookings, { fields: [bookingDocuments.bookingId], references: [bookings.id] }),
  traveler: one(bookingTravelers, {
    fields: [bookingDocuments.travelerId],
    references: [bookingTravelers.id],
  }),
}))

export const bookingStaffAssignmentsRelations = relations(bookingStaffAssignments, ({ one }) => ({
  booking: one(bookings, {
    fields: [bookingStaffAssignments.bookingId],
    references: [bookings.id],
  }),
  bookingItem: one(bookingItems, {
    fields: [bookingStaffAssignments.bookingItemId],
    references: [bookingItems.id],
  }),
}))
