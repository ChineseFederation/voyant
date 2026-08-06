import { defineModule } from "@voyant-travel/core/project"

const runtime = {
  entry: "@voyant-travel/webhook-delivery/api-runtime",
  export: "createOperatorWebhookVoyantRuntime",
} as const

const adminRuntime = {
  entry: "@voyant-travel/operator-settings-react/webhooks",
  export: "createSelectedOperatorWebhooksAdminExtension",
} as const

/** First-class operator-owned business-event webhook settings capability. */
export const operatorWebhooksVoyantModule = defineModule({
  id: "@voyant-travel/webhook-delivery",
  packageName: "@voyant-travel/webhook-delivery",
  localId: "operator-webhooks",
  runtime,
  api: [
    {
      id: "@voyant-travel/webhook-delivery#api.admin",
      surface: "admin",
      mount: "webhooks",
      resource: "webhooks",
      openapi: { document: "operator-webhooks" },
      runtime,
    },
  ],
  resources: [
    {
      id: "@voyant-travel/webhook-delivery#resource.database",
      kind: "database",
      required: true,
      config: { engine: "postgres" },
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/webhook-delivery#access.webhooks",
        resource: "webhooks",
        label: "Webhooks",
        description: "Manage operator business-event subscriptions and delivery history.",
        actions: [
          {
            action: "read",
            label: "View webhooks",
            description: "View subscriptions, event contracts, and delivery history.",
          },
          {
            action: "write",
            label: "Manage webhooks",
            description: "Create, update, test, rotate, and replay webhook subscriptions.",
            sensitive: true,
          },
          {
            action: "delete",
            label: "Delete webhooks",
            description: "Delete operator webhook subscriptions.",
            sensitive: true,
          },
        ],
      },
    ],
  },
  admin: {
    compositionOrder: 20,
    loading: "lazy-routes",
    runtime: adminRuntime,
    routes: [
      {
        id: "@voyant-travel/webhook-delivery#admin.route.settings",
        path: "/settings/webhooks",
        requiredScopes: ["webhooks:read"],
        runtime: adminRuntime,
      },
      {
        id: "@voyant-travel/webhook-delivery#admin.route.detail",
        path: "/settings/webhooks/$subscriptionId",
        requiredScopes: ["webhooks:read"],
        runtime: adminRuntime,
      },
    ],
  },
  lifecycle: {
    uninstall: { default: "retain-data", purge: "not-supported" },
  },
  meta: {
    ownership: "package",
    agentTools: {
      posture: "not-applicable",
      rationale: "Webhook administration is an infrastructure settings surface.",
    },
  },
})

export default operatorWebhooksVoyantModule
