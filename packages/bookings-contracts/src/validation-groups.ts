import { z } from "zod"

// ---------- booking groups ----------

export const bookingGroupKindSchema = z.enum(["shared_room", "cruise_party", "other"])
export const bookingGroupMemberRoleSchema = z.enum(["primary", "shared"])

const bookingGroupCoreSchema = z.object({
  kind: bookingGroupKindSchema.default("shared_room"),
  label: z.string().min(1).max(500),
  primaryBookingId: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
  optionUnitId: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})

export const insertBookingGroupSchema = bookingGroupCoreSchema
export const updateBookingGroupSchema = bookingGroupCoreSchema.partial().extend({
  kind: bookingGroupKindSchema.optional(),
})

export const addBookingGroupMemberSchema = z.object({
  bookingId: z.string().min(1),
  role: bookingGroupMemberRoleSchema.default("shared"),
})

export const bookingGroupListQuerySchema = z.object({
  kind: bookingGroupKindSchema.optional(),
  productId: z.string().optional(),
  optionUnitId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
