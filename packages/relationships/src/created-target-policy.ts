import type { HandlerActionPolicyExpectation } from "@voyant-travel/tools"

export const RELATIONSHIPS_PERSON_CREATED_TARGET_POLICY = {
  actionName: "@voyant-travel/relationships#action.create-person",
  actionVersion: "v1",
  toolName: "create_person",
  toolCapabilityId: "@voyant-travel/relationships#tool.create-person",
  commandTargetType: "person_create_command",
  canonicalTargetType: "person",
  resultReferenceType: "person",
  evaluatedRisk: "high",
} as const

export const RELATIONSHIPS_PERSON_HANDLER_ACTION_POLICY = {
  capabilityId: RELATIONSHIPS_PERSON_CREATED_TARGET_POLICY.toolCapabilityId,
  capabilityVersion: RELATIONSHIPS_PERSON_CREATED_TARGET_POLICY.actionVersion,
  canonicalName: RELATIONSHIPS_PERSON_CREATED_TARGET_POLICY.toolName,
  actionPolicy: {
    id: RELATIONSHIPS_PERSON_CREATED_TARGET_POLICY.actionName,
    capabilityId: RELATIONSHIPS_PERSON_CREATED_TARGET_POLICY.actionName,
    version: RELATIONSHIPS_PERSON_CREATED_TARGET_POLICY.actionVersion,
    kind: "execute",
    targetType: RELATIONSHIPS_PERSON_CREATED_TARGET_POLICY.canonicalTargetType,
    targetLifecycle: "created",
    createdTarget: {
      commandTargetType: RELATIONSHIPS_PERSON_CREATED_TARGET_POLICY.commandTargetType,
      resultReferenceType: RELATIONSHIPS_PERSON_CREATED_TARGET_POLICY.resultReferenceType,
      durability: "handler-command-claim-v1",
    },
    risk: RELATIONSHIPS_PERSON_CREATED_TARGET_POLICY.evaluatedRisk,
    ledger: "required",
    approval: "never",
    reversible: false,
    allowedActorTypes: ["staff"],
  },
} as const satisfies HandlerActionPolicyExpectation

export const RELATIONSHIPS_ORGANIZATION_CREATED_TARGET_POLICY = {
  actionName: "@voyant-travel/relationships#action.create-organization",
  actionVersion: "v1",
  toolName: "create_organization",
  toolCapabilityId: "@voyant-travel/relationships#tool.create-organization",
  commandTargetType: "organization_create_command",
  canonicalTargetType: "organization",
  resultReferenceType: "organization",
  evaluatedRisk: "medium",
} as const

export const RELATIONSHIPS_ORGANIZATION_HANDLER_ACTION_POLICY = {
  capabilityId: RELATIONSHIPS_ORGANIZATION_CREATED_TARGET_POLICY.toolCapabilityId,
  capabilityVersion: RELATIONSHIPS_ORGANIZATION_CREATED_TARGET_POLICY.actionVersion,
  canonicalName: RELATIONSHIPS_ORGANIZATION_CREATED_TARGET_POLICY.toolName,
  actionPolicy: {
    id: RELATIONSHIPS_ORGANIZATION_CREATED_TARGET_POLICY.actionName,
    capabilityId: RELATIONSHIPS_ORGANIZATION_CREATED_TARGET_POLICY.actionName,
    version: RELATIONSHIPS_ORGANIZATION_CREATED_TARGET_POLICY.actionVersion,
    kind: "execute",
    targetType: RELATIONSHIPS_ORGANIZATION_CREATED_TARGET_POLICY.canonicalTargetType,
    targetLifecycle: "created",
    createdTarget: {
      commandTargetType: RELATIONSHIPS_ORGANIZATION_CREATED_TARGET_POLICY.commandTargetType,
      resultReferenceType: RELATIONSHIPS_ORGANIZATION_CREATED_TARGET_POLICY.resultReferenceType,
      durability: "handler-command-claim-v1",
    },
    risk: RELATIONSHIPS_ORGANIZATION_CREATED_TARGET_POLICY.evaluatedRisk,
    ledger: "required",
    approval: "never",
    reversible: false,
    allowedActorTypes: ["staff"],
  },
} as const satisfies HandlerActionPolicyExpectation

export const RELATIONSHIPS_INQUIRY_CREATED_TARGET_POLICY = {
  actionName: "@voyant-travel/relationships#action.create-inquiry",
  actionVersion: "v1",
  toolName: "create_inquiry",
  toolCapabilityId: "@voyant-travel/relationships#tool.create-inquiry",
  commandTargetType: "inquiry_create_command",
  canonicalTargetType: "inquiry",
  resultReferenceType: "inquiry",
  evaluatedRisk: "medium",
} as const

export const RELATIONSHIPS_INQUIRY_HANDLER_ACTION_POLICY = {
  capabilityId: RELATIONSHIPS_INQUIRY_CREATED_TARGET_POLICY.toolCapabilityId,
  capabilityVersion: RELATIONSHIPS_INQUIRY_CREATED_TARGET_POLICY.actionVersion,
  canonicalName: RELATIONSHIPS_INQUIRY_CREATED_TARGET_POLICY.toolName,
  actionPolicy: {
    id: RELATIONSHIPS_INQUIRY_CREATED_TARGET_POLICY.actionName,
    capabilityId: RELATIONSHIPS_INQUIRY_CREATED_TARGET_POLICY.actionName,
    version: RELATIONSHIPS_INQUIRY_CREATED_TARGET_POLICY.actionVersion,
    kind: "execute",
    targetType: RELATIONSHIPS_INQUIRY_CREATED_TARGET_POLICY.canonicalTargetType,
    targetLifecycle: "created",
    createdTarget: {
      commandTargetType: RELATIONSHIPS_INQUIRY_CREATED_TARGET_POLICY.commandTargetType,
      resultReferenceType: RELATIONSHIPS_INQUIRY_CREATED_TARGET_POLICY.resultReferenceType,
      durability: "handler-command-claim-v1",
    },
    risk: RELATIONSHIPS_INQUIRY_CREATED_TARGET_POLICY.evaluatedRisk,
    ledger: "required",
    approval: "never",
    reversible: false,
    allowedActorTypes: ["staff"],
  },
} as const satisfies HandlerActionPolicyExpectation
