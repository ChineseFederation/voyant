/**
 * In-deployment local-Postgres `ReferenceDataProvider`.
 *
 * The simplest possible implementation: reference data lives as ordinary
 * tables in the operator's own Voyant Postgres database. Population is
 * a one-time seed migration / weekly batch refresh / CSV import — whatever
 * suits the deployment. **No external service, no network call.**
 *
 * This is a fully valid first-party implementation, not a fallback. For
 * many tour operators / DMCs, this is the right choice — they don't want
 * a hosted dependency just for IATA lookups.
 *
 * The schema below is exposed as drizzle table definitions; operators can
 * pull them into their `drizzle.config.ts` schema list to generate
 * migrations, or apply the SQL directly.
 *
 * See `docs/architecture/catalog-flights-architecture.md` §6.2.
 */

import type { AnyDrizzleDb } from "@voyant-travel/db"
import { eq, inArray } from "drizzle-orm"
import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import type {
  Aircraft,
  Airline,
  Airport,
  ReferenceDataCapabilities,
  ReferenceDataProvider,
} from "./contract.js"
import { dedupeCodes } from "./contract.js"

// ─────────────────────────────────────────────────────────────────────────────
// Drizzle table schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `reference_airlines` — IATA-code-keyed airline catalog. Populate from a
 * public IATA dataset, a CSV import, or curated by the operator.
 */
export const referenceAirlines = pgTable("reference_airlines", {
  iataCode: text("iata_code").primaryKey(),
  icaoCode: text("icao_code"),
  name: text("name").notNull(),
  country: text("country"),
  logoUrl: text("logo_url"),
  alliance: text("alliance"),
})

/**
 * `reference_airports` — IATA-code-keyed airport catalog with geo + tz.
 */
export const referenceAirports = pgTable("reference_airports", {
  iataCode: text("iata_code").primaryKey(),
  icaoCode: text("icao_code"),
  name: text("name").notNull(),
  city: text("city").notNull(),
  country: text("country").notNull(),
  timezone: text("timezone"),
  latitude: real("latitude"),
  longitude: real("longitude"),
})

/**
 * `reference_aircraft` — IATA-code-keyed aircraft type catalog.
 */
export const referenceAircraft = pgTable("reference_aircraft", {
  iataCode: text("iata_code").primaryKey(),
  icaoCode: text("icao_code"),
  name: text("name").notNull(),
  manufacturer: text("manufacturer"),
  typicalSeats: integer("typical_seats"),
})

/**
 * Durable intent and immutable supplier outcome for admitted ticket/cancel
 * commands. The action-ledger claim and pending row are inserted in one
 * transaction before any provider call.
 */
export const flightActionOperations = pgTable(
  "flight_action_operations",
  {
    id: text("id").primaryKey(),
    commandScope: text("command_scope").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    claimActionId: text("claim_action_id").notNull(),
    organizationId: text("organization_id").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    kind: text("kind").notNull(),
    backendIdentity: text("backend_identity").notNull(),
    requestSnapshot: jsonb("request_snapshot").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    leaseVersion: integer("lease_version").notNull().default(0),
    lastError: text("last_error"),
    providerOperationId: text("provider_operation_id"),
    outcomeSnapshot: jsonb("outcome_snapshot").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("uidx_flight_action_operations_command").on(
      table.commandScope,
      table.idempotencyKey,
    ),
    index("idx_flight_action_operations_target").on(
      table.targetType,
      table.targetId,
      table.kind,
      table.status,
    ),
    index("idx_flight_action_operations_due").on(
      table.status,
      table.nextAttemptAt,
      table.leaseExpiresAt,
    ),
  ],
)

// ─────────────────────────────────────────────────────────────────────────────
// Provider factory
// ─────────────────────────────────────────────────────────────────────────────

export interface LocalPostgresReferenceProviderOptions {
  db: AnyDrizzleDb
  /**
   * Override capabilities — operators that don't populate aircraft data
   * can declare `coversAircraft: false` to fail fast on aircraft lookups.
   * Default: covers airlines + airports + aircraft, read-only at the
   * provider layer (operators write directly to the tables out-of-band).
   */
  capabilities?: Partial<ReferenceDataCapabilities>
}

const DEFAULT_CAPABILITIES: ReferenceDataCapabilities = {
  coversAirlines: true,
  coversAirports: true,
  coversAircraft: true,
  coversCurrencies: false,
  coversCountries: false,
  isReadOnly: true, // provider doesn't expose writes; operator manages tables out-of-band
  refreshCadence: "weekly", // operator-driven cadence; static if seeded once
}

/**
 * Build a `ReferenceDataProvider` backed by ordinary Postgres tables in
 * the operator's own Voyant database. No external service.
 */
export function createLocalPostgresReferenceProvider(
  options: LocalPostgresReferenceProviderOptions,
): ReferenceDataProvider {
  const { db } = options
  const capabilities: ReferenceDataCapabilities = {
    ...DEFAULT_CAPABILITIES,
    ...options.capabilities,
  }

  return {
    capabilities,

    async getAirline(iataCode) {
      if (!capabilities.coversAirlines) return null
      const rows = await db
        .select()
        .from(referenceAirlines)
        .where(eq(referenceAirlines.iataCode, iataCode))
        .limit(1)
      const row = rows[0]
      return row ? rowToAirline(row) : null
    },

    async getAirport(iataCode) {
      if (!capabilities.coversAirports) return null
      const rows = await db
        .select()
        .from(referenceAirports)
        .where(eq(referenceAirports.iataCode, iataCode))
        .limit(1)
      const row = rows[0]
      return row ? rowToAirport(row) : null
    },

    async getAircraft(iataCode) {
      if (!capabilities.coversAircraft) return null
      const rows = await db
        .select()
        .from(referenceAircraft)
        .where(eq(referenceAircraft.iataCode, iataCode))
        .limit(1)
      const row = rows[0]
      return row ? rowToAircraft(row) : null
    },

    async getAirlines(iataCodes) {
      if (!capabilities.coversAirlines) return new Map()
      const codes = dedupeCodes(iataCodes)
      if (codes.length === 0) return new Map()
      const rows = await db
        .select()
        .from(referenceAirlines)
        .where(inArray(referenceAirlines.iataCode, codes))
      const result = new Map<string, Airline>()
      for (const row of rows) {
        result.set(row.iataCode, rowToAirline(row))
      }
      return result
    },

    async getAirports(iataCodes) {
      if (!capabilities.coversAirports) return new Map()
      const codes = dedupeCodes(iataCodes)
      if (codes.length === 0) return new Map()
      const rows = await db
        .select()
        .from(referenceAirports)
        .where(inArray(referenceAirports.iataCode, codes))
      const result = new Map<string, Airport>()
      for (const row of rows) {
        result.set(row.iataCode, rowToAirport(row))
      }
      return result
    },

    async getAircraftBatch(iataCodes) {
      if (!capabilities.coversAircraft) return new Map()
      const codes = dedupeCodes(iataCodes)
      if (codes.length === 0) return new Map()
      const rows = await db
        .select()
        .from(referenceAircraft)
        .where(inArray(referenceAircraft.iataCode, codes))
      const result = new Map<string, Aircraft>()
      for (const row of rows) {
        result.set(row.iataCode, rowToAircraft(row))
      }
      return result
    },
  }
}

function rowToAirline(row: typeof referenceAirlines.$inferSelect): Airline {
  return {
    iataCode: row.iataCode,
    icaoCode: row.icaoCode ?? undefined,
    name: row.name,
    country: row.country ?? undefined,
    logoUrl: row.logoUrl ?? undefined,
    alliance: row.alliance ?? undefined,
  }
}

function rowToAirport(row: typeof referenceAirports.$inferSelect): Airport {
  return {
    iataCode: row.iataCode,
    icaoCode: row.icaoCode ?? undefined,
    name: row.name,
    city: row.city,
    country: row.country,
    timezone: row.timezone ?? undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
  }
}

function rowToAircraft(row: typeof referenceAircraft.$inferSelect): Aircraft {
  return {
    iataCode: row.iataCode,
    icaoCode: row.icaoCode ?? undefined,
    name: row.name,
    manufacturer: row.manufacturer ?? undefined,
    typicalSeats: row.typicalSeats ?? undefined,
  }
}
