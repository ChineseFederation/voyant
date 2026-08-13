import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { VoyantPort } from "@voyant-travel/core/project"
import {
  type CustomFieldValueLifecycleRuntime,
  type CustomFieldValueOperationsRuntime,
  customFieldValueLifecycleRuntimePort,
  customFieldValueOperationsRuntimePort,
} from "@voyant-travel/core/runtime-port"
import {
  type FinanceProposalsPaymentPolicyRuntime,
  financeProposalsPaymentPolicyRuntimePort,
} from "@voyant-travel/finance/runtime-port"
import { checkoutInquiryRuntimePort } from "@voyant-travel/proposals-contracts/checkout-inquiry"
import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { createCheckoutInquiryRuntime } from "./checkout-inquiry-runtime.js"
import { createProposalsRuntime } from "./runtime.js"
import {
  type ProposalsPresentationRuntime,
  type ProposalsRuntime,
  type ProposalsSnapshotRuntime,
  proposalsPresentationRuntimePort,
  proposalsRuntimePort,
  proposalsSnapshotRuntimePort,
} from "./runtime-port.js"
import { proposalsService } from "./service/index.js"

export interface ProposalsRuntimeContributorHost {
  primitives: VoyantRuntimeHostPrimitives
  getRuntimePort<T>(port: Pick<VoyantPort<T>, "id">): T | Promise<T>
}

const proposalCustomFieldValues: CustomFieldValueLifecycleRuntime = {
  supports: (entityType) => entityType === "proposal",
  async renameDefinitionKey(db, definition, nextKey) {
    const database = db as PostgresJsDatabase
    await database.execute(
      sql`UPDATE proposals
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
      sql`UPDATE proposals
          SET custom_fields = custom_fields #- ARRAY[${definition.namespace}, ${definition.key}]::text[],
              updated_at = now()
          WHERE custom_fields -> ${definition.namespace} ? ${definition.key}`,
    )
  },
}

const proposalCustomFieldValueOperations: CustomFieldValueOperationsRuntime = {
  supports: (entityType) => entityType === "proposal",
  async list(db, _owner, input) {
    const database = db as PostgresJsDatabase
    const rows = input.entityId
      ? await database.execute(
          sql`SELECT id, custom_fields FROM proposals WHERE id = ${input.entityId}`,
        )
      : await database.execute(
          sql`SELECT id, custom_fields FROM proposals WHERE custom_fields <> '{}'::jsonb ORDER BY updated_at DESC`,
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
        sql`UPDATE proposals
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
        sql`UPDATE proposals
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

/** Contribute standard Node Proposals adapters selected by the framework BOM. */
export function createProposalsRuntimePortContribution(
  host: ProposalsRuntimeContributorHost,
): Readonly<Record<string, unknown>> {
  const checkoutInquiry = createCheckoutInquiryRuntime()
  const runtime = Promise.resolve(createProposalsRuntime(host))
  return {
    [checkoutInquiryRuntimePort.id]: checkoutInquiry,
    [proposalsRuntimePort.id]: runtime.then((value) => value.proposals),
    [proposalsPresentationRuntimePort.id]: runtime.then((value) => value.proposal),
    [proposalsSnapshotRuntimePort.id]: runtime.then((value) => value.snapshot),
    [financeProposalsPaymentPolicyRuntimePort.id]: {
      resolveProposalVersionPolicy: (db, proposalVersionId) =>
        proposalsService.getProposalVersionPaymentTerms(db, proposalVersionId),
    } satisfies FinanceProposalsPaymentPolicyRuntime,
    [customFieldValueLifecycleRuntimePort.id]: proposalCustomFieldValues,
    [customFieldValueOperationsRuntimePort.id]: proposalCustomFieldValueOperations,
  }
}

export interface ProposalsRuntimeContribution {
  proposals: ProposalsRuntime
  proposal: ProposalsPresentationRuntime
  snapshot: ProposalsSnapshotRuntime
}
