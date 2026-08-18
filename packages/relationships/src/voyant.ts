// agent-quality: file-size exception -- owner: relationships; the import-cheap package manifest remains centralized until #3398 moves custom-field API and Settings facets to their generic owner.
import {
  bookingsCrmSnapshotRuntimePort,
  bookingsRelationshipsRuntimePort,
} from "@voyant-travel/bookings/runtime-port"
import { catalogInquiryBookingSessionRuntimePort } from "@voyant-travel/catalog/inquiry-booking-session-runtime-port"
import { defineModule, providePort, requirePort } from "@voyant-travel/core/project"
import {
  customFieldsRuntimePort,
  customFieldValueLifecycleRuntimePort,
  customFieldValueOperationsRuntimePort,
  customFieldValueReaderRuntimePort,
} from "@voyant-travel/core/runtime-port"
import { financeStoredInstrumentRuntimePort } from "@voyant-travel/finance/runtime-port"
import { proposalInquiryConversionRuntimePort } from "@voyant-travel/proposals-contracts/inquiry-conversion/runtime-port"
import { inquiryTargetAuthorityRuntimePort } from "@voyant-travel/relationships-contracts/inquiry-target-authority/runtime-port"
import {
  relationshipsBookingEnrichmentDatabaseRuntimePort,
  relationshipsMiceRuntimePort,
  relationshipsRouteRuntimePort,
} from "./runtime-port.js"

export {
  type RelationshipsMiceRuntime,
  relationshipsMiceRuntimePort,
  relationshipsRouteRuntimePort,
} from "./runtime-port.js"

const relationshipsAdminRuntime = {
  entry: "@voyant-travel/relationships-react/admin",
  export: "createRelationshipsAdminExtension",
} as const

const publicApiIntakeRuntimePortReference = { id: "public-api.intake.runtime" } as const

const customerSignalCreatedPayloadSchema = {
  type: "object",
  required: ["id", "personId", "kind", "source", "status"],
  properties: {
    id: { type: "string" },
    personId: { type: "string" },
    kind: { enum: ["wishlist", "notify", "inquiry", "request_offer", "referral"] },
    source: { enum: ["form", "phone", "admin", "abandoned_cart", "website", "booking"] },
    status: { enum: ["new", "contacted", "qualified", "converted", "lost", "expired"] },
    productId: { type: ["string", "null"] },
    optionUnitId: { type: ["string", "null"] },
    sourceSubmissionId: { type: ["string", "null"] },
    intake: {
      oneOf: [
        {
          type: "object",
          required: ["surface", "type"],
          properties: {
            surface: { const: "storefront" },
            type: { const: "lead" },
          },
          additionalProperties: false,
        },
        {
          type: "object",
          required: ["surface", "type", "doubleOptIn"],
          properties: {
            surface: { const: "storefront" },
            type: { const: "newsletter" },
            doubleOptIn: { enum: ["not_configured", "requested"] },
          },
          additionalProperties: false,
        },
      ],
    },
  },
  additionalProperties: false,
} as const

const relationshipChangedPayloadSchema = {
  type: "object",
  required: ["id", "action"],
  properties: {
    id: { type: "string" },
    action: { enum: ["created", "updated", "deleted"] },
  },
  additionalProperties: false,
} as const

const inquiryEventPayloadSchema = {
  type: "object",
  required: ["id", "actorId"],
  properties: { id: { type: "string" }, actorId: { type: "string" } },
  additionalProperties: false,
} as const

const inquiryAssignedPayloadSchema = {
  type: "object",
  required: ["id", "actorId", "ownerId", "teamId"],
  properties: {
    id: { type: "string" },
    actorId: { type: "string" },
    ownerId: { type: ["string", "null"] },
    teamId: { type: ["string", "null"] },
  },
  additionalProperties: false,
} as const

const inquiryStatusChangedPayloadSchema = {
  type: "object",
  required: ["id", "actorId", "from", "to"],
  properties: {
    id: { type: "string" },
    actorId: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
  },
  additionalProperties: false,
} as const

const inquiryClosedPayloadSchema = {
  type: "object",
  required: ["id", "actorId", "outcome"],
  properties: {
    id: { type: "string" },
    actorId: { type: "string" },
    outcome: { type: "string" },
  },
  additionalProperties: false,
} as const

const inquiryConvertedPayloadSchema = {
  type: "object",
  required: ["id", "actorId", "conversionId", "kind", "targetId", "inquiryStatus"],
  properties: {
    id: { type: "string" },
    actorId: { type: "string" },
    conversionId: { type: "string" },
    kind: { type: "string", enum: ["proposal", "booking_session"] },
    targetId: { type: "string" },
    inquiryStatus: { type: "string", enum: ["qualified", "converted"] },
  },
  additionalProperties: false,
} as const

const inquiryTargetChangedPayloadSchema = {
  type: "object",
  required: ["id", "actorId", "linkId", "kind", "targetId", "occurredAt"],
  properties: {
    id: { type: "string" },
    actorId: { type: "string" },
    linkId: { type: "string" },
    kind: { type: "string", enum: ["product", "option_unit"] },
    targetId: { type: "string" },
    occurredAt: { type: "string", format: "date-time" },
  },
  additionalProperties: false,
} as const

/** Import-cheap deployment declaration owned by the relationships package. */
export const relationshipsVoyantModule = defineModule({
  id: "@voyant-travel/relationships",
  packageName: "@voyant-travel/relationships",
  localId: "relationships",
  provides: {
    ports: [
      publicApiIntakeRuntimePortReference,
      providePort(relationshipsMiceRuntimePort),
      providePort(bookingsRelationshipsRuntimePort),
      providePort(financeStoredInstrumentRuntimePort),
      providePort(relationshipsRouteRuntimePort),
      providePort(customFieldValueReaderRuntimePort),
      providePort(customFieldValueLifecycleRuntimePort),
      providePort(customFieldValueOperationsRuntimePort),
      providePort(relationshipsBookingEnrichmentDatabaseRuntimePort),
    ],
  },
  runtimePorts: [
    requirePort(customFieldsRuntimePort),
    requirePort(relationshipsRouteRuntimePort),
    requirePort(relationshipsBookingEnrichmentDatabaseRuntimePort),
    // Optional so Relationships remains deployable without Proposals. The
    // conversion endpoint stays mounted and answers 503 when no provider is selected.
    requirePort(proposalInquiryConversionRuntimePort, { optional: true }),
    requirePort(inquiryTargetAuthorityRuntimePort, { optional: true, cardinality: "many" }),
    requirePort(catalogInquiryBookingSessionRuntimePort, { optional: true }),
    // Optional so a deployment that selects CRM without Bookings still boots;
    // the enrichment subscriber simply has nothing to read.
    requirePort(bookingsCrmSnapshotRuntimePort, { optional: true }),
  ],
  api: [
    {
      id: "@voyant-travel/relationships#api.admin",
      surface: "admin",
      mount: "relationships",
      openapi: { document: "relationships" },
      resource: "crm",
      transactional: true,
      runtime: {
        entry: "@voyant-travel/relationships",
        export: "createRelationshipsVoyantRuntime",
      },
    },
    {
      id: "@voyant-travel/relationships#api.public",
      surface: "public",
      mount: "relationships",
      openapi: { document: "relationships" },
      resource: "crm",
      anonymous: true,
      guardedIntake: true,
      transactional: true,
      runtime: {
        entry: "@voyant-travel/relationships",
        export: "createRelationshipsVoyantRuntime",
      },
    },
  ],
  schema: [
    {
      id: "@voyant-travel/relationships#schema",
      source: "@voyant-travel/relationships/schema",
    },
  ],
  migrations: [
    {
      id: "@voyant-travel/relationships#migrations",
      source: "./migrations",
    },
  ],
  links: [
    {
      id: "@voyant-travel/relationships#linkable.inquiry",
      kind: "linkable",
      source: "@voyant-travel/relationships/linkables",
    },
    {
      id: "@voyant-travel/relationships#linkable.organization",
      kind: "linkable",
      source: "@voyant-travel/relationships/linkables",
    },
    {
      id: "@voyant-travel/relationships#linkable.person",
      kind: "linkable",
      source: "@voyant-travel/relationships/linkables",
    },
    {
      id: "@voyant-travel/relationships#link.inquiry-product",
      kind: "definition",
      source: "@voyant-travel/relationships/standard-links",
      export: "inquiryProductLink",
    },
    {
      id: "@voyant-travel/relationships#link.inquiry-option-unit",
      kind: "definition",
      source: "@voyant-travel/relationships/standard-links",
      export: "inquiryOptionUnitLink",
    },
  ],
  events: [
    {
      id: "@voyant-travel/relationships#event.inquiry.created",
      eventType: "inquiry.created",
      version: "1.0.0",
      payloadSchema: inquiryEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "relationships", category: "domain" },
    },
    {
      id: "@voyant-travel/relationships#event.inquiry.updated",
      eventType: "inquiry.updated",
      version: "1.0.0",
      payloadSchema: inquiryEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "relationships", category: "domain" },
    },
    {
      id: "@voyant-travel/relationships#event.inquiry.assigned",
      eventType: "inquiry.assigned",
      version: "1.0.0",
      payloadSchema: inquiryAssignedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "relationships", category: "domain" },
    },
    {
      id: "@voyant-travel/relationships#event.inquiry.status-changed",
      eventType: "inquiry.status_changed",
      version: "1.0.0",
      payloadSchema: inquiryStatusChangedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "relationships", category: "domain" },
    },
    {
      id: "@voyant-travel/relationships#event.inquiry.closed",
      eventType: "inquiry.closed",
      version: "1.0.0",
      payloadSchema: inquiryClosedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "relationships", category: "domain" },
    },
    {
      id: "@voyant-travel/relationships#event.inquiry.converted",
      eventType: "inquiry.converted",
      version: "1.0.0",
      payloadSchema: inquiryConvertedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "relationships", category: "domain" },
    },
    {
      id: "@voyant-travel/relationships#event.inquiry.reopened",
      eventType: "inquiry.reopened",
      version: "1.0.0",
      payloadSchema: inquiryEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "relationships", category: "domain" },
    },
    {
      id: "@voyant-travel/relationships#event.inquiry.target-added",
      eventType: "inquiry.target_added",
      version: "1.0.0",
      payloadSchema: inquiryTargetChangedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "relationships", category: "domain" },
    },
    {
      id: "@voyant-travel/relationships#event.inquiry.target-removed",
      eventType: "inquiry.target_removed",
      version: "1.0.0",
      payloadSchema: inquiryTargetChangedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "relationships", category: "domain" },
    },
    {
      id: "@voyant-travel/relationships#event.customer.signal.created",
      eventType: "customer.signal.created",
      version: "1.0.0",
      payloadSchema: customerSignalCreatedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "relationships", category: "domain" },
    },
    {
      id: "@voyant-travel/relationships#event.person.changed",
      eventType: "person.changed",
      version: "1.0.0",
      payloadSchema: relationshipChangedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "relationships", category: "domain" },
    },
    {
      id: "@voyant-travel/relationships#event.organization.changed",
      eventType: "organization.changed",
      version: "1.0.0",
      payloadSchema: relationshipChangedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "relationships", category: "domain" },
    },
  ],
  subscribers: [
    {
      id: "@voyant-travel/relationships#subscriber.crm-enrichment-booking-confirmed",
      eventType: "booking.confirmed",
      source: "@voyant-travel/relationships/booking-enrichment-subscriber",
      runtime: {
        entry: "@voyant-travel/relationships/booking-enrichment-subscriber",
        export: "createBookingCrmEnrichmentSubscriberGraphRuntime",
      },
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/relationships#access.crm",
        resource: "crm",
        label: "Customer relationships",
        description: "Read and manage people, organizations, and customer relationship records.",
        actions: [
          {
            action: "read",
            label: "Read customer relationships",
            description: "Read people, organizations, and relationship records.",
          },
          {
            action: "write",
            label: "Manage customer relationships",
            description: "Create and update people, organizations, and relationship records.",
            sensitive: true,
          },
          {
            action: "delete",
            label: "Delete customer relationships",
            description: "Delete people, organizations, and relationship records.",
            sensitive: true,
          },
        ],
      },
      {
        id: "@voyant-travel/relationships#access.relationships-pii",
        resource: "relationships-pii",
        label: "Relationship PII",
        description: "Personally-identifiable documents held on relationship records.",
        actions: [
          {
            action: "read",
            label: "Read relationship PII",
            description: "Reveal personally-identifiable documents held on relationship records.",
            sensitive: true,
          },
        ],
      },
    ],
  },
  tools: [
    {
      id: "@voyant-travel/relationships#tool.list-people",
      name: "list_people",
      runtime: { entry: "@voyant-travel/relationships/tools", export: "listPeopleTool" },
      requiredScopes: ["crm:read"],
      context: ["relationships"],
      risk: "low",
    },
    {
      id: "@voyant-travel/relationships#tool.get-person",
      name: "get_person",
      runtime: { entry: "@voyant-travel/relationships/tools", export: "getPersonTool" },
      requiredScopes: ["crm:read"],
      context: ["relationships"],
      risk: "low",
    },
    {
      id: "@voyant-travel/relationships#tool.list-organizations",
      name: "list_organizations",
      runtime: {
        entry: "@voyant-travel/relationships/tools",
        export: "listOrganizationsTool",
      },
      requiredScopes: ["crm:read"],
      context: ["relationships"],
      risk: "low",
    },
    {
      id: "@voyant-travel/relationships#tool.get-organization",
      name: "get_organization",
      runtime: { entry: "@voyant-travel/relationships/tools", export: "getOrganizationTool" },
      requiredScopes: ["crm:read"],
      context: ["relationships"],
      risk: "low",
    },
    {
      id: "@voyant-travel/relationships#tool.create-person",
      name: "create_person",
      runtime: { entry: "@voyant-travel/relationships/tools", export: "createPersonTool" },
      requiredScopes: ["crm:write"],
      context: ["relationships"],
      risk: "high",
    },
    {
      id: "@voyant-travel/relationships#tool.update-person",
      name: "update_person",
      runtime: { entry: "@voyant-travel/relationships/tools", export: "updatePersonTool" },
      requiredScopes: ["crm:write"],
      context: ["relationships"],
      risk: "high",
    },
    {
      id: "@voyant-travel/relationships#tool.create-organization",
      name: "create_organization",
      runtime: { entry: "@voyant-travel/relationships/tools", export: "createOrganizationTool" },
      requiredScopes: ["crm:write"],
      context: ["relationships"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/relationships#tool.update-organization",
      name: "update_organization",
      runtime: { entry: "@voyant-travel/relationships/tools", export: "updateOrganizationTool" },
      requiredScopes: ["crm:write"],
      context: ["relationships"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/relationships#tool.create-inquiry",
      name: "create_inquiry",
      runtime: { entry: "@voyant-travel/relationships/tools", export: "createInquiryTool" },
      requiredScopes: ["crm:write"],
      context: ["relationships"],
      risk: "medium",
      adminWrites: ["relationship/inquiry"],
    },
    ...(["assign", "close", "convert", "reopen", "transition"] as const).map((operation) => ({
      id: `@voyant-travel/relationships#tool.${operation}-inquiry`,
      name: `${operation}_inquiry`,
      runtime: {
        entry: "@voyant-travel/relationships/tools",
        export: `${operation}InquiryTool`,
      },
      requiredScopes: ["crm:write"],
      context: ["relationships"],
      risk: (operation === "close" || operation === "convert" ? "high" : "medium") as
        | "medium"
        | "high",
      adminWrites: [`relationship/inquiry/${operation}`],
    })),
    {
      id: "@voyant-travel/relationships#tool.list-relationship-notes",
      name: "list_relationship_notes",
      runtime: {
        entry: "@voyant-travel/relationships/tools",
        export: "listRelationshipNotesTool",
      },
      requiredScopes: ["crm:read"],
      context: ["relationships"],
      risk: "high",
    },
    ...(["person", "organization"] as const).map((ownerType) => ({
      id: `@voyant-travel/relationships#tool.add-${ownerType}-note`,
      name: `add_${ownerType}_note`,
      runtime: {
        entry: "@voyant-travel/relationships/tools",
        export: ownerType === "person" ? "addPersonNoteTool" : "addOrganizationNoteTool",
      },
      requiredScopes: ["crm:write"],
      context: ["relationships"],
      risk: "high" as const,
    })),
    {
      id: "@voyant-travel/relationships#tool.update-relationship-note",
      name: "update_relationship_note",
      runtime: {
        entry: "@voyant-travel/relationships/tools",
        export: "updateRelationshipNoteTool",
      },
      requiredScopes: ["crm:write"],
      context: ["relationships"],
      risk: "high",
    },
    {
      id: "@voyant-travel/relationships#tool.list-relationship-contact-methods",
      name: "list_relationship_contact_methods",
      runtime: {
        entry: "@voyant-travel/relationships/tools",
        export: "listRelationshipContactMethodsTool",
      },
      requiredScopes: ["crm:read"],
      context: ["relationships"],
      risk: "high",
    },
    ...(["person", "organization"] as const).map((ownerType) => ({
      id: `@voyant-travel/relationships#tool.add-${ownerType}-contact-method`,
      name: `add_${ownerType}_contact_method`,
      runtime: {
        entry: "@voyant-travel/relationships/tools",
        export:
          ownerType === "person"
            ? "addPersonContactMethodTool"
            : "addOrganizationContactMethodTool",
      },
      requiredScopes: ["crm:write"],
      context: ["relationships"],
      risk: "high" as const,
    })),
    {
      id: "@voyant-travel/relationships#tool.update-relationship-contact-method",
      name: "update_relationship_contact_method",
      runtime: {
        entry: "@voyant-travel/relationships/tools",
        export: "updateRelationshipContactMethodTool",
      },
      requiredScopes: ["crm:write"],
      context: ["relationships"],
      risk: "high",
    },
    {
      id: "@voyant-travel/relationships#tool.list-relationship-addresses",
      name: "list_relationship_addresses",
      runtime: {
        entry: "@voyant-travel/relationships/tools",
        export: "listRelationshipAddressesTool",
      },
      requiredScopes: ["crm:read"],
      context: ["relationships"],
      risk: "high",
    },
    ...(["person", "organization"] as const).map((ownerType) => ({
      id: `@voyant-travel/relationships#tool.add-${ownerType}-address`,
      name: `add_${ownerType}_address`,
      runtime: {
        entry: "@voyant-travel/relationships/tools",
        export: ownerType === "person" ? "addPersonAddressTool" : "addOrganizationAddressTool",
      },
      requiredScopes: ["crm:write"],
      context: ["relationships"],
      risk: "high" as const,
    })),
    {
      id: "@voyant-travel/relationships#tool.update-relationship-address",
      name: "update_relationship_address",
      runtime: {
        entry: "@voyant-travel/relationships/tools",
        export: "updateRelationshipAddressTool",
      },
      requiredScopes: ["crm:write"],
      context: ["relationships"],
      risk: "high",
    },
  ],
  actions: [
    {
      id: "@voyant-travel/relationships#action.list-people",
      version: "v1",
      kind: "read",
      targetType: "person",
      requiredScopes: ["crm:read"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/relationships#tool.list-people"] },
    },
    {
      id: "@voyant-travel/relationships#action.get-person",
      version: "v1",
      kind: "read",
      targetType: "person",
      requiredScopes: ["crm:read"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/relationships#tool.get-person"] },
    },
    {
      id: "@voyant-travel/relationships#action.list-organizations",
      version: "v1",
      kind: "read",
      targetType: "organization",
      requiredScopes: ["crm:read"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/relationships#tool.list-organizations"] },
    },
    {
      id: "@voyant-travel/relationships#action.get-organization",
      version: "v1",
      kind: "read",
      targetType: "organization",
      requiredScopes: ["crm:read"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/relationships#tool.get-organization"] },
    },
    {
      id: "@voyant-travel/relationships#action.create-person",
      version: "v1",
      kind: "execute",
      targetType: "person",
      availability: { status: "available" },
      effectBoundary: "multistage",
      durability: {
        strategy: "outbox",
        testReference: "packages/relationships/tests/integration/person-created-command.test.ts",
      },
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "person_create_command",
        resultReferenceType: "person",
        durability: "handler-command-claim-v1",
      },
      requiredScopes: ["crm:write"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      from: { tools: ["@voyant-travel/relationships#tool.create-person"] },
    },
    {
      id: "@voyant-travel/relationships#action.update-person",
      version: "v1",
      kind: "execute",
      targetType: "person",
      commandTargetField: "id",
      requiredScopes: ["crm:write"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: true,
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/relationships#tool.update-person"] },
    },
    {
      id: "@voyant-travel/relationships#action.create-organization",
      version: "v1",
      kind: "execute",
      targetType: "organization",
      availability: { status: "available" },
      effectBoundary: "multistage",
      durability: {
        strategy: "outbox",
        testReference:
          "packages/relationships/tests/integration/organization-created-command.test.ts",
      },
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "organization_create_command",
        resultReferenceType: "organization",
        durability: "handler-command-claim-v1",
      },
      requiredScopes: ["crm:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      from: { tools: ["@voyant-travel/relationships#tool.create-organization"] },
    },
    {
      id: "@voyant-travel/relationships#action.update-organization",
      version: "v1",
      kind: "execute",
      targetType: "organization",
      commandTargetField: "id",
      requiredScopes: ["crm:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: true,
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/relationships#tool.update-organization"] },
    },
    {
      id: "@voyant-travel/relationships#action.create-inquiry",
      version: "v1",
      kind: "execute",
      targetType: "inquiry",
      requiredScopes: ["crm:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "inquiry_create_command",
        resultReferenceType: "inquiry",
        durability: "handler-command-claim-v1",
      },
      from: { tools: ["@voyant-travel/relationships#tool.create-inquiry"] },
    },
    ...(["assign", "close", "convert", "reopen", "transition"] as const).map((operation) => ({
      id: `@voyant-travel/relationships#action.${operation}-inquiry`,
      version: "v1",
      kind: "execute" as const,
      targetType: "inquiry",
      commandTargetField: "id",
      targetLifecycle: "existing" as const,
      requiredScopes: ["crm:write"],
      risk: (operation === "close" || operation === "convert" ? "high" : "medium") as
        | "medium"
        | "high",
      ledger: "required" as const,
      approval: "never" as const,
      reversible: operation !== "convert",
      allowedActorTypes: ["staff"] as const,
      availability: { status: "available" as const },
      effectBoundary: (operation === "convert" ? "multistage" : "local") as "local" | "multistage",
      ...(operation === "convert"
        ? {
            durability: {
              strategy: "outbox" as const,
              testReference: "packages/relationships/tests/integration/inquiry-conversions.test.ts",
            },
          }
        : {}),
      from: { tools: [`@voyant-travel/relationships#tool.${operation}-inquiry`] },
    })),
    {
      id: "@voyant-travel/relationships#action.list-relationship-notes",
      version: "v1",
      kind: "sensitive-read",
      targetType: "relationship-note",
      requiredScopes: ["crm:read"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: false,
      from: { tools: ["@voyant-travel/relationships#tool.list-relationship-notes"] },
    },
    ...(["person", "organization"] as const).map((ownerType) => ({
      id: `@voyant-travel/relationships#action.add-${ownerType}-note`,
      version: "v1",
      kind: "execute" as const,
      targetType: ownerType,
      commandTargetField: "entityId",
      targetLifecycle: "existing" as const,
      requiredScopes: ["crm:write"],
      risk: "high" as const,
      ledger: "required" as const,
      approval: "never" as const,
      reversible: true,
      availability: { status: "available" as const },
      effectBoundary: "local" as const,
      from: { tools: [`@voyant-travel/relationships#tool.add-${ownerType}-note`] },
    })),
    {
      id: "@voyant-travel/relationships#action.update-relationship-note",
      version: "v1",
      kind: "execute",
      targetType: "relationship-note",
      commandTargetField: "id",
      requiredScopes: ["crm:write"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: true,
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/relationships#tool.update-relationship-note"] },
    },
    {
      id: "@voyant-travel/relationships#action.list-relationship-contact-methods",
      version: "v1",
      kind: "sensitive-read",
      targetType: "relationship-contact-method",
      requiredScopes: ["crm:read"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: false,
      from: { tools: ["@voyant-travel/relationships#tool.list-relationship-contact-methods"] },
    },
    ...(["person", "organization"] as const).map((ownerType) => ({
      id: `@voyant-travel/relationships#action.add-${ownerType}-contact-method`,
      version: "v1",
      kind: "execute" as const,
      targetType: ownerType,
      commandTargetField: "entityId",
      targetLifecycle: "existing" as const,
      requiredScopes: ["crm:write"],
      risk: "high" as const,
      ledger: "required" as const,
      approval: "never" as const,
      reversible: true,
      availability: { status: "available" as const },
      effectBoundary: "local" as const,
      from: {
        tools: [`@voyant-travel/relationships#tool.add-${ownerType}-contact-method`],
      },
    })),
    {
      id: "@voyant-travel/relationships#action.update-relationship-contact-method",
      version: "v1",
      kind: "execute",
      targetType: "relationship-contact-method",
      commandTargetField: "id",
      requiredScopes: ["crm:write"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: true,
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/relationships#tool.update-relationship-contact-method"] },
    },
    {
      id: "@voyant-travel/relationships#action.list-relationship-addresses",
      version: "v1",
      kind: "sensitive-read",
      targetType: "relationship-address",
      requiredScopes: ["crm:read"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: false,
      from: { tools: ["@voyant-travel/relationships#tool.list-relationship-addresses"] },
    },
    ...(["person", "organization"] as const).map((ownerType) => ({
      id: `@voyant-travel/relationships#action.add-${ownerType}-address`,
      version: "v1",
      kind: "execute" as const,
      targetType: ownerType,
      commandTargetField: "entityId",
      targetLifecycle: "existing" as const,
      requiredScopes: ["crm:write"],
      risk: "high" as const,
      ledger: "required" as const,
      approval: "never" as const,
      reversible: true,
      availability: { status: "available" as const },
      effectBoundary: "local" as const,
      from: { tools: [`@voyant-travel/relationships#tool.add-${ownerType}-address`] },
    })),
    {
      id: "@voyant-travel/relationships#action.update-relationship-address",
      version: "v1",
      kind: "execute",
      targetType: "relationship-address",
      commandTargetField: "id",
      requiredScopes: ["crm:write"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: true,
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/relationships#tool.update-relationship-address"] },
    },
    {
      // The admin route records the disclosure itself under
      // `PERSON_DOCUMENT_REVEAL_ACTION_NAME`, which is the persisted ledger
      // identity and stays as it is; this id is only the manifest key.
      id: "@voyant-travel/relationships#action.reveal-person-document",
      version: "v1",
      kind: "sensitive-read",
      targetType: "person_document",
      requiredScopes: ["relationships-pii:read"],
      risk: "high",
      ledger: "required",
      approval: "never",
      policy: "scope_grant",
      reversible: false,
      from: { routes: ["@voyant-travel/relationships#api.admin"] },
    },
  ],
  customFieldTargets: [
    {
      id: "organization",
      namespace: "relationships",
      label: "Organization",
      fieldTypes: [
        "varchar",
        "text",
        "double",
        "monetary",
        "date",
        "boolean",
        "enum",
        "set",
        "json",
        "address",
        "phone",
      ],
      capabilities: ["read", "write", "search", "export", "invoice", "presentation"],
    },
    {
      id: "person",
      namespace: "relationships",
      label: "Person",
      fieldTypes: [
        "varchar",
        "text",
        "double",
        "monetary",
        "date",
        "boolean",
        "enum",
        "set",
        "json",
        "address",
        "phone",
      ],
      capabilities: ["read", "write", "search", "export", "invoice", "presentation"],
    },
    {
      id: "activity",
      namespace: "relationships",
      label: "Activity",
      fieldTypes: ["varchar", "text", "double", "date", "boolean", "enum", "set", "json"],
      capabilities: ["read", "write", "presentation"],
    },
  ],
  admin: {
    compositionOrder: 20,
    runtime: {
      entry: "@voyant-travel/relationships-react/admin",
      export: "createSelectedRelationshipsAdminExtension",
    },
    copy: [
      {
        id: "@voyant-travel/relationships#admin.copy",
        namespace: "relationships.admin",
        fallbackLocale: "en",
        runtime: {
          entry: "@voyant-travel/relationships-react/i18n",
          export: "crmUiMessageDefinitions",
        },
      },
    ],
    routes: [
      {
        id: "@voyant-travel/relationships#admin.route.people-index",
        path: "/people",
        requiredScopes: ["crm:read"],
        runtime: relationshipsAdminRuntime,
      },
      {
        id: "@voyant-travel/relationships#admin.route.people-detail",
        path: "/people/$id",
        requiredScopes: ["crm:read"],
        runtime: relationshipsAdminRuntime,
      },
      {
        id: "@voyant-travel/relationships#admin.route.organizations-index",
        path: "/organizations",
        requiredScopes: ["crm:read"],
        runtime: relationshipsAdminRuntime,
      },
      {
        id: "@voyant-travel/relationships#admin.route.organizations-detail",
        path: "/organizations/$id",
        requiredScopes: ["crm:read"],
        runtime: relationshipsAdminRuntime,
      },
    ],
    nav: [
      {
        id: "@voyant-travel/relationships#admin.nav.people",
        routeId: "@voyant-travel/relationships#admin.route.people-index",
        label: {
          namespace: "relationships.admin",
          key: "peoplePage.title",
        },
      },
      {
        id: "@voyant-travel/relationships#admin.nav.organizations",
        routeId: "@voyant-travel/relationships#admin.route.organizations-index",
        label: {
          namespace: "relationships.admin",
          key: "organizationsPage.title",
        },
      },
    ],
    slots: [
      {
        id: "person.details.bookings-tab",
        routeId: "@voyant-travel/relationships#admin.route.people-detail",
        contract: { personId: "string" },
      },
    ],
  },
  lifecycle: {
    uninstall: { default: "retain-data", purge: "not-supported" },
  },
  meta: {
    ownership: "package",
  },
})

export default relationshipsVoyantModule
