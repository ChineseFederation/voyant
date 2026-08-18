import { pgEnum } from "drizzle-orm/pg-core"

export const entityTypeEnum = pgEnum("entity_type", [
  "organization",
  "person",
  "proposal",
  "activity",
  "booking",
  "inquiry",
])

export const relationTypeEnum = pgEnum("relation_type", ["client", "partner", "supplier", "other"])

export const communicationChannelEnum = pgEnum("communication_channel", [
  "email",
  "phone",
  "whatsapp",
  "sms",
  "meeting",
  "other",
])

export const communicationDirectionEnum = pgEnum("communication_direction", ["inbound", "outbound"])

export const recordStatusEnum = pgEnum("record_status", ["active", "inactive", "archived"])

export const activityTypeEnum = pgEnum("activity_type", [
  "call",
  "email",
  "meeting",
  "task",
  "follow_up",
  "note",
])

export const activityStatusEnum = pgEnum("activity_status", ["planned", "done", "cancelled"])

export const activityLinkRoleEnum = pgEnum("activity_link_role", ["primary", "related"])
