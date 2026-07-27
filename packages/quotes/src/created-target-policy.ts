import type { HandlerActionPolicyExpectation } from "@voyant-travel/tools"

interface QuotesCreatedTargetPolicy {
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
 * Opening a quote mints a new target, so it runs as a created-target command
 * rather than a plain write: an exact retry has to return the original quote
 * instead of a second one. An agent that retries a create without a claim is
 * how duplicate records happen.
 */
export const QUOTES_CREATED_TARGET_POLICIES = {
  quote: {
    actionName: "@voyant-travel/quotes#action.create-quote",
    actionVersion: "v1",
    toolName: "create_quote",
    toolCapabilityId: "@voyant-travel/quotes#tool.create-quote",
    capabilityId: "@voyant-travel/quotes#action.create-quote",
    capabilityVersion: "v1",
    commandTargetType: "quote_create_command",
    canonicalTargetType: "quote",
    resultReferenceType: "quote",
    evaluatedRisk: "medium",
    approvalPolicy: "none",
    approvalReasonCode: null,
  },
} as const satisfies Record<string, QuotesCreatedTargetPolicy>

export type { QuotesCreatedTargetPolicy }

export function quotesHandlerActionPolicyExpectation(
  policy: QuotesCreatedTargetPolicy,
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
