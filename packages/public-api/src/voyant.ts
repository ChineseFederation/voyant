// agent-quality: file-size exception -- storefront graph facets stay co-located so one import-cheap manifest remains authoritative.
import { customerBusinessAccountOnboardingRuntimePort } from "@voyant-travel/auth/ports"
import {
  catalogPublicationRuntimePort,
  catalogRuntimeServicesPort,
} from "@voyant-travel/catalog/ports"
import { defineModule, providePort, requirePort } from "@voyant-travel/core/project"

// Search route contracts are intentionally not imported into this import-cheap
// manifest; the runtime contributor resolves the real typed port.
const catalogSearchRuntimePortReference = { id: "catalog.search-runtime" } as const
const flightsRuntimePortReference = { id: "flights.runtime" } as const

// Lightweight reference (id only) so the deployment-graph manifest stays
// import-cheap — importing the real port from @voyant-travel/payments would
// pull the whole package into the manifest graph. Mirrors trips/voyant.ts.
const _paymentAdapterRuntimePortReference = {
  id: "payments.adapter.runtime",
} as const

import {
  publicApiCustomerPortalRuntimePort,
  publicApiIntakeRuntimePort,
  publicApiOffersRuntimePort,
} from "./runtime-port.js"
import {
  publicApiDynamicPackageSourceProviderPort,
  publicApiOpaqueReferenceIssuerPort,
  publicApiPresentationFxProviderPort,
  publicApiShoppingLiveProviderPort,
} from "./shopping/provider-ports.js"
import { publicApiShoppingRuntimePort } from "./shopping/runtime-port.js"

/** Import-cheap deployment declarations owned by the storefront package. */
export const publicApiVoyantModule = defineModule({
  id: "@voyant-travel/public-api",
  packageName: "@voyant-travel/public-api",
  localId: "public-api",
  provides: {
    capabilities: ["public-api.data-owner"],
    ports: [
      providePort(publicApiOffersRuntimePort),
      providePort(customerBusinessAccountOnboardingRuntimePort),
    ],
  },
  runtime: { entry: "@voyant-travel/public-api", export: "createPublicApiVoyantRuntime" },
  runtimePorts: [
    requirePort(publicApiOffersRuntimePort),
    requirePort(publicApiIntakeRuntimePort),
    requirePort(catalogPublicationRuntimePort),
    requirePort(publicApiShoppingRuntimePort, { optional: true }),
  ],
  subscribers: [
    {
      id: "@voyant-travel/public-api#subscriber.invalidate-departures-on-availability-change",
      eventType: "availability.slot.changed",
      source: "@voyant-travel/public-api",
      runtime: {
        entry: "@voyant-travel/public-api",
        export: "publicApiAvailabilityReadModelInvalidationSubscriber",
      },
    },
  ],
  api: [
    {
      id: "@voyant-travel/public-api#api.admin",
      surface: "admin",
      mount: "public-api",
      openapi: { document: "public-api" },
      runtime: {
        entry: "@voyant-travel/public-api",
        export: "createPublicApiModule",
      },
    },
    {
      id: "@voyant-travel/public-api#api.public",
      surface: "public",
      mount: "/",
      resource: "public-api",
      openapi: { document: "public-api" },
      anonymous: [
        "/bookings",
        "/departures",
        "/leads",
        "/newsletter",
        "/offers",
        "/shopping",
        "/settings",
      ],
      // Catalog, departures, offers and shopping are browser reads and
      // browser-driven composition. `/leads` and `/newsletter` are NOT here:
      // they capture a person with nothing challenging the submitter, so they
      // sit under `guardedIntake` and stay secret-key-only until the deployment
      // configures an intake guard.
      publishable: ["/bookings", "/departures", "/offers", "/products", "/shopping", "/settings"],
      guardedIntake: ["/leads", "/newsletter"],
      runtime: {
        entry: "@voyant-travel/public-api",
        export: "createPublicApiModule",
      },
    },
  ],
  resources: [
    {
      id: "@voyant-travel/public-api#resource.database",
      kind: "database",
      required: true,
      config: { engine: "postgres" },
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/public-api#access.public-api",
        resource: "public-api",
        label: "Storefront",
        description: "Manage storefront offers and customer intake.",
        actions: [
          {
            action: "read",
            label: "View storefront",
            description: "View storefront offers and customer intake.",
          },
          {
            action: "write",
            label: "Manage storefront",
            description: "Create and update storefront offers and customer intake.",
          },
        ],
      },
    ],
  },
  lifecycle: {
    uninstall: { default: "retain-data", purge: "not-supported" },
  },
  presentations: [
    {
      id: "@voyant-travel/public-api#presentation.customer",
      runtime: {
        entry: "@voyant-travel/public-api-react/public-api/presentation-routes",
        export: "createPublicApiPresentationContribution",
      },
      contribution: "publicApi",
      routes: [
        { route: "/(public-api)", member: "layout" },
        { route: "/(public-api)/shop", member: "shop" },
        { route: "/(public-api)/shop_/account", member: "account" },
        { route: "/(public-api)/shop_/account/sign-in", member: "accountSignIn" },
        { route: "/(public-api)/shop_/account/sign-up", member: "accountSignUp" },
        { route: "/(public-api)/shop_/account/verify-email", member: "accountVerifyEmail" },
        { route: "/(public-api)/shop_/composer", member: "composer" },
        { route: "/(public-api)/shop_/confirmation/$bookingId", member: "confirmation" },
        { route: "/(public-api)/shop_/products/$entityModule/$entityId", member: "productDetail" },
      ],
    },
  ],
  tools: [
    ["start-my-email-verification", "start_my_email_verification", "startMyEmailVerificationTool"],
    [
      "confirm-my-email-verification",
      "confirm_my_email_verification",
      "confirmMyEmailVerificationTool",
    ],
    ["start-my-sms-verification", "start_my_sms_verification", "startMySmsVerificationTool"],
    ["confirm-my-sms-verification", "confirm_my_sms_verification", "confirmMySmsVerificationTool"],
  ].map(([id, name, exportName]) => ({
    id: `@voyant-travel/public-api#tool.${id}`,
    name: name!,
    runtime: { entry: "@voyant-travel/public-api/tools", export: exportName! },
    requiredScopes: ["public-api:write"],
    context: ["customerVerification"],
    risk: "high" as const,
  })),
  actions: [
    {
      id: "@voyant-travel/public-api#action.start-my-verification",
      version: "v1",
      kind: "execute",
      targetType: "storefront-verification-challenge",
      availability: {
        status: "unavailable",
        reasonCode: "unsafe-nontransactional-effect",
      },
      effectBoundary: "multistage",
      resource: "public-api",
      action: "write",
      requiredScopes: ["public-api:write"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["customer"],
      from: {
        tools: [
          "@voyant-travel/public-api#tool.start-my-email-verification",
          "@voyant-travel/public-api#tool.start-my-sms-verification",
        ],
      },
    },
    {
      id: "@voyant-travel/public-api#action.confirm-my-verification",
      version: "v1",
      kind: "execute",
      targetType: "storefront-verification-challenge",
      resource: "public-api",
      action: "write",
      requiredScopes: ["public-api:write"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["customer"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: {
        tools: [
          "@voyant-travel/public-api#tool.confirm-my-email-verification",
          "@voyant-travel/public-api#tool.confirm-my-sms-verification",
        ],
      },
    },
  ],
  meta: {
    ownership: "package",
  },
})

export const publicApiCustomerPortalVoyantModule = defineModule({
  id: "@voyant-travel/public-api#customer-portal",
  packageName: "@voyant-travel/public-api",
  localId: "public-api.customer-portal",
  provides: { ports: [providePort(publicApiCustomerPortalRuntimePort)] },
  requires: { capabilities: ["public-api.data-owner"] },
  runtime: {
    entry: "@voyant-travel/public-api/customer-portal",
    export: "createCustomerPortalVoyantRuntime",
  },
  runtimePorts: [requirePort(publicApiCustomerPortalRuntimePort)],
  api: [
    {
      id: "@voyant-travel/public-api#customer-portal.api",
      surface: "public",
      mount: "customer-portal",
      resource: "public-api",
      openapi: { document: "customer-portal" },
      // No anonymous routes: the customer portal answers only for an
      // authenticated customer. `contact-exists` used to sit here and told any
      // caller whether an address had an account.
      // Publishable because the customer session — not the key — is what
      // selects whose data comes back; a leaked `vpk_` reads nobody.
      publishable: true,
      runtime: {
        entry: "@voyant-travel/public-api/customer-portal",
        export: "createCustomerPortalApiModule",
      },
    },
  ],
  tools: [
    [
      "get-my-customer-portal-profile",
      "get_my_customer_portal_profile",
      "getMyCustomerPortalProfileTool",
      "public-api:read",
      "high",
    ],
    [
      "update-my-customer-portal-profile",
      "update_my_customer_portal_profile",
      "updateMyCustomerPortalProfileTool",
      "public-api:write",
      "high",
    ],
    [
      "bootstrap-my-customer-portal",
      "bootstrap_my_customer_portal",
      "bootstrapMyCustomerPortalTool",
      "public-api:write",
      "high",
    ],
    [
      "list-my-customer-portal-bookings",
      "list_my_customer_portal_bookings",
      "listMyCustomerPortalBookingsTool",
      "public-api:read",
      "high",
    ],
    [
      "get-my-customer-portal-booking",
      "get_my_customer_portal_booking",
      "getMyCustomerPortalBookingTool",
      "public-api:read",
      "high",
    ],
    [
      "list-my-customer-portal-companions",
      "list_my_customer_portal_companions",
      "listMyCustomerPortalCompanionsTool",
      "public-api:read",
      "high",
    ],
    [
      "create-my-customer-portal-companion",
      "create_my_customer_portal_companion",
      "createMyCustomerPortalCompanionTool",
      "public-api:write",
      "high",
    ],
    [
      "update-my-customer-portal-companion",
      "update_my_customer_portal_companion",
      "updateMyCustomerPortalCompanionTool",
      "public-api:write",
      "high",
    ],
    [
      "import-my-booking-travelers-as-companions",
      "import_my_booking_travelers_as_companions",
      "importMyBookingTravelersAsCompanionsTool",
      "public-api:write",
      "high",
    ],
    [
      "list-my-customer-portal-documents",
      "list_my_customer_portal_documents",
      "listMyCustomerPortalDocumentsTool",
      "public-api:read",
      "high",
    ],
    [
      "create-my-customer-portal-document",
      "create_my_customer_portal_document",
      "createMyCustomerPortalDocumentTool",
      "public-api:write",
      "high",
    ],
    [
      "update-my-customer-portal-document",
      "update_my_customer_portal_document",
      "updateMyCustomerPortalDocumentTool",
      "public-api:write",
      "high",
    ],
    [
      "set-my-primary-customer-portal-document",
      "set_my_primary_customer_portal_document",
      "setMyPrimaryCustomerPortalDocumentTool",
      "public-api:write",
      "high",
    ],
  ].map(([id, name, exportName, scope, risk]) => ({
    id: `@voyant-travel/public-api#tool.${id}`,
    name: name!,
    runtime: { entry: "@voyant-travel/public-api/tools", export: exportName! },
    requiredScopes: [scope!],
    context: ["publicApiCustomerPortal"],
    risk: risk as "medium" | "high",
  })),
  actions: [
    {
      id: "@voyant-travel/public-api#action.inspect-my-customer-portal",
      version: "v1",
      kind: "sensitive-read",
      targetType: "customer-portal",
      resource: "public-api",
      action: "read",
      requiredScopes: ["public-api:read"],
      risk: "high",
      ledger: "required",
      approval: "never",
      allowedActorTypes: ["customer"],
      from: {
        tools: [
          "@voyant-travel/public-api#tool.get-my-customer-portal-profile",
          "@voyant-travel/public-api#tool.list-my-customer-portal-bookings",
          "@voyant-travel/public-api#tool.get-my-customer-portal-booking",
          "@voyant-travel/public-api#tool.list-my-customer-portal-companions",
          "@voyant-travel/public-api#tool.list-my-customer-portal-documents",
        ],
      },
    },
    {
      id: "@voyant-travel/public-api#action.update-my-customer-portal-profile",
      version: "v1",
      kind: "execute",
      targetType: "customer-profile",
      resource: "public-api",
      action: "write",
      requiredScopes: ["public-api:write"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: true,
      allowedActorTypes: ["customer"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/public-api#tool.update-my-customer-portal-profile"] },
    },
    {
      id: "@voyant-travel/public-api#action.bootstrap-my-customer-portal",
      version: "v1",
      kind: "execute",
      targetType: "customer-profile",
      resource: "public-api",
      action: "write",
      requiredScopes: ["public-api:write"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["customer"],
      availability: {
        status: "unavailable",
        reasonCode: "unsafe-unclaimed-create-target",
      },
      from: { tools: ["@voyant-travel/public-api#tool.bootstrap-my-customer-portal"] },
    },
    {
      id: "@voyant-travel/public-api#action.manage-my-customer-portal-companions",
      version: "v1",
      kind: "execute",
      targetType: "customer-companion",
      resource: "public-api",
      action: "write",
      requiredScopes: ["public-api:write"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: true,
      allowedActorTypes: ["customer"],
      availability: {
        status: "unavailable",
        reasonCode: "unsafe-unclaimed-create-target",
      },
      from: {
        tools: [
          "@voyant-travel/public-api#tool.create-my-customer-portal-companion",
          "@voyant-travel/public-api#tool.update-my-customer-portal-companion",
          "@voyant-travel/public-api#tool.import-my-booking-travelers-as-companions",
        ],
      },
    },
    {
      id: "@voyant-travel/public-api#action.manage-my-customer-portal-documents",
      version: "v1",
      kind: "execute",
      targetType: "customer-identity-document",
      resource: "public-api",
      action: "write",
      requiredScopes: ["public-api:write"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: true,
      allowedActorTypes: ["customer"],
      availability: {
        status: "unavailable",
        reasonCode: "unsafe-unclaimed-create-target",
      },
      from: {
        tools: [
          "@voyant-travel/public-api#tool.create-my-customer-portal-document",
          "@voyant-travel/public-api#tool.update-my-customer-portal-document",
          "@voyant-travel/public-api#tool.set-my-primary-customer-portal-document",
        ],
      },
    },
  ],
  meta: {
    ownership: "package",
  },
})

/**
 * Optional OSS composition unit. Selecting it binds the managed shopping
 * runtime only when all closed trust/supply/reference dependencies exist.
 */
export const publicApiShoppingProviderVoyantModule = defineModule({
  id: "@voyant-travel/public-api#shopping-provider",
  packageName: "@voyant-travel/public-api",
  localId: "public-api.shopping-provider",
  provides: { ports: [providePort(publicApiShoppingRuntimePort)] },
  runtime: {
    entry: "@voyant-travel/public-api/runtime-contributor",
    export: "createPublicApiRuntimePortContribution",
  },
  runtimePorts: [
    catalogSearchRuntimePortReference,
    requirePort(catalogRuntimeServicesPort),
    { ...flightsRuntimePortReference, optional: true },
    requirePort(publicApiShoppingLiveProviderPort, { optional: true }),
    requirePort(publicApiDynamicPackageSourceProviderPort, { optional: true }),
    requirePort(publicApiOpaqueReferenceIssuerPort),
    requirePort(publicApiPresentationFxProviderPort, { optional: true }),
  ],
  meta: {
    ownership: "package",
    agentTools: {
      posture: "not-applicable",
      rationale:
        "This module binds managed customer shopping ports; product domains own agent-facing Tools.",
    },
  },
})

export default publicApiVoyantModule
