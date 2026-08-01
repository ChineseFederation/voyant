import { pgEnum } from "drizzle-orm/pg-core"

export const legalTargetKindValues = [
  "booking",
  "proposal_version",
  "program",
  "product",
  "inventory_item",
  "supplier_channel_relationship",
  "provider_source_ref",
] as const

export const legalTargetKindEnum = pgEnum("legal_target_kind", legalTargetKindValues)

export type LegalTargetKind = (typeof legalTargetKindValues)[number]
