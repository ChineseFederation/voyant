import { defineModule } from "@voyant-travel/core/project"

const setupRuntime = {
  entry: "@voyant-travel/setup/api-runtime",
  export: "createSetupVoyantRuntime",
} as const

const setupLifecycleChangedEventPayloadSchema = {
  type: "object",
  properties: {
    change: {
      type: "string",
      enum: ["initialized", "step_completed", "step_skipped"],
    },
    stepId: { type: ["string", "null"] },
  },
  required: ["change", "stepId"],
  additionalProperties: false,
} as const

export const setupVoyantModule = defineModule({
  id: "@voyant-travel/setup",
  packageName: "@voyant-travel/setup",
  localId: "setup",
  api: [
    {
      id: "@voyant-travel/setup#api.admin",
      surface: "admin",
      mount: "setup",
      resource: "setup",
      authorization: "route",
      openapi: { document: "setup" },
      runtime: setupRuntime,
    },
  ],
  schema: [{ id: "@voyant-travel/setup#schema", source: "@voyant-travel/setup/schema" }],
  migrations: [{ id: "@voyant-travel/setup#migrations", source: "./migrations" }],
  resources: [
    {
      id: "@voyant-travel/setup#resource.database",
      kind: "database",
      required: true,
      config: { engine: "postgres" },
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/setup#access.setup",
        resource: "setup",
        label: "Setup",
        description: "View and update organization setup guidance state.",
        actions: [
          { action: "read", label: "View setup", description: "View setup progress." },
          {
            action: "write",
            label: "Manage setup",
            description: "Initialize, complete, and skip setup guidance steps.",
          },
        ],
      },
    ],
  },
  events: [
    {
      id: "@voyant-travel/setup#event.lifecycle-changed",
      eventType: "setup.lifecycle.changed",
      version: "1.0.0",
      payloadSchema: setupLifecycleChangedEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "setup", category: "internal" },
    },
  ],
  tools: [
    {
      id: "@voyant-travel/setup#tool.get-setup-state",
      name: "get_setup_state",
      runtime: { entry: "@voyant-travel/setup/tools", export: "getSetupStateTool" },
      requiredScopes: ["setup:read"],
      context: ["setup"],
      risk: "low",
    },
    {
      id: "@voyant-travel/setup#tool.initialize-setup",
      name: "initialize_setup",
      runtime: { entry: "@voyant-travel/setup/tools", export: "initializeSetupTool" },
      requiredScopes: ["setup:write"],
      context: ["setup"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/setup#tool.complete-setup-step",
      name: "complete_setup_step",
      runtime: { entry: "@voyant-travel/setup/tools", export: "completeSetupStepTool" },
      requiredScopes: ["setup:write"],
      context: ["setup"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/setup#tool.skip-setup-step",
      name: "skip_setup_step",
      runtime: { entry: "@voyant-travel/setup/tools", export: "skipSetupStepTool" },
      requiredScopes: ["setup:write"],
      context: ["setup"],
      risk: "medium",
    },
  ],
  actions: [
    {
      id: "@voyant-travel/setup#action.get-setup-state",
      version: "v1",
      kind: "read",
      targetType: "setup-state",
      requiredScopes: ["setup:read"],
      risk: "low",
      ledger: "optional",
      allowedActorTypes: ["staff"],
      from: { tools: ["@voyant-travel/setup#tool.get-setup-state"] },
    },
    {
      id: "@voyant-travel/setup#action.initialize-setup",
      version: "v1",
      kind: "execute",
      targetType: "setup-state",
      availability: {
        status: "unavailable",
        reasonCode: "unsafe-nontransactional-effect",
      },
      effectBoundary: "multistage",
      resource: "setup",
      action: "write",
      requiredScopes: ["setup:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      from: { tools: ["@voyant-travel/setup#tool.initialize-setup"] },
    },
    {
      id: "@voyant-travel/setup#action.complete-setup-step",
      version: "v1",
      kind: "execute",
      targetType: "setup-step",
      commandTargetField: "stepId",
      resource: "setup",
      action: "write",
      requiredScopes: ["setup:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/setup#tool.complete-setup-step"] },
    },
    {
      id: "@voyant-travel/setup#action.skip-setup-step",
      version: "v1",
      kind: "execute",
      targetType: "setup-step",
      commandTargetField: "stepId",
      resource: "setup",
      action: "write",
      requiredScopes: ["setup:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/setup#tool.skip-setup-step"] },
    },
  ],
  admin: {
    compositionOrder: -1000,
    runtime: {
      entry: "@voyant-travel/setup-react/admin",
      export: "createSelectedSetupAdminExtension",
    },
    routes: [
      {
        id: "@voyant-travel/setup#admin.route.setup",
        path: "/setup",
        runtime: {
          entry: "@voyant-travel/setup-react/admin",
          export: "createSelectedSetupAdminExtension",
        },
      },
    ],
  },
  lifecycle: { uninstall: { default: "retain-data", purge: "not-supported" } },
  meta: { ownership: "package" },
})

export default setupVoyantModule
