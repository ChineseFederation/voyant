import type { InquiryTargetAuthorityRuntime } from "@voyant-travel/relationships-contracts/inquiry-target-authority/runtime-port"
import type {
  PublicApiIntakeContext,
  PublicApiIntakePersistence,
} from "@voyant-travel/relationships-contracts/public-api-intake"
import { and, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { resolveIntakeTargets } from "./inquiry-intake-targets.js"
import { customerSignals } from "./schema.js"
import { relationshipsService } from "./service/index.js"

function requirePublicApiDb(context: PublicApiIntakeContext): PostgresJsDatabase {
  if (!context.db) {
    throw new Error("Storefront intake requires a request database")
  }
  return context.db as PostgresJsDatabase
}

/** Standard graph adapter from Storefront intake to the selected Relationships package. */
export function createPublicApiIntakePersistence(
  resolveAuthorities: () => Promise<readonly InquiryTargetAuthorityRuntime[]> = async () => [],
): PublicApiIntakePersistence {
  return {
    async createInquiry({ context, data }) {
      const db = requirePublicApiDb(context)
      if (!context.channelId || context.channelStatus !== "active") {
        throw new Error("Active channel context is required")
      }
      const authorities = await resolveAuthorities()
      const { targets, unresolved } = await resolveIntakeTargets(db, authorities, [
        ...(data.productId ? [{ kind: "product" as const, targetId: data.productId }] : []),
        // Legacy leads name this field for the option unit; it has always carried
        // the departure-equivalent the customer picked.
        ...(data.optionUnitId ? [{ kind: "departure" as const, targetId: data.optionUnitId }] : []),
      ])
      const result = await relationshipsService.createPublicInquiry(
        db,
        {
          subject: targets[0]?.snapshot.title ?? data.message ?? "General inquiry",
          kind: data.productId ? "product" : "general",
          sourceRef: data.sourceRef,
          contactSnapshot: data.contact,
          customerMessage: data.message,
          sourceUrl: data.sourceUrl,
          locale: data.locale,
          tags: data.tags,
          customFields: {
            relationships: {
              compatibilityPayload: data.payload,
              ...(unresolved.length ? { unresolvedTargets: unresolved } : {}),
            },
          },
          consentSnapshot: data.consent,
          targets,
        },
        {
          actorId: `storefront:${context.channelId}`,
          channelId: context.channelId,
          targetValidation: {
            async validateTarget(database, kind, targetId) {
              const matches = authorities.filter((authority) => authority.kind === kind)
              const authority = matches[0]
              if (matches.length !== 1 || !authority) return "unavailable"
              return (await authority.targetExists(database, targetId)) ? "valid" : "not_found"
            },
          },
        },
      )
      return {
        id: result.inquiry.id,
        personId: result.inquiry.personId,
        duplicate: result.replayed,
        createdAt: result.inquiry.createdAt,
      }
    },
    async findSignal({ context, kind, sourceSubmissionId }) {
      const db = requirePublicApiDb(context)
      const [row] = await db
        .select()
        .from(customerSignals)
        .where(
          and(
            eq(customerSignals.kind, kind),
            eq(customerSignals.sourceSubmissionId, sourceSubmissionId),
          ),
        )
        .limit(1)
      return row ?? null
    },
    createPerson({ context, data }) {
      return relationshipsService.createPerson(requirePublicApiDb(context), data)
    },
    createCustomerSignal({ context, data }) {
      return relationshipsService.createCustomerSignal(requirePublicApiDb(context), data)
    },
    updateCustomerSignal({ context, id, data }) {
      return relationshipsService.updateCustomerSignal(requirePublicApiDb(context), id, data)
    },
    deleteCustomerSignal({ context, id }) {
      return relationshipsService.deleteCustomerSignal(requirePublicApiDb(context), id)
    },
    deletePerson({ context, id }) {
      return relationshipsService.deletePerson(requirePublicApiDb(context), id)
    },
  }
}
