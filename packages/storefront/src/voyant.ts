import { customerBusinessAccountOnboardingRuntimePort } from "@voyant-travel/auth/ports"
import { bookingsGuestVerificationRuntimePort } from "@voyant-travel/bookings/runtime-port"
import { defineModule, providePort, requirePort } from "@voyant-travel/core/project"

// Lightweight reference (id only) so the deployment-graph manifest stays
// import-cheap — importing the real port from @voyant-travel/payments would
// pull the whole package into the manifest graph. Mirrors trips/voyant.ts.
const paymentAdapterRuntimePortReference = {
  id: "payments.adapter.runtime",
} as const

import {
  storefrontCustomerPortalRuntimePort,
  storefrontIntakeRuntimePort,
  storefrontOffersRuntimePort,
  storefrontPaymentLinkRuntimePort,
  storefrontPaymentReconciliationJobRuntimePort,
  storefrontVerificationRuntimePort,
} from "./runtime-port.js"

/** Import-cheap deployment declarations owned by the storefront package. */
export const storefrontVoyantModule = defineModule({
  id: "@voyant-travel/storefront",
  packageName: "@voyant-travel/storefront",
  localId: "storefront",
  provides: {
    capabilities: ["storefront.data-owner"],
    ports: [
      providePort(storefrontOffersRuntimePort),
      providePort(customerBusinessAccountOnboardingRuntimePort),
    ],
  },
  runtime: { entry: "@voyant-travel/storefront", export: "createStorefrontVoyantRuntime" },
  runtimePorts: [
    requirePort(storefrontOffersRuntimePort),
    requirePort(storefrontIntakeRuntimePort),
  ],
  subscribers: [
    {
      id: "@voyant-travel/storefront#subscriber.invalidate-departures-on-availability-change",
      eventType: "availability.slot.changed",
      source: "@voyant-travel/storefront",
      runtime: {
        entry: "@voyant-travel/storefront",
        export: "storefrontAvailabilityReadModelInvalidationSubscriber",
      },
    },
  ],
  api: [
    {
      id: "@voyant-travel/storefront#api.admin",
      surface: "admin",
      mount: "storefront",
      openapi: { document: "storefront" },
      runtime: {
        entry: "@voyant-travel/storefront",
        export: "createStorefrontApiModule",
      },
    },
    {
      id: "@voyant-travel/storefront#api.public",
      surface: "public",
      mount: "/",
      resource: "storefront",
      openapi: { document: "storefront" },
      anonymous: ["/bookings", "/departures", "/leads", "/newsletter", "/offers", "/settings"],
      runtime: {
        entry: "@voyant-travel/storefront",
        export: "createStorefrontApiModule",
      },
    },
  ],
  schema: [
    {
      id: "@voyant-travel/storefront#schema",
      source: "@voyant-travel/storefront/verification/schema",
    },
  ],
  migrations: [
    {
      id: "@voyant-travel/storefront#migrations",
      source: "./migrations",
    },
  ],
  links: [
    {
      id: "@voyant-travel/storefront#linkable.storefrontVerificationChallenge",
      kind: "linkable",
      source: "@voyant-travel/storefront/verification",
      export: "storefrontVerificationLinkable",
    },
  ],
  resources: [
    {
      id: "@voyant-travel/storefront#resource.database",
      kind: "database",
      required: true,
      config: { engine: "postgres" },
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/storefront#access.storefront",
        resource: "storefront",
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
      id: "@voyant-travel/storefront#presentation.customer",
      runtime: {
        entry: "@voyant-travel/storefront-react/storefront",
        export: "createStorefrontPresentationContribution",
      },
      contribution: "storefront",
      routes: [
        { route: "/(storefront)", member: "layout" },
        { route: "/(storefront)/shop", member: "shop" },
        { route: "/(storefront)/shop_/account", member: "account" },
        { route: "/(storefront)/shop_/account/sign-in", member: "accountSignIn" },
        { route: "/(storefront)/shop_/account/sign-up", member: "accountSignUp" },
        { route: "/(storefront)/shop_/account/verify-email", member: "accountVerifyEmail" },
        { route: "/(storefront)/shop_/composer", member: "composer" },
        { route: "/(storefront)/shop_/confirmation/$bookingId", member: "confirmation" },
        { route: "/(storefront)/shop_/products/$entityModule/$entityId", member: "productDetail" },
      ],
    },
  ],
  meta: {
    ownership: "package",
    agentTools: {
      posture: "not-applicable",
      rationale:
        "The storefront root composes customer HTTP surfaces; submodules own agent capabilities.",
    },
  },
})

export const storefrontCustomerPortalVoyantModule = defineModule({
  id: "@voyant-travel/storefront#customer-portal",
  packageName: "@voyant-travel/storefront",
  localId: "storefront.customer-portal",
  provides: { ports: [providePort(storefrontCustomerPortalRuntimePort)] },
  requires: { capabilities: ["storefront.data-owner"] },
  runtime: {
    entry: "@voyant-travel/storefront/customer-portal",
    export: "createCustomerPortalVoyantRuntime",
  },
  runtimePorts: [requirePort(storefrontCustomerPortalRuntimePort)],
  api: [
    {
      id: "@voyant-travel/storefront#customer-portal.api",
      surface: "public",
      mount: "customer-portal",
      resource: "storefront",
      openapi: { document: "customer-portal" },
      // No anonymous routes: the customer portal answers only for an
      // authenticated customer. `contact-exists` used to sit here and told any
      // caller whether an address had an account.
      runtime: {
        entry: "@voyant-travel/storefront/customer-portal",
        export: "createCustomerPortalApiModule",
      },
    },
  ],
  tools: [
    [
      "get-my-customer-portal-profile",
      "get_my_customer_portal_profile",
      "getMyCustomerPortalProfileTool",
      "storefront:read",
      "high",
    ],
    [
      "update-my-customer-portal-profile",
      "update_my_customer_portal_profile",
      "updateMyCustomerPortalProfileTool",
      "storefront:write",
      "high",
    ],
    [
      "bootstrap-my-customer-portal",
      "bootstrap_my_customer_portal",
      "bootstrapMyCustomerPortalTool",
      "storefront:write",
      "high",
    ],
    [
      "list-my-customer-portal-bookings",
      "list_my_customer_portal_bookings",
      "listMyCustomerPortalBookingsTool",
      "storefront:read",
      "high",
    ],
    [
      "get-my-customer-portal-booking",
      "get_my_customer_portal_booking",
      "getMyCustomerPortalBookingTool",
      "storefront:read",
      "high",
    ],
    [
      "list-my-customer-portal-companions",
      "list_my_customer_portal_companions",
      "listMyCustomerPortalCompanionsTool",
      "storefront:read",
      "high",
    ],
    [
      "create-my-customer-portal-companion",
      "create_my_customer_portal_companion",
      "createMyCustomerPortalCompanionTool",
      "storefront:write",
      "high",
    ],
    [
      "update-my-customer-portal-companion",
      "update_my_customer_portal_companion",
      "updateMyCustomerPortalCompanionTool",
      "storefront:write",
      "high",
    ],
    [
      "import-my-booking-travelers-as-companions",
      "import_my_booking_travelers_as_companions",
      "importMyBookingTravelersAsCompanionsTool",
      "storefront:write",
      "high",
    ],
    [
      "list-my-customer-portal-documents",
      "list_my_customer_portal_documents",
      "listMyCustomerPortalDocumentsTool",
      "storefront:read",
      "high",
    ],
    [
      "create-my-customer-portal-document",
      "create_my_customer_portal_document",
      "createMyCustomerPortalDocumentTool",
      "storefront:write",
      "high",
    ],
    [
      "update-my-customer-portal-document",
      "update_my_customer_portal_document",
      "updateMyCustomerPortalDocumentTool",
      "storefront:write",
      "high",
    ],
    [
      "set-my-primary-customer-portal-document",
      "set_my_primary_customer_portal_document",
      "setMyPrimaryCustomerPortalDocumentTool",
      "storefront:write",
      "high",
    ],
  ].map(([id, name, exportName, scope, risk]) => ({
    id: `@voyant-travel/storefront#tool.${id}`,
    name: name!,
    runtime: { entry: "@voyant-travel/storefront/tools", export: exportName! },
    requiredScopes: [scope!],
    context: ["storefrontCustomerPortal"],
    risk: risk as "medium" | "high",
  })),
  actions: [
    {
      id: "@voyant-travel/storefront#action.inspect-my-customer-portal",
      version: "v1",
      kind: "sensitive-read",
      targetType: "customer-portal",
      resource: "storefront",
      action: "read",
      requiredScopes: ["storefront:read"],
      risk: "high",
      ledger: "required",
      approval: "never",
      allowedActorTypes: ["customer"],
      from: {
        tools: [
          "@voyant-travel/storefront#tool.get-my-customer-portal-profile",
          "@voyant-travel/storefront#tool.list-my-customer-portal-bookings",
          "@voyant-travel/storefront#tool.get-my-customer-portal-booking",
          "@voyant-travel/storefront#tool.list-my-customer-portal-companions",
          "@voyant-travel/storefront#tool.list-my-customer-portal-documents",
        ],
      },
    },
    {
      id: "@voyant-travel/storefront#action.update-my-customer-portal-profile",
      version: "v1",
      kind: "execute",
      targetType: "customer-profile",
      resource: "storefront",
      action: "write",
      requiredScopes: ["storefront:write"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: true,
      allowedActorTypes: ["customer"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/storefront#tool.update-my-customer-portal-profile"] },
    },
    {
      id: "@voyant-travel/storefront#action.bootstrap-my-customer-portal",
      version: "v1",
      kind: "execute",
      targetType: "customer-profile",
      resource: "storefront",
      action: "write",
      requiredScopes: ["storefront:write"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["customer"],
      availability: {
        status: "unavailable",
        reasonCode: "unsafe-unclaimed-create-target",
      },
      from: { tools: ["@voyant-travel/storefront#tool.bootstrap-my-customer-portal"] },
    },
    {
      id: "@voyant-travel/storefront#action.manage-my-customer-portal-companions",
      version: "v1",
      kind: "execute",
      targetType: "customer-companion",
      resource: "storefront",
      action: "write",
      requiredScopes: ["storefront:write"],
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
          "@voyant-travel/storefront#tool.create-my-customer-portal-companion",
          "@voyant-travel/storefront#tool.update-my-customer-portal-companion",
          "@voyant-travel/storefront#tool.import-my-booking-travelers-as-companions",
        ],
      },
    },
    {
      id: "@voyant-travel/storefront#action.manage-my-customer-portal-documents",
      version: "v1",
      kind: "execute",
      targetType: "customer-identity-document",
      resource: "storefront",
      action: "write",
      requiredScopes: ["storefront:write"],
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
          "@voyant-travel/storefront#tool.create-my-customer-portal-document",
          "@voyant-travel/storefront#tool.update-my-customer-portal-document",
          "@voyant-travel/storefront#tool.set-my-primary-customer-portal-document",
        ],
      },
    },
  ],
  meta: {
    ownership: "package",
  },
})

export const storefrontVerificationVoyantModule = defineModule({
  id: "@voyant-travel/storefront#verification",
  packageName: "@voyant-travel/storefront",
  localId: "storefront.verification",
  requires: { capabilities: ["storefront.data-owner"] },
  runtime: {
    entry: "@voyant-travel/storefront/verification",
    export: "createStorefrontVerificationVoyantRuntime",
  },
  runtimePorts: [requirePort(storefrontVerificationRuntimePort)],
  provides: {
    ports: [providePort(bookingsGuestVerificationRuntimePort)],
  },
  api: [
    {
      id: "@voyant-travel/storefront#verification.api",
      surface: "public",
      mount: "storefront-verification",
      openapi: { document: "storefront-verification" },
      anonymous: true,
      runtime: {
        entry: "@voyant-travel/storefront/verification",
        export: "createStorefrontVerificationApiModule",
      },
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
    id: `@voyant-travel/storefront#tool.${id}`,
    name: name!,
    runtime: { entry: "@voyant-travel/storefront/tools", export: exportName! },
    requiredScopes: ["storefront:write"],
    context: ["storefrontVerification"],
    risk: "high" as const,
  })),
  actions: [
    {
      id: "@voyant-travel/storefront#action.start-my-verification",
      version: "v1",
      kind: "execute",
      targetType: "storefront-verification-challenge",
      availability: {
        status: "unavailable",
        reasonCode: "unsafe-nontransactional-effect",
      },
      effectBoundary: "multistage",
      resource: "storefront",
      action: "write",
      requiredScopes: ["storefront:write"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["customer"],
      from: {
        tools: [
          "@voyant-travel/storefront#tool.start-my-email-verification",
          "@voyant-travel/storefront#tool.start-my-sms-verification",
        ],
      },
    },
    {
      id: "@voyant-travel/storefront#action.confirm-my-verification",
      version: "v1",
      kind: "execute",
      targetType: "storefront-verification-challenge",
      resource: "storefront",
      action: "write",
      requiredScopes: ["storefront:write"],
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
          "@voyant-travel/storefront#tool.confirm-my-email-verification",
          "@voyant-travel/storefront#tool.confirm-my-sms-verification",
        ],
      },
    },
  ],
  meta: {
    ownership: "package",
  },
})

export const storefrontPaymentLinkVoyantModule = defineModule({
  id: "@voyant-travel/storefront#payment-link",
  packageName: "@voyant-travel/storefront",
  localId: "storefront.payment-link",
  requires: { capabilities: ["storefront.data-owner"] },
  runtime: {
    entry: "@voyant-travel/storefront/payment-link",
    export: "createPaymentLinkVoyantRuntime",
  },
  runtimePorts: [
    requirePort(storefrontPaymentLinkRuntimePort),
    requirePort(storefrontPaymentReconciliationJobRuntimePort),
    // Optional: when a payment adapter is wired (self-host in-process OR the
    // managed remote adapter), the IPN webhook verifies + applies callbacks.
    { ...paymentAdapterRuntimePortReference, optional: true },
  ],
  api: [
    {
      id: "@voyant-travel/storefront#payment-link.api",
      surface: "public",
      mount: "/",
      resource: "storefront",
      openapi: { document: "payment-link" },
      anonymous: ["payment-link-config", "payment-link"],
      runtime: {
        entry: "@voyant-travel/storefront/payment-link",
        export: "createPaymentLinkApiModule",
      },
    },
  ],
  jobs: [
    {
      id: "storefront.reconcile-payment-sessions",
      schedule: { every: "1m", overlap: "skip" },
      scheduling: {
        required: true,
        profiles: {
          eager: { every: "1m", overlap: "skip" },
          economical: { every: "5m", overlap: "skip" },
          "scale-to-zero": { cron: "*/15 * * * *", overlap: "skip" },
        },
      },
      wakeup: true,
      runtime: {
        entry: "@voyant-travel/storefront/payment-reconciliation-job",
        export: "runPaymentAdapterReconciliationJob",
      },
    },
  ],
  tools: [
    {
      id: "@voyant-travel/storefront#tool.get-payment-link",
      name: "get_payment_link",
      runtime: { entry: "@voyant-travel/storefront/tools", export: "getPaymentLinkTool" },
      requiredScopes: ["storefront:read"],
      context: ["storefrontPaymentLink"],
      risk: "high",
    },
    {
      id: "@voyant-travel/storefront#tool.create-invoice-payment-link",
      name: "create_invoice_payment_link",
      runtime: {
        entry: "@voyant-travel/storefront/tools",
        export: "createInvoicePaymentLinkTool",
      },
      requiredScopes: ["storefront:write"],
      context: ["storefrontPaymentLink"],
      risk: "high",
    },
  ],
  actions: [
    {
      id: "@voyant-travel/storefront#action.inspect-payment-link",
      version: "v1",
      kind: "sensitive-read",
      targetType: "payment-link",
      resource: "storefront",
      action: "read",
      requiredScopes: ["storefront:read"],
      risk: "high",
      ledger: "required",
      approval: "never",
      allowedActorTypes: ["staff"],
      from: { tools: ["@voyant-travel/storefront#tool.get-payment-link"] },
    },
    {
      id: "@voyant-travel/storefront#action.create-invoice-payment-link",
      version: "v1",
      kind: "execute",
      targetType: "invoice",
      commandTargetField: "invoiceId",
      targetLifecycle: "existing",
      resource: "storefront",
      action: "write",
      requiredScopes: ["storefront:write"],
      risk: "high",
      ledger: "required",
      approval: "required",
      reversible: true,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      from: { tools: ["@voyant-travel/storefront#tool.create-invoice-payment-link"] },
    },
  ],
  meta: {
    ownership: "package",
  },
})

export default storefrontVoyantModule
