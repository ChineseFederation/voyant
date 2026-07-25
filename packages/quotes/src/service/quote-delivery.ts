import {
  type ActionLedgerRequestContextValues,
  type AdmittedExistingTargetCommand,
  type ExistingTargetCommandPayload,
  executeAdmittedExistingTargetCommand,
} from "@voyant-travel/action-ledger"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import type { ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import { and, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { z } from "zod"

import { buildQuoteVersionProposalUrl } from "../proposal-routes.js"
import type {
  QuoteProposalNotificationDelivery,
  QuotesNotificationsRuntime,
} from "../runtime-port.js"
import type { QuoteVersion } from "../schema.js"
import { quoteProposalDeliveryRequests, quotes } from "../schema.js"
import { QuoteVersionConflictError, quoteVersionsService } from "./quote-versions.js"

export const snapshotAndSendQuoteInputSchema = z.object({
  quoteId: z.string().min(1),
  to: z.string().trim().min(1),
  templateSlug: z.string().trim().min(1),
  channel: z.enum(["email", "sms"]).default("email"),
  validUntil: z.string().date().nullable().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
})

export type SnapshotAndSendQuoteInput = z.infer<typeof snapshotAndSendQuoteInputSchema>

export interface SnapshotAndSendQuoteResult extends Record<string, unknown> {
  quoteVersion: QuoteVersion
  proposalUrl: string
  delivery: QuoteProposalNotificationDelivery
}

export interface ExecuteSnapshotAndSendQuoteCommandInput {
  db: AnyDrizzleDb
  context: ActionLedgerRequestContextValues
  admitted: ToolHandlerActionPolicyContext
  notifications: QuotesNotificationsRuntime
  input: SnapshotAndSendQuoteInput
  publicProposalBaseUrl?: string | null
}

/**
 * Admit one quote delivery command and atomically persist the quote snapshot,
 * sent lifecycle state, durable Notifications enqueue, exact provider
 * identity, immutable command, and replay result. Provider code is worker-only.
 */
export async function executeSnapshotAndSendQuoteCommand(
  input: ExecuteSnapshotAndSendQuoteCommandInput,
) {
  return executeAdmittedExistingTargetCommand(
    {
      db: input.db,
      context: input.context,
      admitted: input.admitted,
      commandInput: input.input,
      evaluatedRisk: "high",
    },
    {
      prepare: (tx, command, payload) =>
        prepareSnapshotAndSendQuote(
          tx,
          input.notifications,
          command,
          payload,
          input.publicProposalBaseUrl,
        ),
      execute: (command) => resolveSnapshotAndSendQuoteResult(input.db, command),
      replay: (command) => resolveSnapshotAndSendQuoteResult(input.db, command),
    },
  )
}

async function prepareSnapshotAndSendQuote(
  tx: AnyDrizzleDb,
  notifications: QuotesNotificationsRuntime,
  command: AdmittedExistingTargetCommand,
  input: ExistingTargetCommandPayload<SnapshotAndSendQuoteInput>,
  publicProposalBaseUrl: string | null | undefined,
): Promise<void> {
  const [quote] = await tx
    .select({ id: quotes.id })
    .from(quotes)
    .where(eq(quotes.id, command.target.id))
    .for("update")
    .limit(1)
  if (!quote || command.target.type !== "quote" || input.quoteId !== quote.id) {
    throw new QuoteVersionConflictError(`Quote ${command.target.id} was not found`)
  }

  const quoteDb = tx as PostgresJsDatabase
  const quoteVersion = await quoteVersionsService.createVersionSnapshotFromQuote(quoteDb, quote.id)
  if (!quoteVersion) throw new QuoteVersionConflictError(`Quote ${quote.id} was not found`)
  const proposalUrl = buildQuoteVersionProposalUrl(quoteVersion.id, {
    baseUrl: publicProposalBaseUrl,
  })
  const delivery = await notifications.enqueueQuoteProposal(tx, {
    idempotencyKey: `quotes:snapshot-send:${command.causation.claimActionId}`,
    templateSlug: input.templateSlug,
    to: input.to,
    channel: input.channel,
    quoteId: quote.id,
    quoteVersionId: quoteVersion.id,
    data: {
      ...input.data,
      quoteId: quote.id,
      quoteVersionId: quoteVersion.id,
      proposalUrl,
    },
  })
  if (delivery.status === "failed" || delivery.status === "cancelled") {
    throw new QuoteVersionConflictError(
      `Notifications rejected quote delivery with status ${delivery.status}`,
    )
  }

  const sent = await quoteVersionsService.sendQuoteVersion(quoteDb, quoteVersion.id, {
    validUntil: input.validUntil,
  })
  if (!sent) throw new QuoteVersionConflictError("Prepared Quote Version was not found")
  const result: SnapshotAndSendQuoteResult = {
    quoteVersion: sent,
    proposalUrl,
    delivery,
  }
  await tx.insert(quoteProposalDeliveryRequests).values({
    id: command.causation.claimActionId,
    commandScope: command.idempotency.scope,
    commandIdempotencyKey: command.idempotency.key,
    requestFingerprint: command.idempotency.fingerprint,
    claimActionId: command.causation.claimActionId,
    organizationId: command.authorization.organizationId,
    targetType: command.target.type,
    targetId: command.target.id,
    quoteId: quote.id,
    quoteVersionId: sent.id,
    proposalUrl,
    provider: delivery.provider,
    resultSnapshot: result,
    completedAt: new Date(),
  })
}

async function resolveSnapshotAndSendQuoteResult(
  db: AnyDrizzleDb,
  command: AdmittedExistingTargetCommand,
): Promise<SnapshotAndSendQuoteResult> {
  const [operation] = await db
    .select()
    .from(quoteProposalDeliveryRequests)
    .where(
      and(
        eq(quoteProposalDeliveryRequests.commandScope, command.idempotency.scope),
        eq(quoteProposalDeliveryRequests.commandIdempotencyKey, command.idempotency.key),
      ),
    )
    .limit(1)
  if (
    !operation ||
    operation.requestFingerprint !== command.idempotency.fingerprint ||
    operation.claimActionId !== command.causation.claimActionId ||
    operation.organizationId !== command.authorization.organizationId ||
    operation.targetType !== command.target.type ||
    operation.targetId !== command.target.id ||
    operation.quoteId !== command.target.id
  ) {
    throw new QuoteVersionConflictError(
      "Durable quote delivery command state is missing or inconsistent",
    )
  }
  return operation.resultSnapshot as SnapshotAndSendQuoteResult
}
