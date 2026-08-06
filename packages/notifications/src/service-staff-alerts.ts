/**
 * Reads and writes for the two staff-alert preference layers, and the
 * resolution rule that combines them.
 *
 * Everything here touches only notifications-owned tables. Recipient
 * resolution and rendering live in `service-staff-alert-dispatch.ts`.
 */

import { and, eq, inArray } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  type NewStaffAlertPreference,
  type NewStaffAlertSettings,
  type StaffAlertPreference,
  type StaffAlertSettings,
  staffAlertPreferences,
  staffAlertSettings,
} from "./schema.js"
import {
  getStaffAlertDefinition,
  isStaffAlertEventKey,
  STAFF_ALERT_DEFINITIONS,
  type StaffAlertDefinition,
  type StaffAlertEventKey,
} from "./staff-alert-registry.js"

export class StaffAlertError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StaffAlertError"
  }
}

/** A definition with its stored deployment default folded in. */
export interface ResolvedStaffAlertSetting {
  definition: StaffAlertDefinition
  enabled: boolean
  routeToAssignee: boolean
  routeToRoles: string[]
  extraAddresses: string[]
  /** False when no row exists yet and the registry default is in force. */
  configured: boolean
}

function fromDefinition(definition: StaffAlertDefinition): ResolvedStaffAlertSetting {
  return {
    definition,
    enabled: definition.defaultEnabled,
    routeToAssignee: definition.supportsAssigneeRouting,
    routeToRoles: [...definition.defaultRoles],
    extraAddresses: [],
    configured: false,
  }
}

function merge(
  definition: StaffAlertDefinition,
  row: StaffAlertSettings,
): ResolvedStaffAlertSetting {
  return {
    definition,
    enabled: row.enabled,
    // A stored `true` cannot resurrect assignee routing for an alert whose
    // owning module has no assignment concept — the registry is the authority,
    // and a stale row must not make the dispatcher look for an assignee that
    // can never exist.
    routeToAssignee: definition.supportsAssigneeRouting && row.routeToAssignee,
    routeToRoles: [...(row.routeToRoles ?? [])],
    extraAddresses: [...(row.extraAddresses ?? [])],
    configured: true,
  }
}

/**
 * Every alert in the registry, with stored settings applied where present.
 *
 * Driven by the registry rather than by the table, so an alert added in code
 * shows up immediately and a row left behind by a removed alert is ignored
 * rather than rendering a settings card for something that no longer fires.
 */
export async function listStaffAlertSettings(
  db: PostgresJsDatabase,
): Promise<ResolvedStaffAlertSetting[]> {
  const rows = await db.select().from(staffAlertSettings)
  const byKey = new Map(rows.map((row) => [row.eventKey, row]))

  return STAFF_ALERT_DEFINITIONS.map((definition) => {
    const row = byKey.get(definition.key)
    return row ? merge(definition, row) : fromDefinition(definition)
  })
}

export async function getStaffAlertSetting(
  db: PostgresJsDatabase,
  eventKey: string,
): Promise<ResolvedStaffAlertSetting> {
  const definition = getStaffAlertDefinition(eventKey)
  if (!definition) throw new StaffAlertError(`Unknown staff alert "${eventKey}".`)

  const [row] = await db
    .select()
    .from(staffAlertSettings)
    .where(eq(staffAlertSettings.eventKey, eventKey))
    .limit(1)

  return row ? merge(definition, row) : fromDefinition(definition)
}

export interface UpdateStaffAlertSettingInput {
  eventKey: string
  enabled?: boolean
  routeToAssignee?: boolean
  routeToRoles?: string[]
  extraAddresses?: string[]
}

export async function upsertStaffAlertSetting(
  db: PostgresJsDatabase,
  input: UpdateStaffAlertSettingInput,
): Promise<ResolvedStaffAlertSetting> {
  const definition = getStaffAlertDefinition(input.eventKey)
  if (!definition) throw new StaffAlertError(`Unknown staff alert "${input.eventKey}".`)

  const current = await getStaffAlertSetting(db, input.eventKey)
  const values: NewStaffAlertSettings = {
    eventKey: definition.key,
    enabled: input.enabled ?? current.enabled,
    routeToAssignee:
      definition.supportsAssigneeRouting && (input.routeToAssignee ?? current.routeToAssignee),
    routeToRoles: input.routeToRoles ?? current.routeToRoles,
    extraAddresses: normalizeAddresses(input.extraAddresses ?? current.extraAddresses),
    updatedAt: new Date(),
  }

  const [row] = await db
    .insert(staffAlertSettings)
    .values(values)
    .onConflictDoUpdate({
      target: staffAlertSettings.eventKey,
      set: {
        enabled: values.enabled,
        routeToAssignee: values.routeToAssignee,
        routeToRoles: values.routeToRoles,
        extraAddresses: values.extraAddresses,
        updatedAt: values.updatedAt,
      },
    })
    .returning()

  if (!row) throw new StaffAlertError(`Failed to persist staff alert "${input.eventKey}".`)
  return merge(definition, row)
}

function normalizeAddresses(addresses: readonly string[]): string[] {
  const seen = new Set<string>()
  for (const address of addresses) {
    const trimmed = address.trim().toLowerCase()
    if (trimmed) seen.add(trimmed)
  }
  return [...seen]
}

/** One alert as a specific staff user experiences it. */
export interface StaffAlertPreferenceView {
  definition: StaffAlertDefinition
  /** What actually happens for this user right now. */
  enabled: boolean
  /** The deployment default, shown so "off" can be attributed correctly. */
  deploymentEnabled: boolean
  /** The user's explicit choice, or null when they are inheriting. */
  override: boolean | null
}

/**
 * Effective state per alert for one staff user.
 *
 * The deployment default gates everything: a user cannot opt into an alert the
 * operator has switched off, because "off" there means the deployment has no
 * routing or no sender for it. The reverse — opting out of an enabled alert —
 * is always allowed.
 */
export async function listStaffAlertPreferences(
  db: PostgresJsDatabase,
  userId: string,
): Promise<StaffAlertPreferenceView[]> {
  const [settings, overrides] = await Promise.all([
    listStaffAlertSettings(db),
    db.select().from(staffAlertPreferences).where(eq(staffAlertPreferences.userId, userId)),
  ])

  const overrideByKey = new Map(overrides.map((row) => [row.eventKey, row.enabled]))

  return settings.map((setting) => {
    const override = overrideByKey.get(setting.definition.key) ?? null
    return {
      definition: setting.definition,
      enabled: setting.enabled && (override ?? true),
      deploymentEnabled: setting.enabled,
      override,
    }
  })
}

export async function upsertStaffAlertPreference(
  db: PostgresJsDatabase,
  input: { userId: string; eventKey: string; enabled: boolean },
): Promise<StaffAlertPreference> {
  if (!isStaffAlertEventKey(input.eventKey)) {
    throw new StaffAlertError(`Unknown staff alert "${input.eventKey}".`)
  }

  const values: NewStaffAlertPreference = {
    userId: input.userId,
    eventKey: input.eventKey,
    enabled: input.enabled,
    updatedAt: new Date(),
  }

  const [row] = await db
    .insert(staffAlertPreferences)
    .values(values)
    .onConflictDoUpdate({
      target: [staffAlertPreferences.userId, staffAlertPreferences.eventKey],
      set: { enabled: values.enabled, updatedAt: values.updatedAt },
    })
    .returning()

  if (!row) throw new StaffAlertError(`Failed to persist staff alert preference.`)
  return row
}

/** Drop an explicit choice so the user follows the deployment default again. */
export async function clearStaffAlertPreference(
  db: PostgresJsDatabase,
  input: { userId: string; eventKey: string },
): Promise<boolean> {
  const deleted = await db
    .delete(staffAlertPreferences)
    .where(
      and(
        eq(staffAlertPreferences.userId, input.userId),
        eq(staffAlertPreferences.eventKey, input.eventKey),
      ),
    )
    .returning()
  return deleted.length > 0
}

/**
 * The user ids that have explicitly opted OUT of an alert.
 *
 * Deliberately the opt-out set rather than the opt-in set: absence of a row
 * means inherit, so the dispatcher builds its recipient list from routing and
 * then subtracts these. Asking for opted-in users instead would silently drop
 * everyone who has never opened the preferences page — which is everyone, on a
 * fresh deployment.
 */
export async function listStaffAlertOptOutUserIds(
  db: PostgresJsDatabase,
  eventKey: StaffAlertEventKey,
): Promise<Set<string>> {
  const rows = await db
    .select({ userId: staffAlertPreferences.userId })
    .from(staffAlertPreferences)
    .where(
      and(eq(staffAlertPreferences.eventKey, eventKey), eq(staffAlertPreferences.enabled, false)),
    )
  return new Set(rows.map((row) => row.userId))
}

/** Bulk variant for surfaces that render many alerts at once. */
export async function listStaffAlertOptOutsForKeys(
  db: PostgresJsDatabase,
  eventKeys: readonly StaffAlertEventKey[],
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>()
  if (eventKeys.length === 0) return result

  const rows = await db
    .select({ userId: staffAlertPreferences.userId, eventKey: staffAlertPreferences.eventKey })
    .from(staffAlertPreferences)
    .where(
      and(
        inArray(staffAlertPreferences.eventKey, [...eventKeys]),
        eq(staffAlertPreferences.enabled, false),
      ),
    )

  for (const row of rows) {
    const bucket = result.get(row.eventKey) ?? new Set<string>()
    bucket.add(row.userId)
    result.set(row.eventKey, bucket)
  }
  return result
}
