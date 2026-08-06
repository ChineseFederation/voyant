import { defineModule, providePort, requirePort } from "@voyant-travel/core/project"
import {
  customFieldsRuntimePort,
  customFieldValueLifecycleRuntimePort,
  customFieldValueOperationsRuntimePort,
  customFieldValueReaderRuntimePort,
} from "@voyant-travel/core/runtime-port"

export const customFieldsVoyantModule = defineModule({
  id: "@voyant-travel/custom-fields",
  packageName: "@voyant-travel/custom-fields",
  localId: "custom-fields",
  provides: { ports: [providePort(customFieldsRuntimePort)] },
  runtimePorts: [
    requirePort(customFieldValueReaderRuntimePort, {
      optional: true,
      cardinality: "many",
    }),
    requirePort(customFieldValueLifecycleRuntimePort, {
      optional: true,
      cardinality: "many",
    }),
    requirePort(customFieldValueOperationsRuntimePort, {
      optional: true,
      cardinality: "many",
    }),
  ],
  api: [
    {
      id: "@voyant-travel/custom-fields#api.admin",
      surface: "admin",
      mount: "custom-fields",
      openapi: { document: "custom-fields" },
      resource: "custom-fields",
      transactional: true,
      runtime: {
        entry: "@voyant-travel/custom-fields/api-runtime",
        export: "createCustomFieldsApiModule",
      },
    },
  ],
  schema: [
    {
      id: "@voyant-travel/custom-fields#schema",
      source: "@voyant-travel/custom-fields/schema",
    },
  ],
  migrations: [
    {
      id: "@voyant-travel/custom-fields#migrations",
      source: "./migrations",
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/custom-fields#access.custom-fields",
        resource: "custom-fields",
        label: "Custom fields",
        description: "Manage database-owned custom-field definitions.",
        actions: [
          {
            action: "read",
            label: "View custom fields",
            description: "View custom-field definitions and supported targets.",
          },
          {
            action: "write",
            label: "Manage custom fields",
            description: "Create and update custom-field definitions.",
            sensitive: true,
          },
          {
            action: "delete",
            label: "Delete custom fields",
            description: "Delete custom-field definitions.",
            sensitive: true,
          },
        ],
      },
    ],
  },
  admin: {
    compositionOrder: 15,
    loading: "lazy-routes",
    runtime: {
      entry: "@voyant-travel/custom-fields-react/admin",
      export: "createSelectedCustomFieldsAdminExtension",
    },
    routes: [
      {
        id: "@voyant-travel/custom-fields#admin.route.settings",
        path: "/settings/custom-fields",
        requiredScopes: ["custom-fields:read"],
        runtime: {
          entry: "@voyant-travel/custom-fields-react/admin",
          export: "createSelectedCustomFieldsAdminExtension",
        },
      },
    ],
  },
  lifecycle: { uninstall: { default: "retain-data", purge: "not-supported" } },
  meta: {
    ownership: "package",
    agentTools: {
      posture: "not-applicable",
      rationale:
        "Custom-field definition management is an authenticated Settings and domain API surface; this module does not expose agent Tools.",
    },
  },
})

export default customFieldsVoyantModule
