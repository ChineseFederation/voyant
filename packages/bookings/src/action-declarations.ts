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

/**
 * Ledger identity for recording a Booking Document. Like the `booking.note.*`
 * names, this is a package-local literal rather than a graph action: recording
 * a document needs no approval gate, only an entry saying who did it. Both the
 * admin route and `record_booking_document` write it, so a document recorded
 * by an agent and one recorded by a person read the same way.
 */
export const BOOKING_DOCUMENT_LEDGER_ACTION_NAME = "booking.document.record"
export const BOOKING_DOCUMENT_LEDGER_ACTION_VERSION = "v1"

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

const amendmentToolBinding = (toolId: string) => ({ tools: [toolId] })

const amendmentDurability = {
  strategy: "transactional",
  testReference: "packages/bookings/tests/integration/booking-amendments.test.ts",
} as const

const amendmentWriteCapability = {
  version: "v1",
  risk: "medium",
  ledgerPolicy: "required",
  approvalPolicy: "none",
  reversible: false,
  allowedActorTypes: ["staff"],
  requiredGrants: [{ resource: "bookings", action: "write" }],
  graph: {
    kind: "execute",
    targetLifecycle: "existing",
    availability: { status: "available" },
    effectBoundary: "local",
    durability: amendmentDurability,
  },
} as const

/**
 * `graph.id` is the manifest-visible key a Tool's `actionPolicy.id` resolves
 * against, and nothing persists it: the generic gate records
 * `capabilityId ?? id` as the ledger `action_name`, and every one of these
 * declares a `capabilityId`. The package-local admin route path records its own
 * `booking.status.*` literals (`routes-admin.ts`, `service-core.ts`), which are
 * ledger identity and must not be renamed to follow this file.
 */
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
      id: "@voyant-travel/bookings#action.read-booking-pii",
      kind: "sensitive-read",
      from: adminRouteBinding,
      policy: "bookings-pii-scope-or-staff-v1",
    },
  },
  status: {
    cancel: {
      ...bookingWriteCapability,
      id: "bookings:status:cancel",
      action: "cancel",
      risk: "critical",
      approvalPolicy: "conditional",
      graph: {
        ...bookingWriteCapability.graph,
        id: "@voyant-travel/bookings#action.cancel-booking",
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
      graph: {
        ...bookingWriteCapability.graph,
        id: "@voyant-travel/bookings#action.start-booking",
      },
    },
    complete: {
      ...bookingWriteCapability,
      id: "bookings:status:complete",
      action: "complete",
      graph: {
        ...bookingWriteCapability.graph,
        id: "@voyant-travel/bookings#action.complete-booking",
      },
    },
    override: {
      ...bookingWriteCapability,
      id: "bookings:status:override",
      action: "override_status",
      risk: "high",
      approvalPolicy: "conditional",
      graph: {
        ...bookingWriteCapability.graph,
        id: "@voyant-travel/bookings#action.override-booking-status",
      },
    },
  },
  documents: {
    read: {
      id: "bookings:documents:read",
      version: "v1",
      resource: "booking_document",
      action: "read",
      risk: "high",
      ledgerPolicy: "required",
      approvalPolicy: "none",
      reversible: false,
      allowedActorTypes: ["staff"],
      requiredGrants: [
        { resource: "bookings", action: "read" },
        { resource: "bookings-pii", action: "read" },
      ],
      graph: {
        id: "@voyant-travel/bookings#action.read-booking-documents",
        kind: "sensitive-read",
        // The collection holds traveller passports and visas alongside
        // commercial paperwork, so reading it is a PII read.
        from: {
          ...adminRouteBinding,
          tools: ["@voyant-travel/bookings#tool.list-booking-documents"],
        },
        policy: "bookings-pii-scope-or-staff-v1",
      },
    },
    record: {
      ...bookingWriteCapability,
      id: "bookings:documents:record",
      resource: "booking_document",
      action: "record",
      // Recording paperwork issued elsewhere writes a row and nothing else: it
      // allocates no number from a Voyant series, renders no template, and
      // creates no invoice or contract. It is reversible by deleting the row,
      // so it carries a ledger entry rather than an approval gate.
      reversible: true,
      allowedActorTypes: ["staff"],
      graph: {
        ...bookingWriteCapability.graph,
        id: "@voyant-travel/bookings#action.record-booking-document",
        commandTargetField: "bookingId",
        targetLifecycle: "existing",
        availability: { status: "available" },
        effectBoundary: "local",
        from: {
          ...adminRouteBinding,
          tools: ["@voyant-travel/bookings#tool.record-booking-document"],
        },
      },
    },
  },
  amendments: {
    previewTravelerCorrection: {
      ...amendmentWriteCapability,
      id: "bookings:amendments:preview-traveler-correction",
      resource: "booking",
      action: "preview_traveler_correction_amendment",
      graph: {
        ...amendmentWriteCapability.graph,
        id: "@voyant-travel/bookings#action.preview-traveler-correction-amendment",
        commandTargetField: "bookingId",
        from: amendmentToolBinding(
          "@voyant-travel/bookings#tool.preview-traveler-correction-amendment",
        ),
      },
    },
    previewTravelerRosterChange: {
      ...amendmentWriteCapability,
      id: "bookings:amendments:preview-traveler-roster-change",
      resource: "booking",
      action: "preview_traveler_roster_change_amendment",
      graph: {
        ...amendmentWriteCapability.graph,
        id: "@voyant-travel/bookings#action.preview-traveler-roster-change-amendment",
        commandTargetField: "bookingId",
        from: amendmentToolBinding(
          "@voyant-travel/bookings#tool.preview-traveler-roster-change-amendment",
        ),
      },
    },
    accept: {
      ...amendmentWriteCapability,
      id: "bookings:amendments:accept",
      resource: "booking-amendment",
      action: "accept",
      graph: {
        ...amendmentWriteCapability.graph,
        id: "@voyant-travel/bookings#action.accept-booking-amendment",
        commandTargetField: "amendmentId",
        from: amendmentToolBinding("@voyant-travel/bookings#tool.accept-booking-amendment"),
      },
    },
    apply: {
      ...amendmentWriteCapability,
      id: "bookings:amendments:apply",
      resource: "booking-amendment",
      action: "apply",
      graph: {
        ...amendmentWriteCapability.graph,
        id: "@voyant-travel/bookings#action.apply-booking-amendment",
        commandTargetField: "amendmentId",
        from: amendmentToolBinding("@voyant-travel/bookings#tool.apply-booking-amendment"),
      },
    },
    reconcile: {
      ...amendmentWriteCapability,
      id: "bookings:amendments:reconcile",
      resource: "booking-amendment",
      action: "reconcile",
      graph: {
        ...amendmentWriteCapability.graph,
        id: "@voyant-travel/bookings#action.reconcile-booking-amendment",
        commandTargetField: "amendmentId",
        from: amendmentToolBinding("@voyant-travel/bookings#tool.reconcile-booking-amendment"),
      },
    },
  },
} as const satisfies {
  piiRead: BookingActionDeclaration
  status: Record<string, BookingActionDeclaration>
  documents: Record<string, BookingActionDeclaration>
  amendments: Record<string, BookingActionDeclaration>
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
  cancel: toCapabilityDefinition(BOOKING_ACTION_DECLARATIONS.status.cancel),
  start: toCapabilityDefinition(BOOKING_ACTION_DECLARATIONS.status.start),
  complete: toCapabilityDefinition(BOOKING_ACTION_DECLARATIONS.status.complete),
  override: toCapabilityDefinition(BOOKING_ACTION_DECLARATIONS.status.override),
} as const

export const BOOKING_DOCUMENT_CAPABILITIES = {
  read: toCapabilityDefinition(BOOKING_ACTION_DECLARATIONS.documents.read),
  record: toCapabilityDefinition(BOOKING_ACTION_DECLARATIONS.documents.record),
} as const

export const BOOKING_AMENDMENT_CAPABILITIES = {
  previewTravelerCorrection: toCapabilityDefinition(
    BOOKING_ACTION_DECLARATIONS.amendments.previewTravelerCorrection,
  ),
  previewTravelerRosterChange: toCapabilityDefinition(
    BOOKING_ACTION_DECLARATIONS.amendments.previewTravelerRosterChange,
  ),
  accept: toCapabilityDefinition(BOOKING_ACTION_DECLARATIONS.amendments.accept),
  apply: toCapabilityDefinition(BOOKING_ACTION_DECLARATIONS.amendments.apply),
  reconcile: toCapabilityDefinition(BOOKING_ACTION_DECLARATIONS.amendments.reconcile),
} as const

export const BOOKING_ACTION_LEDGER_CAPABILITIES = [
  BOOKING_PII_READ_CAPABILITY,
  ...Object.values(BOOKING_STATUS_CAPABILITIES),
  ...Object.values(BOOKING_DOCUMENT_CAPABILITIES),
  ...Object.values(BOOKING_AMENDMENT_CAPABILITIES),
] as const

export const BOOKING_VOYANT_ACTIONS = [
  toVoyantAction(BOOKING_ACTION_DECLARATIONS.piiRead),
  ...Object.values(BOOKING_ACTION_DECLARATIONS.status).map(toVoyantAction),
  ...Object.values(BOOKING_ACTION_DECLARATIONS.documents).map(toVoyantAction),
  ...Object.values(BOOKING_ACTION_DECLARATIONS.amendments).map(toVoyantAction),
] as const
