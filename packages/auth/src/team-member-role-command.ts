import {
  type ActionLedgerRequestContextValues,
  executeAdmittedExistingTargetCommand,
} from "@voyant-travel/action-ledger"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import {
  deriveCommandIdempotencyKey,
  type ToolHandlerActionPolicyContext,
  withServerResolvedIdempotencyKey,
} from "@voyant-travel/tools"
import type { TeamInvitationDto, TeamMemberDto } from "./team-management-runtime-port.js"

/**
 * Admit one exact desired-role command before crossing the local/cloud adapter boundary.
 * Both adapters implement role assignment as an idempotent setter, so a replay after an
 * ambiguous timeout safely converges on the same role instead of inventing another effect.
 */
export async function executeUpdateTeamMemberRoleCommand(input: {
  db: AnyDrizzleDb
  context: ActionLedgerRequestContextValues
  admitted: ToolHandlerActionPolicyContext
  memberId: string
  roleId: string
  update(): Promise<TeamMemberDto>
}) {
  const commandInput = { memberId: input.memberId, roleId: input.roleId }
  const resolvedAdmitted = withServerResolvedIdempotencyKey(
    input.admitted,
    await deriveCommandIdempotencyKey("update-team-member-role", commandInput),
  )
  const result = await executeAdmittedExistingTargetCommand(
    {
      db: input.db,
      context: input.context,
      admitted: resolvedAdmitted,
      commandInput,
      evaluatedRisk: "high",
    },
    {
      prepare: () => Promise.resolve(),
      execute: input.update,
      replay: input.update,
    },
  )
  return result.value
}

/** Admit one exact desired access state before crossing the local/cloud adapter boundary. */
export async function executeSetTeamMemberAccessCommand(input: {
  db: AnyDrizzleDb
  context: ActionLedgerRequestContextValues
  admitted: ToolHandlerActionPolicyContext
  memberId: string
  access: "active" | "deactivated"
  update(): Promise<TeamMemberDto>
}) {
  const commandInput = { memberId: input.memberId, access: input.access }
  const resolvedAdmitted = withServerResolvedIdempotencyKey(
    input.admitted,
    await deriveCommandIdempotencyKey("set-team-member-access", commandInput),
  )
  const result = await executeAdmittedExistingTargetCommand(
    {
      db: input.db,
      context: input.context,
      admitted: resolvedAdmitted,
      commandInput,
      evaluatedRisk: "high",
    },
    {
      prepare: () => Promise.resolve(),
      execute: input.update,
      replay: input.update,
    },
  )
  return result.value
}

/** Revoke an invitation, reconciling an ambiguous DELETE before redispatch. */
export async function executeRevokeTeamInvitationCommand(input: {
  db: AnyDrizzleDb
  context: ActionLedgerRequestContextValues
  admitted: ToolHandlerActionPolicyContext
  invitationId: string
  list(): Promise<TeamInvitationDto[]>
  revoke(): Promise<void>
}) {
  const commandInput = { invitationId: input.invitationId }
  const resolvedAdmitted = withServerResolvedIdempotencyKey(
    input.admitted,
    await deriveCommandIdempotencyKey("revoke-team-invitation", commandInput),
  )
  await executeAdmittedExistingTargetCommand(
    {
      db: input.db,
      context: input.context,
      admitted: resolvedAdmitted,
      commandInput,
      evaluatedRisk: "high",
    },
    {
      prepare: () => Promise.resolve(),
      execute: input.revoke,
      async replay() {
        const stillPresent = (await input.list()).some(({ id }) => id === input.invitationId)
        if (stillPresent) await input.revoke()
      },
    },
  )
}
