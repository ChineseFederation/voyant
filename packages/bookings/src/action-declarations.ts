import type { ActionLedgerCapabilityDefinition } from "@voyant-travel/action-ledger/capability"
import type {
  VoyantGraphActionBindings,
  VoyantGraphActionDeclaration,
} from "@voyant-travel/core/project"

interface BookingActionDeclaration extends ActionLedgerCapabilityDefinition {
  graph: {
    id: string
    kind: VoyantGraphActionDeclaration["kind"]
    from: VoyantGraphActionBindings
    policy?: string
    approval?: VoyantGraphActionDeclaration["approval"]
    commandTargetField?: VoyantGraphActionDeclaration["commandTargetField"]
    targetLifecycle?: VoyantGraphActionDeclaration["targetLifecycle"]
    createdTarget?: VoyantGraphActionDeclaration["createdTarget"]
    existingTarget?: VoyantGraphActionDeclaration["existingTarget"]
    availability?: VoyantGraphActionDeclaration["availability"]
    effectBoundary?: VoyantGraphActionDeclaration["effectBoundary"]
    durability?: VoyantGraphActionDeclaration["durability"]
  }
}

const adminRouteBinding = {
  routes: ["@voyant-travel/bookings#api.admin"],
} as const

const bookingWriteCapability = {
  version: "v1",
  resource: "booking",
  risk: "medium",
  ledgerPolicy: "required",
  approvalPolicy: "none",
  reversible: false,
  allowedActorTypes: ["staff", "system"],
  requiredGrants: [{ resource: "bookings", action: "write" }],
  graph: { kind: "execute", from: adminRouteBinding },
} as const

export const BOOKING_ACTION_DECLARATIONS = {
  piiRead: {
    id: "bookings-pii:read",
    version: "v1",
    resource: "booking_traveler",
    action: "read",
    risk: "high",
    ledgerPolicy: "required",
    approvalPolicy: "none",
    reversible: false,
    allowedActorTypes: ["staff", "system"],
    requiredGrants: [{ resource: "bookings-pii", action: "read" }],
    graph: {
      id: "booking.pii.read",
      kind: "sensitive-read",
      from: adminRouteBinding,
      policy: "bookings-pii-scope-or-staff-v1",
    },
  },
  status: {
    confirm: {
      ...bookingWriteCapability,
      id: "bookings:status:confirm",
      action: "confirm",
      risk: "high",
      approvalPolicy: "conditional",
      graph: {
        ...bookingWriteCapability.graph,
        id: "booking.status.confirm",
        approval: "required",
        policy: "bookings-status-approval-v1",
        commandTargetField: "id",
        targetLifecycle: "existing",
        existingTarget: { durability: "handler-command-result-v1" },
        effectBoundary: "multistage",
        durability: {
          strategy: "transactional",
          testReference: "packages/finance/tests/integration/booking-create.test.ts",
        },
        from: {
          ...adminRouteBinding,
          tools: ["@voyant-travel/bookings#tool.confirm-booking"],
        },
      },
    },
    expire: {
      ...bookingWriteCapability,
      id: "bookings:status:expire",
      action: "expire",
      graph: { ...bookingWriteCapability.graph, id: "booking.status.expire" },
    },
    cancel: {
      ...bookingWriteCapability,
      id: "bookings:status:cancel",
      action: "cancel",
      risk: "critical",
      approvalPolicy: "conditional",
      graph: {
        ...bookingWriteCapability.graph,
        id: "booking.status.cancel",
        approval: "required",
        policy: "bookings-status-approval-v1",
        commandTargetField: "id",
        targetLifecycle: "existing",
        existingTarget: { durability: "handler-command-result-v1" },
        availability: { status: "available" },
        effectBoundary: "multistage",
        durability: {
          strategy: "transactional",
          testReference: "packages/finance/tests/integration/booking-create.test.ts",
        },
        from: {
          ...adminRouteBinding,
          tools: ["@voyant-travel/bookings#tool.cancel-booking"],
        },
      },
    },
    start: {
      ...bookingWriteCapability,
      id: "bookings:status:start",
      action: "start",
      graph: { ...bookingWriteCapability.graph, id: "booking.status.start" },
    },
    complete: {
      ...bookingWriteCapability,
      id: "bookings:status:complete",
      action: "complete",
      graph: { ...bookingWriteCapability.graph, id: "booking.status.complete" },
    },
    override: {
      ...bookingWriteCapability,
      id: "bookings:status:override",
      action: "override_status",
      risk: "high",
      approvalPolicy: "conditional",
      graph: { ...bookingWriteCapability.graph, id: "booking.status.override" },
    },
  },
} as const satisfies {
  piiRead: BookingActionDeclaration
  status: Record<string, BookingActionDeclaration>
}

function toCapabilityDefinition<const T extends BookingActionDeclaration>(
  declaration: T,
): Omit<T, "graph"> {
  const { graph: _graph, ...definition } = declaration
  return definition
}

function grantToScope(grant: { resource: string; action: string }): string {
  return `${grant.resource}:${grant.action}`
}

function toVoyantAction(declaration: BookingActionDeclaration): VoyantGraphActionDeclaration {
  const { id, kind, ...graph } = declaration.graph
  return {
    id,
    capabilityId: declaration.id,
    version: declaration.version,
    kind,
    targetType: declaration.resource,
    resource: declaration.resource,
    action: declaration.action,
    requiredScopes: declaration.requiredGrants?.map(grantToScope),
    risk: declaration.risk,
    ledger: declaration.ledgerPolicy === "none" ? "optional" : declaration.ledgerPolicy,
    approval: declaration.approvalPolicy === "none" ? "never" : declaration.approvalPolicy,
    reversible: declaration.reversible,
    allowedActorTypes: declaration.allowedActorTypes,
    ...graph,
  }
}

export const BOOKING_PII_READ_CAPABILITY = toCapabilityDefinition(
  BOOKING_ACTION_DECLARATIONS.piiRead,
)

export const BOOKING_STATUS_CAPABILITIES = {
  confirm: toCapabilityDefinition(BOOKING_ACTION_DECLARATIONS.status.confirm),
  expire: toCapabilityDefinition(BOOKING_ACTION_DECLARATIONS.status.expire),
  cancel: toCapabilityDefinition(BOOKING_ACTION_DECLARATIONS.status.cancel),
  start: toCapabilityDefinition(BOOKING_ACTION_DECLARATIONS.status.start),
  complete: toCapabilityDefinition(BOOKING_ACTION_DECLARATIONS.status.complete),
  override: toCapabilityDefinition(BOOKING_ACTION_DECLARATIONS.status.override),
} as const

export const BOOKING_ACTION_LEDGER_CAPABILITIES = [
  BOOKING_PII_READ_CAPABILITY,
  ...Object.values(BOOKING_STATUS_CAPABILITIES),
] as const

export const BOOKING_VOYANT_ACTIONS = [
  toVoyantAction(BOOKING_ACTION_DECLARATIONS.piiRead),
  ...Object.values(BOOKING_ACTION_DECLARATIONS.status).map(toVoyantAction),
] as const
