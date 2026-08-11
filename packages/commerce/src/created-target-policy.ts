import {
  type BuildCreatedTargetCommandFingerprintInput,
  buildCreatedTargetCommandFingerprint,
} from "@voyant-travel/action-ledger"
import type { HandlerActionPolicyExpectation } from "@voyant-travel/tools"

interface CommerceCreatedTargetPolicy {
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

export const COMMERCE_CREATED_TARGET_POLICIES = {
  sellabilityPolicy: {
    actionName: "@voyant-travel/commerce#action.create-sellability-policy",
    actionVersion: "v1",
    toolName: "create_sellability_policy",
    toolCapabilityId: "@voyant-travel/commerce#tool.create-sellability-policy",
    capabilityId: "@voyant-travel/commerce#action.create-sellability-policy",
    capabilityVersion: "v1",
    commandTargetType: "sellability_policy_create_command",
    canonicalTargetType: "sellability-policy",
    resultReferenceType: "sellability-policy",
    evaluatedRisk: "medium",
    approvalPolicy: "none",
    approvalReasonCode: null,
  },
  cancellationPolicy: {
    actionName: "@voyant-travel/commerce#action.create-cancellation-policy",
    actionVersion: "v1",
    toolName: "create_cancellation_policy",
    toolCapabilityId: "@voyant-travel/commerce#tool.create-cancellation-policy",
    capabilityId: "@voyant-travel/commerce#action.create-cancellation-policy",
    capabilityVersion: "v1",
    commandTargetType: "cancellation_policy_create_command",
    canonicalTargetType: "cancellation-policy",
    resultReferenceType: "cancellation-policy",
    evaluatedRisk: "medium",
    approvalPolicy: "none",
    approvalReasonCode: null,
  },
  priceCatalog: {
    actionName: "@voyant-travel/commerce#action.create-price-catalog",
    actionVersion: "v1",
    toolName: "create_price_catalog",
    toolCapabilityId: "@voyant-travel/commerce#tool.create-price-catalog",
    capabilityId: "@voyant-travel/commerce#action.create-price-catalog",
    capabilityVersion: "v1",
    commandTargetType: "price_catalog_create_command",
    canonicalTargetType: "price-catalog",
    resultReferenceType: "price-catalog",
    evaluatedRisk: "medium",
    approvalPolicy: "none",
    approvalReasonCode: null,
  },
  promotion: {
    actionName: "@voyant-travel/commerce#action.create-promotion",
    actionVersion: "v1",
    toolName: "create_promotion",
    toolCapabilityId: "@voyant-travel/commerce#tool.create-promotion",
    capabilityId: "@voyant-travel/commerce#action.create-promotion",
    capabilityVersion: "v1",
    commandTargetType: "promotion_create_command",
    canonicalTargetType: "promotion",
    resultReferenceType: "promotion",
    evaluatedRisk: "medium",
    approvalPolicy: "none",
    approvalReasonCode: null,
  },
} as const satisfies Record<string, CommerceCreatedTargetPolicy>

export function buildCommerceCreatedTargetFingerprint(
  policy: CommerceCreatedTargetPolicy,
  commandTargetId: string,
  commandInput: unknown,
): Promise<string> {
  const input: BuildCreatedTargetCommandFingerprintInput = {
    actionName: policy.actionName,
    actionVersion: policy.actionVersion,
    commandTarget: { type: policy.commandTargetType, id: commandTargetId },
    canonicalTargetType: policy.canonicalTargetType,
    resultReferenceType: policy.resultReferenceType,
    commandInput,
    capabilityId: policy.capabilityId,
    capabilityVersion: policy.capabilityVersion,
    evaluatedRisk: policy.evaluatedRisk,
    approvalPolicy: policy.approvalPolicy,
    approvalReasonCode: policy.approvalReasonCode,
  }
  return buildCreatedTargetCommandFingerprint(input)
}

export function commerceHandlerActionPolicyExpectation(
  policy: CommerceCreatedTargetPolicy,
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
