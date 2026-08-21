import { z } from "zod"

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const entityTypeSchema = z.enum([
  "organization",
  "person",
  "proposal",
  "activity",
  "booking",
  "inquiry",
])
export const customFieldTargetSchema = z.string().min(1)

export const recordStatusSchema = z.enum(["active", "inactive", "archived"])
export const relationTypeSchema = z.enum(["client", "partner", "supplier", "other"])
export const communicationChannelSchema = z.enum([
  "email",
  "phone",
  "whatsapp",
  "sms",
  "meeting",
  "other",
])
export const communicationDirectionSchema = z.enum(["inbound", "outbound"])
export const activityTypeSchema = z.enum(["call", "email", "meeting", "task", "follow_up", "note"])
export const activityStatusSchema = z.enum(["planned", "done", "cancelled"])
export const activityLinkRoleSchema = z.enum(["primary", "related"])
export const nullableTrimmedStringSchema = z
  .string()
  .nullable()
  .optional()
  .transform((value) => (typeof value === "string" ? value.trim() || null : value))
