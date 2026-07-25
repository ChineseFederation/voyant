import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import {
  type CustomFieldValueLifecycleRuntime,
  type CustomFieldValueOperationsRuntime,
  customFieldValueLifecycleRuntimePort,
  customFieldValueOperationsRuntimePort,
} from "@voyant-travel/core/runtime-port"
import { checkoutInquiryRuntimePort } from "@voyant-travel/quotes-contracts/checkout-inquiry"
import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { createCheckoutInquiryRuntime } from "./checkout-inquiry-runtime.js"
import { createQuotesRuntime } from "./runtime.js"
import {
  type QuotesProposalRuntime,
  type QuotesRuntime,
  type QuotesSnapshotRuntime,
  quotesProposalRuntimePort,
  quotesRuntimePort,
  quotesSnapshotRuntimePort,
} from "./runtime-port.js"

export interface QuotesRuntimeContributorHost {
  primitives: VoyantRuntimeHostPrimitives
}

const quoteCustomFieldValues: CustomFieldValueLifecycleRuntime = {
  supports: (entityType) => entityType === "quote",
  async renameDefinitionKey(db, definition, nextKey) {
    const database = db as PostgresJsDatabase
    await database.execute(
      sql`UPDATE quotes
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
    const database = db as PostgresJsDatabase
    await database.execute(
      sql`UPDATE quotes
          SET custom_fields = custom_fields #- ARRAY[${definition.namespace}, ${definition.key}]::text[],
              updated_at = now()
          WHERE custom_fields -> ${definition.namespace} ? ${definition.key}`,
    )
  },
}

const quoteCustomFieldValueOperations: CustomFieldValueOperationsRuntime = {
  supports: (entityType) => entityType === "quote",
  async list(db, _owner, input) {
    const database = db as PostgresJsDatabase
    const rows = input.entityId
      ? await database.execute(
          sql`SELECT id, custom_fields FROM quotes WHERE id = ${input.entityId}`,
        )
      : await database.execute(
          sql`SELECT id, custom_fields FROM quotes WHERE custom_fields <> '{}'::jsonb ORDER BY updated_at DESC`,
        )
    return Array.from(rows, (row) => ({
      entityId: String(row.id),
      customFields: (row.custom_fields as Record<string, unknown> | null) ?? {},
    }))
  },
  async upsert(db, _owner, input) {
    const database = db as PostgresJsDatabase
    const updated = Array.from(
      await database.execute(
        sql`UPDATE quotes
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
    const database = db as PostgresJsDatabase
    const deleted = Array.from(
      await database.execute(
        sql`UPDATE quotes
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

/** Contribute standard Node Quotes adapters selected by the framework BOM. */
export function createQuotesRuntimePortContribution(
  host: QuotesRuntimeContributorHost,
): Readonly<Record<string, unknown>> {
  const checkoutInquiry = createCheckoutInquiryRuntime()
  const runtime = Promise.resolve(createQuotesRuntime(host))
  return {
    [checkoutInquiryRuntimePort.id]: checkoutInquiry,
    [quotesRuntimePort.id]: runtime.then((value) => value.quotes),
    [quotesProposalRuntimePort.id]: runtime.then((value) => value.proposal),
    [quotesSnapshotRuntimePort.id]: runtime.then((value) => value.snapshot),
    [customFieldValueLifecycleRuntimePort.id]: quoteCustomFieldValues,
    [customFieldValueOperationsRuntimePort.id]: quoteCustomFieldValueOperations,
  }
}

export interface QuotesRuntimeContribution {
  quotes: QuotesRuntime
  proposal: QuotesProposalRuntime
  snapshot: QuotesSnapshotRuntime
}
