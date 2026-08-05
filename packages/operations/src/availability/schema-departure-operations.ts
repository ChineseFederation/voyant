import { typeId } from "@voyant-travel/db/lib/typeid-column"
import { sql } from "drizzle-orm"
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

/**
 * The operational lifecycle of a single materialized departure service line.
 *
 * Deliberately NOT `availability_slot_status`. That enum is capacity-shaped
 * (open / closed / sold_out / cancelled) and describes whether a whole
 * departure can still be sold. A line status describes whether one operable
 * item on the run sheet has been arranged with its supplier and delivered — a
 * different axis with its own transitions (voyant#4035). Overloading the slot
 * enum would conflate "is there room" with "is the coach booked".
 */
export const departureServiceOperationStatusEnum = pgEnum("departure_service_operation_status", [
  "planned",
  "requested",
  "confirmed",
  "ready",
  "completed",
  "cancelled",
  "exception",
])

export type DepartureServiceOperationStatus =
  (typeof departureServiceOperationStatusEnum.enumValues)[number]

/**
 * One operable service line on a specific departure, materialized from the
 * FROZEN `product_versions.snapshot` a slot was sold against.
 *
 * `slotId`, `productVersionId`, `facilityId`, `supplierId` and
 * `supplierServiceId` are soft references (plain text): `availability_slots` is
 * owned by this module's availability schema, `product_versions` by inventory, and
 * facilities/suppliers by other modules — a cross-domain foreign key would
 * violate schema discipline, exactly as `availability_slots.product_version_id`
 * documents.
 *
 * Idempotency key is `(slot_id, source_day_service_id)`: re-materializing a
 * departure never duplicates a line, and — because it reads the frozen
 * snapshot rather than live product rows — never rewrites one either.
 */
export const departureServiceOperations = pgTable(
  "departure_service_operations",
  {
    id: typeId("departure_service_operations"),
    slotId: text("slot_id").notNull(),
    productVersionId: text("product_version_id"),
    sourceDayId: text("source_day_id").notNull(),
    sourceDayServiceId: text("source_day_service_id").notNull(),
    dayNumber: integer("day_number").notNull(),
    dateLocal: date("date_local").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    timezone: text("timezone").notNull(),
    sequence: integer("sequence").notNull().default(0),
    facilityId: text("facility_id"),
    supplierId: text("supplier_id"),
    supplierServiceId: text("supplier_service_id"),
    serviceType: text("service_type"),
    name: text("name").notNull(),
    inclusionRole: text("inclusion_role").notNull().default("included"),
    travelerScope: text("traveler_scope").notNull().default("all"),
    status: departureServiceOperationStatusEnum("status").notNull().default("planned"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uidx_departure_service_operations_slot_source").on(
      table.slotId,
      table.sourceDayServiceId,
    ),
    index("idx_departure_service_operations_slot_day_seq").on(
      table.slotId,
      table.dayNumber,
      table.sequence,
    ),
    index("idx_departure_service_operations_version").on(table.productVersionId),
    index("idx_departure_service_operations_status").on(table.status),
    index("idx_departure_service_operations_supplier").on(table.supplierId),
    index("idx_departure_service_operations_facility").on(table.facilityId),
    /**
     * `inclusion_role` and `traveler_scope` mirror vocabularies inventory owns
     * (`day_service_inclusion_role`, `day_service_traveler_scope`). Operations
     * cannot import inventory's pgEnum without a cross-domain schema
     * dependency, and minting a second Postgres enum type of the same name
     * would make this copy look authoritative — so the domain is pinned with a
     * check constraint instead, the same way `supplier_operations` pins its
     * subject types.
     *
     * Without these the columns were plain `text` with a default and accepted
     * any string, so a materializer bug could silently write an
     * inclusion role no reader understands.
     *
     * If inventory adds a value, this constraint must be widened in the same
     * change — that coupling is the point, and a failing insert is a far better
     * signal than a row nothing can interpret.
     */
    check(
      "ck_departure_service_operations_inclusion_role",
      sql`${table.inclusionRole} IN ('included', 'optional')`,
    ),
    check(
      "ck_departure_service_operations_traveler_scope",
      sql`${table.travelerScope} IN ('all', 'adults', 'children')`,
    ),
  ],
)

export type DepartureServiceOperation = typeof departureServiceOperations.$inferSelect
export type NewDepartureServiceOperation = typeof departureServiceOperations.$inferInsert
