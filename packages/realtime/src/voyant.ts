import {
  defineExtension,
  defineModule,
  providePort,
  requirePort,
} from "@voyant-travel/core/project"
import { realtimeRuntimePort } from "./runtime-port.js"

/** Import-cheap deployment declaration owned by the realtime package. */
export const realtimeVoyantModule = defineModule({
  id: "@voyant-travel/realtime",
  packageName: "@voyant-travel/realtime",
  localId: "realtime",
  provides: {
    ports: [
      { id: "realtime.transport" },
      { id: "realtime.admin-invalidation-publication" },
      providePort(realtimeRuntimePort),
    ],
  },
  runtimePorts: [requirePort(realtimeRuntimePort)],
  api: [
    {
      id: "@voyant-travel/realtime#api.admin",
      surface: "admin",
      mount: "realtime",
      resource: "realtime",
      openapi: { document: "realtime-admin" },
      runtime: {
        entry: "@voyant-travel/realtime",
        export: "createRealtimeVoyantRuntime",
      },
    },
    {
      id: "@voyant-travel/realtime#api.public",
      surface: "public",
      mount: "realtime",
      resource: "realtime",
      openapi: { document: "realtime-public" },
      // Mints a short-lived channel token for the caller's own session.
      publishable: true,
      runtime: {
        entry: "@voyant-travel/realtime",
        export: "createRealtimeVoyantRuntime",
      },
    },
  ],
  admin: {
    compositionOrder: 110,
    runtime: {
      entry: "@voyant-travel/realtime-react/admin",
      export: "createSelectedRealtimeAdminExtension",
    },
  },
  config: [
    {
      id: "@voyant-travel/realtime#config.voyant-cloud-base-url",
      key: "VOYANT_CLOUD_API_URL",
      required: false,
    },
    {
      id: "@voyant-travel/realtime#config.voyant-cloud-user-agent",
      key: "VOYANT_CLOUD_USER_AGENT",
      required: false,
    },
  ],
  secrets: [
    {
      id: "@voyant-travel/realtime#secret.voyant-cloud-api-key",
      key: "VOYANT_API_KEY",
      required: true,
      description: "Voyant Cloud API key used by the selected realtime transport.",
      rotation: "replace-only",
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/realtime#access.realtime",
        resource: "realtime",
        label: "Realtime",
        description: "Mint capability-scoped realtime client tokens.",
        actions: [
          {
            action: "write",
            label: "Connect to realtime",
            description: "Mint a short-lived capability-scoped realtime client token.",
          },
        ],
      },
    ],
  },
  providers: [
    {
      id: "@voyant-travel/realtime#provider.local",
      port: "realtime.transport",
      selection: { role: "realtime", value: "local" },
      runtime: {
        entry: "@voyant-travel/realtime/providers/local",
        export: "createLocalGraphRealtimeProvider",
      },
    },
    {
      id: "@voyant-travel/realtime#provider.voyant-cloud",
      port: "realtime.transport",
      selection: { role: "realtime", value: "voyant-cloud" },
      uses: {
        config: [
          "@voyant-travel/realtime#config.voyant-cloud-base-url",
          "@voyant-travel/realtime#config.voyant-cloud-user-agent",
        ],
        secrets: ["@voyant-travel/realtime#secret.voyant-cloud-api-key"],
      },
      runtime: {
        entry: "@voyant-travel/realtime/providers/voyant-cloud",
        export: "createVoyantCloudGraphRealtimeProvider",
      },
    },
  ],
  subscribers: [
    ["product.created", "realtimeProductCreatedInvalidationSubscriber"],
    ["product.updated", "realtimeProductUpdatedInvalidationSubscriber"],
    ["product.deleted", "realtimeProductDeletedInvalidationSubscriber"],
    ["product.content.changed", "realtimeProductContentChangedInvalidationSubscriber"],
    ["person.changed", "realtimePersonChangedInvalidationSubscriber"],
    ["organization.changed", "realtimeOrganizationChangedInvalidationSubscriber"],
    ["customer.signal.created", "realtimeCustomerSignalCreatedInvalidationSubscriber"],
    ["supplier.created", "realtimeSupplierCreatedInvalidationSubscriber"],
    ["supplier.updated", "realtimeSupplierUpdatedInvalidationSubscriber"],
    ["supplier.deleted", "realtimeSupplierDeletedInvalidationSubscriber"],
    ["invoice.issued", "realtimeInvoiceIssuedInvalidationSubscriber"],
    ["invoice.voided", "realtimeInvoiceVoidedInvalidationSubscriber"],
    ["invoice.settled", "realtimeInvoiceSettledInvalidationSubscriber"],
    ["invoice.proforma.issued", "realtimeInvoiceProformaIssuedInvalidationSubscriber"],
    ["invoice.proforma.converted", "realtimeInvoiceProformaConvertedInvalidationSubscriber"],
    ["contract.issued", "realtimeContractIssuedInvalidationSubscriber"],
    ["contract.sent", "realtimeContractSentInvalidationSubscriber"],
    ["contract.signed", "realtimeContractSignedInvalidationSubscriber"],
    ["contract.executed", "realtimeContractExecutedInvalidationSubscriber"],
    ["contract.voided", "realtimeContractVoidedInvalidationSubscriber"],
    ["cruise.created", "realtimeCruiseCreatedInvalidationSubscriber"],
    ["cruise.updated", "realtimeCruiseUpdatedInvalidationSubscriber"],
    ["cruise.deleted", "realtimeCruiseDeletedInvalidationSubscriber"],
    ["pricing.rule.changed", "realtimePricingRuleChangedInvalidationSubscriber"],
    ["promotion.changed", "realtimePromotionChangedInvalidationSubscriber"],
    ["booking.confirmed", "realtimeBookingConfirmedInvalidationSubscriber"],
    ["booking.cancelled", "realtimeBookingCancelledInvalidationSubscriber"],
    ["booking.refunded", "realtimeBookingRefundedInvalidationSubscriber"],
    ["payment.completed", "realtimePaymentCompletedInvalidationSubscriber"],
    ["availability.slot.changed", "realtimeAvailabilitySlotChangedInvalidationSubscriber"],
  ].map(([eventType, exportName]) => ({
    id: `@voyant-travel/realtime#subscriber.admin-invalidation.${eventType}`,
    eventType,
    source: "@voyant-travel/realtime/runtime",
    runtime: {
      entry: "@voyant-travel/realtime/runtime",
      export: exportName,
    },
  })),
  meta: {
    ownership: "package",
    agentTools: {
      posture: "not-applicable",
      rationale:
        "Realtime is a transport and invalidation module, not an agent-callable domain surface.",
    },
  },
})

/** Proposal-owned invalidations are selected only when both Proposals and Realtime are active. */
export const realtimeProposalsInvalidationVoyantExtension = defineExtension({
  id: "@voyant-travel/realtime#proposals-invalidation-extension",
  packageName: "@voyant-travel/realtime",
  localId: "realtime.proposals-invalidation-extension",
  subscribers: [
    ["proposal.created", "realtimeProposalCreatedInvalidationSubscriber"],
    ["proposal.updated", "realtimeProposalUpdatedInvalidationSubscriber"],
    ["proposal.deleted", "realtimeProposalDeletedInvalidationSubscriber"],
  ].map(([eventType, exportName]) => ({
    id: `@voyant-travel/realtime#subscriber.admin-invalidation.${eventType}`,
    eventType,
    source: "@voyant-travel/realtime/runtime",
    runtime: {
      entry: "@voyant-travel/realtime/runtime",
      export: exportName,
    },
  })),
  meta: {
    ownership: "standard-product",
  },
})

export default realtimeVoyantModule
