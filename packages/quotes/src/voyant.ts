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
import { checkoutInquiryRuntimePort } from "@voyant-travel/quotes-contracts/runtime-port"
import {
  quotesNotificationsRuntimePort,
  quotesProposalRuntimePort,
  quotesRuntimePort,
  quotesSnapshotRuntimePort,
} from "./runtime-port.js"

const durableNotificationProviderPortReference = {
  id: "notifications.durable-provider",
  conformance: {
    entry: "@voyant-travel/notifications/durable-provider-port",
    export: "durableNotificationProviderPort",
  },
} as const

const quoteChangedPayloadSchema = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string" } },
  additionalProperties: false,
} as const

/** Import-cheap deployment declarations owned by the quotes package. */
export const quotesVoyantModule = defineModule({
  id: "@voyant-travel/quotes",
  packageName: "@voyant-travel/quotes",
  localId: "quotes",
  runtimePorts: [requirePort(quotesRuntimePort)],
  customFieldTargets: [
    {
      id: "quote",
      namespace: "quotes",
      label: "Quote",
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
      providePort(checkoutInquiryRuntimePort),
      providePort(quotesRuntimePort),
      providePort(customFieldValueLifecycleRuntimePort),
      providePort(customFieldValueOperationsRuntimePort),
    ],
  },
  api: [
    {
      id: "@voyant-travel/quotes#api",
      surface: "admin",
      mount: "quotes",
      openapi: { document: "quotes" },
      transactional: true,
      runtime: {
        entry: "@voyant-travel/quotes",
        export: "createQuotesVoyantRuntime",
      },
    },
  ],
  schema: [
    {
      id: "@voyant-travel/quotes#schema",
      source: "@voyant-travel/quotes/schema",
    },
  ],
  migrations: [
    {
      id: "@voyant-travel/quotes#migrations",
      source: "./migrations",
    },
  ],
  links: [
    {
      id: "@voyant-travel/quotes#linkable.quote",
      kind: "linkable",
      source: "@voyant-travel/quotes/linkables",
    },
    {
      id: "@voyant-travel/quotes#linkable.quoteVersion",
      kind: "linkable",
      source: "@voyant-travel/quotes/linkables",
    },
  ],
  events: [
    {
      id: "@voyant-travel/quotes#event.quote-created",
      eventType: "quote.created",
      version: "1.0.0",
      payloadSchema: quoteChangedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "quotes", category: "domain" },
    },
    {
      id: "@voyant-travel/quotes#event.quote-updated",
      eventType: "quote.updated",
      version: "1.0.0",
      payloadSchema: quoteChangedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "quotes", category: "domain" },
    },
    {
      id: "@voyant-travel/quotes#event.quote-deleted",
      eventType: "quote.deleted",
      version: "1.0.0",
      payloadSchema: quoteChangedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "quotes", category: "domain" },
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/quotes#access.quotes",
        resource: "quotes",
        label: "Quotes",
        description: "Read and manage sales quotes, versions, and proposal state.",
        actions: [
          {
            action: "read",
            label: "Read quotes",
            description: "Read quotes, quote versions, and proposal state.",
          },
          {
            action: "write",
            label: "Manage quotes",
            description: "Create, update, issue, accept, decline, or delete quotes and versions.",
            sensitive: true,
          },
        ],
      },
    ],
  },
  tools: [
    {
      id: "@voyant-travel/quotes#tool.list-quotes",
      name: "list_quotes",
      runtime: { entry: "@voyant-travel/quotes/tools", export: "listQuotesTool" },
      requiredScopes: ["quotes:read"],
      context: ["quotes"],
      risk: "low",
    },
    {
      id: "@voyant-travel/quotes#tool.get-quote",
      name: "get_quote",
      runtime: { entry: "@voyant-travel/quotes/tools", export: "getQuoteTool" },
      requiredScopes: ["quotes:read"],
      context: ["quotes"],
      risk: "low",
    },
    {
      id: "@voyant-travel/quotes#tool.list-quote-pipelines",
      name: "list_quote_pipelines",
      runtime: { entry: "@voyant-travel/quotes/tools", export: "listQuotePipelinesTool" },
      requiredScopes: ["quotes:read"],
      context: ["quotes"],
      risk: "low",
    },
    {
      id: "@voyant-travel/quotes#tool.list-quote-stages",
      name: "list_quote_stages",
      runtime: { entry: "@voyant-travel/quotes/tools", export: "listQuoteStagesTool" },
      requiredScopes: ["quotes:read"],
      context: ["quotes"],
      risk: "low",
    },
    {
      id: "@voyant-travel/quotes#tool.create-quote",
      name: "create_quote",
      runtime: { entry: "@voyant-travel/quotes/tools", export: "createQuoteTool" },
      requiredScopes: ["quotes:write"],
      context: ["quotes"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/quotes#tool.add-quote-product",
      name: "add_quote_product",
      runtime: { entry: "@voyant-travel/quotes/tools", export: "addQuoteProductTool" },
      requiredScopes: ["quotes:write"],
      context: ["quotes"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/quotes#tool.snapshot-quote-version",
      name: "snapshot_quote_version",
      runtime: { entry: "@voyant-travel/quotes/tools", export: "snapshotQuoteVersionTool" },
      requiredScopes: ["quotes:write"],
      context: ["quotes"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/quotes#tool.send-quote-version",
      name: "send_quote_version",
      runtime: { entry: "@voyant-travel/quotes/tools", export: "sendQuoteVersionTool" },
      requiredScopes: ["quotes:write"],
      context: ["quotes"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/quotes#tool.accept-quote-version",
      name: "accept_quote_version",
      runtime: { entry: "@voyant-travel/quotes/tools", export: "acceptQuoteVersionTool" },
      requiredScopes: ["quotes:write"],
      context: ["quotes"],
      risk: "high",
    },
    {
      id: "@voyant-travel/quotes#tool.decline-quote-version",
      name: "decline_quote_version",
      runtime: { entry: "@voyant-travel/quotes/tools", export: "declineQuoteVersionTool" },
      requiredScopes: ["quotes:write"],
      context: ["quotes"],
      risk: "medium",
    },
  ],
  actions: [
    {
      id: "@voyant-travel/quotes#action.list-quotes",
      version: "v1",
      kind: "read",
      targetType: "quote",
      requiredScopes: ["quotes:read"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/quotes#tool.list-quotes"] },
    },
    {
      id: "@voyant-travel/quotes#action.get-quote",
      version: "v1",
      kind: "read",
      targetType: "quote",
      requiredScopes: ["quotes:read"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/quotes#tool.get-quote"] },
    },
    {
      id: "@voyant-travel/quotes#action.create-quote",
      version: "v1",
      kind: "execute",
      targetType: "quote",
      resource: "quotes",
      action: "write",
      requiredScopes: ["quotes:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      // Opening a quote mints the target, so an exact retry has to claim the
      // original rather than open a second one.
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "quote_create_command",
        resultReferenceType: "quote",
        durability: "handler-command-claim-v1",
      },
      from: { tools: ["@voyant-travel/quotes#tool.create-quote"] },
    },
    {
      id: "@voyant-travel/quotes#action.add-quote-product",
      version: "v1",
      kind: "execute",
      targetType: "quote",
      // A line belongs to a quote that already exists; the quote is the target,
      // matching how snapshot-quote-version models the same relationship.
      commandTargetField: "quoteId",
      targetLifecycle: "existing",
      resource: "quotes",
      action: "write",
      requiredScopes: ["quotes:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      from: { tools: ["@voyant-travel/quotes#tool.add-quote-product"] },
    },
    {
      id: "@voyant-travel/quotes#action.snapshot-quote-version",
      version: "v1",
      kind: "execute",
      targetType: "quote",
      commandTargetField: "quoteId",
      targetLifecycle: "existing",
      resource: "quotes",
      action: "write",
      requiredScopes: ["quotes:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      from: { tools: ["@voyant-travel/quotes#tool.snapshot-quote-version"] },
    },
    {
      id: "@voyant-travel/quotes#action.send-quote-version",
      version: "v1",
      kind: "execute",
      targetType: "quote-version",
      commandTargetField: "quoteVersionId",
      resource: "quotes",
      action: "write",
      requiredScopes: ["quotes:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/quotes#tool.send-quote-version"] },
    },
    {
      id: "@voyant-travel/quotes#action.accept-quote-version",
      version: "v1",
      kind: "execute",
      targetType: "quote-version",
      commandTargetField: "quoteVersionId",
      requiredScopes: ["quotes:write"],
      resource: "quotes",
      action: "write",
      risk: "high",
      ledger: "required",
      approval: "required",
      reversible: false,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/quotes#tool.accept-quote-version"] },
    },
    {
      id: "@voyant-travel/quotes#action.decline-quote-version",
      version: "v1",
      kind: "execute",
      targetType: "quote-version",
      commandTargetField: "quoteVersionId",
      resource: "quotes",
      action: "write",
      requiredScopes: ["quotes:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/quotes#tool.decline-quote-version"] },
    },
  ],
  admin: {
    compositionOrder: 100,
    runtime: {
      entry: "@voyant-travel/quotes-react/admin",
      export: "createSelectedQuotesAdminExtension",
    },
    copy: [
      {
        id: "@voyant-travel/quotes#admin.copy",
        namespace: "quotes.admin",
        fallbackLocale: "en",
        runtime: {
          entry: "@voyant-travel/quotes-react/i18n",
          export: "crmUiMessageDefinitions",
        },
      },
    ],
    routes: [
      {
        id: "@voyant-travel/quotes#admin.route.quotes-index",
        path: "/quotes",
        requiredScopes: ["quotes:read"],
        runtime: {
          entry: "@voyant-travel/quotes-react/admin",
          export: "createSelectedQuotesAdminExtension",
        },
      },
      {
        id: "@voyant-travel/quotes#admin.route.quotes-detail",
        path: "/quotes/$id",
        requiredScopes: ["quotes:read"],
        runtime: {
          entry: "@voyant-travel/quotes-react/admin",
          export: "createSelectedQuotesAdminExtension",
        },
      },
    ],
    nav: [
      {
        id: "@voyant-travel/quotes#admin.nav.quotes",
        routeId: "@voyant-travel/quotes#admin.route.quotes-index",
        label: {
          namespace: "quotes.admin",
          key: "quotesBoardPage.title",
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

export const quotesBookingVoyantPlugin = defineExtension({
  id: "@voyant-travel/quotes#booking-extension",
  packageName: "@voyant-travel/quotes",
  localId: "quotes.booking-extension",
  api: [
    {
      id: "@voyant-travel/quotes#booking-extension.api",
      surface: "admin",
      mount: "bookings",
      openapi: { document: "quotes-booking" },
      runtime: {
        entry: "@voyant-travel/quotes/booking-extension",
        export: "quotesBookingExtension",
      },
    },
  ],
  meta: {
    ownership: "package",
  },
})

export const quotesProposalVoyantPlugin = defineExtension({
  id: "@voyant-travel/quotes#proposal-extension",
  packageName: "@voyant-travel/quotes",
  localId: "quotes.proposal-extension",
  requires: { capabilities: ["notifications.delivery"] },
  provides: { ports: [providePort(quotesProposalRuntimePort)] },
  runtimePorts: [
    requirePort(quotesProposalRuntimePort),
    requirePort(quotesNotificationsRuntimePort, { optional: true }),
    { ...durableNotificationProviderPortReference, optional: true },
  ],
  tools: [
    {
      id: "@voyant-travel/quotes#proposal-extension.tool.snapshot-and-send-quote",
      name: "snapshot_and_send_quote",
      runtime: {
        entry: "@voyant-travel/quotes/tools",
        export: "snapshotAndSendQuoteTool",
      },
      requiredScopes: ["quotes:write", "notifications:send"],
      context: ["quoteDelivery"],
      risk: "high",
    },
  ],
  actions: [
    {
      id: "@voyant-travel/quotes#proposal-extension.action.snapshot-and-send-quote",
      version: "v2",
      kind: "execute",
      targetType: "quote",
      commandTargetField: "quoteId",
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
        testReference: "packages/quotes/tests/integration/quote-delivery.test.ts",
      },
      resource: "quotes",
      action: "write",
      requiredScopes: ["quotes:write", "notifications:send"],
      risk: "high",
      ledger: "required",
      approval: "required",
      reversible: false,
      allowedActorTypes: ["staff"],
      from: {
        tools: ["@voyant-travel/quotes#proposal-extension.tool.snapshot-and-send-quote"],
      },
    },
  ],
  events: [
    {
      id: "@voyant-travel/quotes#event.proposal-feedback-requested",
      eventType: "quote.proposal_feedback.requested",
      version: "1.0.0",
      payloadSchema: {
        type: "object",
        required: ["quoteId", "quoteVersionId", "activityId", "message", "proposalUrl"],
        properties: {
          quoteId: { type: "string", minLength: 1 },
          quoteVersionId: { type: "string", minLength: 1 },
          activityId: { type: "string", minLength: 1 },
          message: { type: "string", minLength: 1, maxLength: 4000 },
          proposalUrl: { type: "string", minLength: 1 },
        },
        additionalProperties: false,
      },
      visibility: "internal",
      audit: { sourceModule: "quotes", category: "domain" },
    },
  ],
  api: [
    {
      id: "@voyant-travel/quotes#proposal-extension.api.admin",
      surface: "admin",
      mount: "quote-versions",
      openapi: { document: "quotes" },
      resource: "quotes",
      transactional: true,
      runtime: {
        entry: "@voyant-travel/quotes",
        export: "createQuoteProposalVoyantRuntime",
      },
    },
    {
      id: "@voyant-travel/quotes#proposal-extension.api.public",
      surface: "public",
      mount: "proposals",
      anonymous: true,
      transactional: true,
      openapi: { document: "quotes-proposal-public" },
      runtime: {
        entry: "@voyant-travel/quotes",
        export: "createQuoteProposalVoyantRuntime",
      },
    },
  ],
  presentations: [
    {
      id: "@voyant-travel/quotes#presentation.public",
      runtime: {
        entry: "@voyant-travel/quotes-react/public-routes",
        export: "createQuotesPublicRouteContribution",
      },
    },
  ],
  meta: {
    ownership: "package",
  },
})

export const quotesVersionSnapshotVoyantPlugin = defineExtension({
  id: "@voyant-travel/quotes#quote-version-snapshot-extension",
  packageName: "@voyant-travel/quotes",
  localId: "quotes.quote-version-snapshot-extension",
  provides: { ports: [providePort(quotesSnapshotRuntimePort)] },
  runtimePorts: [requirePort(quotesSnapshotRuntimePort)],
  api: [
    {
      id: "@voyant-travel/quotes#quote-version-snapshot-extension.api",
      surface: "admin",
      mount: "trips",
      openapi: { document: "quote-version-snapshot" },
      transactional: true,
      runtime: {
        entry: "@voyant-travel/quotes",
        export: "createQuoteVersionSnapshotVoyantRuntime",
      },
    },
  ],
  meta: {
    ownership: "package",
  },
})

export default quotesVoyantModule
