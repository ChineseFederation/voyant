import {
  type BuildCreatedTargetCommandFingerprintInput,
  buildCreatedTargetCommandFingerprint,
} from "@voyant-travel/action-ledger"
import type { HandlerActionPolicyExpectation } from "@voyant-travel/tools"

export const LEGAL_CONTRACT_DRAFT_CREATED_TARGET_POLICY = {
  actionName: "@voyant-travel/legal#action.create-contract-draft",
  actionVersion: "v1",
  toolName: "create_legal_contract_draft",
  toolCapabilityId: "@voyant-travel/legal#tool.create-contract-draft",
  capabilityId: "@voyant-travel/legal#action.create-contract-draft",
  capabilityVersion: "v1",
  commandTargetType: "legal_contract_draft_create_command",
  canonicalTargetType: "legal-contract",
  resultReferenceType: "legal-contract",
  evaluatedRisk: "high",
  approvalPolicy: "none",
  approvalReasonCode: null,
} as const

export const LEGAL_CONTRACT_DRAFT_HANDLER_EXPECTATION = {
  capabilityId: LEGAL_CONTRACT_DRAFT_CREATED_TARGET_POLICY.toolCapabilityId,
  capabilityVersion: LEGAL_CONTRACT_DRAFT_CREATED_TARGET_POLICY.capabilityVersion,
  canonicalName: LEGAL_CONTRACT_DRAFT_CREATED_TARGET_POLICY.toolName,
  actionPolicy: {
    id: LEGAL_CONTRACT_DRAFT_CREATED_TARGET_POLICY.actionName,
    capabilityId: LEGAL_CONTRACT_DRAFT_CREATED_TARGET_POLICY.capabilityId,
    version: LEGAL_CONTRACT_DRAFT_CREATED_TARGET_POLICY.actionVersion,
    kind: "execute",
    targetType: LEGAL_CONTRACT_DRAFT_CREATED_TARGET_POLICY.canonicalTargetType,
    targetLifecycle: "created",
    createdTarget: {
      commandTargetType: LEGAL_CONTRACT_DRAFT_CREATED_TARGET_POLICY.commandTargetType,
      resultReferenceType: LEGAL_CONTRACT_DRAFT_CREATED_TARGET_POLICY.resultReferenceType,
      durability: "handler-command-claim-v1",
    },
    risk: LEGAL_CONTRACT_DRAFT_CREATED_TARGET_POLICY.evaluatedRisk,
    ledger: "required",
    approval: "never",
    reversible: false,
    allowedActorTypes: ["staff"],
  },
} as const satisfies HandlerActionPolicyExpectation

export const LEGAL_CONTRACT_TEMPLATE_CREATED_TARGET_POLICY = {
  actionName: "@voyant-travel/legal#action.create-contract-template",
  actionVersion: "v1",
  toolName: "create_contract_template",
  toolCapabilityId: "@voyant-travel/legal#tool.create-contract-template",
  capabilityId: "@voyant-travel/legal#action.create-contract-template",
  capabilityVersion: "v1",
  commandTargetType: "legal_contract_template_create_command",
  canonicalTargetType: "contract-template",
  resultReferenceType: "contract-template",
  evaluatedRisk: "high",
} as const

export const LEGAL_CONTRACT_TEMPLATE_HANDLER_EXPECTATION = {
  capabilityId: LEGAL_CONTRACT_TEMPLATE_CREATED_TARGET_POLICY.toolCapabilityId,
  capabilityVersion: LEGAL_CONTRACT_TEMPLATE_CREATED_TARGET_POLICY.capabilityVersion,
  canonicalName: LEGAL_CONTRACT_TEMPLATE_CREATED_TARGET_POLICY.toolName,
  actionPolicy: {
    id: LEGAL_CONTRACT_TEMPLATE_CREATED_TARGET_POLICY.actionName,
    capabilityId: LEGAL_CONTRACT_TEMPLATE_CREATED_TARGET_POLICY.capabilityId,
    version: LEGAL_CONTRACT_TEMPLATE_CREATED_TARGET_POLICY.actionVersion,
    kind: "execute",
    targetType: LEGAL_CONTRACT_TEMPLATE_CREATED_TARGET_POLICY.canonicalTargetType,
    targetLifecycle: "created",
    createdTarget: {
      commandTargetType: LEGAL_CONTRACT_TEMPLATE_CREATED_TARGET_POLICY.commandTargetType,
      resultReferenceType: LEGAL_CONTRACT_TEMPLATE_CREATED_TARGET_POLICY.resultReferenceType,
      durability: "handler-command-claim-v1",
    },
    risk: LEGAL_CONTRACT_TEMPLATE_CREATED_TARGET_POLICY.evaluatedRisk,
    ledger: "required",
    approval: "never",
    reversible: false,
    allowedActorTypes: ["staff"],
  },
} as const satisfies HandlerActionPolicyExpectation

export function buildLegalContractDraftFingerprint(
  admittedAction: { capabilityId: string; version: string },
  commandTargetId: string,
  commandInput: unknown,
): Promise<string> {
  const policy = LEGAL_CONTRACT_DRAFT_CREATED_TARGET_POLICY
  const input: BuildCreatedTargetCommandFingerprintInput = {
    actionName: admittedAction.capabilityId,
    actionVersion: admittedAction.version,
    commandTarget: { type: policy.commandTargetType, id: commandTargetId },
    canonicalTargetType: policy.canonicalTargetType,
    resultReferenceType: policy.resultReferenceType,
    commandInput,
    capabilityId: admittedAction.capabilityId,
    capabilityVersion: admittedAction.version,
    evaluatedRisk: policy.evaluatedRisk,
    approvalPolicy: policy.approvalPolicy,
    approvalReasonCode: policy.approvalReasonCode,
  }
  return buildCreatedTargetCommandFingerprint(input)
}
