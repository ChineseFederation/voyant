import type { HandlerActionPolicyExpectation } from "@voyant-travel/tools"

const OWNER = "@voyant-travel/legal"
export const LEGAL_CONTRACT_LIFECYCLE_APPROVAL_POLICY = "legal.contract-lifecycle.v1"

export const LEGAL_CONTRACT_LIFECYCLE_POLICIES = {
  issue: lifecyclePolicy("issue", "high"),
  send: lifecyclePolicy("send", "high"),
  void: lifecyclePolicy("void", "critical"),
  execute: lifecyclePolicy("execute", "critical"),
} as const

function lifecyclePolicy(
  transition: "issue" | "send" | "void" | "execute",
  risk: "high" | "critical",
) {
  const actionName = `${OWNER}#action.${transition}-contract` as const
  const toolCapabilityId = `${OWNER}#tool.${transition}-contract` as const
  return {
    actionName,
    actionVersion: "v1",
    toolName: `${transition}_legal_contract`,
    toolCapabilityId,
    canonicalTargetType: "legal-contract",
    commandTargetField: "contractId",
    evaluatedRisk: risk,
    approvalPolicyName: LEGAL_CONTRACT_LIFECYCLE_APPROVAL_POLICY,
  } as const
}

export function legalContractLifecycleHandlerExpectation(
  policy: (typeof LEGAL_CONTRACT_LIFECYCLE_POLICIES)[keyof typeof LEGAL_CONTRACT_LIFECYCLE_POLICIES],
): HandlerActionPolicyExpectation {
  return {
    capabilityId: policy.toolCapabilityId,
    capabilityVersion: policy.actionVersion,
    canonicalName: policy.toolName,
    actionPolicy: {
      id: policy.actionName,
      capabilityId: policy.actionName,
      version: policy.actionVersion,
      kind: "execute",
      targetType: policy.canonicalTargetType,
      commandTargetField: policy.commandTargetField,
      targetLifecycle: "existing",
      existingTarget: { durability: "handler-command-result-v1" },
      risk: policy.evaluatedRisk,
      ledger: "required",
      approval: "required",
      policy: policy.approvalPolicyName,
      reversible: false,
      allowedActorTypes: ["staff"],
    },
  }
}

export const LEGAL_CONTRACT_LIFECYCLE_HANDLER_EXPECTATIONS = {
  issue: legalContractLifecycleHandlerExpectation(LEGAL_CONTRACT_LIFECYCLE_POLICIES.issue),
  send: legalContractLifecycleHandlerExpectation(LEGAL_CONTRACT_LIFECYCLE_POLICIES.send),
  void: legalContractLifecycleHandlerExpectation(LEGAL_CONTRACT_LIFECYCLE_POLICIES.void),
  execute: legalContractLifecycleHandlerExpectation(LEGAL_CONTRACT_LIFECYCLE_POLICIES.execute),
} as const
