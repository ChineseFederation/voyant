import type { HandlerActionPolicyExpectation } from "@voyant-travel/tools"

const OWNER = "@voyant-travel/legal"
export const LEGAL_CONTRACT_DOCUMENT_APPROVAL_POLICY = "legal.contract-document.v1"
export type LegalContractDocumentPolicyMode = "generate" | "regenerate"

function documentPolicy(mode: LegalContractDocumentPolicyMode, risk: "high" | "critical") {
  const actionName = `${OWNER}#action.${mode}-booking-contract-document` as const
  const toolCapabilityId = `${OWNER}#tool.${mode}-booking-contract-document` as const
  return {
    actionName,
    actionVersion: "v1",
    toolName: `${mode}_booking_contract_document`,
    toolCapabilityId,
    canonicalTargetType: "booking",
    commandTargetField: "bookingId",
    evaluatedRisk: risk,
    approvalPolicyName: LEGAL_CONTRACT_DOCUMENT_APPROVAL_POLICY,
  } as const
}

export const LEGAL_CONTRACT_DOCUMENT_POLICIES = {
  generate: documentPolicy("generate", "high"),
  regenerate: documentPolicy("regenerate", "critical"),
} as const

function handlerExpectation(
  policy: (typeof LEGAL_CONTRACT_DOCUMENT_POLICIES)[keyof typeof LEGAL_CONTRACT_DOCUMENT_POLICIES],
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

export const LEGAL_CONTRACT_DOCUMENT_HANDLER_EXPECTATIONS = {
  generate: handlerExpectation(LEGAL_CONTRACT_DOCUMENT_POLICIES.generate),
  regenerate: handlerExpectation(LEGAL_CONTRACT_DOCUMENT_POLICIES.regenerate),
} as const
