// agent-quality: file-size exception -- owner: proposals; package-owned graph manifest keeps APIs, tools, actions, access, presentation extensions, and runtime factories together for authority review.

import { catalogBookingRuntimePort } from "@voyant-travel/catalog/ports"
import {
  defineExtension,
  defineModule,
  providePort,
  requirePort,
} from "@voyant-travel/core/project"
import {
  customFieldValueLifecycleRuntimePort,
  customFieldValueOperationsRuntimePort,
} from "@voyant-travel/core/runtime-port"
import { financeProposalsPaymentPolicyRuntimePort } from "@voyant-travel/finance/runtime-port"
import { proposalInquiryConversionRuntimePort } from "@voyant-travel/proposals-contracts/inquiry-conversion/runtime-port"
import {
  proposalsNotificationsRuntimePort,
  proposalsPresentationRuntimePort,
  proposalsRuntimePort,
  proposalsSnapshotRuntimePort,
} from "./runtime-port.js"

const durableNotificationProviderPortReference = {
  id: "notifications.durable-provider",
  conformance: {
    entry: "@voyant-travel/notifications/durable-provider-port",
    export: "durableNotificationProviderPort",
  },
} as const

const proposalChangedPayloadSchema = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string" } },
  additionalProperties: false,
} as const

/** Import-cheap deployment declarations owned by the proposals package. */
export const proposalsVoyantModule = defineModule({
  id: "@voyant-travel/proposals",
  packageName: "@voyant-travel/proposals",
  localId: "proposals",
  runtimePorts: [requirePort(proposalsRuntimePort)],
  customFieldTargets: [
    {
      id: "proposal",
      namespace: "proposals",
      label: "Proposal",
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
      ],
      capabilities: ["read", "write", "presentation"],
    },
  ],
  provides: {
    ports: [
      providePort(proposalInquiryConversionRuntimePort),
      providePort(proposalsRuntimePort),
      // Terms an accepted Proposal Version stated, for finance's payment-policy
      // cascade. Provided from here rather than read by finance: the walk stops
      // inside `proposal_versions`, and finance may not depend on proposals.
      providePort(financeProposalsPaymentPolicyRuntimePort),
      providePort(customFieldValueLifecycleRuntimePort),
      providePort(customFieldValueOperationsRuntimePort),
    ],
  },
  api: [
    {
      id: "@voyant-travel/proposals#api",
      surface: "admin",
      mount: "proposals",
      openapi: { document: "proposals" },
      transactional: true,
      runtime: {
        entry: "@voyant-travel/proposals",
        export: "createProposalsVoyantRuntime",
      },
    },
  ],
  schema: [
    {
      id: "@voyant-travel/proposals#schema",
      source: "@voyant-travel/proposals/schema",
    },
  ],
  migrations: [
    {
      id: "@voyant-travel/proposals#migrations",
      source: "./migrations",
    },
  ],
  links: [
    {
      id: "@voyant-travel/proposals#linkable.proposal",
      kind: "linkable",
      source: "@voyant-travel/proposals/linkables",
    },
    {
      id: "@voyant-travel/proposals#linkable.proposalVersion",
      kind: "linkable",
      source: "@voyant-travel/proposals/linkables",
    },
  ],
  events: [
    {
      id: "@voyant-travel/proposals#event.proposal-created",
      eventType: "proposal.created",
      version: "1.0.0",
      payloadSchema: proposalChangedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "proposals", category: "domain" },
    },
    {
      id: "@voyant-travel/proposals#event.proposal-updated",
      eventType: "proposal.updated",
      version: "1.0.0",
      payloadSchema: proposalChangedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "proposals", category: "domain" },
    },
    {
      id: "@voyant-travel/proposals#event.proposal-deleted",
      eventType: "proposal.deleted",
      version: "1.0.0",
      payloadSchema: proposalChangedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "proposals", category: "domain" },
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/proposals#access.proposals",
        resource: "proposals",
        label: "Proposals",
        description: "Read and manage sales proposals, versions, and proposal state.",
        actions: [
          {
            action: "read",
            label: "Read proposals",
            description: "Read proposals, proposal versions, and proposal state.",
          },
          {
            action: "write",
            label: "Manage proposals",
            description:
              "Create, update, issue, accept, decline, or delete proposals and versions.",
            sensitive: true,
          },
        ],
      },
    ],
  },
  tools: [
    {
      id: "@voyant-travel/proposals#tool.list-proposals",
      name: "list_proposals",
      runtime: { entry: "@voyant-travel/proposals/tools", export: "listProposalsTool" },
      requiredScopes: ["proposals:read"],
      context: ["proposals"],
      risk: "low",
    },
    {
      id: "@voyant-travel/proposals#tool.get-proposal",
      name: "get_proposal",
      runtime: { entry: "@voyant-travel/proposals/tools", export: "getProposalTool" },
      requiredScopes: ["proposals:read"],
      context: ["proposals"],
      risk: "low",
    },
    {
      id: "@voyant-travel/proposals#tool.list-proposal-versions",
      name: "list_proposal_versions",
      runtime: { entry: "@voyant-travel/proposals/tools", export: "listProposalVersionsTool" },
      requiredScopes: ["proposals:read"],
      context: ["proposals"],
      risk: "low",
    },
    {
      id: "@voyant-travel/proposals#tool.get-proposal-version",
      name: "get_proposal_version",
      runtime: { entry: "@voyant-travel/proposals/tools", export: "getProposalVersionTool" },
      requiredScopes: ["proposals:read"],
      context: ["proposals"],
      risk: "low",
    },
    {
      id: "@voyant-travel/proposals#tool.list-proposal-pipelines",
      name: "list_proposal_pipelines",
      runtime: { entry: "@voyant-travel/proposals/tools", export: "listProposalPipelinesTool" },
      requiredScopes: ["proposals:read"],
      context: ["proposals"],
      risk: "low",
    },
    {
      id: "@voyant-travel/proposals#tool.list-proposal-stages",
      name: "list_proposal_stages",
      runtime: { entry: "@voyant-travel/proposals/tools", export: "listProposalStagesTool" },
      requiredScopes: ["proposals:read"],
      context: ["proposals"],
      risk: "low",
    },
    {
      id: "@voyant-travel/proposals#tool.create-proposal",
      name: "create_proposal",
      runtime: { entry: "@voyant-travel/proposals/tools", export: "createProposalTool" },
      requiredScopes: ["proposals:write"],
      context: ["proposals"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/proposals#tool.add-proposal-product",
      name: "add_proposal_product",
      runtime: { entry: "@voyant-travel/proposals/tools", export: "addProposalProductTool" },
      requiredScopes: ["proposals:write"],
      context: ["proposals"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/proposals#tool.snapshot-proposal-version",
      name: "snapshot_proposal_version",
      runtime: { entry: "@voyant-travel/proposals/tools", export: "snapshotProposalVersionTool" },
      requiredScopes: ["proposals:write"],
      context: ["proposals"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/proposals#tool.send-proposal-version",
      name: "send_proposal_version",
      runtime: { entry: "@voyant-travel/proposals/tools", export: "sendProposalVersionTool" },
      requiredScopes: ["proposals:write"],
      context: ["proposals"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/proposals#tool.accept-proposal-version",
      name: "accept_proposal_version",
      runtime: { entry: "@voyant-travel/proposals/tools", export: "acceptProposalVersionTool" },
      requiredScopes: ["proposals:write"],
      context: ["proposals"],
      risk: "high",
    },
    {
      id: "@voyant-travel/proposals#tool.decline-proposal-version",
      name: "decline_proposal_version",
      runtime: { entry: "@voyant-travel/proposals/tools", export: "declineProposalVersionTool" },
      requiredScopes: ["proposals:write"],
      context: ["proposals"],
      risk: "medium",
    },
  ],
  actions: [
    {
      id: "@voyant-travel/proposals#action.list-proposals",
      version: "v1",
      kind: "read",
      targetType: "proposal",
      requiredScopes: ["proposals:read"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/proposals#tool.list-proposals"] },
    },
    {
      id: "@voyant-travel/proposals#action.get-proposal",
      version: "v1",
      kind: "read",
      targetType: "proposal",
      requiredScopes: ["proposals:read"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/proposals#tool.get-proposal"] },
    },
    {
      id: "@voyant-travel/proposals#action.list-proposal-versions",
      version: "v1",
      kind: "read",
      targetType: "proposal-version",
      requiredScopes: ["proposals:read"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/proposals#tool.list-proposal-versions"] },
    },
    {
      id: "@voyant-travel/proposals#action.get-proposal-version",
      version: "v1",
      kind: "read",
      targetType: "proposal-version",
      requiredScopes: ["proposals:read"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/proposals#tool.get-proposal-version"] },
    },
    {
      id: "@voyant-travel/proposals#action.create-proposal",
      version: "v1",
      kind: "execute",
      targetType: "proposal",
      resource: "proposals",
      action: "write",
      requiredScopes: ["proposals:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      // Opening a proposal mints the target, so an exact retry has to claim the
      // original rather than open a second one.
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "proposal_create_command",
        resultReferenceType: "proposal",
        durability: "handler-command-claim-v1",
      },
      from: { tools: ["@voyant-travel/proposals#tool.create-proposal"] },
    },
    {
      id: "@voyant-travel/proposals#action.add-proposal-product",
      version: "v1",
      kind: "execute",
      targetType: "proposal",
      // A line belongs to a proposal that already exists; the proposal is the target,
      // matching how snapshot-proposal-version models the same relationship.
      commandTargetField: "proposalId",
      targetLifecycle: "existing",
      resource: "proposals",
      action: "write",
      requiredScopes: ["proposals:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      from: { tools: ["@voyant-travel/proposals#tool.add-proposal-product"] },
    },
    {
      id: "@voyant-travel/proposals#action.snapshot-proposal-version",
      version: "v1",
      kind: "execute",
      targetType: "proposal",
      commandTargetField: "proposalId",
      targetLifecycle: "existing",
      resource: "proposals",
      action: "write",
      requiredScopes: ["proposals:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      from: { tools: ["@voyant-travel/proposals#tool.snapshot-proposal-version"] },
    },
    {
      id: "@voyant-travel/proposals#action.send-proposal-version",
      version: "v1",
      kind: "execute",
      targetType: "proposal-version",
      commandTargetField: "proposalVersionId",
      resource: "proposals",
      action: "write",
      requiredScopes: ["proposals:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/proposals#tool.send-proposal-version"] },
    },
    {
      id: "@voyant-travel/proposals#action.accept-proposal-version",
      version: "v1",
      kind: "execute",
      targetType: "proposal-version",
      commandTargetField: "proposalVersionId",
      requiredScopes: ["proposals:write"],
      resource: "proposals",
      action: "write",
      risk: "high",
      ledger: "required",
      approval: "required",
      reversible: false,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      existingTarget: { durability: "handler-command-result-v1" },
      from: { tools: ["@voyant-travel/proposals#tool.accept-proposal-version"] },
    },
    {
      id: "@voyant-travel/proposals#action.decline-proposal-version",
      version: "v1",
      kind: "execute",
      targetType: "proposal-version",
      commandTargetField: "proposalVersionId",
      resource: "proposals",
      action: "write",
      requiredScopes: ["proposals:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/proposals#tool.decline-proposal-version"] },
    },
  ],
  admin: {
    compositionOrder: 100,
    runtime: {
      entry: "@voyant-travel/proposals-react/admin",
      export: "createSelectedProposalsAdminExtension",
    },
    copy: [
      {
        id: "@voyant-travel/proposals#admin.copy",
        namespace: "proposals.admin",
        fallbackLocale: "en",
        runtime: {
          entry: "@voyant-travel/proposals-react/i18n",
          export: "crmUiMessageDefinitions",
        },
      },
    ],
    routes: [
      {
        id: "@voyant-travel/proposals#admin.route.proposals-index",
        path: "/proposals",
        requiredScopes: ["proposals:read"],
        runtime: {
          entry: "@voyant-travel/proposals-react/admin",
          export: "createSelectedProposalsAdminExtension",
        },
      },
      {
        id: "@voyant-travel/proposals#admin.route.proposals-detail",
        path: "/proposals/$id",
        requiredScopes: ["proposals:read"],
        runtime: {
          entry: "@voyant-travel/proposals-react/admin",
          export: "createSelectedProposalsAdminExtension",
        },
      },
    ],
    nav: [
      {
        id: "@voyant-travel/proposals#admin.nav.proposals",
        routeId: "@voyant-travel/proposals#admin.route.proposals-index",
        label: {
          namespace: "proposals.admin",
          key: "proposalsBoardPage.title",
        },
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

export const proposalsBookingVoyantPlugin = defineExtension({
  id: "@voyant-travel/proposals#booking-extension",
  packageName: "@voyant-travel/proposals",
  localId: "proposals.booking-extension",
  api: [
    {
      id: "@voyant-travel/proposals#booking-extension.api",
      surface: "admin",
      mount: "bookings",
      openapi: { document: "proposals-booking" },
      runtime: {
        entry: "@voyant-travel/proposals/booking-extension",
        export: "proposalsBookingExtension",
      },
    },
  ],
  meta: {
    ownership: "package",
  },
})

export const proposalsPresentationVoyantExtension = defineExtension({
  id: "@voyant-travel/proposals#presentation-extension",
  packageName: "@voyant-travel/proposals",
  localId: "proposals.presentation-extension",
  requires: { capabilities: ["notifications.delivery"] },
  provides: { ports: [providePort(proposalsPresentationRuntimePort)] },
  runtimePorts: [
    requirePort(proposalsPresentationRuntimePort),
    requirePort(catalogBookingRuntimePort),
    requirePort(proposalsNotificationsRuntimePort, { optional: true }),
    { ...durableNotificationProviderPortReference, optional: true },
  ],
  tools: [
    {
      id: "@voyant-travel/proposals#presentation-extension.tool.accept-proposal-for-booking",
      name: "accept_proposal_for_booking",
      runtime: {
        entry: "@voyant-travel/proposals/tools",
        export: "acceptProposalForBookingTool",
      },
      requiredScopes: ["proposals:write"],
      context: ["proposalAcceptance"],
      risk: "high",
    },
    {
      id: "@voyant-travel/proposals#presentation-extension.tool.snapshot-and-send-proposal",
      name: "snapshot_and_send_proposal",
      runtime: {
        entry: "@voyant-travel/proposals/tools",
        export: "snapshotAndSendProposalTool",
      },
      requiredScopes: ["proposals:write", "notifications:send"],
      context: ["proposalDelivery"],
      risk: "high",
    },
  ],
  actions: [
    {
      id: "@voyant-travel/proposals#presentation-extension.action.accept-proposal-for-booking",
      version: "v1",
      kind: "execute",
      targetType: "proposal",
      commandTargetField: "proposalId",
      targetLifecycle: "existing",
      existingTarget: { durability: "handler-command-result-v1" },
      effectBoundary: "local",
      resource: "proposals",
      action: "write",
      requiredScopes: ["proposals:write"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      from: {
        tools: ["@voyant-travel/proposals#presentation-extension.tool.accept-proposal-for-booking"],
      },
    },
    {
      id: "@voyant-travel/proposals#presentation-extension.action.snapshot-and-send-proposal",
      version: "v2",
      kind: "execute",
      targetType: "proposal",
      commandTargetField: "proposalId",
      targetLifecycle: "existing",
      existingTarget: { durability: "handler-command-result-v1" },
      availability: {
        status: "unavailable",
        reasonCode: "provider-idempotency-unavailable",
        enableWhen: {
          selectedProviderPorts: {
            mode: "all",
            ports: [durableNotificationProviderPortReference.id],
          },
        },
      },
      effectBoundary: "multistage",
      durability: {
        strategy: "saga",
        testReference: "packages/proposals/tests/integration/proposal-delivery.test.ts",
      },
      resource: "proposals",
      action: "write",
      requiredScopes: ["proposals:write", "notifications:send"],
      risk: "high",
      ledger: "required",
      approval: "required",
      reversible: false,
      allowedActorTypes: ["staff"],
      from: {
        tools: ["@voyant-travel/proposals#presentation-extension.tool.snapshot-and-send-proposal"],
      },
    },
  ],
  events: [
    {
      id: "@voyant-travel/proposals#event.proposal-feedback-requested",
      eventType: "proposal.proposal_feedback.requested",
      version: "1.0.0",
      payloadSchema: {
        type: "object",
        required: ["proposalId", "proposalVersionId", "activityId", "message", "proposalUrl"],
        properties: {
          proposalId: { type: "string", minLength: 1 },
          proposalVersionId: { type: "string", minLength: 1 },
          activityId: { type: "string", minLength: 1 },
          message: { type: "string", minLength: 1, maxLength: 4000 },
          proposalUrl: { type: "string", minLength: 1 },
        },
        additionalProperties: false,
      },
      visibility: "internal",
      audit: { sourceModule: "proposals", category: "domain" },
    },
    {
      // Its own event rather than a `kind` on the one above: a decline reason
      // closes a deal and an edit request keeps it open, and a subscriber that
      // notifies an owner should not have to inspect a payload to tell them
      // apart.
      id: "@voyant-travel/proposals#event.proposal-feedback-declined",
      eventType: "proposal.proposal_feedback.declined",
      version: "1.0.0",
      payloadSchema: {
        type: "object",
        required: ["proposalId", "proposalVersionId", "activityId", "message", "proposalUrl"],
        properties: {
          proposalId: { type: "string", minLength: 1 },
          proposalVersionId: { type: "string", minLength: 1 },
          activityId: { type: "string", minLength: 1 },
          message: { type: "string", minLength: 1, maxLength: 4000 },
          proposalUrl: { type: "string", minLength: 1 },
        },
        additionalProperties: false,
      },
      visibility: "internal",
      audit: { sourceModule: "proposals", category: "domain" },
    },
  ],
  api: [
    {
      id: "@voyant-travel/proposals#presentation-extension.api.admin",
      surface: "admin",
      mount: "proposal-versions",
      openapi: { document: "proposals" },
      resource: "proposals",
      transactional: true,
      runtime: {
        entry: "@voyant-travel/proposals",
        export: "createProposalPresentationVoyantRuntime",
      },
    },
    {
      id: "@voyant-travel/proposals#presentation-extension.api.public",
      surface: "public",
      mount: "proposals",
      anonymous: true,
      transactional: true,
      // A proposal version id IS the shared link a customer was sent, and the
      // presentation is opened in their browser.
      publishable: true,
      openapi: { document: "proposals-public" },
      runtime: {
        entry: "@voyant-travel/proposals",
        export: "createProposalPresentationVoyantRuntime",
      },
    },
  ],
  presentations: [
    {
      id: "@voyant-travel/proposals#presentation.public",
      runtime: {
        entry: "@voyant-travel/proposals-react/public-routes",
        export: "createProposalsPublicRouteContribution",
      },
      contribution: "proposals",
      routes: [{ route: "/proposal/$proposalVersionId", member: "proposal" }],
    },
  ],
  meta: {
    ownership: "package",
  },
})

export const proposalsVersionSnapshotVoyantPlugin = defineExtension({
  id: "@voyant-travel/proposals#proposal-version-snapshot-extension",
  packageName: "@voyant-travel/proposals",
  localId: "proposals.proposal-version-snapshot-extension",
  provides: { ports: [providePort(proposalsSnapshotRuntimePort)] },
  runtimePorts: [requirePort(proposalsSnapshotRuntimePort)],
  api: [
    {
      id: "@voyant-travel/proposals#proposal-version-snapshot-extension.api",
      surface: "admin",
      mount: "trips",
      openapi: { document: "proposal-version-snapshot" },
      transactional: true,
      runtime: {
        entry: "@voyant-travel/proposals",
        export: "createProposalVersionSnapshotVoyantRuntime",
      },
    },
  ],
  meta: {
    ownership: "package",
  },
})

export default proposalsVoyantModule
