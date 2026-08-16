import { defineModule, requirePort } from "@voyant-travel/core/project"

import { customerVerificationRuntimePort } from "./runtime-port.js"

/** Import-cheap deployment declaration owned by the identity package. */
export const identityVoyantModule = defineModule({
  id: "@voyant-travel/identity",
  packageName: "@voyant-travel/identity",
  localId: "identity",
  provides: { capabilities: ["identity.data-owner"] },
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
  links: [
    {
      id: "@voyant-travel/identity#linkable.customerVerificationChallenge",
      kind: "linkable",
      source: "@voyant-travel/identity/verification",
      export: "customerVerificationLinkable",
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
      availability: { status: "available" as const },
      effectBoundary: "local" as const,
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
      availability: { status: "available" as const },
      effectBoundary: "local" as const,
      targetLifecycle: "existing" as const,
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

export const customerVerificationVoyantModule = defineModule({
  id: "@voyant-travel/identity#verification",
  packageName: "@voyant-travel/identity",
  localId: "identity.verification",
  requires: { capabilities: ["identity.data-owner"] },
  runtime: {
    entry: "@voyant-travel/identity/verification",
    export: "createCustomerVerificationVoyantRuntime",
  },
  runtimePorts: [requirePort(customerVerificationRuntimePort)],
  api: [
    {
      id: "@voyant-travel/identity#verification.api",
      surface: "public",
      mount: "customer-verification",
      openapi: { document: "identity-verification" },
      anonymous: true,
      // OTP start/confirm from the browser. Per-destination cooldowns and a
      // per-challenge attempt limit are the challenge here, so this is not
      // unchallenged intake.
      publishable: true,
      runtime: {
        entry: "@voyant-travel/identity/verification",
        export: "createCustomerVerificationApiModule",
      },
    },
  ],
  meta: {
    ownership: "package",
    agentTools: {
      posture: "not-applicable",
      rationale:
        "The verification Tools live in @voyant-travel/public-api, not here. They act on the authenticated customer's OWN email or phone, which means resolving \"my\" through the customer portal's profile -- a composition of auth and customer records. Declaring them here would make identity depend on the layer above it (voyant#4627). This module owns the challenges themselves and exposes them as anonymous public routes.",
    },
  },
})

export default identityVoyantModule
