import {
  type BookingsCanonicalInquiryIntakeRuntime,
  bookingsCanonicalInquiryIntakeRuntimePort,
} from "@voyant-travel/bookings/inquiry-intake-runtime-port"
import {
  type LegacyBookingInquiryReadRuntime,
  legacyBookingInquiryReadRuntimePort,
} from "@voyant-travel/bookings/legacy-inquiry-read-runtime-port"
import {
  type BookingsRelationshipsRuntime,
  bookingsRelationshipsRuntimePort,
} from "@voyant-travel/bookings/runtime-port"
import type { BookingInquiry } from "@voyant-travel/bookings/schema"
import {
  type CatalogInquiryBookingSessionRuntime,
  catalogInquiryBookingSessionRuntimePort,
} from "@voyant-travel/catalog/inquiry-booking-session-runtime-port"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import {
  type CustomFieldsRuntime,
  type CustomFieldValueLifecycleRuntime,
  type CustomFieldValueReaderRuntime,
  customFieldsRuntimePort,
  customFieldsVisibleIn,
  customFieldValueLifecycleRuntimePort,
  customFieldValueReaderRuntimePort,
} from "@voyant-travel/core/custom-fields"
import type { VoyantPort } from "@voyant-travel/core/project"
import {
  type CustomFieldValueOperationsRuntime,
  customFieldValueOperationsRuntimePort,
} from "@voyant-travel/core/runtime-port"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import {
  type FinanceStoredInstrumentRuntime,
  financeStoredInstrumentRuntimePort,
} from "@voyant-travel/finance/runtime-port"
import {
  type MediaInquiryAttachmentRuntime,
  mediaInquiryAttachmentRuntimePort,
} from "@voyant-travel/media/runtime-port"
import {
  type ProposalInquiryConversionRuntime,
  proposalInquiryConversionRuntimePort,
} from "@voyant-travel/proposals-contracts/inquiry-conversion"
import {
  type InquiryTargetAuthorityRuntime,
  inquiryTargetAuthorityRuntimePort,
} from "@voyant-travel/relationships-contracts/inquiry-target-authority/runtime-port"
import { and, desc, eq, or, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { resolveIntakeTargets } from "./inquiry-intake-targets.js"
import { relationshipsInquiryOverdueJobRuntimePort } from "./inquiry-overdue-job-runtime-port.js"
import type { InquiryFirstResponseSlaConfiguration } from "./inquiry-sla-policy.js"
import {
  adoptLegacyBookingInquiry,
  runLegacyInquiryCutoverBatch,
} from "./legacy-inquiry-cutover.js"
import {
  type LegacyInquiryCutoverJobRuntime,
  legacyInquiryCutoverJobRuntimePort,
} from "./legacy-inquiry-cutover-job-runtime-port.js"
import { createPublicApiIntakePersistence } from "./public-api-intake-runtime.js"
import type { RelationshipsRouteRuntimeOptions } from "./route-runtime.js"
import {
  type RelationshipsBookingEnrichmentDatabaseRuntime,
  type RelationshipsMiceRuntime,
  type RelationshipsPersonNotificationsRuntime,
  relationshipsBookingEnrichmentDatabaseRuntimePort,
  relationshipsMiceRuntimePort,
  relationshipsPersonNotificationsRuntimePort,
  relationshipsRouteRuntimePort,
} from "./runtime-port.js"
import { inquiries, inquiryLegacySources } from "./schema.js"
import { relationshipsService } from "./service/index.js"

const publicApiIntakeRuntimePortReference = {
  id: "public-api.intake.runtime",
} as const

type BookingInquiryCompatibilitySnapshot = Omit<BookingInquiry, "id" | "createdAt" | "updatedAt">

function bookingInquiryCompatibilitySnapshot(
  value: unknown,
): BookingInquiryCompatibilitySnapshot | null {
  if (!value || typeof value !== "object") return null
  const row = value as Partial<BookingInquiryCompatibilitySnapshot>
  return typeof row.channelId === "string" &&
    typeof row.productId === "string" &&
    typeof row.idempotencyKey === "string" &&
    typeof row.requestFingerprint === "string"
    ? (row as BookingInquiryCompatibilitySnapshot)
    : null
}

function materializeBookingInquiryCompatibility(
  snapshot: BookingInquiryCompatibilitySnapshot,
  canonical: typeof inquiries.$inferSelect,
): BookingInquiry {
  return {
    ...snapshot,
    id: canonical.id,
    status: canonical.status === "closed" ? "closed" : "open",
    createdAt: canonical.createdAt,
    updatedAt: canonical.updatedAt,
  }
}

function materializeLegacyBookingInquiryCompatibility(value: unknown): BookingInquiry | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  if (
    typeof row.id !== "string" ||
    typeof row.idempotencyKey !== "string" ||
    typeof row.requestFingerprint !== "string" ||
    typeof row.channelId !== "string" ||
    typeof row.productId !== "string" ||
    typeof row.locale !== "string" ||
    typeof row.message !== "string" ||
    typeof row.createdAt !== "string" ||
    typeof row.updatedAt !== "string"
  ) {
    return null
  }
  return {
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    requestFingerprint: row.requestFingerprint,
    channelId: row.channelId,
    productId: row.productId,
    departureId: typeof row.departureId === "string" ? row.departureId : null,
    contactFirstName: typeof row.contactFirstName === "string" ? row.contactFirstName : null,
    contactLastName: typeof row.contactLastName === "string" ? row.contactLastName : null,
    contactEmail: typeof row.contactEmail === "string" ? row.contactEmail : null,
    contactPhone: typeof row.contactPhone === "string" ? row.contactPhone : null,
    locale: row.locale,
    message: row.message,
    status: row.status === "closed" ? "closed" : "open",
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }
}

async function listCanonicalBookingInquiryCompatibility(db: PostgresJsDatabase) {
  const rows = await db
    .select({ inquiry: inquiries, provenance: inquiryLegacySources })
    .from(inquiries)
    .leftJoin(inquiryLegacySources, eq(inquiryLegacySources.inquiryId, inquiries.id))
    .where(
      or(
        sql`${inquiries.customFields} -> 'relationships' ? 'bookingInquiryCompatibility'`,
        eq(inquiryLegacySources.sourceTable, "booking_inquiries"),
      ),
    )
    .orderBy(desc(inquiries.createdAt), desc(inquiries.id))
  return rows.flatMap(({ inquiry, provenance }) => {
    const relationships = inquiry.customFields.relationships
    const compatibility = bookingInquiryCompatibilitySnapshot(
      relationships?.bookingInquiryCompatibility,
    )
    const receipt = compatibility
      ? materializeBookingInquiryCompatibility(compatibility, inquiry)
      : materializeLegacyBookingInquiryCompatibility(provenance?.sourceSnapshot)
    return receipt ? [{ canonicalId: inquiry.id, receipt }] : []
  })
}

async function bookingInquiryRequestFingerprint(input: {
  channelId: string
  productId: string
  departureId: string | null
  contact: {
    firstName: string | null
    lastName: string | null
    email: string | null
    phone: string | null
  }
  locale: string
  message: string
}) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(input)),
  )
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function findAdoptedBookingInquiryByIdentity(
  db: PostgresJsDatabase,
  input: { channelId: string; idempotencyKey: string },
) {
  const [source] = await db
    .select({ snapshot: inquiryLegacySources.sourceSnapshot })
    .from(inquiryLegacySources)
    .where(
      and(
        eq(inquiryLegacySources.sourceTable, "booking_inquiries"),
        sql`${inquiryLegacySources.sourceSnapshot} ->> 'channelId' = ${input.channelId}`,
        sql`${inquiryLegacySources.sourceSnapshot} ->> 'idempotencyKey' = ${input.idempotencyKey}`,
      ),
    )
    .limit(1)
  return materializeLegacyBookingInquiryCompatibility(source?.snapshot)
}

const relationshipCustomFieldTables = {
  person: "people",
  organization: "organizations",
  activity: "activities",
} as const

const relationshipCustomFieldValues: CustomFieldValueLifecycleRuntime = {
  supports: (entityType) => entityType in relationshipCustomFieldTables,
  async renameDefinitionKey(db, definition, nextKey) {
    const table =
      relationshipCustomFieldTables[
        definition.entityType as keyof typeof relationshipCustomFieldTables
      ]
    if (!table) return
    const database = db as PostgresJsDatabase
    await database.execute(
      sql`UPDATE ${sql.identifier(table)}
          SET custom_fields = jsonb_set(
            custom_fields,
            ARRAY[${definition.namespace}]::text[],
            (COALESCE(custom_fields -> ${definition.namespace}, '{}'::jsonb) - ${definition.key})
              || jsonb_build_object(
                ${nextKey}::text,
                custom_fields #> ARRAY[${definition.namespace}, ${definition.key}]::text[]
              ),
            true
          ),
          updated_at = now()
          WHERE custom_fields -> ${definition.namespace} ? ${definition.key}`,
    )
  },
  async deleteDefinitionValues(db, definition) {
    const table =
      relationshipCustomFieldTables[
        definition.entityType as keyof typeof relationshipCustomFieldTables
      ]
    if (!table) return
    const database = db as PostgresJsDatabase
    await database.execute(
      sql`UPDATE ${sql.identifier(table)}
          SET custom_fields = custom_fields #- ARRAY[${definition.namespace}, ${definition.key}]::text[],
              updated_at = now()
          WHERE custom_fields -> ${definition.namespace} ? ${definition.key}`,
    )
  },
}

const relationshipCustomFieldValueOperations: CustomFieldValueOperationsRuntime = {
  supports: (entityType) => entityType in relationshipCustomFieldTables,
  async list(db, _owner, input) {
    const table =
      relationshipCustomFieldTables[input.entityType as keyof typeof relationshipCustomFieldTables]
    if (!table) return []
    const database = db as PostgresJsDatabase
    const rows = input.entityId
      ? await database.execute(
          sql`SELECT id, custom_fields FROM ${sql.identifier(table)} WHERE id = ${input.entityId}`,
        )
      : await database.execute(
          sql`SELECT id, custom_fields FROM ${sql.identifier(table)} WHERE custom_fields <> '{}'::jsonb ORDER BY updated_at DESC`,
        )
    return Array.from(rows, (row) => ({
      entityId: String(row.id),
      customFields: (row.custom_fields as Record<string, unknown> | null) ?? {},
    }))
  },
  async upsert(db, _owner, input) {
    const table =
      relationshipCustomFieldTables[
        input.definition.entityType as keyof typeof relationshipCustomFieldTables
      ]
    if (!table) return false
    const database = db as PostgresJsDatabase
    const updated = Array.from(
      await database.execute(
        sql`UPDATE ${sql.identifier(table)}
            SET custom_fields = jsonb_set(
                  custom_fields,
                  ARRAY[${input.definition.namespace}]::text[],
                  COALESCE(custom_fields -> ${input.definition.namespace}, '{}'::jsonb)
                    || jsonb_build_object(
                      ${input.definition.key}::text,
                      ${JSON.stringify(input.value)}::jsonb
                    ),
                  true
                ),
                updated_at = now()
            WHERE id = ${input.entityId}
            RETURNING id`,
      ),
    )
    return updated.length > 0
  },
  async delete(db, _owner, input) {
    const table =
      relationshipCustomFieldTables[
        input.definition.entityType as keyof typeof relationshipCustomFieldTables
      ]
    if (!table) return false
    const database = db as PostgresJsDatabase
    const deleted = Array.from(
      await database.execute(
        sql`UPDATE ${sql.identifier(table)}
            SET custom_fields = custom_fields #- ARRAY[${input.definition.namespace}, ${input.definition.key}]::text[],
                updated_at = now()
            WHERE id = ${input.entityId}
              AND custom_fields -> ${input.definition.namespace} ? ${input.definition.key}
            RETURNING id`,
      ),
    )
    return deleted.length > 0
  },
}

interface RelationshipsRuntimeContributorHost {
  primitives: VoyantRuntimeHostPrimitives
  hasRuntimePort?(port: Pick<VoyantPort<unknown>, "id">): boolean
  getRuntimePort<T>(port: Pick<VoyantPort<T>, "id">): T | Promise<T>
  getRuntimePorts?<T>(port: Pick<VoyantPort<T>, "id">): readonly T[] | Promise<readonly T[]>
}

/**
 * Notifications is optional. A deployment that selects CRM without it keeps a
 * Communications tab listing only hand-logged entries, which is what it showed
 * before this seam existed.
 */
async function resolvePersonNotifications(
  host: RelationshipsRuntimeContributorHost,
): Promise<RelationshipsPersonNotificationsRuntime | undefined> {
  if (host.hasRuntimePort?.(relationshipsPersonNotificationsRuntimePort) === false) return undefined
  try {
    return await host.getRuntimePort<RelationshipsPersonNotificationsRuntime>(
      relationshipsPersonNotificationsRuntimePort,
    )
  } catch {
    return undefined
  }
}

/** Package-owned registration map for Relationships deployment adapters. */
export function createRelationshipsRuntimePortContribution(
  host: RelationshipsRuntimeContributorHost,
): Readonly<Record<string, unknown>> {
  const customFieldsRuntime = Promise.resolve(
    host.getRuntimePort<CustomFieldsRuntime>(customFieldsRuntimePort),
  )
  const personNotifications = resolvePersonNotifications(host)
  const proposalInquiryConversion =
    host.hasRuntimePort?.(proposalInquiryConversionRuntimePort) === true
      ? Promise.resolve(
          host.getRuntimePort<ProposalInquiryConversionRuntime>(
            proposalInquiryConversionRuntimePort,
          ),
        )
      : undefined
  const inquiryTargetAuthorities = Promise.resolve(
    host.getRuntimePorts?.<InquiryTargetAuthorityRuntime>(inquiryTargetAuthorityRuntimePort) ?? [],
  )
  const legacyBookingInquiryReader =
    host.hasRuntimePort?.(legacyBookingInquiryReadRuntimePort) === true
      ? Promise.resolve(
          host.getRuntimePort<LegacyBookingInquiryReadRuntime>(legacyBookingInquiryReadRuntimePort),
        )
      : undefined
  const inquiryBookingSession =
    host.hasRuntimePort?.(catalogInquiryBookingSessionRuntimePort) === true
      ? Promise.resolve(
          host.getRuntimePort<CatalogInquiryBookingSessionRuntime>(
            catalogInquiryBookingSessionRuntimePort,
          ),
        )
      : undefined
  const inquiryAttachments =
    host.hasRuntimePort?.(mediaInquiryAttachmentRuntimePort) === true
      ? Promise.resolve(
          host.getRuntimePort<MediaInquiryAttachmentRuntime>(mediaInquiryAttachmentRuntimePort),
        )
      : undefined
  const customFields: CustomFieldValueReaderRuntime = {
    async resolveVisibleValues(db, entity, entityId, channel) {
      const database = db as PostgresJsDatabase
      const row =
        entity === "person"
          ? await relationshipsService.getPersonById(database, entityId)
          : entity === "organization"
            ? await relationshipsService.getOrganizationById(database, entityId)
            : null
      if (!row) return {}

      const values = row.customFields ?? {}
      const definitions = customFieldsVisibleIn(
        await (await customFieldsRuntime).resolveRegistry(database),
        entity,
        channel,
      )
      const visible: Record<string, Record<string, unknown>> = {}
      for (const definition of definitions) {
        const value = values[definition.namespace]?.[definition.key]
        if (value !== undefined) {
          const namespaceValues = visible[definition.namespace] ?? {}
          namespaceValues[definition.key] = value
          visible[definition.namespace] = namespaceValues
        }
      }
      return visible
    },
  }
  return {
    [publicApiIntakeRuntimePortReference.id]: createPublicApiIntakePersistence(
      () => inquiryTargetAuthorities,
    ),
    [relationshipsInquiryOverdueJobRuntimePort.id]: {
      withDb: <T>(bindings: unknown, operation: (db: PostgresJsDatabase) => Promise<T>) =>
        operation(host.primitives.database.resolve<PostgresJsDatabase>(bindings)),
    },
    [legacyInquiryCutoverJobRuntimePort.id]: {
      async run(bindings) {
        const reader = legacyBookingInquiryReader ? await legacyBookingInquiryReader : undefined
        return runLegacyInquiryCutoverBatch({
          db: host.primitives.database.resolve<PostgresJsDatabase>(bindings),
          ...(reader ? { reader } : {}),
          authorities: await inquiryTargetAuthorities,
        })
      },
    } satisfies LegacyInquiryCutoverJobRuntime,
    [customFieldValueReaderRuntimePort.id]: customFields,
    [customFieldValueLifecycleRuntimePort.id]: relationshipCustomFieldValues,
    [customFieldValueOperationsRuntimePort.id]: relationshipCustomFieldValueOperations,
    [relationshipsRouteRuntimePort.id]: {
      resolveInquiryFirstResponseSla: (bindings) => {
        const configured = host.primitives.config.read(bindings, "inquiryFirstResponseSla")
        return configured && typeof configured === "object"
          ? (configured as InquiryFirstResponseSlaConfiguration)
          : undefined
      },
      customFields: async (db) =>
        (await customFieldsRuntime).resolveRegistry(db as PostgresJsDatabase),
      customFieldsForWrite: async (db, entity) =>
        (await customFieldsRuntime).resolveRegistryForWrite(db as PostgresJsDatabase, entity),
      // Resolved per call, not folded into this object: routes read the route
      // runtime synchronously, so awaiting an optional port to build it would
      // hand them a promise where they expect the options. Answers with an
      // empty list when no notifications module is selected.
      personNotifications: {
        listPersonDeliveries: async (db, personId, query) =>
          (await personNotifications)?.listPersonDeliveries(db, personId, query) ?? [],
      },
      ...(proposalInquiryConversion
        ? {
            proposalInquiryConversion: {
              convertInquiry: async (
                ...args: Parameters<ProposalInquiryConversionRuntime["convertInquiry"]>
              ) => (await proposalInquiryConversion).convertInquiry(...args),
            },
          }
        : {}),
      inquiryTargetValidation: {
        async validateTarget(db, kind, targetId) {
          const matching = (await inquiryTargetAuthorities).filter(
            (authority) => authority.kind === kind,
          )
          const [authority] = matching
          if (matching.length !== 1 || !authority) return "unavailable"
          return (await authority.targetExists(db, targetId)) ? "valid" : "not_found"
        },
      },
      ...(inquiryBookingSession
        ? {
            inquiryBookingSession: {
              createForInquiry: async (
                ...args: Parameters<CatalogInquiryBookingSessionRuntime["createForInquiry"]>
              ) => (await inquiryBookingSession).createForInquiry(...args),
            },
          }
        : {}),
      ...(inquiryAttachments
        ? {
            inquiryAttachments: {
              preparePrivateDocument: async (
                ...args: Parameters<MediaInquiryAttachmentRuntime["preparePrivateDocument"]>
              ) => (await inquiryAttachments).preparePrivateDocument(...args),
              finalizePrivateDocument: async (
                ...args: Parameters<MediaInquiryAttachmentRuntime["finalizePrivateDocument"]>
              ) => (await inquiryAttachments).finalizePrivateDocument(...args),
              abortPrivateDocument: async (
                ...args: Parameters<MediaInquiryAttachmentRuntime["abortPrivateDocument"]>
              ) => (await inquiryAttachments).abortPrivateDocument(...args),
              claimPrivateDocument: async (
                ...args: Parameters<MediaInquiryAttachmentRuntime["claimPrivateDocument"]>
              ) => (await inquiryAttachments).claimPrivateDocument(...args),
              claimExistingPrivateDocument: async (
                ...args: Parameters<MediaInquiryAttachmentRuntime["claimExistingPrivateDocument"]>
              ) => (await inquiryAttachments).claimExistingPrivateDocument(...args),
              releasePrivateDocument: async (
                ...args: Parameters<MediaInquiryAttachmentRuntime["releasePrivateDocument"]>
              ) => (await inquiryAttachments).releasePrivateDocument(...args),
              requestPrivateDocumentPurge: async (
                ...args: Parameters<MediaInquiryAttachmentRuntime["requestPrivateDocumentPurge"]>
              ) => (await inquiryAttachments).requestPrivateDocumentPurge(...args),
              resolvePrivateDocument: async (
                ...args: Parameters<MediaInquiryAttachmentRuntime["resolvePrivateDocument"]>
              ) => (await inquiryAttachments).resolvePrivateDocument(...args),
              downloadPrivateDocument: async (
                ...args: Parameters<MediaInquiryAttachmentRuntime["downloadPrivateDocument"]>
              ) => (await inquiryAttachments).downloadPrivateDocument(...args),
            },
          }
        : {}),
    } satisfies RelationshipsRouteRuntimeOptions,
    [relationshipsMiceRuntimePort.id]: {
      personExists: async (db, personId) =>
        (await relationshipsService.getPersonById(db as never, personId)) != null,
    } satisfies RelationshipsMiceRuntime,
    [relationshipsBookingEnrichmentDatabaseRuntimePort.id]: {
      withDb: <T>(bindings: unknown, operation: (db: AnyDrizzleDb) => Promise<T>) =>
        host.primitives.database.transaction(bindings, (database) =>
          operation(database as AnyDrizzleDb),
        ),
    } satisfies RelationshipsBookingEnrichmentDatabaseRuntime,
    [bookingsRelationshipsRuntimePort.id]: {
      loadPersonTravelSnapshot: (...args) => relationshipsService.loadPersonTravelSnapshot(...args),
      upsertPersonFromContact: (...args) => relationshipsService.upsertPersonFromContact(...args),
      getPersonById: (...args) => relationshipsService.getPersonById(...args),
      getOrganizationById: (...args) => relationshipsService.getOrganizationById(...args),
    } satisfies BookingsRelationshipsRuntime,
    [bookingsCanonicalInquiryIntakeRuntimePort.id]: {
      async submit(db, input) {
        const requestFingerprint = await bookingInquiryRequestFingerprint({
          channelId: input.channelId,
          productId: input.productId,
          departureId: input.departureId,
          contact: input.contact,
          locale: input.locale,
          message: input.message,
        })
        const adoptedReceipt = await findAdoptedBookingInquiryByIdentity(db, input)
        if (adoptedReceipt) {
          return {
            status:
              adoptedReceipt.requestFingerprint === requestFingerprint ? "replayed" : "conflict",
            inquiry: adoptedReceipt,
          }
        }
        const authorities = await inquiryTargetAuthorities
        const reader = legacyBookingInquiryReader ? await legacyBookingInquiryReader : undefined
        const historical = await reader?.findByIdentity(db, input)
        if (historical) {
          await adoptLegacyBookingInquiry(db, authorities, historical)
          return {
            status: historical.requestFingerprint === requestFingerprint ? "replayed" : "conflict",
            inquiry: historical,
          }
        }
        // A Booking Inquiry is a customer submission. If an owner cannot resolve
        // the Product or departure it named, the submission is still recorded and
        // the reference is retained for reconciliation.
        const { targets: resolvedTargets, unresolved } = await resolveIntakeTargets(
          db,
          authorities,
          [
            { kind: "product", targetId: input.productId },
            ...(input.departureId
              ? [{ kind: "departure" as const, targetId: input.departureId }]
              : []),
          ],
        )
        const productSnapshot = resolvedTargets.find(
          (target) => target.kind === "product",
        )?.snapshot
        const name = [input.contact.firstName, input.contact.lastName].filter(Boolean).join(" ")
        const result = await relationshipsService.createPublicInquiry(
          db,
          {
            subject:
              productSnapshot?.title ?? (input.message.trim().slice(0, 300) || "Product inquiry"),
            kind: "product",
            sourceRef: input.idempotencyKey,
            contactSnapshot: {
              ...(name ? { name } : {}),
              ...(input.contact.email ? { email: input.contact.email } : {}),
              ...(input.contact.phone ? { phone: input.contact.phone } : {}),
            },
            customerMessage: input.message,
            locale: input.locale,
            tags: [],
            customFields: {
              relationships: {
                compatibilityRequestFingerprint: requestFingerprint,
                bookingInquiryCompatibility: {
                  idempotencyKey: input.idempotencyKey,
                  requestFingerprint,
                  channelId: input.channelId,
                  productId: input.productId,
                  departureId: input.departureId,
                  contactFirstName: input.contact.firstName,
                  contactLastName: input.contact.lastName,
                  contactEmail: input.contact.email,
                  contactPhone: input.contact.phone,
                  locale: input.locale,
                  message: input.message,
                  status: "open",
                } satisfies BookingInquiryCompatibilitySnapshot,
                ...(unresolved.length ? { unresolvedTargets: unresolved } : {}),
              },
            },
            targets: resolvedTargets,
          },
          {
            actorId: `storefront:${input.channelId}`,
            channelId: input.channelId,
            targetValidation: {
              async validateTarget(database, kind, targetId) {
                const match = authorities.filter((authority) => authority.kind === kind)
                const authority = match[0]
                if (match.length !== 1 || !authority) return "unavailable"
                return (await authority.targetExists(database, targetId)) ? "valid" : "not_found"
              },
            },
          },
        )
        const storedFingerprint =
          result.inquiry.customFields.relationships?.compatibilityRequestFingerprint
        return {
          status:
            result.replayed && storedFingerprint !== requestFingerprint
              ? "conflict"
              : result.replayed
                ? "replayed"
                : "created",
          inquiry: {
            id: result.inquiry.id,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint,
            channelId: input.channelId,
            productId: input.productId,
            departureId: input.departureId,
            contactFirstName: input.contact.firstName,
            contactLastName: input.contact.lastName,
            contactEmail: input.contact.email,
            contactPhone: input.contact.phone,
            locale: input.locale,
            message: input.message,
            status: "open",
            createdAt: result.inquiry.createdAt,
            updatedAt: result.inquiry.updatedAt,
          },
        }
      },
      async getById(db, id) {
        const rows = await listCanonicalBookingInquiryCompatibility(db)
        return rows.find((row) => row.canonicalId === id || row.receipt.id === id)?.receipt ?? null
      },
      async list(db) {
        return (await listCanonicalBookingInquiryCompatibility(db)).map((row) => row.receipt)
      },
    } satisfies BookingsCanonicalInquiryIntakeRuntime,
    /**
     * Where an instrument a payment provider stored becomes a row on the
     * person who paid. Finance owns the payment and knows the instrument; it
     * does not know what a person is, so this is the seam it hands the fact
     * across.
     */
    [financeStoredInstrumentRuntimePort.id]: {
      async recordStoredInstrument(db, instrument) {
        const { personId, ...rest } = instrument
        await relationshipsService.recordProjectedPersonPaymentMethod(db, personId, rest)
      },
    } satisfies FinanceStoredInstrumentRuntime,
  }
}
