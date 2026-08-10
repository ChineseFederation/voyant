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

import type { TeamMemberDto } from "./team-management-runtime-port.js"

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
