import { z } from "zod"

import { paginationSchema } from "./common.js"

// ---------- customer signals ----------

export const customerSignalKindSchema = z.enum([
  "wishlist",
  "notify",
  "inquiry",
  "request_offer",
  "referral",
])

/** New writes exclude the two kinds now owned by the Inquiry aggregate. */
export const activeCustomerSignalKindSchema = z.enum(["wishlist", "notify", "referral"])

export const customerSignalSourceSchema = z.enum([
  "form",
  "phone",
  "admin",
  "abandoned_cart",
  "website",
  "booking",
])

export const customerSignalStatusSchema = z.enum([
  "new",
  "contacted",
  "qualified",
  "converted",
  "lost",
  "expired",
])

export const customerSignalPrioritySchema = z.enum(["low", "normal", "high", "urgent"])

const customerSignalCoreSchema = z.object({
  personId: z.string().min(1),
  productId: z.string().nullable().optional(),
  optionUnitId: z.string().nullable().optional(),
  kind: activeCustomerSignalKindSchema,
  source: customerSignalSourceSchema,
  status: customerSignalStatusSchema.default("new"),
  priority: customerSignalPrioritySchema.default("normal"),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  assignedToUserId: z.string().nullable().optional(),
  followUpAt: z.string().datetime().nullable().optional(),
  resolvedBookingId: z.string().nullable().optional(),
  sourceSubmissionId: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const insertCustomerSignalSchema = customerSignalCoreSchema
export const updateCustomerSignalSchema = customerSignalCoreSchema
  .partial()
  .omit({ personId: true })

export const customerSignalListQuerySchema = paginationSchema.extend({
  personId: z.string().optional(),
  assignedToUserId: z.string().optional(),
  status: customerSignalStatusSchema.optional(),
  kind: customerSignalKindSchema.optional(),
  productId: z.string().optional(),
  search: z.string().optional(),
})

export const resolveCustomerSignalSchema = z.object({
  bookingId: z.string().min(1),
})

export type CustomerSignalInput = z.infer<typeof insertCustomerSignalSchema>
export type CustomerSignalUpdate = z.infer<typeof updateCustomerSignalSchema>
export type CustomerSignalListQueryInput = z.infer<typeof customerSignalListQuerySchema>
export type ResolveCustomerSignalInput = z.infer<typeof resolveCustomerSignalSchema>
