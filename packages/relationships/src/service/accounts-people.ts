// agent-quality: file-size exception -- owner: crm; existing service module stays co-located until a dedicated split preserves behavior and tests.
import type { CustomFieldDefinition } from "@voyant-travel/core/custom-fields"
import { RequestValidationError } from "@voyant-travel/hono"
import { identityContactPoints } from "@voyant-travel/identity/schema"
import { identityService } from "@voyant-travel/identity/service"
import { toCsvRow } from "@voyant-travel/utils"
import type { AnyColumn } from "drizzle-orm"
import { and, asc, desc, eq, exists, gte, ilike, lte, or, type SQL, sql } from "drizzle-orm"
import type { PgUpdateSetSource } from "drizzle-orm/pg-core/query-builders/update"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  communicationLog,
  organizationNotes,
  organizations,
  people,
  personNotes,
  personPaymentMethods,
  segments,
} from "../schema.js"
import type {
  InsertPersonPaymentMethodInput,
  UpdatePersonPaymentMethodInput,
} from "../validation.js"
import {
  type CommunicationListQuery,
  type CreateAddressForEntityInput,
  type CreateAddressInput,
  type CreateCommunicationLogInput,
  type CreateContactPointForEntityInput,
  type CreateContactPointInput,
  type CreateOrganizationNoteInput,
  type CreatePersonInput,
  type CreatePersonNoteInput,
  type CreateSegmentInput,
  deletePersonIdentity,
  hydratePeople,
  organizationEntityType,
  type PersonListQuery,
  personBaseFields,
  personEntityType,
  syncPersonIdentity,
  type UpdateAddressInput,
  type UpdateContactPointInput,
  type UpdatePersonInput,
} from "./accounts-shared.js"
import { paginate } from "./helpers.js"

const cardPaymentMethodBrands = new Set(["visa", "mastercard", "amex", "revolut"])

function assertValidPaymentMethodFields(data: {
  brand: string
  last4?: string | null
  expMonth?: number | null
  expYear?: number | null
}) {
  const fields: Record<string, string[]> = {}

  if (data.brand === "bank_transfer") {
    for (const field of ["last4", "expMonth", "expYear"] as const) {
      if (data[field] != null) {
        fields[field] = [`${field} is only valid for card payment methods`]
      }
    }
  } else if (cardPaymentMethodBrands.has(data.brand)) {
    for (const field of ["last4", "expMonth", "expYear"] as const) {
      if (data[field] == null) {
        fields[field] = [`${field} is required for card payment methods`]
      }
    }
  }

  if (Object.keys(fields).length > 0) {
    throw new RequestValidationError("Invalid payment method fields", { fields })
  }
}

function unaccentedIlike(column: AnyColumn, term: string): SQL {
  // agent-quality: raw-sql reviewed -- owner: crm; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
  return sql`unaccent(coalesce(${column}, '')) ILIKE unaccent(${term})`
}

async function organizationExists(db: PostgresJsDatabase, organizationId: string) {
  const [row] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1)
  return Boolean(row)
}

async function personExists(db: PostgresJsDatabase, personId: string) {
  const [row] = await db
    .select({ id: people.id })
    .from(people)
    .where(eq(people.id, personId))
    .limit(1)
  return Boolean(row)
}

function buildPersonSearchCondition(
  db: PostgresJsDatabase,
  search: string,
  searchableCustomFields: ReadonlyArray<CustomFieldDefinition> = [],
): SQL | undefined {
  const trimmedSearch = search.trim()
  if (!trimmedSearch) return undefined

  const term = `%${trimmedSearch}%`
  const tokens = trimmedSearch.split(/\s+/).filter(Boolean)
  const digits = trimmedSearch.replace(/\D/g, "")
  const searchablePersonColumns = [
    people.firstName,
    people.middleName,
    people.lastName,
    people.jobTitle,
  ]
  const contactPointConditions: SQL[] = [
    ilike(identityContactPoints.value, term),
    ilike(identityContactPoints.normalizedValue, term),
  ]

  if (digits) {
    const digitsTerm = `%${digits}%`
    contactPointConditions.push(
      // agent-quality: raw-sql reviewed -- owner: crm; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      sql`regexp_replace(${identityContactPoints.value}, '[^0-9]+', '', 'g') ILIKE ${digitsTerm}`,
      // agent-quality: raw-sql reviewed -- owner: crm; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      sql`regexp_replace(coalesce(${identityContactPoints.normalizedValue}, ''), '[^0-9]+', '', 'g') ILIKE ${digitsTerm}`,
    )
  }

  const tokenizedPersonCondition = tokens.length
    ? and(
        ...tokens.map((token) =>
          or(...searchablePersonColumns.map((column) => unaccentedIlike(column, `%${token}%`))),
        ),
      )
    : undefined

  // Namespaced values use only definition-owned registry components; request
  // input never participates in a JSONB path.
  const customFieldConditions = searchableCustomFields.map(
    // agent-quality: raw-sql reviewed -- owner: crm; namespace/key are vetted registry values and term is parameter-bound.
    (field) => sql`${people.customFields} -> ${field.namespace} ->> ${field.key} ILIKE ${term}`,
  )

  return or(
    tokenizedPersonCondition,
    exists(
      db
        .select({ one: sql`1` })
        .from(identityContactPoints)
        .where(
          and(
            eq(identityContactPoints.entityType, personEntityType),
            eq(identityContactPoints.entityId, people.id),
            or(eq(identityContactPoints.kind, "email"), eq(identityContactPoints.kind, "phone")),
            or(...contactPointConditions),
          ),
        ),
    ),
    ...customFieldConditions,
  )
}

/** Render a custom-field value for a CSV cell (objects/arrays as JSON). */
function formatCustomFieldCell(value: unknown): string {
  if (value == null) return ""
  return typeof value === "object" ? JSON.stringify(value) : String(value)
}

export const peopleAccountsService = {
  async listPeople(
    db: PostgresJsDatabase,
    query: PersonListQuery,
    searchableCustomFields: ReadonlyArray<CustomFieldDefinition> = [],
  ) {
    const conditions: SQL[] = []

    if (query.organizationId) conditions.push(eq(people.organizationId, query.organizationId))
    if (query.ownerId) conditions.push(eq(people.ownerId, query.ownerId))
    if (query.relation) conditions.push(eq(people.relation, query.relation))
    if (query.status) conditions.push(eq(people.status, query.status))
    if (query.search) {
      const searchCondition = buildPersonSearchCondition(db, query.search, searchableCustomFields)
      if (searchCondition) conditions.push(searchCondition)
    }

    const where = conditions.length ? and(...conditions) : undefined

    const sortColumns = (() => {
      switch (query.sortBy) {
        case "name":
          return [people.firstName, people.lastName] as const
        case "relation":
          return [people.relation] as const
        case "status":
          return [people.status] as const
        case "createdAt":
          return [people.createdAt] as const
        default:
          return [people.updatedAt] as const
      }
    })()
    const sortFn = query.sortDir === "asc" ? asc : desc
    const orderBy = [...sortColumns.map((col) => sortFn(col)), desc(people.updatedAt)]

    const result = await paginate(
      db
        .select()
        .from(people)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(...orderBy),
      db.select({ count: sql<number>`count(*)::int` }).from(people).where(where),
      query.limit,
      query.offset,
    )

    return {
      ...result,
      data: await hydratePeople(db, result.data, { fallbackOnError: true }),
    }
  },

  async getPersonById(db: PostgresJsDatabase, id: string) {
    const [row] = await db.select().from(people).where(eq(people.id, id)).limit(1)
    if (!row) return null
    // Same graceful degradation as listPeople: if person_directory is missing
    // (e.g. a schema-derived DB predating issue #1971's bundle fix) the by-id
    // read returns base rows instead of 500ing — which also unbreaks create /
    // update, both of which round-trip through here.
    const [hydrated] = await hydratePeople(db, [row], { fallbackOnError: true })
    return hydrated ?? null
  },

  async createPerson(db: PostgresJsDatabase, data: CreatePersonInput) {
    const [row] = await db
      .insert(people)
      .values({
        ...personBaseFields(data),
        firstName: data.firstName,
        lastName: data.lastName,
      })
      .returning()
    if (!row) {
      throw new Error("Failed to create person")
    }
    await syncPersonIdentity(db, row.id, data)
    return this.getPersonById(db, row.id)
  },

  /**
   * Write the encrypted person-level PII slots.
   *
   * Separate from {@link updatePerson} on purpose. Those slots are not part of
   * the CRM person update surface — putting them there would expose encrypted
   * PII fields to every caller of it — but the columns are relationships', so
   * the write belongs here rather than in the customer portal.
   *
   * The caller keeps the encryption seam and passes sealed envelopes; this only
   * stores what it is given. An empty patch is a no-op.
   */
  async updatePersonEncryptedProfile(
    db: PostgresJsDatabase,
    id: string,
    patch: Partial<
      Record<
        "accessibilityEncrypted" | "dietaryEncrypted" | "loyaltyEncrypted" | "insuranceEncrypted",
        unknown
      >
    >,
  ) {
    const updates = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    ) as PgUpdateSetSource<typeof people>
    if (Object.keys(updates).length === 0) return
    await db
      .update(people)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(people.id, id))
  },

  async updatePerson(db: PostgresJsDatabase, id: string, data: UpdatePersonInput) {
    const existing = await this.getPersonById(db, id)
    if (!existing) return null
    const updates = Object.fromEntries(
      Object.entries(personBaseFields(data)).filter(([, value]) => value !== undefined),
    ) as PgUpdateSetSource<typeof people>
    if (data.customFields !== undefined) {
      updates.customFields = sql`jsonb_set(
        ${people.customFields},
        ARRAY['custom']::text[],
        ${JSON.stringify(data.customFields.custom ?? {})}::jsonb,
        true
      )`
    }

    await db
      .update(people)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(people.id, id))

    // Pass the request fields through verbatim: syncPersonIdentity leaves
    // `undefined` (omitted) fields untouched and only clears on explicit
    // null/empty. Backfilling omitted fields from `existing` (a hydrated read
    // that degrades to null when person_directory is missing) would silently
    // delete the person's contact points on an affected DB. See issue #1971.
    await syncPersonIdentity(db, id, {
      email: data.email,
      phone: data.phone,
      website: data.website,
    })

    return this.getPersonById(db, id)
  },

  async deletePerson(db: PostgresJsDatabase, id: string) {
    await deletePersonIdentity(db, id)
    const [row] = await db.delete(people).where(eq(people.id, id)).returning({ id: people.id })
    return row ?? null
  },

  listContactMethods(
    db: PostgresJsDatabase,
    entityType: "organization" | "person",
    entityId: string,
  ) {
    return identityService.listContactPointsForEntity(
      db,
      entityType === "organization" ? organizationEntityType : personEntityType,
      entityId,
    )
  },

  async createContactMethod(
    db: PostgresJsDatabase,
    entityType: "organization" | "person",
    entityId: string,
    data: CreateContactPointInput | CreateContactPointForEntityInput,
  ) {
    if (entityType === "organization" && !(await organizationExists(db, entityId))) {
      return null
    }
    if (entityType === "person" && !(await personExists(db, entityId))) {
      return null
    }

    return identityService.createContactPoint(db, {
      ...data,
      entityType: entityType === "organization" ? organizationEntityType : personEntityType,
      entityId,
    })
  },

  async updateContactMethod(db: PostgresJsDatabase, id: string, data: UpdateContactPointInput) {
    return identityService.updateContactPoint(db, id, data)
  },

  async deleteContactMethod(db: PostgresJsDatabase, id: string) {
    return identityService.deleteContactPoint(db, id)
  },

  listAddresses(db: PostgresJsDatabase, entityType: "organization" | "person", entityId: string) {
    return identityService.listAddressesForEntity(
      db,
      entityType === "organization" ? organizationEntityType : personEntityType,
      entityId,
    )
  },

  async createAddress(
    db: PostgresJsDatabase,
    entityType: "organization" | "person",
    entityId: string,
    data: CreateAddressInput | CreateAddressForEntityInput,
  ) {
    if (entityType === "organization" && !(await organizationExists(db, entityId))) {
      return null
    }
    if (entityType === "person" && !(await personExists(db, entityId))) {
      return null
    }

    return identityService.createAddress(db, {
      ...data,
      entityType: entityType === "organization" ? organizationEntityType : personEntityType,
      entityId,
    })
  },

  async updateAddress(db: PostgresJsDatabase, id: string, data: UpdateAddressInput) {
    return identityService.updateAddress(db, id, data)
  },

  async deleteAddress(db: PostgresJsDatabase, id: string) {
    return identityService.deleteAddress(db, id)
  },

  listPersonNotes(db: PostgresJsDatabase, personId: string) {
    return db
      .select()
      .from(personNotes)
      .where(eq(personNotes.personId, personId))
      .orderBy(personNotes.createdAt)
  },

  async createPersonNote(
    db: PostgresJsDatabase,
    personId: string,
    userId: string,
    data: CreatePersonNoteInput,
  ) {
    const [existing] = await db
      .select({ id: people.id })
      .from(people)
      .where(eq(people.id, personId))
      .limit(1)
    if (!existing) return null

    const [row] = await db
      .insert(personNotes)
      .values({ personId, authorId: userId, content: data.content })
      .returning()
    return row
  },

  listOrganizationNotes(db: PostgresJsDatabase, organizationId: string) {
    return db
      .select()
      .from(organizationNotes)
      .where(eq(organizationNotes.organizationId, organizationId))
      .orderBy(organizationNotes.createdAt)
  },

  async createOrganizationNote(
    db: PostgresJsDatabase,
    organizationId: string,
    userId: string,
    data: CreateOrganizationNoteInput,
  ) {
    const [existing] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1)
    if (!existing) return null

    const [row] = await db
      .insert(organizationNotes)
      .values({ organizationId, authorId: userId, content: data.content })
      .returning()
    return row
  },

  async updatePersonNote(db: PostgresJsDatabase, id: string, content: string) {
    const [row] = await db
      .update(personNotes)
      .set({ content })
      .where(eq(personNotes.id, id))
      .returning()
    return row ?? null
  },

  async deletePersonNote(db: PostgresJsDatabase, id: string) {
    const [row] = await db.delete(personNotes).where(eq(personNotes.id, id)).returning()
    return row ?? null
  },

  // ── Payment methods ────────────────────────────────────────────────────

  listPersonPaymentMethods(db: PostgresJsDatabase, personId: string) {
    return db
      .select()
      .from(personPaymentMethods)
      .where(eq(personPaymentMethods.personId, personId))
      .orderBy(desc(personPaymentMethods.isDefault), desc(personPaymentMethods.createdAt))
  },

  async createPersonPaymentMethod(
    db: PostgresJsDatabase,
    personId: string,
    data: InsertPersonPaymentMethodInput,
  ) {
    const [existing] = await db
      .select({ id: people.id })
      .from(people)
      .where(eq(people.id, personId))
      .limit(1)
    if (!existing) return null

    assertValidPaymentMethodFields(data)

    if (data.isDefault) {
      // Only one default per person — clear the others first.
      await db
        .update(personPaymentMethods)
        .set({ isDefault: false })
        .where(eq(personPaymentMethods.personId, personId))
    }
    const [row] = await db
      .insert(personPaymentMethods)
      .values({ personId, ...data })
      .returning()
    return row ?? null
  },

  async updatePersonPaymentMethod(
    db: PostgresJsDatabase,
    id: string,
    data: UpdatePersonPaymentMethodInput,
  ) {
    const [existing] = await db
      .select()
      .from(personPaymentMethods)
      .where(eq(personPaymentMethods.id, id))
      .limit(1)
    if (!existing) return null

    assertValidPaymentMethodFields({
      brand: data.brand ?? existing.brand,
      last4: data.last4 !== undefined ? data.last4 : existing.last4,
      expMonth: data.expMonth !== undefined ? data.expMonth : existing.expMonth,
      expYear: data.expYear !== undefined ? data.expYear : existing.expYear,
    })

    if (data.isDefault) {
      await db
        .update(personPaymentMethods)
        .set({ isDefault: false })
        .where(eq(personPaymentMethods.personId, existing.personId))
    }
    const [row] = await db
      .update(personPaymentMethods)
      .set(data)
      .where(eq(personPaymentMethods.id, id))
      .returning()
    return row ?? null
  },

  async deletePersonPaymentMethod(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(personPaymentMethods)
      .where(eq(personPaymentMethods.id, id))
      .returning()
    return row ?? null
  },

  async updateOrganizationNote(db: PostgresJsDatabase, id: string, content: string) {
    const [row] = await db
      .update(organizationNotes)
      .set({ content })
      .where(eq(organizationNotes.id, id))
      .returning()
    return row ?? null
  },

  async deleteOrganizationNote(db: PostgresJsDatabase, id: string) {
    const [row] = await db.delete(organizationNotes).where(eq(organizationNotes.id, id)).returning()
    return row ?? null
  },

  async listCommunications(
    db: PostgresJsDatabase,
    personId: string,
    query: CommunicationListQuery,
  ) {
    const conditions = [eq(communicationLog.personId, personId)]

    if (query.channel) conditions.push(eq(communicationLog.channel, query.channel))
    if (query.direction) conditions.push(eq(communicationLog.direction, query.direction))
    if (query.dateFrom) conditions.push(gte(communicationLog.createdAt, new Date(query.dateFrom)))
    if (query.dateTo) conditions.push(lte(communicationLog.createdAt, new Date(query.dateTo)))

    return db
      .select()
      .from(communicationLog)
      .where(and(...conditions))
      .limit(query.limit)
      .offset(query.offset)
      .orderBy(desc(communicationLog.createdAt))
  },

  async createCommunication(
    db: PostgresJsDatabase,
    personId: string,
    data: CreateCommunicationLogInput,
  ) {
    const [existing] = await db
      .select({ id: people.id })
      .from(people)
      .where(eq(people.id, personId))
      .limit(1)
    if (!existing) return null

    const [row] = await db
      .insert(communicationLog)
      .values({
        personId,
        organizationId: data.organizationId ?? null,
        channel: data.channel,
        direction: data.direction,
        subject: data.subject ?? null,
        content: data.content ?? null,
        sentAt: data.sentAt ? new Date(data.sentAt) : null,
      })
      .returning()
    return row
  },

  listSegments(db: PostgresJsDatabase) {
    return db.select().from(segments).orderBy(segments.createdAt)
  },

  async createSegment(db: PostgresJsDatabase, data: CreateSegmentInput) {
    const [row] = await db.insert(segments).values(data).returning()
    return row
  },

  async deleteSegment(db: PostgresJsDatabase, segmentId: string) {
    const [row] = await db
      .delete(segments)
      .where(eq(segments.id, segmentId))
      .returning({ id: segments.id })
    return row ?? null
  },

  async exportPeopleCsv(
    db: PostgresJsDatabase,
    customFields: ReadonlyArray<CustomFieldDefinition> = [],
  ) {
    const rows = await hydratePeople(db, await db.select().from(people).orderBy(people.createdAt), {
      fallbackOnError: true,
    })

    const baseHeaders = [
      "id",
      "firstName",
      "lastName",
      "jobTitle",
      "relation",
      "preferredLanguage",
      "preferredCurrency",
      "email",
      "phone",
      "website",
      "organizationId",
    ]

    // Namespace disambiguates same-key fields from different owners.
    const csvLines = [
      toCsvRow([
        ...baseHeaders,
        ...customFields.map((field) => `${field.label} (${field.namespace})`),
      ]),
    ]
    for (const row of rows) {
      // toCsvRow quotes delimiters/quotes/newlines AND neutralizes
      // spreadsheet formula-injection prefixes (= + - @ tab CR); see L4.
      const base = baseHeaders.map((header) => row[header as keyof typeof row])
      const custom = customFields.map((field) =>
        formatCustomFieldCell(row.customFields?.[field.namespace]?.[field.key]),
      )
      csvLines.push(toCsvRow([...base, ...custom]))
    }

    return csvLines.join("\n")
  },

  async importPeopleCsv(db: PostgresJsDatabase, csvText: string) {
    const lines = csvText.split("\n").filter((line) => line.trim())
    if (lines.length < 2) {
      return { error: "CSV must have a header row and at least one data row" as const }
    }

    const headers = lines[0]!.split(",").map((header) => header.trim())
    const rows: Record<string, string>[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i]!.split(",").map((value) => value.trim())
      const row: Record<string, string> = {}
      for (let j = 0; j < headers.length; j++) {
        const header = headers[j]
        const value = values[j]
        if (header && value) {
          row[header] = value
        }
      }
      rows.push(row)
    }

    const imported: unknown[] = []
    const errors: { row: number; error: string }[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!
      const result = (await import("../validation.js")).insertPersonSchema.safeParse({
        firstName: row.firstName || "",
        lastName: row.lastName || "",
        jobTitle: row.jobTitle || null,
        relation: row.relation || null,
        preferredLanguage: row.preferredLanguage || null,
        preferredCurrency: row.preferredCurrency || null,
        email: row.email || null,
        phone: row.phone || null,
        website: row.website || null,
        organizationId: row.organizationId || null,
        tags: [],
      })

      if (!result.success) {
        errors.push({ row: i + 2, error: result.error.message })
        continue
      }

      imported.push(await this.createPerson(db, result.data))
    }

    return { imported: imported.length, errors }
  },
}
