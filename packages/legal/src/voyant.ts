// agent-quality: file-size exception -- owner: legal; the import-cheap package manifest keeps routes, events, actions, setup, and runtime-port declarations co-located for deterministic graph review.
import { commerceLegalRuntimePort } from "@voyant-travel/commerce/runtime-port"
import {
  defineExtension,
  defineModule,
  providePort,
  requirePort,
} from "@voyant-travel/core/project"
import { legalContractDocumentJobRuntimePort } from "./contract-document-job-runtime-port.js"
import { legalContractDocumentRuntimePort } from "./contract-document-runtime-port.js"
import { legalDocumentArtifactProviderPort } from "./contracts/document-artifact-provider.js"
import {
  contractDocumentGeneratedEventPayloadSchema,
  contractExecutedEventPayloadSchema,
  contractIssuedEventPayloadSchema,
  contractSentEventPayloadSchema,
  contractSignedEventPayloadSchema,
  contractVoidedEventPayloadSchema,
} from "./event-payload-schemas.js"
import { legalRuntimePort } from "./runtime-port.js"

const legalAdminRuntime = {
  entry: "@voyant-travel/legal-react/admin",
  export: "createLegalAdminExtension",
} as const

const linkableSource = "@voyant-travel/legal/linkables"

const contractDocumentTools = [
  {
    id: "@voyant-travel/legal#tool.generate-booking-contract-document",
    name: "generate_booking_contract_document",
    runtime: {
      entry: "@voyant-travel/legal/tools",
      export: "generateBookingContractDocumentTool",
    },
    requiredScopes: ["legal:write"],
    context: ["legalContractDocument"],
    risk: "high" as const,
  },
  {
    id: "@voyant-travel/legal#tool.regenerate-booking-contract-document",
    name: "regenerate_booking_contract_document",
    runtime: {
      entry: "@voyant-travel/legal/tools",
      export: "regenerateBookingContractDocumentTool",
    },
    requiredScopes: ["legal:write"],
    context: ["legalContractDocument"],
    risk: "critical" as const,
  },
  {
    id: "@voyant-travel/legal#tool.resolve-contract-document-delivery",
    name: "resolve_contract_document_delivery",
    runtime: {
      entry: "@voyant-travel/legal/tools",
      export: "resolveContractDocumentDeliveryTool",
    },
    requiredScopes: ["legal:read"],
    context: ["legalContractDocument"],
    risk: "high" as const,
  },
] as const

const contractDocumentActions = [
  {
    id: "@voyant-travel/legal#action.generate-booking-contract-document",
    version: "v1",
    kind: "execute" as const,
    targetType: "booking",
    commandTargetField: "bookingId",
    targetLifecycle: "existing" as const,
    existingTarget: { durability: "handler-command-result-v1" as const },
    availability: {
      status: "unavailable" as const,
      reasonCode: "provider-not-conformant",
      enableWhen: {
        selectedProviderPorts: {
          mode: "all" as const,
          ports: [legalDocumentArtifactProviderPort.id],
        },
      },
    },
    effectBoundary: "multistage" as const,
    durability: {
      strategy: "outbox" as const,
      testReference: "packages/legal/tests/integration/document-operation.test.ts",
    },
    resource: "legal",
    action: "write",
    requiredScopes: ["legal:write"],
    risk: "high" as const,
    ledger: "required" as const,
    approval: "required" as const,
    policy: "legal.contract-document.v1",
    reversible: false,
    allowedActorTypes: ["staff" as const],
    from: { tools: ["@voyant-travel/legal#tool.generate-booking-contract-document"] },
  },
  {
    id: "@voyant-travel/legal#action.regenerate-booking-contract-document",
    version: "v1",
    kind: "execute" as const,
    targetType: "booking",
    commandTargetField: "bookingId",
    targetLifecycle: "existing" as const,
    existingTarget: { durability: "handler-command-result-v1" as const },
    availability: {
      status: "unavailable" as const,
      reasonCode: "provider-not-conformant",
      enableWhen: {
        selectedProviderPorts: {
          mode: "all" as const,
          ports: [legalDocumentArtifactProviderPort.id],
        },
      },
    },
    effectBoundary: "multistage" as const,
    durability: {
      strategy: "outbox" as const,
      testReference: "packages/legal/tests/integration/document-operation.test.ts",
    },
    resource: "legal",
    action: "write",
    requiredScopes: ["legal:write"],
    risk: "critical" as const,
    ledger: "required" as const,
    approval: "required" as const,
    policy: "legal.contract-document.v1",
    reversible: false,
    allowedActorTypes: ["staff" as const],
    from: { tools: ["@voyant-travel/legal#tool.regenerate-booking-contract-document"] },
  },
  {
    id: "@voyant-travel/legal#action.resolve-contract-document-delivery",
    version: "v1",
    kind: "sensitive-read" as const,
    targetType: "contract-document-delivery",
    resource: "legal",
    action: "read",
    requiredScopes: ["legal:read"],
    risk: "high" as const,
    ledger: "required" as const,
    approval: "never" as const,
    allowedActorTypes: ["staff" as const],
    from: { tools: ["@voyant-travel/legal#tool.resolve-contract-document-delivery"] },
  },
] as const

const contractDocumentJobs = [
  {
    id: "legal.contract-document-operations",
    schedule: { every: "1m", overlap: "skip" as const },
    scheduling: {
      required: true,
      profiles: {
        eager: { every: "1m", overlap: "skip" as const },
        economical: { every: "5m", overlap: "skip" as const },
        "scale-to-zero": { cron: "*/15 * * * *", overlap: "skip" as const },
      },
    },
    wakeup: true,
    runtime: {
      entry: "@voyant-travel/legal/contract-document-job",
      export: "runDueLegalContractDocumentOperationsJob",
    },
  },
] as const

/** Import-cheap deployment declaration owned by the legal package. */
export const legalVoyantModule = defineModule({
  id: "@voyant-travel/legal",
  packageName: "@voyant-travel/legal",
  localId: "legal",
  provides: {
    ports: [
      providePort(commerceLegalRuntimePort),
      providePort(legalRuntimePort),
      providePort(legalContractDocumentRuntimePort),
      providePort(legalDocumentArtifactProviderPort),
      providePort(legalContractDocumentJobRuntimePort),
    ],
  },
  runtimePorts: [
    requirePort(legalRuntimePort),
    requirePort(legalContractDocumentRuntimePort),
    requirePort(legalDocumentArtifactProviderPort, { optional: true }),
    requirePort(legalContractDocumentJobRuntimePort),
  ],
  resources: [
    {
      id: "@voyant-travel/legal#resource.database",
      kind: "database",
      required: true,
    },
    {
      id: "@voyant-travel/legal#resource.document-storage",
      kind: "document-storage",
      required: true,
    },
    {
      id: "@voyant-travel/legal#resource.document-renderer",
      kind: "document-renderer",
      required: true,
    },
  ],
  providers: [
    {
      id: "@voyant-travel/legal#provider.document-artifact",
      port: legalDocumentArtifactProviderPort.id,
      selection: { role: "legalDocumentArtifact", value: "standard" },
      uses: {
        resources: [
          "@voyant-travel/legal#resource.database",
          "@voyant-travel/legal#resource.document-storage",
          "@voyant-travel/legal#resource.document-renderer",
        ],
      },
      runtime: {
        entry: "@voyant-travel/legal/runtime-contributor",
        export: "createLegalDocumentArtifactGraphProvider",
      },
    },
  ],
  api: [
    {
      id: "@voyant-travel/legal#api.admin",
      surface: "admin",
      mount: "legal",
      openapi: { document: "legal" },
      transactional: true,
      runtime: {
        entry: "@voyant-travel/legal",
        export: "createLegalVoyantRuntime",
      },
    },
    {
      id: "@voyant-travel/legal#api.contract-document",
      surface: "admin",
      resource: "legal",
      openapi: { document: "contract-document" },
      runtime: {
        entry: "@voyant-travel/legal/contract-document-routes",
        export: "createContractDocumentApiModule",
      },
    },
    {
      id: "@voyant-travel/legal#api.public",
      surface: "public",
      mount: "legal",
      openapi: { document: "legal" },
      anonymous: true,
      transactional: true,
      runtime: {
        entry: "@voyant-travel/legal",
        export: "createLegalVoyantRuntime",
      },
    },
  ],
  schema: [
    {
      id: "@voyant-travel/legal#schema",
      source: "@voyant-travel/legal/schema",
    },
  ],
  migrations: [
    {
      id: "@voyant-travel/legal#migrations",
      source: "./migrations",
    },
  ],
  links: [
    {
      id: "@voyant-travel/legal#linkable.contract",
      kind: "linkable",
      source: linkableSource,
      export: "contractLinkable",
    },
    {
      id: "@voyant-travel/legal#linkable.contractTemplate",
      kind: "linkable",
      source: linkableSource,
      export: "contractTemplateLinkable",
    },
    {
      id: "@voyant-travel/legal#linkable.policy",
      kind: "linkable",
      source: linkableSource,
      export: "policyLinkable",
    },
    {
      id: "@voyant-travel/legal#linkable.policyVersion",
      kind: "linkable",
      source: linkableSource,
      export: "policyVersionLinkable",
    },
    {
      id: "@voyant-travel/legal#linkable.policyAcceptance",
      kind: "linkable",
      source: linkableSource,
      export: "policyAcceptanceLinkable",
    },
    {
      id: "@voyant-travel/legal#linkable.term",
      kind: "linkable",
      source: linkableSource,
      export: "legalTermLinkable",
    },
    {
      id: "@voyant-travel/legal#link.contract-booking",
      kind: "definition",
      source: "@voyant-travel/legal/standard-links",
      export: "contractBookingLink",
    },
    {
      id: "@voyant-travel/legal#link.contract-organization",
      kind: "definition",
      source: "@voyant-travel/legal/standard-links",
      export: "contractOrganizationLink",
    },
    {
      id: "@voyant-travel/legal#link.contract-person",
      kind: "definition",
      source: "@voyant-travel/legal/standard-links",
      export: "contractPersonLink",
    },
    {
      id: "@voyant-travel/legal#link.contract-supplier",
      kind: "definition",
      source: "@voyant-travel/legal/standard-links",
      export: "contractSupplierLink",
    },
    {
      id: "@voyant-travel/legal#link.policy-acceptance-booking",
      kind: "definition",
      source: "@voyant-travel/legal/standard-links",
      export: "policyAcceptanceBookingLink",
    },
    {
      id: "@voyant-travel/legal#link.policy-product",
      kind: "definition",
      source: "@voyant-travel/legal/standard-links",
      export: "policyProductLink",
    },
  ],
  events: [
    {
      id: "@voyant-travel/legal#event.contract.issued",
      eventType: "contract.issued",
      version: "1.0.0",
      payloadSchema: contractIssuedEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "legal", category: "domain" },
    },
    {
      id: "@voyant-travel/legal#event.contract.sent",
      eventType: "contract.sent",
      version: "1.0.0",
      payloadSchema: contractSentEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "legal", category: "domain" },
    },
    {
      id: "@voyant-travel/legal#event.contract.signed",
      eventType: "contract.signed",
      version: "1.0.0",
      payloadSchema: contractSignedEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "legal", category: "domain" },
    },
    {
      id: "@voyant-travel/legal#event.contract.executed",
      eventType: "contract.executed",
      version: "1.0.0",
      payloadSchema: contractExecutedEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "legal", category: "domain" },
    },
    {
      id: "@voyant-travel/legal#event.contract.voided",
      eventType: "contract.voided",
      version: "1.0.0",
      payloadSchema: contractVoidedEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "legal", category: "domain" },
    },
    {
      id: "@voyant-travel/legal#event.contract.document.generated",
      eventType: "contract.document.generated",
      version: "1.0.0",
      payloadSchema: contractDocumentGeneratedEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "legal", category: "domain" },
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/legal#access.legal",
        resource: "legal",
        label: "Legal",
        description: "Manage contracts, templates, policies, and legal terms.",
        actions: [
          {
            action: "read",
            label: "View legal records",
            description: "View contracts, templates, policies, and legal terms.",
          },
          {
            action: "write",
            label: "Manage legal records",
            description: "Create and update contracts, templates, policies, and legal terms.",
          },
        ],
      },
    ],
  },
  tools: [
    ...[
      ["list-contracts", "list_legal_contracts", "listLegalContractsTool", "legal:read", "high"],
      ["get-contract", "get_legal_contract", "getLegalContractTool", "legal:read", "high"],
      [
        "create-contract-draft",
        "create_legal_contract_draft",
        "createLegalContractDraftTool",
        "legal:write",
        "high",
      ],
      [
        "list-contract-templates",
        "list_contract_templates",
        "listContractTemplatesTool",
        "legal:read",
        "high",
      ],
      [
        "get-contract-template",
        "get_contract_template",
        "getContractTemplateTool",
        "legal:read",
        "high",
      ],
      [
        "preview-contract-template",
        "preview_contract_template",
        "previewContractTemplateTool",
        "legal:read",
        "high",
      ],
      [
        "create-contract-template",
        "create_contract_template",
        "createContractTemplateTool",
        "legal:write",
        "high",
      ],
      [
        "update-contract-template",
        "update_contract_template",
        "updateContractTemplateTool",
        "legal:write",
        "high",
      ],
      ["list-policies", "list_legal_policies", "listLegalPoliciesTool", "legal:read", "high"],
      ["get-policy", "get_legal_policy", "getLegalPolicyTool", "legal:read", "high"],
      ["resolve-policy", "resolve_legal_policy", "resolveLegalPolicyTool", "legal:read", "high"],
      [
        "evaluate-cancellation-policy",
        "evaluate_cancellation_policy",
        "evaluateCancellationPolicyTool",
        "legal:read",
        "high",
      ],
      ["list-terms", "list_legal_terms", "listLegalTermsTool", "legal:read", "high"],
      ["get-term", "get_legal_term", "getLegalTermTool", "legal:read", "high"],
      [
        "list-contract-attachments",
        "list_contract_attachments",
        "listContractAttachmentsTool",
        "legal:read",
        "high",
      ],
      ["issue-contract", "issue_legal_contract", "issueLegalContractTool", "legal:write", "high"],
      ["send-contract", "send_legal_contract", "sendLegalContractTool", "legal:write", "high"],
      [
        "execute-contract",
        "execute_legal_contract",
        "executeLegalContractTool",
        "legal:write",
        "critical",
      ],
    ].map(([id, name, exportName, scope, risk]) => ({
      id: `@voyant-travel/legal#tool.${id}`,
      name: name!,
      runtime: { entry: "@voyant-travel/legal/tools", export: exportName! },
      requiredScopes: [scope!],
      context: ["legal"],
      risk: risk as "medium" | "high" | "critical",
    })),
    ...contractDocumentTools,
  ],
  actions: [
    {
      id: "@voyant-travel/legal#action.inspect-contracts",
      version: "v1",
      kind: "sensitive-read",
      targetType: "legal-contract",
      resource: "legal",
      action: "read",
      requiredScopes: ["legal:read"],
      risk: "high",
      ledger: "required",
      approval: "never",
      allowedActorTypes: ["staff"],
      from: {
        tools: [
          "@voyant-travel/legal#tool.list-contracts",
          "@voyant-travel/legal#tool.get-contract",
        ],
      },
    },
    {
      id: "@voyant-travel/legal#action.create-contract-draft",
      version: "v1",
      kind: "execute",
      targetType: "legal-contract",
      resource: "legal",
      action: "write",
      requiredScopes: ["legal:write"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "legal_contract_draft_create_command",
        resultReferenceType: "legal-contract",
        durability: "handler-command-claim-v1",
      },
      from: { tools: ["@voyant-travel/legal#tool.create-contract-draft"] },
    },
    {
      id: "@voyant-travel/legal#action.inspect-contract-templates",
      version: "v1",
      kind: "sensitive-read",
      targetType: "contract-template",
      resource: "legal",
      action: "read",
      requiredScopes: ["legal:read"],
      risk: "high",
      ledger: "required",
      approval: "never",
      allowedActorTypes: ["staff"],
      from: {
        tools: [
          "@voyant-travel/legal#tool.list-contract-templates",
          "@voyant-travel/legal#tool.get-contract-template",
          "@voyant-travel/legal#tool.preview-contract-template",
        ],
      },
    },
    {
      id: "@voyant-travel/legal#action.author-contract-template",
      version: "v1",
      kind: "execute",
      targetType: "contract-template",
      resource: "legal",
      action: "write",
      requiredScopes: ["legal:write"],
      risk: "high",
      ledger: "required",
      approval: "required",
      reversible: true,
      allowedActorTypes: ["staff"],
      availability: {
        status: "unavailable",
        reasonCode: "unsafe-unclaimed-create-target",
      },
      from: {
        tools: [
          "@voyant-travel/legal#tool.create-contract-template",
          "@voyant-travel/legal#tool.update-contract-template",
        ],
      },
    },
    {
      id: "@voyant-travel/legal#action.inspect-policies",
      version: "v1",
      kind: "sensitive-read",
      targetType: "legal-policy",
      resource: "legal",
      action: "read",
      requiredScopes: ["legal:read"],
      risk: "high",
      ledger: "required",
      approval: "never",
      allowedActorTypes: ["staff"],
      from: {
        tools: [
          "@voyant-travel/legal#tool.list-policies",
          "@voyant-travel/legal#tool.get-policy",
          "@voyant-travel/legal#tool.resolve-policy",
          "@voyant-travel/legal#tool.evaluate-cancellation-policy",
        ],
      },
    },
    {
      id: "@voyant-travel/legal#action.inspect-terms",
      version: "v1",
      kind: "sensitive-read",
      targetType: "legal-term",
      resource: "legal",
      action: "read",
      requiredScopes: ["legal:read"],
      risk: "high",
      ledger: "required",
      approval: "never",
      allowedActorTypes: ["staff"],
      from: {
        tools: ["@voyant-travel/legal#tool.list-terms", "@voyant-travel/legal#tool.get-term"],
      },
    },
    {
      id: "@voyant-travel/legal#action.inspect-contract-attachments",
      version: "v1",
      kind: "sensitive-read",
      targetType: "contract-attachment",
      resource: "legal",
      action: "read",
      requiredScopes: ["legal:read"],
      risk: "high",
      ledger: "required",
      approval: "never",
      allowedActorTypes: ["staff"],
      from: { tools: ["@voyant-travel/legal#tool.list-contract-attachments"] },
    },
    ...(
      [
        ["issue", "issue-contract", "high"],
        ["send", "send-contract", "high"],
        ["execute", "execute-contract", "critical"],
      ] as const
    ).map(([transition, tool, risk]) => ({
      id: `@voyant-travel/legal#action.${transition}-contract`,
      version: "v1",
      kind: "execute" as const,
      targetType: "legal-contract",
      commandTargetField: "contractId",
      targetLifecycle: "existing" as const,
      existingTarget: { durability: "handler-command-result-v1" as const },
      availability: { status: "available" as const },
      effectBoundary: "multistage" as const,
      durability: {
        strategy: "outbox" as const,
        testReference: "packages/legal/tests/integration/contract-lifecycle-command.test.ts",
      },
      resource: "legal",
      action: "write",
      requiredScopes: ["legal:write"],
      risk,
      ledger: "required" as const,
      approval: "required" as const,
      policy: "legal.contract-lifecycle.v1",
      reversible: false,
      allowedActorTypes: ["staff"],
      from: { tools: [`@voyant-travel/legal#tool.${tool}`] },
    })),
    ...contractDocumentActions,
  ],
  jobs: contractDocumentJobs,
  admin: {
    compositionOrder: 60,
    setupSteps: [],
    runtime: {
      entry: "@voyant-travel/legal-react/admin",
      export: "createSelectedLegalAdminExtension",
    },
    copy: [
      {
        id: "@voyant-travel/legal#admin.copy",
        namespace: "legal.admin",
        fallbackLocale: "en",
        runtime: {
          entry: "@voyant-travel/legal-react/i18n",
          export: "legalUiMessageDefinitions",
        },
      },
    ],
    routes: (
      [
        ["index", "/legal"],
        ["contracts-index", "/legal/contracts"],
        ["contracts-detail", "/legal/contracts/$id"],
        ["templates-index", "/legal/templates"],
        ["templates-detail", "/legal/templates/$id"],
        ["policies-index", "/legal/policies"],
        ["policies-detail", "/legal/policies/$id"],
        ["number-series", "/legal/number-series"],
      ] as const
    ).map(([id, path]) => ({
      id: `@voyant-travel/legal#admin.route.${id}`,
      path,
      requiredScopes: ["legal:read"],
      runtime: legalAdminRuntime,
    })),
    nav: [
      {
        id: "@voyant-travel/legal#admin.nav.contracts",
        routeId: "@voyant-travel/legal#admin.route.contracts-index",
        label: { namespace: "legal.admin", key: "contractsPage.title" },
      },
      {
        id: "@voyant-travel/legal#admin.nav.templates",
        routeId: "@voyant-travel/legal#admin.route.templates-index",
        label: { namespace: "legal.admin", key: "templatesPage.title" },
      },
      {
        id: "@voyant-travel/legal#admin.nav.policies",
        routeId: "@voyant-travel/legal#admin.route.policies-index",
        label: { namespace: "legal.admin", key: "policiesPage.title" },
      },
      {
        id: "@voyant-travel/legal#admin.nav.number-series",
        routeId: "@voyant-travel/legal#admin.route.number-series",
        label: { namespace: "legal.admin", key: "numberSeriesPage.title" },
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

/** Neutral association selected explicitly by the standard product BOM. */
export const legalStandardProductLinksVoyantExtension = defineExtension({
  id: "@voyant-travel/legal#standard-product-links",
  packageName: "@voyant-travel/legal",
  localId: "legal.standard-product-links",
  links: [
    {
      id: "@voyant-travel/legal#link.contract-invoice",
      kind: "definition",
      source: "@voyant-travel/legal/standard-links",
      export: "contractInvoiceLink",
    },
  ],
  meta: { ownership: "standard-product" },
})

export default legalVoyantModule
