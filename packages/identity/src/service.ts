import { listResponse } from "@voyant-travel/types"
import { and, desc, eq, ne, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { z } from "zod"
import { identityAddresses, identityContactPoints, identityNamedContacts } from "./schema.js"
import type {
  addressListQuerySchema,
  contactPointListQuerySchema,
  insertAddressSchema,
  insertContactPointSchema,
  insertNamedContactSchema,
  namedContactListQuerySchema,
  updateAddressSchema,
  updateContactPointSchema,
  updateNamedContactSchema,
} from "./validation.js"

type ContactPointListQuery = z.infer<typeof contactPointListQuerySchema>
type CreateContactPointInput = z.infer<typeof insertContactPointSchema>
type UpdateContactPointInput = z.infer<typeof updateContactPointSchema>
type AddressListQuery = z.infer<typeof addressListQuerySchema>
type CreateAddressInput = z.infer<typeof insertAddressSchema>
type UpdateAddressInput = z.infer<typeof updateAddressSchema>
type NamedContactListQuery = z.infer<typeof namedContactListQuerySchema>
type CreateNamedContactInput = z.infer<typeof insertNamedContactSchema>
type UpdateNamedContactInput = z.infer<typeof updateNamedContactSchema>

async function paginate<T extends object>(
  rowsQuery: Promise<T[]>,
  countQuery: Promise<Array<{ count: number }>>,
  limit: number,
  offset: number,
) {
  const [data, countResult] = await Promise.all([rowsQuery, countQuery])
  return listResponse(data, { total: countResult[0]?.count ?? 0, limit, offset })
}

async function ensurePrimaryContactPoint(
  db: PostgresJsDatabase,
  params: { id?: string; entityType: string; entityId: string; kind: string },
) {
  const conditions = [
    eq(identityContactPoints.entityType, params.entityType),
    eq(identityContactPoints.entityId, params.entityId),
    eq(
      identityContactPoints.kind,
      params.kind as (typeof identityContactPoints.kind.enumValues)[number],
    ),
  ]
  if (params.id) conditions.push(ne(identityContactPoints.id, params.id))

  await db
    .update(identityContactPoints)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(and(...conditions))
}

async function ensurePrimaryAddress(
  db: PostgresJsDatabase,
  params: { id?: string; entityType: string; entityId: string },
) {
  const conditions = [
    eq(identityAddresses.entityType, params.entityType),
    eq(identityAddresses.entityId, params.entityId),
  ]
  if (params.id) conditions.push(ne(identityAddresses.id, params.id))

  await db
    .update(identityAddresses)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(and(...conditions))
}

async function ensurePrimaryNamedContact(
  db: PostgresJsDatabase,
  params: { id?: string; entityType: string; entityId: string },
) {
  const conditions = [
    eq(identityNamedContacts.entityType, params.entityType),
    eq(identityNamedContacts.entityId, params.entityId),
  ]
  if (params.id) conditions.push(ne(identityNamedContacts.id, params.id))

  await db
    .update(identityNamedContacts)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(and(...conditions))
}

export const identityService = {
  async listContactPoints(db: PostgresJsDatabase, query: ContactPointListQuery) {
    const conditions = []
    if (query.entityType) conditions.push(eq(identityContactPoints.entityType, query.entityType))
    if (query.entityId) conditions.push(eq(identityContactPoints.entityId, query.entityId))
    if (query.kind) conditions.push(eq(identityContactPoints.kind, query.kind))
    if (query.isPrimary !== undefined) {
      conditions.push(eq(identityContactPoints.isPrimary, query.isPrimary))
    }
    if (query.search) {
      const term = `%${query.search}%`
      conditions.push(
        // agent-quality: raw-sql reviewed -- owner: identity; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
        sql`(${identityContactPoints.value} ILIKE ${term} OR ${identityContactPoints.normalizedValue} ILIKE ${term})`,
      )
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined

    return paginate(
      db
        .select()
        .from(identityContactPoints)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(desc(identityContactPoints.isPrimary), identityContactPoints.createdAt),
      db.select({ count: sql<number>`count(*)::int` }).from(identityContactPoints).where(where),
      query.limit,
      query.offset,
    )
  },

  async listContactPointsForEntity(db: PostgresJsDatabase, entityType: string, entityId: string) {
    return db
      .select()
      .from(identityContactPoints)
      .where(
        and(
          eq(identityContactPoints.entityType, entityType),
          eq(identityContactPoints.entityId, entityId),
        ),
      )
      .orderBy(desc(identityContactPoints.isPrimary), identityContactPoints.createdAt)
  },

  async getContactPointById(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .select()
      .from(identityContactPoints)
      .where(eq(identityContactPoints.id, id))
      .limit(1)
    return row ?? null
  },

  async createContactPoint(db: PostgresJsDatabase, data: CreateContactPointInput) {
    if (data.isPrimary) {
      await ensurePrimaryContactPoint(db, {
        entityType: data.entityType,
        entityId: data.entityId,
        kind: data.kind,
      })
    }

    const [row] = await db.insert(identityContactPoints).values(data).returning()
    return row ?? null
  },

  async updateContactPoint(db: PostgresJsDatabase, id: string, data: UpdateContactPointInput) {
    const existing = await this.getContactPointById(db, id)
    if (!existing) return null

    const nextEntityType = data.entityType ?? existing.entityType
    const nextEntityId = data.entityId ?? existing.entityId
    const nextKind = data.kind ?? existing.kind

    if (data.isPrimary) {
      await ensurePrimaryContactPoint(db, {
        id,
        entityType: nextEntityType,
        entityId: nextEntityId,
        kind: nextKind,
      })
    }

    const [row] = await db
      .update(identityContactPoints)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(identityContactPoints.id, id))
      .returning()
    return row ?? null
  },

  async deleteContactPoint(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(identityContactPoints)
      .where(eq(identityContactPoints.id, id))
      .returning({ id: identityContactPoints.id })
    return row ?? null
  },

  async listAddresses(db: PostgresJsDatabase, query: AddressListQuery) {
    const conditions = []
    if (query.entityType) conditions.push(eq(identityAddresses.entityType, query.entityType))
    if (query.entityId) conditions.push(eq(identityAddresses.entityId, query.entityId))
    if (query.label) conditions.push(eq(identityAddresses.label, query.label))
    if (query.isPrimary !== undefined)
      conditions.push(eq(identityAddresses.isPrimary, query.isPrimary))
    if (query.search) {
      const term = `%${query.search}%`
      conditions.push(
        // agent-quality: raw-sql reviewed -- owner: identity; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
        sql`(${identityAddresses.fullText} ILIKE ${term} OR ${identityAddresses.line1} ILIKE ${term} OR ${identityAddresses.city} ILIKE ${term})`,
      )
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined

    return paginate(
      db
        .select()
        .from(identityAddresses)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(desc(identityAddresses.isPrimary), identityAddresses.createdAt),
      db.select({ count: sql<number>`count(*)::int` }).from(identityAddresses).where(where),
      query.limit,
      query.offset,
    )
  },

  async listAddressesForEntity(db: PostgresJsDatabase, entityType: string, entityId: string) {
    return db
      .select()
      .from(identityAddresses)
      .where(
        and(eq(identityAddresses.entityType, entityType), eq(identityAddresses.entityId, entityId)),
      )
      .orderBy(desc(identityAddresses.isPrimary), identityAddresses.createdAt)
  },

  async getAddressById(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .select()
      .from(identityAddresses)
      .where(eq(identityAddresses.id, id))
      .limit(1)
    return row ?? null
  },

  async createAddress(db: PostgresJsDatabase, data: CreateAddressInput) {
    if (data.isPrimary) {
      await ensurePrimaryAddress(db, {
        entityType: data.entityType,
        entityId: data.entityId,
      })
    }

    const [row] = await db.insert(identityAddresses).values(data).returning()
    return row ?? null
  },

  async updateAddress(db: PostgresJsDatabase, id: string, data: UpdateAddressInput) {
    const existing = await this.getAddressById(db, id)
    if (!existing) return null

    const nextEntityType = data.entityType ?? existing.entityType
    const nextEntityId = data.entityId ?? existing.entityId

    if (data.isPrimary) {
      await ensurePrimaryAddress(db, {
        id,
        entityType: nextEntityType,
        entityId: nextEntityId,
      })
    }

    const [row] = await db
      .update(identityAddresses)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(identityAddresses.id, id))
      .returning()
    return row ?? null
  },

  async deleteAddress(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(identityAddresses)
      .where(eq(identityAddresses.id, id))
      .returning({ id: identityAddresses.id })
    return row ?? null
  },

  /**
   * Repoint every identity record for `entityType` from `mergeId` onto `keepId`.
   *
   * Account merge lives in `relationships`, but the rows being moved are
   * identity's, and so is the rule for what counts as a duplicate: a contact
   * point is the same contact point when its `kind` and `value` match. Keeping
   * that here means relationships asks for a merge rather than reaching into
   * three tables to perform one, and the dedupe rule stays with the module that
   * defines it.
   *
   * Call inside the caller's transaction — this is several statements and a
   * partial application would leave records split across both entities.
   */
  async reassignEntityRecords(
    db: PostgresJsDatabase,
    input: { entityType: string; keepId: string; mergeId: string },
  ) {
    const { entityType, keepId, mergeId } = input

    // Drop merge-side contact points the keep side already has, so the repoint
    // below cannot create a duplicate pair.
    await db.delete(identityContactPoints).where(
      and(
        eq(identityContactPoints.entityType, entityType),
        eq(identityContactPoints.entityId, mergeId),
        sql`EXISTS (
          SELECT 1
          FROM identity_contact_points keep_point
          WHERE keep_point.entity_type = ${entityType}
            AND keep_point.entity_id = ${keepId}
            AND keep_point.kind = ${identityContactPoints.kind}
            AND keep_point.value = ${identityContactPoints.value}
        )`,
      ),
    )

    await db
      .update(identityContactPoints)
      .set({ entityId: keepId, updatedAt: new Date() })
      .where(
        and(
          eq(identityContactPoints.entityType, entityType),
          eq(identityContactPoints.entityId, mergeId),
        ),
      )

    await db
      .update(identityAddresses)
      .set({ entityId: keepId, updatedAt: new Date() })
      .where(
        and(eq(identityAddresses.entityType, entityType), eq(identityAddresses.entityId, mergeId)),
      )

    await db
      .update(identityNamedContacts)
      .set({ entityId: keepId, updatedAt: new Date() })
      .where(
        and(
          eq(identityNamedContacts.entityType, entityType),
          eq(identityNamedContacts.entityId, mergeId),
        ),
      )
  },

  async listNamedContacts(db: PostgresJsDatabase, query: NamedContactListQuery) {
    const conditions = []
    if (query.entityType) conditions.push(eq(identityNamedContacts.entityType, query.entityType))
    if (query.entityId) conditions.push(eq(identityNamedContacts.entityId, query.entityId))
    if (query.role) conditions.push(eq(identityNamedContacts.role, query.role))
    if (query.isPrimary !== undefined) {
      conditions.push(eq(identityNamedContacts.isPrimary, query.isPrimary))
    }
    if (query.search) {
      const term = `%${query.search}%`
      conditions.push(
        sql`(
          ${identityNamedContacts.name} ILIKE ${term}
          OR ${identityNamedContacts.title} ILIKE ${term}
          OR ${identityNamedContacts.email} ILIKE ${term}
          OR ${identityNamedContacts.phone} ILIKE ${term}
        )`,
      )
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    return paginate(
      db
        .select()
        .from(identityNamedContacts)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(desc(identityNamedContacts.isPrimary), identityNamedContacts.createdAt),
      db.select({ count: sql<number>`count(*)::int` }).from(identityNamedContacts).where(where),
      query.limit,
      query.offset,
    )
  },

  async listNamedContactsForEntity(db: PostgresJsDatabase, entityType: string, entityId: string) {
    return db
      .select()
      .from(identityNamedContacts)
      .where(
        and(
          eq(identityNamedContacts.entityType, entityType),
          eq(identityNamedContacts.entityId, entityId),
        ),
      )
      .orderBy(desc(identityNamedContacts.isPrimary), identityNamedContacts.createdAt)
  },

  async getNamedContactById(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .select()
      .from(identityNamedContacts)
      .where(eq(identityNamedContacts.id, id))
      .limit(1)
    return row ?? null
  },

  async createNamedContact(db: PostgresJsDatabase, data: CreateNamedContactInput) {
    if (data.isPrimary) {
      await ensurePrimaryNamedContact(db, {
        entityType: data.entityType,
        entityId: data.entityId,
      })
    }

    const [row] = await db.insert(identityNamedContacts).values(data).returning()
    return row ?? null
  },

  async updateNamedContact(db: PostgresJsDatabase, id: string, data: UpdateNamedContactInput) {
    const existing = await this.getNamedContactById(db, id)
    if (!existing) return null

    const nextEntityType = data.entityType ?? existing.entityType
    const nextEntityId = data.entityId ?? existing.entityId

    if (data.isPrimary) {
      await ensurePrimaryNamedContact(db, {
        id,
        entityType: nextEntityType,
        entityId: nextEntityId,
      })
    }

    const [row] = await db
      .update(identityNamedContacts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(identityNamedContacts.id, id))
      .returning()
    return row ?? null
  },

  async deleteNamedContact(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(identityNamedContacts)
      .where(eq(identityNamedContacts.id, id))
      .returning({ id: identityNamedContacts.id })
    return row ?? null
  },
}
