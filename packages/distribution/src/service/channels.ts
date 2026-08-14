import type { EventBus } from "@voyant-travel/core"
import { identityService } from "@voyant-travel/identity/service"
import type {
  InsertContactPointForEntity,
  InsertNamedContactForEntity,
  UpdateContactPoint as UpdateIdentityContactPoint,
  UpdateNamedContact as UpdateIdentityNamedContact,
} from "@voyant-travel/identity/validation"
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { findChannelPreset } from "../channel-presets.js"
import { channelContactProjections, channels } from "../schema.js"
import { DistributionServiceRefusalError } from "./errors.js"
import { publicationServiceOperations } from "./publications.js"
import type { ChannelListQuery, CreateChannelInput, UpdateChannelInput } from "./types.js"

/**
 * Refusal to mutate a system-provisioned channel in a way that would break the
 * surface depending on it. Distinct from "not found" so the route answers 409
 * rather than a 404 that reads like the row is gone.
 */
/**
 * Refusal to create a second channel for a named network. The preset key is
 * meant to resolve to one row, so a connector asking for "the GetYourGuide
 * channel" gets an answer rather than a list.
 */
export class DuplicateChannelPresetError extends DistributionServiceRefusalError {
  readonly presetKey: string
  readonly existingChannelId: string

  constructor(presetKey: string, existingChannelId: string, message: string) {
    super(message)
    this.name = "DuplicateChannelPresetError"
    this.presetKey = presetKey
    this.existingChannelId = existingChannelId
  }
}

export class SystemChannelProtectedError extends DistributionServiceRefusalError {
  readonly channelId: string
  readonly systemKey: string

  constructor(channelId: string, systemKey: string, message: string) {
    super(message)
    this.name = "SystemChannelProtectedError"
    this.channelId = channelId
    this.systemKey = systemKey
  }
}

const channelEntityType = "channel"
const channelBaseIdentitySource = "distribution.base"
const channelPrimaryNamedContactSource = "distribution.primary_contact"

type ChannelIdentityInput = Pick<CreateChannelInput, "website" | "contactName" | "contactEmail">

type ChannelHydratedFields = {
  website: string | null
  contactName: string | null
  contactEmail: string | null
}

function emptyChannelHydratedFields(): ChannelHydratedFields {
  return {
    website: null,
    contactName: null,
    contactEmail: null,
  }
}

function normalizeWebsite(value: string) {
  return value.trim().toLowerCase()
}

function isManagedBySource(metadata: Record<string, unknown> | null | undefined, source: string) {
  return metadata?.managedBy === source
}

function toNullableTrimmed(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function toCreateChannelBaseValues(data: CreateChannelInput) {
  return {
    name: data.name,
    description: data.description,
    kind: data.kind,
    status: data.status,
    metadata: data.metadata,
    presetKey: data.presetKey ?? null,
  }
}

function toUpdateChannelBaseValues(data: UpdateChannelInput) {
  return {
    name: data.name,
    description: data.description,
    kind: data.kind,
    status: data.status,
    metadata: data.metadata,
  }
}

async function ensureChannelExists(db: PostgresJsDatabase, channelId: string) {
  const [row] = await db
    .select({ id: channels.id })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1)
  return row ?? null
}

async function syncChannelIdentity(
  db: PostgresJsDatabase,
  channelId: string,
  data: ChannelIdentityInput,
) {
  const [existingContactPoints, existingNamedContacts] = await Promise.all([
    identityService.listContactPointsForEntity(db, channelEntityType, channelId),
    identityService.listNamedContactsForEntity(db, channelEntityType, channelId),
  ])

  const managedWebsiteContact = existingContactPoints.find(
    (point) =>
      point.kind === "website" &&
      isManagedBySource(
        point.metadata as Record<string, unknown> | null,
        channelBaseIdentitySource,
      ),
  )
  const managedPrimaryContact = existingNamedContacts.find((contact) =>
    isManagedBySource(
      contact.metadata as Record<string, unknown> | null,
      channelPrimaryNamedContactSource,
    ),
  )

  const website = toNullableTrimmed(data.website)
  if (!website) {
    if (managedWebsiteContact) {
      await identityService.deleteContactPoint(db, managedWebsiteContact.id)
    }
  } else {
    const websitePayload = {
      entityType: channelEntityType,
      entityId: channelId,
      kind: "website" as const,
      label: "website",
      value: website,
      normalizedValue: normalizeWebsite(website),
      isPrimary: true,
      metadata: {
        managedBy: channelBaseIdentitySource,
      },
    }

    if (managedWebsiteContact) {
      await identityService.updateContactPoint(db, managedWebsiteContact.id, websitePayload)
    } else {
      await identityService.createContactPoint(db, websitePayload)
    }
  }

  const contactName = toNullableTrimmed(data.contactName)
  const contactEmail = toNullableTrimmed(data.contactEmail)
  const hasPrimaryContact = Boolean(contactName || contactEmail)

  if (!hasPrimaryContact) {
    if (managedPrimaryContact) {
      await identityService.deleteNamedContact(db, managedPrimaryContact.id)
    }

    await rebuildChannelContactProjection(db, channelId)
    return
  }

  const namedContactPayload = {
    entityType: channelEntityType,
    entityId: channelId,
    role: "primary" as const,
    name: contactName ?? contactEmail ?? "Primary contact",
    email: contactEmail,
    isPrimary: true,
    metadata: {
      managedBy: channelPrimaryNamedContactSource,
    },
  }

  if (managedPrimaryContact) {
    await identityService.updateNamedContact(db, managedPrimaryContact.id, namedContactPayload)
  } else {
    await identityService.createNamedContact(db, namedContactPayload)
  }

  await rebuildChannelContactProjection(db, channelId)
}

async function deleteChannelIdentity(db: PostgresJsDatabase, channelId: string) {
  const [contactPoints, namedContacts] = await Promise.all([
    identityService.listContactPointsForEntity(db, channelEntityType, channelId),
    identityService.listNamedContactsForEntity(db, channelEntityType, channelId),
  ])

  await Promise.all([
    ...contactPoints.map((point) => identityService.deleteContactPoint(db, point.id)),
    ...namedContacts.map((contact) => identityService.deleteNamedContact(db, contact.id)),
  ])

  await rebuildChannelContactProjection(db, channelId)
}

async function rebuildChannelContactProjection(db: PostgresJsDatabase, channelId: string) {
  const [contactPoints, namedContacts] = await Promise.all([
    identityService.listContactPointsForEntity(db, channelEntityType, channelId),
    identityService.listNamedContactsForEntity(db, channelEntityType, channelId),
  ])

  const primaryWebsite =
    contactPoints.find((point) => point.kind === "website" && point.isPrimary) ??
    contactPoints.find((point) => point.kind === "website") ??
    null
  const primaryContact =
    namedContacts.find((contact) => contact.isPrimary) ?? namedContacts[0] ?? null

  await db
    .delete(channelContactProjections)
    .where(eq(channelContactProjections.channelId, channelId))

  if (!primaryWebsite && !primaryContact) {
    return
  }

  await db.insert(channelContactProjections).values({
    channelId,
    websiteContactPointId: primaryWebsite?.id ?? null,
    primaryNamedContactId: primaryContact?.id ?? null,
    website: primaryWebsite?.value ?? null,
    contactName: primaryContact?.name ?? null,
    contactEmail: primaryContact?.email ?? null,
  })
}

async function hydrateChannels<T extends { id: string }>(
  db: PostgresJsDatabase,
  rows: T[],
): Promise<Array<T & ChannelHydratedFields>> {
  if (rows.length === 0) {
    return rows.map((row) => ({ ...row, ...emptyChannelHydratedFields() }))
  }

  const ids = rows.map((row) => row.id)
  const projections = await db
    .select()
    .from(channelContactProjections)
    .where(inArray(channelContactProjections.channelId, ids))

  const projectionMap = new Map(projections.map((projection) => [projection.channelId, projection]))

  return rows.map((row) => {
    const projection = projectionMap.get(row.id)

    return {
      ...row,
      website: projection?.website ?? null,
      contactName: projection?.contactName ?? null,
      contactEmail: projection?.contactEmail ?? null,
    }
  })
}

export const channelServiceOperations = {
  async listChannels(db: PostgresJsDatabase, query: ChannelListQuery) {
    const conditions = []
    if (query.kind) conditions.push(eq(channels.kind, query.kind))
    if (query.status) conditions.push(eq(channels.status, query.status))
    // Defaults to `include`: publication pickers and product-mapping surfaces
    // read this same endpoint and must keep seeing Direct, or nothing could be
    // published to it. Only the counterparty list asks to drop it.
    if (query.system === "exclude") conditions.push(isNull(channels.systemKey))
    if (query.system === "only") conditions.push(isNotNull(channels.systemKey))
    const where = conditions.length ? and(...conditions) : undefined
    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(channels)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(channels.createdAt),
      db.select({ count: sql<number>`count(*)::int` }).from(channels).where(where),
    ])

    return {
      data: await hydrateChannels(db, rows),
      total: countResult[0]?.count ?? 0,
      limit: query.limit,
      offset: query.offset,
    }
  },

  async getChannelById(db: PostgresJsDatabase, id: string) {
    const [row] = await db.select().from(channels).where(eq(channels.id, id)).limit(1)
    if (!row) {
      return null
    }

    const [hydrated] = await hydrateChannels(db, [row])
    return hydrated ?? null
  },

  async createChannel(db: PostgresJsDatabase, data: CreateChannelInput) {
    if (data.presetKey) {
      // The unique index is the real guard; this turns the collision into a
      // sentence an operator can act on instead of a driver error, and names
      // the row they already have.
      const [existing] = await db
        .select({ id: channels.id, name: channels.name })
        .from(channels)
        .where(eq(channels.presetKey, data.presetKey))
        .limit(1)
      if (existing) {
        throw new DuplicateChannelPresetError(
          data.presetKey,
          existing.id,
          `This deployment already has a ${findChannelPreset(data.presetKey)?.name ?? data.presetKey} channel ("${existing.name}").`,
        )
      }
    }
    const [row] = await db.insert(channels).values(toCreateChannelBaseValues(data)).returning()
    if (!row) {
      throw new Error("Failed to create channel")
    }
    await syncChannelIdentity(db, row.id, data)
    return channelServiceOperations.getChannelById(db, row.id)
  },

  async updateChannel(
    db: PostgresJsDatabase,
    id: string,
    data: UpdateChannelInput,
    eventBus?: EventBus,
  ) {
    const existing = await channelServiceOperations.getChannelById(db, id)
    if (!existing) {
      return null
    }
    // A system channel stays editable — its name and contact details are the
    // operator's to set — but not in the two ways that would take the public
    // surface down: re-kinding it, or moving it off `active`.
    if (existing.systemKey) {
      if (data.kind !== undefined && data.kind !== existing.kind) {
        throw new SystemChannelProtectedError(
          id,
          existing.systemKey,
          "The Direct channel's kind cannot be changed.",
        )
      }
      if (data.status !== undefined && data.status !== "active") {
        throw new SystemChannelProtectedError(
          id,
          existing.systemKey,
          "The Direct channel cannot be deactivated — every public surface resolves to it.",
        )
      }
    }
    await db
      .update(channels)
      .set({ ...toUpdateChannelBaseValues(data), updatedAt: new Date() })
      .where(eq(channels.id, id))

    await syncChannelIdentity(db, id, {
      website: data.website === undefined ? existing.website : data.website,
      contactName: data.contactName === undefined ? existing.contactName : data.contactName,
      contactEmail: data.contactEmail === undefined ? existing.contactEmail : data.contactEmail,
    })

    const row = await channelServiceOperations.getChannelById(db, id)
    if (row) await eventBus?.emit("channel.updated", { id: row.id })
    return row
  },

  async deleteChannel(db: PostgresJsDatabase, id: string, eventBus?: EventBus) {
    const [existing] = await db
      .select({ systemKey: channels.systemKey })
      .from(channels)
      .where(eq(channels.id, id))
      .limit(1)
    if (existing?.systemKey) {
      throw new SystemChannelProtectedError(
        id,
        existing.systemKey,
        "The Direct channel cannot be deleted — every public surface resolves to it.",
      )
    }
    const row = await db.transaction(async (tx) => {
      const affectedProductIds = await publicationServiceOperations.captureChannelDeletionReindex(
        tx,
        { channelId: id },
      )
      await deleteChannelIdentity(tx, id)
      const [row] = await tx
        .delete(channels)
        .where(eq(channels.id, id))
        .returning({ id: channels.id })
      return row ? { ...row, affectedProductIds } : null
    })
    if (row) {
      await eventBus?.emit("channel.deleted", {
        id: row.id,
        affectedProductIds: row.affectedProductIds,
      })
    }
    return row
  },

  async listChannelContactPoints(db: PostgresJsDatabase, channelId: string) {
    const channel = await ensureChannelExists(db, channelId)
    if (!channel) return null
    return identityService.listContactPointsForEntity(db, channelEntityType, channelId)
  },

  async createChannelContactPoint(
    db: PostgresJsDatabase,
    channelId: string,
    data: InsertContactPointForEntity,
  ) {
    const channel = await ensureChannelExists(db, channelId)
    if (!channel) return null

    const row = await identityService.createContactPoint(db, {
      ...data,
      entityType: channelEntityType,
      entityId: channelId,
    })

    await rebuildChannelContactProjection(db, channelId)

    return row
  },

  async updateChannelContactPoint(
    db: PostgresJsDatabase,
    id: string,
    data: UpdateIdentityContactPoint,
  ) {
    const existing = await identityService.getContactPointById(db, id)
    if (!existing) return null

    const row = await identityService.updateContactPoint(db, id, data)
    if (row?.entityType === channelEntityType) {
      await rebuildChannelContactProjection(db, row.entityId)
    }

    return row
  },

  async deleteChannelContactPoint(db: PostgresJsDatabase, id: string) {
    const existing = await identityService.getContactPointById(db, id)
    const row = await identityService.deleteContactPoint(db, id)

    if (row && existing?.entityType === channelEntityType) {
      await rebuildChannelContactProjection(db, existing.entityId)
    }

    return row
  },

  async listChannelContacts(db: PostgresJsDatabase, channelId: string) {
    const channel = await ensureChannelExists(db, channelId)
    if (!channel) return null
    return identityService.listNamedContactsForEntity(db, channelEntityType, channelId)
  },

  async createChannelContact(
    db: PostgresJsDatabase,
    channelId: string,
    data: InsertNamedContactForEntity,
  ) {
    const channel = await ensureChannelExists(db, channelId)
    if (!channel) return null

    const row = await identityService.createNamedContact(db, {
      ...data,
      entityType: channelEntityType,
      entityId: channelId,
    })

    await rebuildChannelContactProjection(db, channelId)

    return row
  },

  async updateChannelContact(db: PostgresJsDatabase, id: string, data: UpdateIdentityNamedContact) {
    const existing = await identityService.getNamedContactById(db, id)
    if (!existing) return null

    const row = await identityService.updateNamedContact(db, id, data)
    if (row?.entityType === channelEntityType) {
      await rebuildChannelContactProjection(db, row.entityId)
    }

    return row
  },

  async deleteChannelContact(db: PostgresJsDatabase, id: string) {
    const existing = await identityService.getNamedContactById(db, id)
    const row = await identityService.deleteNamedContact(db, id)

    if (row && existing?.entityType === channelEntityType) {
      await rebuildChannelContactProjection(db, existing.entityId)
    }

    return row
  },
}
