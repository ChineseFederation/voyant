import { defineModule } from "@voyant-travel/core/project"

const runtime = {
  entry: "@voyant-travel/navigation-preferences/api-runtime",
  export: "createNavigationPreferencesApiModule",
} as const

const adminRuntime = {
  entry: "@voyant-travel/navigation-preferences-react/settings",
  export: "createSelectedNavigationPreferencesAdminExtension",
} as const

export const navigationPreferencesVoyantModule = defineModule({
  id: "@voyant-travel/navigation-preferences",
  packageName: "@voyant-travel/navigation-preferences",
  localId: "navigation-preferences",
  api: [
    {
      id: "@voyant-travel/navigation-preferences#api.admin",
      surface: "admin",
      mount: "navigation-preferences",
      resource: "admin-navigation",
      authorization: "route",
      openapi: { document: "navigation-preferences" },
      runtime,
    },
  ],
  schema: [
    {
      id: "@voyant-travel/navigation-preferences#schema",
      source: "@voyant-travel/navigation-preferences/schema",
    },
  ],
  migrations: [
    {
      id: "@voyant-travel/navigation-preferences#migrations",
      source: "./migrations",
    },
  ],
  resources: [
    {
      id: "@voyant-travel/navigation-preferences#resource.database",
      kind: "database",
      required: true,
      config: { engine: "postgres" },
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/navigation-preferences#access.navigation-preferences",
        resource: "admin-navigation",
        label: "Navigation preferences",
        description: "View and manage organization navigation defaults.",
        actions: [
          {
            action: "read",
            label: "View navigation preferences",
            description: "View organization defaults and personal navigation overrides.",
          },
          {
            action: "write",
            label: "Manage organization navigation",
            description: "Set or provision organization navigation defaults.",
            sensitive: true,
          },
        ],
      },
    ],
  },
  tools: [
    {
      id: "@voyant-travel/navigation-preferences#tool.get-navigation-preferences",
      name: "get_navigation_preferences",
      runtime: {
        entry: "@voyant-travel/navigation-preferences/tools",
        export: "getNavigationPreferencesTool",
      },
      requiredScopes: ["admin-navigation:read"],
      context: ["navigationPreferences"],
      risk: "low",
    },
    {
      id: "@voyant-travel/navigation-preferences#tool.set-organization-navigation-preferences",
      name: "set_organization_navigation_preferences",
      runtime: {
        entry: "@voyant-travel/navigation-preferences/tools",
        export: "setOrganizationNavigationPreferencesTool",
      },
      requiredScopes: ["admin-navigation:write"],
      context: ["navigationPreferences"],
      risk: "high",
    },
    {
      id: "@voyant-travel/navigation-preferences#tool.set-my-navigation-preferences",
      name: "set_my_navigation_preferences",
      runtime: {
        entry: "@voyant-travel/navigation-preferences/tools",
        export: "setMyNavigationPreferencesTool",
      },
      requiredScopes: ["admin-navigation:write"],
      context: ["navigationPreferences"],
      risk: "medium",
    },
  ],
  actions: [
    {
      id: "@voyant-travel/navigation-preferences#action.get-navigation-preferences",
      version: "v1",
      kind: "read",
      targetType: "navigation-preferences",
      requiredScopes: ["admin-navigation:read"],
      risk: "low",
      ledger: "optional",
      allowedActorTypes: ["staff"],
      from: {
        tools: ["@voyant-travel/navigation-preferences#tool.get-navigation-preferences"],
      },
    },
    {
      id: "@voyant-travel/navigation-preferences#action.set-organization-navigation-preferences",
      capabilityId:
        "@voyant-travel/navigation-preferences#action.set-organization-navigation-preferences",
      version: "v1",
      kind: "execute",
      targetType: "organization-navigation-preferences",
      commandTargetField: "preferencesId",
      resource: "admin-navigation",
      action: "write",
      requiredScopes: ["admin-navigation:write"],
      risk: "high",
      ledger: "required",
      approval: "required",
      reversible: true,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      existingTarget: { durability: "handler-command-result-v1" },
      from: {
        tools: [
          "@voyant-travel/navigation-preferences#tool.set-organization-navigation-preferences",
        ],
      },
    },
    {
      id: "@voyant-travel/navigation-preferences#action.set-my-navigation-preferences",
      version: "v1",
      kind: "execute",
      targetType: "member-navigation-preferences",
      resource: "admin-navigation",
      action: "write",
      requiredScopes: ["admin-navigation:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: true,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: {
        tools: ["@voyant-travel/navigation-preferences#tool.set-my-navigation-preferences"],
      },
    },
  ],
  admin: {
    compositionOrder: 15,
    setupSteps: [
      {
        id: "@voyant-travel/navigation-preferences#setup.organization-navigation",
        skippable: true,
      },
    ],
    runtime: adminRuntime,
    routes: [
      {
        id: "@voyant-travel/navigation-preferences#admin.route.settings",
        path: "/settings/navigation",
        runtime: adminRuntime,
      },
    ],
  },
  lifecycle: {
    uninstall: { default: "retain-data", purge: "not-supported" },
  },
  meta: { ownership: "package" },
})

export default navigationPreferencesVoyantModule
