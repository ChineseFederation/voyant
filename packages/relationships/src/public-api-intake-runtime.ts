import type {
  PublicApiIntakeContext,
  PublicApiIntakePersistence,
} from "@voyant-travel/relationships-contracts/public-api-intake"
import { and, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { customerSignals } from "./schema.js"
import { relationshipsService } from "./service/index.js"

function requirePublicApiDb(context: PublicApiIntakeContext): PostgresJsDatabase {
  if (!context.db) {
    throw new Error("Storefront intake requires a request database")
  }
  return context.db as PostgresJsDatabase
}

/** Standard graph adapter from Storefront intake to the selected Relationships package. */
export function createPublicApiIntakePersistence(): PublicApiIntakePersistence {
  return {
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
