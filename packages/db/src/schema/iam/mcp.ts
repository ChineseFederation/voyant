import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export interface StoredMcpExposurePolicy {
  allowedRiskLevels: string[]
  allowWrites: boolean
  allowSensitiveData: boolean
  toolOverrides: Record<string, "allow" | "deny">
}

/** One deployment-wide ceiling applied to every API-token and OAuth MCP client. */
export const mcpExposurePolicies = pgTable("mcp_exposure_policies", {
  id: text("id").primaryKey(),
  policy: jsonb("policy").$type<StoredMcpExposurePolicy>().notNull(),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export type McpExposurePolicyRow = typeof mcpExposurePolicies.$inferSelect
export type NewMcpExposurePolicyRow = typeof mcpExposurePolicies.$inferInsert
