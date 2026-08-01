import type { HandlerActionPolicyExpectation } from "@voyant-travel/tools"

interface ProposalsCreatedTargetPolicy {
  actionName: string
  actionVersion: "v1"
  toolName: string
  toolCapabilityId: string
  capabilityId: string
  capabilityVersion: "v1"
  commandTargetType: string
  canonicalTargetType: string
  resultReferenceType: string
  evaluatedRisk: "medium"
  approvalPolicy: "none"
  approvalReasonCode: null
}

/**
 * Opening a proposal mints a new target, so it runs as a created-target command
 * rather than a plain write: an exact retry has to return the original proposal
 * instead of a second one. An agent that retries a create without a claim is
 * how duplicate records happen.
 */
export const PROPOSALS_CREATED_TARGET_POLICIES = {
  proposal: {
    actionName: "@voyant-travel/proposals#action.create-proposal",
    actionVersion: "v1",
    toolName: "create_proposal",
    toolCapabilityId: "@voyant-travel/proposals#tool.create-proposal",
    capabilityId: "@voyant-travel/proposals#action.create-proposal",
    capabilityVersion: "v1",
    commandTargetType: "proposal_create_command",
    canonicalTargetType: "proposal",
    resultReferenceType: "proposal",
    evaluatedRisk: "medium",
    approvalPolicy: "none",
    approvalReasonCode: null,
  },
} as const satisfies Record<string, ProposalsCreatedTargetPolicy>

export type { ProposalsCreatedTargetPolicy }

export function proposalsHandlerActionPolicyExpectation(
  policy: ProposalsCreatedTargetPolicy,
): HandlerActionPolicyExpectation {
  return {
    capabilityId: policy.toolCapabilityId,
    capabilityVersion: policy.capabilityVersion,
    canonicalName: policy.toolName,
    actionPolicy: {
      id: policy.actionName,
      capabilityId: policy.capabilityId,
      version: policy.actionVersion,
      kind: "execute",
      targetType: policy.canonicalTargetType,
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: policy.commandTargetType,
        resultReferenceType: policy.resultReferenceType,
        durability: "handler-command-claim-v1",
      },
      risk: policy.evaluatedRisk,
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
    },
  }
}
