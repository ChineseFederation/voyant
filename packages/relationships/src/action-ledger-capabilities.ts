import type { ActionLedgerCapabilityDefinition } from "@voyant-travel/action-ledger"

export const PERSON_DOCUMENT_REVEAL_CAPABILITY = {
  id: "relationships-pii:read:person-document",
  version: "v1",
  resource: "person_document",
  action: "read",
  risk: "high",
  ledgerPolicy: "required",
  approvalPolicy: "none",
  reversible: false,
  allowedActorTypes: ["staff", "system"],
  requiredGrants: [{ resource: "relationships-pii", action: "read" }],
} as const satisfies ActionLedgerCapabilityDefinition

export const PERSON_DOCUMENT_REVEAL_ACTION_NAME = "relationships.person_document.reveal"
export const PERSON_DOCUMENT_REVEAL_ACTION_VERSION = "v1"
export const PERSON_DOCUMENT_REVEAL_AUTHORIZATION_SOURCE = "scope" as const
export const PERSON_DOCUMENT_REVEAL_DECISION_POLICY = "scope_grant" as const

export const INQUIRY_PRIVATE_DATA_READ_CAPABILITY = {
  id: "relationships-pii:read:inquiry-private-data",
  version: "v1",
  resource: "inquiry",
  action: "read",
  risk: "high",
  ledgerPolicy: "required",
  approvalPolicy: "none",
  reversible: false,
  allowedActorTypes: ["staff", "system"],
  requiredGrants: [{ resource: "relationships-pii", action: "read" }],
} as const satisfies ActionLedgerCapabilityDefinition

export const INQUIRY_PRIVACY_ERASURE_CAPABILITY = {
  id: "relationships-pii:delete:inquiry-private-data",
  version: "v1",
  resource: "inquiry",
  action: "delete",
  risk: "high",
  ledgerPolicy: "required",
  approvalPolicy: "none",
  reversible: false,
  allowedActorTypes: ["staff", "system"],
  requiredGrants: [{ resource: "relationships-pii", action: "delete" }],
} as const satisfies ActionLedgerCapabilityDefinition
