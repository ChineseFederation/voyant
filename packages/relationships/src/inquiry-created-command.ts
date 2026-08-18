import {
  type ActionLedgerRequestContextValues,
  executeAdmittedCreatedTargetCommand,
} from "@voyant-travel/action-ledger"
import type { CreateInquiryInput } from "@voyant-travel/relationships-contracts"
import type { ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { InquiryFirstResponseSlaPolicy } from "./inquiry-sla-policy.js"

import { RELATIONSHIPS_INQUIRY_CREATED_TARGET_POLICY as POLICY } from "./created-target-policy.js"
import { relationshipsService } from "./service/index.js"

export interface InquiryCreateCommandInput {
  inquiry: Omit<CreateInquiryInput, "source" | "sourceRef">
  actorId: string
}

export async function executeInquiryCreateCommand(input: {
  db: PostgresJsDatabase
  context: ActionLedgerRequestContextValues
  commandInput: InquiryCreateCommandInput
  admitted: ToolHandlerActionPolicyContext
  idempotencyKey: string
  slaPolicy?: InquiryFirstResponseSlaPolicy
}) {
  return executeAdmittedCreatedTargetCommand(
    {
      db: input.db,
      context: input.context,
      admitted: input.admitted,
      idempotencyKey: input.idempotencyKey,
      commandTargetType: POLICY.commandTargetType,
      canonicalTargetType: POLICY.canonicalTargetType,
      resultReferenceType: POLICY.resultReferenceType,
      commandInput: input.commandInput,
      evaluatedRisk: POLICY.evaluatedRisk,
    },
    {
      async create(tx) {
        const result = await relationshipsService.createInquiry(
          tx as PostgresJsDatabase,
          {
            ...input.commandInput.inquiry,
            source: "admin",
            sourceRef: `tool:${input.idempotencyKey}`,
          },
          input.commandInput.actorId,
          { slaPolicy: input.slaPolicy },
        )
        return {
          value: { id: result.inquiry.id },
          targetId: result.inquiry.id,
        }
      },
      async replay(_tx, result) {
        return { id: result.reference.id }
      },
    },
  )
}
