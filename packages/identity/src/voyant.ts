import { defineModule } from "@voyant-travel/core/project"

/** Import-cheap deployment declaration owned by the identity package. */
export const identityVoyantModule = defineModule({
  id: "@voyant-travel/identity",
  packageName: "@voyant-travel/identity",
  localId: "identity",
  api: [
    {
      id: "@voyant-travel/identity#api.admin",
      surface: "admin",
      mount: "identity",
      resource: "identity",
      openapi: { document: "identity" },
      runtime: {
        entry: "@voyant-travel/identity",
        export: "identityApiModule",
      },
    },
  ],
  schema: [
    {
      id: "@voyant-travel/identity#schema",
      source: "@voyant-travel/identity/schema",
    },
  ],
  migrations: [
    {
      id: "@voyant-travel/identity#migrations",
      source: "./migrations",
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/identity#access.identity",
        resource: "identity",
        label: "Identity",
        description: "Manage reusable contact points, addresses, and named contacts.",
        actions: [
          {
            action: "read",
            label: "View identity records",
            description: "View contact points, addresses, and named contacts.",
          },
          {
            action: "write",
            label: "Manage identity records",
            description: "Create and update contact points, addresses, and named contacts.",
          },
          {
            action: "delete",
            label: "Delete identity records",
            description: "Delete contact points, addresses, and named contacts.",
            sensitive: true,
          },
        ],
      },
    ],
  },
  tools: [
    {
      id: "@voyant-travel/identity#tool.list-contact-points",
      name: "list_identity_contact_points",
      runtime: { entry: "@voyant-travel/identity/tools", export: "listIdentityContactPointsTool" },
      requiredScopes: ["identity:read"],
      context: ["identity"],
      risk: "high",
    },
    {
      id: "@voyant-travel/identity#tool.get-contact-point",
      name: "get_identity_contact_point",
      runtime: { entry: "@voyant-travel/identity/tools", export: "getIdentityContactPointTool" },
      requiredScopes: ["identity:read"],
      context: ["identity"],
      risk: "high",
    },
    {
      id: "@voyant-travel/identity#tool.create-contact-point",
      name: "create_identity_contact_point",
      runtime: { entry: "@voyant-travel/identity/tools", export: "createIdentityContactPointTool" },
      requiredScopes: ["identity:write"],
      context: ["identity"],
      risk: "high",
    },
    {
      id: "@voyant-travel/identity#tool.update-contact-point",
      name: "update_identity_contact_point",
      runtime: { entry: "@voyant-travel/identity/tools", export: "updateIdentityContactPointTool" },
      requiredScopes: ["identity:write"],
      context: ["identity"],
      risk: "high",
    },
    {
      id: "@voyant-travel/identity#tool.list-addresses",
      name: "list_identity_addresses",
      runtime: { entry: "@voyant-travel/identity/tools", export: "listIdentityAddressesTool" },
      requiredScopes: ["identity:read"],
      context: ["identity"],
      risk: "high",
    },
    {
      id: "@voyant-travel/identity#tool.get-address",
      name: "get_identity_address",
      runtime: { entry: "@voyant-travel/identity/tools", export: "getIdentityAddressTool" },
      requiredScopes: ["identity:read"],
      context: ["identity"],
      risk: "high",
    },
    {
      id: "@voyant-travel/identity#tool.create-address",
      name: "create_identity_address",
      runtime: { entry: "@voyant-travel/identity/tools", export: "createIdentityAddressTool" },
      requiredScopes: ["identity:write"],
      context: ["identity"],
      risk: "high",
    },
    {
      id: "@voyant-travel/identity#tool.update-address",
      name: "update_identity_address",
      runtime: { entry: "@voyant-travel/identity/tools", export: "updateIdentityAddressTool" },
      requiredScopes: ["identity:write"],
      context: ["identity"],
      risk: "high",
    },
    {
      id: "@voyant-travel/identity#tool.list-named-contacts",
      name: "list_identity_named_contacts",
      runtime: { entry: "@voyant-travel/identity/tools", export: "listIdentityNamedContactsTool" },
      requiredScopes: ["identity:read"],
      context: ["identity"],
      risk: "high",
    },
    {
      id: "@voyant-travel/identity#tool.get-named-contact",
      name: "get_identity_named_contact",
      runtime: { entry: "@voyant-travel/identity/tools", export: "getIdentityNamedContactTool" },
      requiredScopes: ["identity:read"],
      context: ["identity"],
      risk: "high",
    },
    {
      id: "@voyant-travel/identity#tool.create-named-contact",
      name: "create_identity_named_contact",
      runtime: { entry: "@voyant-travel/identity/tools", export: "createIdentityNamedContactTool" },
      requiredScopes: ["identity:write"],
      context: ["identity"],
      risk: "high",
    },
    {
      id: "@voyant-travel/identity#tool.update-named-contact",
      name: "update_identity_named_contact",
      runtime: { entry: "@voyant-travel/identity/tools", export: "updateIdentityNamedContactTool" },
      requiredScopes: ["identity:write"],
      context: ["identity"],
      risk: "high",
    },
  ],
  actions: [
    ...(
      [
        ["list-contact-points", "identity_contact_point"],
        ["get-contact-point", "identity_contact_point"],
        ["list-addresses", "identity_address"],
        ["get-address", "identity_address"],
        ["list-named-contacts", "identity_named_contact"],
        ["get-named-contact", "identity_named_contact"],
      ] as const
    ).map(([id, targetType]) => ({
      id: `@voyant-travel/identity#action.${id}`,
      version: "v1" as const,
      kind: "sensitive-read" as const,
      targetType,
      requiredScopes: ["identity:read"],
      risk: "high" as const,
      ledger: "required" as const,
      approval: "never" as const,
      reversible: false,
      from: { tools: [`@voyant-travel/identity#tool.${id}`] },
    })),
    ...(
      [
        ["create-contact-point", "identity_contact_point", "contact-point-create-command"],
        ["create-address", "identity_address", "address-create-command"],
        ["create-named-contact", "identity_named_contact", "named-contact-create-command"],
      ] as const
    ).map(([id, targetType, commandTargetType]) => ({
      id: `@voyant-travel/identity#action.${id}`,
      capabilityId: `@voyant-travel/identity#action.${id}`,
      version: "v1" as const,
      kind: "execute" as const,
      targetType,
      targetLifecycle: "created" as const,
      createdTarget: {
        commandTargetType,
        resultReferenceType: targetType,
        durability: "handler-command-claim-v1" as const,
        parentAnchor: { targetTypeField: "entityType", targetIdField: "entityId" },
      },
      requiredScopes: ["identity:write"],
      risk: "high" as const,
      ledger: "required" as const,
      approval: "never" as const,
      reversible: false,
      allowedActorTypes: ["staff"],
      from: { tools: [`@voyant-travel/identity#tool.${id}`] },
    })),
    ...(
      [
        ["update-contact-point", "identity_contact_point"],
        ["update-address", "identity_address"],
        ["update-named-contact", "identity_named_contact"],
      ] as const
    ).map(([id, targetType]) => ({
      id: `@voyant-travel/identity#action.${id}`,
      version: "v1" as const,
      kind: "execute" as const,
      targetType,
      commandTargetField: "id",
      requiredScopes: ["identity:write"],
      risk: "high" as const,
      ledger: "required" as const,
      approval: "never" as const,
      reversible: true,
      from: { tools: [`@voyant-travel/identity#tool.${id}`] },
    })),
  ],
  lifecycle: {
    uninstall: { default: "retain-data", purge: "not-supported" },
  },
  meta: {
    ownership: "package",
  },
})

export default identityVoyantModule
