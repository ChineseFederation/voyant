import { pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const ORGANIZATION_SETUP_ID = "organization"

export const organizationSetup = pgTable("organization_setup", {
  id: text("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  firstRunOpenedAt: timestamp("first_run_opened_at", { withTimezone: true }),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
})

export const organizationSetupSteps = pgTable("organization_setup_steps", {
  stepId: text("step_id").primaryKey(),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  skippedAt: timestamp("skipped_at", { withTimezone: true }),
})

export type OrganizationSetup = typeof organizationSetup.$inferSelect
export type OrganizationSetupStep = typeof organizationSetupSteps.$inferSelect
