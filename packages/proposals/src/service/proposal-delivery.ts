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

import { buildProposalVersionProposalUrl } from "../proposal-routes.js"
import type {
  ProposalNotificationDelivery,
  ProposalsNotificationsRuntime,
} from "../runtime-port.js"
import type { ProposalVersion } from "../schema.js"
import { proposalDeliveryRequests, proposals } from "../schema.js"
import { ProposalVersionConflictError, proposalVersionsService } from "./proposal-versions.js"

export const snapshotAndSendProposalInputSchema = z.object({
  proposalId: z.string().min(1),
  to: z.string().trim().min(1),
  templateSlug: z.string().trim().min(1),
  channel: z.enum(["email", "sms"]).default("email"),
  validUntil: z.string().date().nullable().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
})

export type SnapshotAndSendProposalInput = z.infer<typeof snapshotAndSendProposalInputSchema>

export interface SnapshotAndSendProposalResult extends Record<string, unknown> {
  proposalVersion: ProposalVersion
  proposalUrl: string
  delivery: ProposalNotificationDelivery
}

export interface ExecuteSnapshotAndSendProposalCommandInput {
  db: AnyDrizzleDb
  context: ActionLedgerRequestContextValues
  admitted: ToolHandlerActionPolicyContext
  notifications: ProposalsNotificationsRuntime
  input: SnapshotAndSendProposalInput
  publicProposalBaseUrl?: string | null
}

/**
 * Admit one proposal delivery command and atomically persist the proposal snapshot,
 * sent lifecycle state, durable Notifications enqueue, exact provider
 * identity, immutable command, and replay result. Provider code is worker-only.
 */
export async function executeSnapshotAndSendProposalCommand(
  input: ExecuteSnapshotAndSendProposalCommandInput,
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
        prepareSnapshotAndSendProposal(
          tx,
          input.notifications,
          command,
          payload,
          input.publicProposalBaseUrl,
        ),
      execute: (command) => resolveSnapshotAndSendProposalResult(input.db, command),
      replay: (command) => resolveSnapshotAndSendProposalResult(input.db, command),
    },
  )
}

async function prepareSnapshotAndSendProposal(
  tx: AnyDrizzleDb,
  notifications: ProposalsNotificationsRuntime,
  command: AdmittedExistingTargetCommand,
  input: ExistingTargetCommandPayload<SnapshotAndSendProposalInput>,
  publicProposalBaseUrl: string | null | undefined,
): Promise<void> {
  const [proposal] = await tx
    .select({ id: proposals.id })
    .from(proposals)
    .where(eq(proposals.id, command.target.id))
    .for("update")
    .limit(1)
  if (!proposal || command.target.type !== "proposal" || input.proposalId !== proposal.id) {
    throw new ProposalVersionConflictError(`Proposal ${command.target.id} was not found`)
  }

  const proposalDb = tx as PostgresJsDatabase
  const proposalVersion = await proposalVersionsService.createVersionSnapshotFromProposal(
    proposalDb,
    proposal.id,
  )
  if (!proposalVersion)
    throw new ProposalVersionConflictError(`Proposal ${proposal.id} was not found`)
  const proposalUrl = buildProposalVersionProposalUrl(proposalVersion.id, {
    baseUrl: publicProposalBaseUrl,
  })
  const delivery = await notifications.enqueueProposalNotification(tx, {
    idempotencyKey: `proposals:snapshot-send:${command.causation.claimActionId}`,
    templateSlug: input.templateSlug,
    to: input.to,
    channel: input.channel,
    proposalId: proposal.id,
    proposalVersionId: proposalVersion.id,
    data: {
      ...input.data,
      proposalId: proposal.id,
      proposalVersionId: proposalVersion.id,
      proposalUrl,
    },
  })
  if (delivery.status === "failed" || delivery.status === "cancelled") {
    throw new ProposalVersionConflictError(
      `Notifications rejected proposal delivery with status ${delivery.status}`,
    )
  }

  const sent = await proposalVersionsService.sendProposalVersion(proposalDb, proposalVersion.id, {
    validUntil: input.validUntil,
  })
  if (!sent) throw new ProposalVersionConflictError("Prepared Proposal Version was not found")
  const result: SnapshotAndSendProposalResult = {
    proposalVersion: sent,
    proposalUrl,
    delivery,
  }
  await tx.insert(proposalDeliveryRequests).values({
    id: command.causation.claimActionId,
    commandScope: command.idempotency.scope,
    commandIdempotencyKey: command.idempotency.key,
    requestFingerprint: command.idempotency.fingerprint,
    claimActionId: command.causation.claimActionId,
    organizationId: command.authorization.organizationId,
    targetType: command.target.type,
    targetId: command.target.id,
    proposalId: proposal.id,
    proposalVersionId: sent.id,
    proposalUrl,
    provider: delivery.provider,
    resultSnapshot: result,
    completedAt: new Date(),
  })
}

async function resolveSnapshotAndSendProposalResult(
  db: AnyDrizzleDb,
  command: AdmittedExistingTargetCommand,
): Promise<SnapshotAndSendProposalResult> {
  const [operation] = await db
    .select()
    .from(proposalDeliveryRequests)
    .where(
      and(
        eq(proposalDeliveryRequests.commandScope, command.idempotency.scope),
        eq(proposalDeliveryRequests.commandIdempotencyKey, command.idempotency.key),
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
    operation.proposalId !== command.target.id
  ) {
    throw new ProposalVersionConflictError(
      "Durable proposal delivery command state is missing or inconsistent",
    )
  }
  return operation.resultSnapshot as SnapshotAndSendProposalResult
}
