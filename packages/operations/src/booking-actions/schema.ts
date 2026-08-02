import type {
  BookingActionCustomerNextAction,
  BookingActionEscalationPolicy,
  BookingActionKind,
  BookingActionOperatorNextAction,
  BookingActionSourceState,
} from "@voyant-travel/bookings-contracts/booking-actions"
import { typeId } from "@voyant-travel/db/lib/typeid-column"
import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

/**
 * Operations-owned read model of booking obligations. It intentionally has no
 * foreign keys to source modules: source identity is a stable federated tuple,
 * and source modules remain the only writers of authoritative state.
 */
export const bookingActionProjections = pgTable(
  "booking_action_projections",
  {
    id: typeId("booking_action_projections"),
    providerId: text("provider_id").notNull(),
    sourceModule: text("source_module").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }).notNull(),
    kind: text("kind").$type<BookingActionKind>().notNull(),
    bookingId: text("booking_id"),
    bookingSessionId: text("booking_session_id"),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    dueLocalDate: text("due_local_date"),
    timeZone: text("time_zone").notNull(),
    deadlineSemantics: text("deadline_semantics").$type<"instant" | "local_date_end">().notNull(),
    sourceState: text("source_state").$type<BookingActionSourceState>().notNull(),
    satisfiedAt: timestamp("satisfied_at", { withTimezone: true }),
    dueWindowSeconds: integer("due_window_seconds").notNull(),
    escalateAfterSeconds: integer("escalate_after_seconds").notNull(),
    operatorNextAction: text("operator_next_action")
      .$type<BookingActionOperatorNextAction>()
      .notNull(),
    customerVisible: boolean("customer_visible").notNull().default(false),
    customerNextAction: text("customer_next_action").$type<BookingActionCustomerNextAction>(),
    safeMetadata: jsonb("safe_metadata").$type<Record<string, unknown>>().notNull().default({}),
    fingerprint: text("fingerprint").notNull(),
    projectedAt: timestamp("projected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("booking_action_projections_id_typeid", sql`${table.id} LIKE 'bkap_%'`),
    check(
      "booking_action_projections_source_state",
      sql`${table.sourceState} IN ('open','satisfied','cancelled','superseded','invalid_source')`,
    ),
    check(
      "booking_action_projections_deadline_semantics",
      sql`${table.deadlineSemantics} IN ('instant','local_date_end')`,
    ),
    check(
      "booking_action_projections_escalation_policy",
      sql`${table.dueWindowSeconds} >= 0 AND ${table.escalateAfterSeconds} >= ${table.dueWindowSeconds}`,
    ),
    uniqueIndex("uidx_booking_action_projections_source").on(
      table.providerId,
      table.sourceModule,
      table.sourceType,
      table.sourceId,
    ),
    index("idx_booking_action_projections_work_queue").on(table.sourceState, table.dueAt),
    index("idx_booking_action_projections_booking").on(table.bookingId, table.dueAt),
    index("idx_booking_action_projections_session").on(table.bookingSessionId, table.dueAt),
    index("idx_booking_action_projections_provider_projected").on(
      table.providerId,
      table.projectedAt,
    ),
  ],
)

export type BookingActionProjection = typeof bookingActionProjections.$inferSelect
export type NewBookingActionProjection = typeof bookingActionProjections.$inferInsert

export function bookingActionEscalationPolicy(
  row: Pick<BookingActionProjection, "dueWindowSeconds" | "escalateAfterSeconds">,
): BookingActionEscalationPolicy {
  return {
    dueWindowSeconds: row.dueWindowSeconds,
    escalateAfterSeconds: row.escalateAfterSeconds,
  }
}
