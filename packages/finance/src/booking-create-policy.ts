import type {
  HandlerActionPolicyExpectation,
  RouteActionBinding,
  ToolActionInvocationPolicy,
} from "@voyant-travel/tools"

export const FINANCE_BOOKING_CREATE_ACTION =
  "@voyant-travel/finance#bookings-create-extension.action.create-booking"
export const FINANCE_BOOKING_CREATE_TOOL =
  "@voyant-travel/finance#bookings-create-extension.tool.create-booking"

/**
 * Self-service creation is a second, separate action over the same command.
 *
 * It deliberately does not reuse the staff Tool's capability identity: a
 * distinct action id gives it its own fingerprint domain and its own audit
 * trail, and binding it to the route transport keeps it unreachable from MCP.
 */
export const FINANCE_BOOKING_CREATE_SELF_SERVICE_ACTION =
  "@voyant-travel/finance#bookings-create-extension.action.create-booking-self-service"
export const FINANCE_BOOKING_CREATE_SELF_SERVICE_ROUTE =
  "@voyant-travel/finance#bookings-create-extension.route.create-booking-self-service"

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

/**
 * The narrow public invocation contract. A self-service caller supplies only an
 * idempotency key; every other command field is derived server-side from the
 * draft and quote.
 */
export const FINANCE_BOOKING_CREATE_SELF_SERVICE_INVOCATION = {
  controlField: "_voyant",
  requiredFields: ["idempotencyKey"],
  optionalFields: [],
  fingerprintAlgorithm: "action-ledger-command-v1",
} as const satisfies ToolActionInvocationPolicy

export const FINANCE_BOOKING_CREATE_SELF_SERVICE_HANDLER_POLICY = {
  capabilityId: FINANCE_BOOKING_CREATE_SELF_SERVICE_ROUTE,
  capabilityVersion: "v1",
  canonicalName: "create_booking_self_service",
  transport: "route",
  actionPolicy: {
    id: FINANCE_BOOKING_CREATE_SELF_SERVICE_ACTION,
    capabilityId: FINANCE_BOOKING_CREATE_SELF_SERVICE_ACTION,
    version: "v1",
    kind: "execute",
    targetType: FINANCE_BOOKING_CREATE_POLICY.canonicalTargetType,
    targetLifecycle: "created",
    ledger: "required",
    approval: "never",
    risk: FINANCE_BOOKING_CREATE_POLICY.evaluatedRisk,
    reversible: false,
    // Customer only. The staff Tool action stays staff only; neither widens.
    allowedActorTypes: ["customer"],
    transport: "route",
    createdTarget: {
      commandTargetType: FINANCE_BOOKING_CREATE_POLICY.commandTargetType,
      resultReferenceType: FINANCE_BOOKING_CREATE_POLICY.resultReferenceType,
      durability: "handler-command-claim-v1",
    },
  },
} as const satisfies HandlerActionPolicyExpectation

/** What a deployment registers so the route can be admitted at all. */
export const FINANCE_BOOKING_CREATE_SELF_SERVICE_ROUTE_ACTION = {
  capabilityId: FINANCE_BOOKING_CREATE_SELF_SERVICE_ROUTE,
  capabilityVersion: "v1",
  canonicalName: "create_booking_self_service",
  actionPolicy: FINANCE_BOOKING_CREATE_SELF_SERVICE_HANDLER_POLICY.actionPolicy,
  invocation: FINANCE_BOOKING_CREATE_SELF_SERVICE_INVOCATION,
} as const satisfies RouteActionBinding
