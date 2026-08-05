import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { identityAddresses } from "@voyant-travel/identity/schema"
import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

import { groundDispatches } from "./schema-dispatch.js"
import { groundDrivers, groundOperators, groundVehicles } from "./schema-operators.js"
import {
  groundAssignmentSourceEnum,
  groundCheckpointStatusEnum,
  groundDispatchLegTypeEnum,
  groundDriverShiftStatusEnum,
  groundExecutionEventTypeEnum,
  groundIncidentResolutionStatusEnum,
  groundIncidentSeverityEnum,
} from "./schema-shared.js"

export const groundExecutionEvents = pgTable(
  "ground_execution_events",
  {
    id: typeId("ground_execution_events"),
    dispatchId: typeIdRef("dispatch_id")
      .notNull()
      .references(() => groundDispatches.id, { onDelete: "cascade" }),
    eventType: groundExecutionEventTypeEnum("event_type").notNull().default("note"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    facilityId: typeIdRef("facility_id"),
    // Cross-package FK into identity, allowed because operations declares
    // "@voyant-travel/identity" in voyant.requiresSchemas — see
    // docs/architecture/schema-discipline.md. identity_addresses is hard-deleted,
    // so `set null` is what stops this column holding a dangling id.
    addressId: typeIdRef("address_id").references(() => identityAddresses.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_ground_execution_events_dispatch_occurred_created").on(
      table.dispatchId,
      table.occurredAt,
      table.createdAt,
    ),
    index("idx_ground_execution_events_type_occurred_created").on(
      table.eventType,
      table.occurredAt,
      table.createdAt,
    ),
    index("idx_ground_execution_events_facility_occurred_created").on(
      table.facilityId,
      table.occurredAt,
      table.createdAt,
    ),
    index("idx_ground_execution_events_occurred_at").on(table.occurredAt),
  ],
)

export const groundDispatchAssignments = pgTable(
  "ground_dispatch_assignments",
  {
    id: typeId("ground_dispatch_assignments"),
    dispatchId: typeIdRef("dispatch_id")
      .notNull()
      .references(() => groundDispatches.id, { onDelete: "cascade" }),
    operatorId: typeIdRef("operator_id").references(() => groundOperators.id, {
      onDelete: "set null",
    }),
    vehicleId: typeIdRef("vehicle_id").references(() => groundVehicles.id, {
      onDelete: "set null",
    }),
    driverId: typeIdRef("driver_id").references(() => groundDrivers.id, { onDelete: "set null" }),
    assignmentSource: groundAssignmentSourceEnum("assignment_source").notNull().default("manual"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_ground_dispatch_assignments_dispatch_assigned").on(
      table.dispatchId,
      table.assignedAt,
    ),
    index("idx_ground_dispatch_assignments_operator_assigned").on(
      table.operatorId,
      table.assignedAt,
    ),
    index("idx_ground_dispatch_assignments_vehicle_assigned").on(table.vehicleId, table.assignedAt),
    index("idx_ground_dispatch_assignments_driver_assigned").on(table.driverId, table.assignedAt),
    index("idx_ground_dispatch_assignments_source_assigned").on(
      table.assignmentSource,
      table.assignedAt,
    ),
  ],
)

export const groundDispatchLegs = pgTable(
  "ground_dispatch_legs",
  {
    id: typeId("ground_dispatch_legs"),
    dispatchId: typeIdRef("dispatch_id")
      .notNull()
      .references(() => groundDispatches.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull().default(0),
    legType: groundDispatchLegTypeEnum("leg_type").notNull().default("pickup"),
    facilityId: typeIdRef("facility_id"),
    // Cross-package FK into identity, allowed because operations declares
    // "@voyant-travel/identity" in voyant.requiresSchemas — see
    // docs/architecture/schema-discipline.md. identity_addresses is hard-deleted,
    // so `set null` is what stops this column holding a dangling id.
    addressId: typeIdRef("address_id").references(() => identityAddresses.id, {
      onDelete: "set null",
    }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    actualAt: timestamp("actual_at", { withTimezone: true }),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_ground_dispatch_legs_dispatch_sequence").on(table.dispatchId, table.sequence),
    index("idx_ground_dispatch_legs_type_sequence").on(table.legType, table.sequence),
    index("idx_ground_dispatch_legs_facility_sequence").on(table.facilityId, table.sequence),
  ],
)

export const groundDispatchPassengers = pgTable(
  "ground_dispatch_passengers",
  {
    id: typeId("ground_dispatch_passengers"),
    dispatchId: typeIdRef("dispatch_id")
      .notNull()
      .references(() => groundDispatches.id, { onDelete: "cascade" }),
    participantId: text("participant_id"),
    displayName: text("display_name"),
    seatLabel: text("seat_label"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_ground_dispatch_passengers_dispatch_created").on(table.dispatchId, table.createdAt),
    index("idx_ground_dispatch_passengers_participant_created").on(
      table.participantId,
      table.createdAt,
    ),
  ],
)

export const groundDriverShifts = pgTable(
  "ground_driver_shifts",
  {
    id: typeId("ground_driver_shifts"),
    driverId: typeIdRef("driver_id")
      .notNull()
      .references(() => groundDrivers.id, { onDelete: "cascade" }),
    operatorId: typeIdRef("operator_id").references(() => groundOperators.id, {
      onDelete: "set null",
    }),
    facilityId: typeIdRef("facility_id"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: groundDriverShiftStatusEnum("status").notNull().default("scheduled"),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_ground_driver_shifts_starts_at").on(table.startsAt),
    index("idx_ground_driver_shifts_driver_starts_at").on(table.driverId, table.startsAt),
    index("idx_ground_driver_shifts_operator_starts_at").on(table.operatorId, table.startsAt),
    index("idx_ground_driver_shifts_facility_starts_at").on(table.facilityId, table.startsAt),
    index("idx_ground_driver_shifts_status_starts_at").on(table.status, table.startsAt),
  ],
)

export const groundServiceIncidents = pgTable(
  "ground_service_incidents",
  {
    id: typeId("ground_service_incidents"),
    dispatchId: typeIdRef("dispatch_id")
      .notNull()
      .references(() => groundDispatches.id, { onDelete: "cascade" }),
    severity: groundIncidentSeverityEnum("severity").notNull().default("warning"),
    incidentType: text("incident_type").notNull(),
    resolutionStatus: groundIncidentResolutionStatusEnum("resolution_status")
      .notNull()
      .default("open"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_ground_service_incidents_dispatch_opened").on(table.dispatchId, table.openedAt),
    index("idx_ground_service_incidents_severity_opened").on(table.severity, table.openedAt),
    index("idx_ground_service_incidents_resolution_opened").on(
      table.resolutionStatus,
      table.openedAt,
    ),
  ],
)

export const groundDispatchCheckpoints = pgTable(
  "ground_dispatch_checkpoints",
  {
    id: typeId("ground_dispatch_checkpoints"),
    dispatchId: typeIdRef("dispatch_id")
      .notNull()
      .references(() => groundDispatches.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull().default(0),
    checkpointType: text("checkpoint_type").notNull(),
    status: groundCheckpointStatusEnum("status").notNull().default("pending"),
    plannedAt: timestamp("planned_at", { withTimezone: true }),
    actualAt: timestamp("actual_at", { withTimezone: true }),
    facilityId: typeIdRef("facility_id"),
    // Cross-package FK into identity, allowed because operations declares
    // "@voyant-travel/identity" in voyant.requiresSchemas — see
    // docs/architecture/schema-discipline.md. identity_addresses is hard-deleted,
    // so `set null` is what stops this column holding a dangling id.
    addressId: typeIdRef("address_id").references(() => identityAddresses.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_ground_dispatch_checkpoints_dispatch_sequence").on(table.dispatchId, table.sequence),
    index("idx_ground_dispatch_checkpoints_status_sequence").on(table.status, table.sequence),
    index("idx_ground_dispatch_checkpoints_facility_sequence").on(table.facilityId, table.sequence),
  ],
)

export type GroundExecutionEvent = typeof groundExecutionEvents.$inferSelect
export type NewGroundExecutionEvent = typeof groundExecutionEvents.$inferInsert
export type GroundDispatchAssignment = typeof groundDispatchAssignments.$inferSelect
export type NewGroundDispatchAssignment = typeof groundDispatchAssignments.$inferInsert
export type GroundDispatchLeg = typeof groundDispatchLegs.$inferSelect
export type NewGroundDispatchLeg = typeof groundDispatchLegs.$inferInsert
export type GroundDispatchPassenger = typeof groundDispatchPassengers.$inferSelect
export type NewGroundDispatchPassenger = typeof groundDispatchPassengers.$inferInsert
export type GroundDriverShift = typeof groundDriverShifts.$inferSelect
export type NewGroundDriverShift = typeof groundDriverShifts.$inferInsert
export type GroundServiceIncident = typeof groundServiceIncidents.$inferSelect
export type NewGroundServiceIncident = typeof groundServiceIncidents.$inferInsert
export type GroundDispatchCheckpoint = typeof groundDispatchCheckpoints.$inferSelect
export type NewGroundDispatchCheckpoint = typeof groundDispatchCheckpoints.$inferInsert
