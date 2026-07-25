import type { HandlerActionPolicyExpectation } from "@voyant-travel/tools"

export const FINANCE_BOOKING_CREATE_ACTION =
  "@voyant-travel/finance#bookings-create-extension.action.create-booking"
export const FINANCE_BOOKING_CREATE_TOOL =
  "@voyant-travel/finance#bookings-create-extension.tool.create-booking"

export const FINANCE_BOOKING_CREATE_POLICY = {
  canonicalTargetType: "booking",
  commandTargetType: "finance_booking_create_command",
  resultReferenceType: "booking",
  evaluatedRisk: "high",
} as const

export const FINANCE_BOOKING_CREATE_HANDLER_POLICY = {
  capabilityId: FINANCE_BOOKING_CREATE_TOOL,
  capabilityVersion: "v1",
  canonicalName: "create_booking",
  actionPolicy: {
    id: FINANCE_BOOKING_CREATE_ACTION,
    capabilityId: FINANCE_BOOKING_CREATE_ACTION,
    version: "v1",
    kind: "execute",
    targetType: FINANCE_BOOKING_CREATE_POLICY.canonicalTargetType,
    targetLifecycle: "created",
    ledger: "required",
    approval: "never",
    risk: FINANCE_BOOKING_CREATE_POLICY.evaluatedRisk,
    reversible: false,
    allowedActorTypes: ["staff"],
    createdTarget: {
      commandTargetType: FINANCE_BOOKING_CREATE_POLICY.commandTargetType,
      resultReferenceType: FINANCE_BOOKING_CREATE_POLICY.resultReferenceType,
      durability: "handler-command-claim-v1",
    },
  },
} as const satisfies HandlerActionPolicyExpectation
