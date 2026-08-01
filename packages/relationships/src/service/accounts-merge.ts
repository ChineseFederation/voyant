// agent-quality: file-size exception -- owner: relationships; existing service module stays co-located until a dedicated split preserves behavior and tests.
import {
  identityAddresses,
  identityContactPoints,
  identityNamedContacts,
} from "@voyant-travel/identity/schema"
import { and, eq, inArray, ne, or, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  activityLinks,
  activityParticipants,
  communicationLog,
  customerSignals,
  organizationNotes,
  organizations,
  people,
  personDocuments,
  personNotes,
  personPaymentMethods,
  personRelationships,
  segmentMembers,
} from "../schema.js"
import { hydratePeople, organizationEntityType, personEntityType } from "./accounts-shared.js"

function relationshipEntityTableName(entityType: "person" | "organization") {
  return entityType === "person" ? "people" : "organizations"
}

export class RelationshipsMergeError extends Error {
  readonly status: 400 | 404

  constructor(message: string, status: 400 | 404) {
    super(message)
    this.name = "RelationshipsMergeError"
    this.status = status
  }
}

type OptionalReference = {
  table: string
  column: string
}

type OptionalEntityTargetReference = {
  table: string
  entityType: "person" | "organization"
}

const OPTIONAL_PERSON_REFERENCES: OptionalReference[] = [
  { table: "bookings", column: "person_id" },
  { table: "booking_travelers", column: "person_id" },
  { table: "booking_staff_assignments", column: "person_id" },
  { table: "offers", column: "person_id" },
  { table: "offer_participants", column: "person_id" },
  { table: "offer_contact_assignments", column: "person_id" },
  { table: "offer_staff_assignments", column: "person_id" },
  { table: "orders", column: "person_id" },
  { table: "order_participants", column: "person_id" },
  { table: "order_contact_assignments", column: "person_id" },
  { table: "order_staff_assignments", column: "person_id" },
  { table: "order_terms", column: "accepted_by" },
  { table: "invoices", column: "person_id" },
  { table: "travel_credits", column: "issued_to_person_id" },
  { table: "payment_instruments", column: "person_id" },
  { table: "payment_sessions", column: "payer_person_id" },
  { table: "contracts", column: "person_id" },
  { table: "contract_signatures", column: "person_id" },
  { table: "policy_acceptances", column: "person_id" },
  { table: "policy_acceptances", column: "accepted_by" },
  { table: "notification_deliveries", column: "person_id" },
  { table: "notification_reminder_runs", column: "person_id" },
  { table: "proposals", column: "person_id" },
  { table: "proposal_participants", column: "person_id" },
]

const OPTIONAL_ORGANIZATION_REFERENCES: OptionalReference[] = [
  { table: "bookings", column: "organization_id" },
  { table: "offers", column: "organization_id" },
  { table: "orders", column: "organization_id" },
  { table: "invoices", column: "organization_id" },
  { table: "travel_credits", column: "issued_to_organization_id" },
  { table: "payment_instruments", column: "organization_id" },
  { table: "payment_sessions", column: "payer_organization_id" },
  { table: "contracts", column: "organization_id" },
  { table: "policy_assignments", column: "organization_id" },
  { table: "notification_deliveries", column: "organization_id" },
  { table: "notification_reminder_runs", column: "organization_id" },
  { table: "proposals", column: "organization_id" },
]

const OPTIONAL_PERSON_ENTITY_TARGET_REFERENCES: OptionalEntityTargetReference[] = [
  { table: "notification_deliveries", entityType: "person" },
]

const OPTIONAL_ORGANIZATION_ENTITY_TARGET_REFERENCES: OptionalEntityTargetReference[] = [
  { table: "notification_deliveries", entityType: "organization" },
]

function proposalIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`
}

function mergeTags(
  keepTags: string[] | null | undefined,
  mergeTags: string[] | null | undefined,
): string[] {
  return [...new Set([...(keepTags ?? []), ...(mergeTags ?? [])])]
}

function backfill<T extends Record<string, unknown>>(
  keep: T,
  merge: T,
  keys: Array<keyof T>,
): Partial<T> {
  const patch: Partial<T> = {}

  for (const key of keys) {
    const keepValue = keep[key]
    const mergeValue = merge[key]
    if (
      (keepValue === null || keepValue === undefined || keepValue === "") &&
      mergeValue !== null &&
      mergeValue !== undefined &&
      mergeValue !== ""
    ) {
      patch[key] = mergeValue
    }
  }

  return patch
}

async function tableHasColumn(db: PostgresJsDatabase, table: string, column: string) {
  const rows = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${table}
        AND column_name = ${column}
    ) AS "exists"
  `)
  return Boolean(rows[0]?.exists)
}

async function updateOptionalReference(
  db: PostgresJsDatabase,
  reference: OptionalReference,
  keepId: string,
  mergeId: string,
) {
  if (!(await tableHasColumn(db, reference.table, reference.column))) return
  const hasUpdatedAt = await tableHasColumn(db, reference.table, "updated_at")

  if (hasUpdatedAt) {
    await db.execute(sql`
      UPDATE ${sql.raw(proposalIdentifier(reference.table))}
      SET ${sql.raw(proposalIdentifier(reference.column))} = ${keepId},
          updated_at = NOW()
      WHERE ${sql.raw(proposalIdentifier(reference.column))} = ${mergeId}
    `)
    return
  }

  await db.execute(sql`
      UPDATE ${sql.raw(proposalIdentifier(reference.table))}
      SET ${sql.raw(proposalIdentifier(reference.column))} = ${keepId}
      WHERE ${sql.raw(proposalIdentifier(reference.column))} = ${mergeId}
    `)
}

async function updateOptionalReferences(
  db: PostgresJsDatabase,
  references: OptionalReference[],
  keepId: string,
  mergeId: string,
) {
  for (const reference of references) {
    await updateOptionalReference(db, reference, keepId, mergeId)
  }
}

async function updateOptionalEntityTargetReference(
  db: PostgresJsDatabase,
  reference: OptionalEntityTargetReference,
  keepId: string,
  mergeId: string,
) {
  const hasTargetType = await tableHasColumn(db, reference.table, "target_type")
  const hasTargetId = await tableHasColumn(db, reference.table, "target_id")
  if (!hasTargetType || !hasTargetId) return

  await db.execute(sql`
    UPDATE ${sql.raw(proposalIdentifier(reference.table))}
    SET target_id = ${keepId}
    WHERE target_type = ${reference.entityType}
      AND target_id = ${mergeId}
  `)
}

async function updateOptionalEntityTargetReferences(
  db: PostgresJsDatabase,
  references: OptionalEntityTargetReference[],
  keepId: string,
  mergeId: string,
) {
  for (const reference of references) {
    await updateOptionalEntityTargetReference(db, reference, keepId, mergeId)
  }
}

async function dedupeOptionalPersonJoinTable(
  db: PostgresJsDatabase,
  reference: { table: string; ownerColumn: string; personColumn: string },
  keepId: string,
  mergeId: string,
) {
  const hasOwner = await tableHasColumn(db, reference.table, reference.ownerColumn)
  const hasPerson = await tableHasColumn(db, reference.table, reference.personColumn)
  if (!hasOwner || !hasPerson) return

  const table = sql.raw(proposalIdentifier(reference.table))
  const ownerColumn = sql.raw(proposalIdentifier(reference.ownerColumn))
  const personColumn = sql.raw(proposalIdentifier(reference.personColumn))

  await db.execute(sql`
    DELETE FROM ${table} merge_row
    WHERE merge_row.${personColumn} = ${mergeId}
      AND EXISTS (
        SELECT 1
        FROM ${table} keep_row
        WHERE keep_row.${ownerColumn} = merge_row.${ownerColumn}
          AND keep_row.${personColumn} = ${keepId}
      )
  `)
}

async function mergeIdentityRows(
  db: PostgresJsDatabase,
  entityType: string,
  keepId: string,
  mergeId: string,
) {
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
}

async function mergeEntityLinks(
  db: PostgresJsDatabase,
  entityType: "person" | "organization",
  keepId: string,
  mergeId: string,
) {
  await db
    .update(activityLinks)
    .set({ entityId: keepId })
    .where(and(eq(activityLinks.entityType, entityType), eq(activityLinks.entityId, mergeId)))

  // Merge each namespace independently so a keeper collision wins at the field
  // key without discarding unrelated values from the loser's same namespace.
  const table = relationshipEntityTableName(entityType)
  // agent-quality: raw-sql reviewed -- owner: relationships; table names come from the closed relationship mapping and values remain bound parameters.
  await db.execute(
    sql`UPDATE ${sql.identifier(table)} k
            SET custom_fields = (
                  SELECT COALESCE(
                    jsonb_object_agg(
                      namespaces.namespace,
                      COALESCE(m.custom_fields -> namespaces.namespace, '{}'::jsonb)
                        || COALESCE(k.custom_fields -> namespaces.namespace, '{}'::jsonb)
                    ),
                    '{}'::jsonb
                  )
                  FROM (
                    SELECT jsonb_object_keys(m.custom_fields) AS namespace
                    UNION
                    SELECT jsonb_object_keys(k.custom_fields) AS namespace
                  ) namespaces
                ),
                updated_at = now()
          FROM ${sql.identifier(table)} m
          WHERE k.id = ${keepId} AND m.id = ${mergeId}`,
  )
}

async function dedupePersonJoinTables(db: PostgresJsDatabase, keepId: string, mergeId: string) {
  await dedupeOptionalPersonJoinTable(
    db,
    { table: "proposal_participants", ownerColumn: "proposal_id", personColumn: "person_id" },
    keepId,
    mergeId,
  )

  await db.delete(activityParticipants).where(
    and(
      eq(activityParticipants.personId, mergeId),
      sql`EXISTS (
          SELECT 1
          FROM activity_participants keep_participant
          WHERE keep_participant.activity_id = ${activityParticipants.activityId}
            AND keep_participant.person_id = ${keepId}
        )`,
    ),
  )

  await db
    .delete(personRelationships)
    .where(
      or(
        and(
          eq(personRelationships.fromPersonId, mergeId),
          eq(personRelationships.toPersonId, keepId),
        ),
        and(
          eq(personRelationships.fromPersonId, keepId),
          eq(personRelationships.toPersonId, mergeId),
        ),
        and(
          eq(personRelationships.fromPersonId, mergeId),
          eq(personRelationships.toPersonId, mergeId),
        ),
      ),
    )

  await db.delete(personRelationships).where(
    and(
      eq(personRelationships.fromPersonId, mergeId),
      ne(personRelationships.toPersonId, mergeId),
      sql`EXISTS (
          SELECT 1
          FROM person_relationships keep_relationship
          WHERE keep_relationship.from_person_id = ${keepId}
            AND keep_relationship.to_person_id = ${personRelationships.toPersonId}
            AND keep_relationship.kind = ${personRelationships.kind}
        )`,
    ),
  )

  await db.delete(personRelationships).where(
    and(
      eq(personRelationships.toPersonId, mergeId),
      ne(personRelationships.fromPersonId, mergeId),
      sql`EXISTS (
          SELECT 1
          FROM person_relationships keep_relationship
          WHERE keep_relationship.from_person_id = ${personRelationships.fromPersonId}
            AND keep_relationship.to_person_id = ${keepId}
            AND keep_relationship.kind = ${personRelationships.kind}
        )`,
    ),
  )
}

export const accountMergeService = {
  async mergePerson(db: PostgresJsDatabase, keepId: string, mergeId: string) {
    if (keepId === mergeId) {
      throw new RelationshipsMergeError("Cannot merge a person into itself", 400)
    }

    return db.transaction(async (tx) => {
      const [keep, merge] = await tx
        .select()
        .from(people)
        .where(inArray(people.id, [keepId, mergeId]))
        .for("update")

      const keepPerson = keep?.id === keepId ? keep : merge?.id === keepId ? merge : null
      const mergePerson = keep?.id === mergeId ? keep : merge?.id === mergeId ? merge : null

      if (!keepPerson) throw new RelationshipsMergeError("Person to keep not found", 404)
      if (!mergePerson) throw new RelationshipsMergeError("Person to merge not found", 404)

      await tx
        .update(people)
        .set({
          ...backfill(keepPerson, mergePerson, [
            "organizationId",
            "middleName",
            "gender",
            "jobTitle",
            "relation",
            "preferredLanguage",
            "preferredCurrency",
            "ownerId",
            "source",
            "sourceRef",
            "dateOfBirth",
            "notes",
            "accessibilityEncrypted",
            "dietaryEncrypted",
            "loyaltyEncrypted",
            "insuranceEncrypted",
          ]),
          tags: mergeTags(keepPerson.tags, mergePerson.tags),
          updatedAt: new Date(),
        })
        .where(eq(people.id, keepId))

      await dedupePersonJoinTables(tx as PostgresJsDatabase, keepId, mergeId)
      await mergeIdentityRows(tx as PostgresJsDatabase, personEntityType, keepId, mergeId)
      await mergeEntityLinks(tx as PostgresJsDatabase, "person", keepId, mergeId)

      await tx
        .update(personNotes)
        .set({ personId: keepId })
        .where(eq(personNotes.personId, mergeId))
      await tx
        .update(personDocuments)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(
          and(
            eq(personDocuments.personId, mergeId),
            eq(personDocuments.isPrimary, true),
            sql`EXISTS (
              SELECT 1
              FROM person_documents keep_document
              WHERE keep_document.person_id = ${keepId}
                AND keep_document.type = ${personDocuments.type}
                AND keep_document.is_primary = true
            )`,
          ),
        )
      await tx
        .update(personDocuments)
        .set({ personId: keepId, updatedAt: new Date() })
        .where(eq(personDocuments.personId, mergeId))
      await tx
        .update(personPaymentMethods)
        .set({ personId: keepId })
        .where(eq(personPaymentMethods.personId, mergeId))
      await tx
        .update(communicationLog)
        .set({ personId: keepId })
        .where(eq(communicationLog.personId, mergeId))
      await tx
        .update(activityParticipants)
        .set({ personId: keepId })
        .where(eq(activityParticipants.personId, mergeId))
      await tx
        .update(personRelationships)
        .set({ fromPersonId: keepId, updatedAt: new Date() })
        .where(eq(personRelationships.fromPersonId, mergeId))
      await tx
        .update(personRelationships)
        .set({ toPersonId: keepId, updatedAt: new Date() })
        .where(eq(personRelationships.toPersonId, mergeId))
      await tx
        .update(segmentMembers)
        .set({ personId: keepId })
        .where(eq(segmentMembers.personId, mergeId))
      await tx
        .update(customerSignals)
        .set({ personId: keepId, updatedAt: new Date() })
        .where(eq(customerSignals.personId, mergeId))

      await updateOptionalReferences(
        tx as PostgresJsDatabase,
        OPTIONAL_PERSON_REFERENCES,
        keepId,
        mergeId,
      )
      await updateOptionalEntityTargetReferences(
        tx as PostgresJsDatabase,
        OPTIONAL_PERSON_ENTITY_TARGET_REFERENCES,
        keepId,
        mergeId,
      )

      await tx.delete(people).where(eq(people.id, mergeId))

      const [row] = await tx.select().from(people).where(eq(people.id, keepId)).limit(1)
      if (!row) throw new Error("Merged person disappeared")
      const [hydrated] = await hydratePeople(tx as PostgresJsDatabase, [row])
      return hydrated ?? row
    })
  },

  async mergeOrganization(db: PostgresJsDatabase, keepId: string, mergeId: string) {
    if (keepId === mergeId) {
      throw new RelationshipsMergeError("Cannot merge an organization into itself", 400)
    }

    return db.transaction(async (tx) => {
      const [keep, merge] = await tx
        .select()
        .from(organizations)
        .where(inArray(organizations.id, [keepId, mergeId]))
        .for("update")

      const keepOrganization = keep?.id === keepId ? keep : merge?.id === keepId ? merge : null
      const mergeOrganization = keep?.id === mergeId ? keep : merge?.id === mergeId ? merge : null

      if (!keepOrganization)
        throw new RelationshipsMergeError("Organization to keep not found", 404)
      if (!mergeOrganization)
        throw new RelationshipsMergeError("Organization to merge not found", 404)

      await tx
        .update(organizations)
        .set({
          ...backfill(keepOrganization, mergeOrganization, [
            "legalName",
            "website",
            "taxId",
            "industry",
            "relation",
            "ownerId",
            "defaultCurrency",
            "preferredLanguage",
            "paymentTerms",
            "source",
            "sourceRef",
            "notes",
          ]),
          tags: mergeTags(keepOrganization.tags, mergeOrganization.tags),
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, keepId))

      await mergeIdentityRows(tx as PostgresJsDatabase, organizationEntityType, keepId, mergeId)
      await mergeEntityLinks(tx as PostgresJsDatabase, "organization", keepId, mergeId)

      await tx
        .update(people)
        .set({ organizationId: keepId, updatedAt: new Date() })
        .where(eq(people.organizationId, mergeId))
      await tx
        .update(organizationNotes)
        .set({ organizationId: keepId })
        .where(eq(organizationNotes.organizationId, mergeId))
      await tx
        .update(communicationLog)
        .set({ organizationId: keepId })
        .where(eq(communicationLog.organizationId, mergeId))
      await updateOptionalReferences(
        tx as PostgresJsDatabase,
        OPTIONAL_ORGANIZATION_REFERENCES,
        keepId,
        mergeId,
      )
      await updateOptionalEntityTargetReferences(
        tx as PostgresJsDatabase,
        OPTIONAL_ORGANIZATION_ENTITY_TARGET_REFERENCES,
        keepId,
        mergeId,
      )

      await tx.delete(organizations).where(eq(organizations.id, mergeId))

      const [row] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, keepId))
        .limit(1)
      if (!row) throw new Error("Merged organization disappeared")
      return row
    })
  },
}
