// agent-quality: file-size exception -- owner: finance; the package-owned deployment declarations remain centralized in one manifest.
import { actionLedgerFinanceDriftRuntimePort } from "@voyant-travel/action-ledger/runtime-port"
import {
  bookingActionSourceRuntimePort,
  bookingsCancellationPolicyRuntimePort,
  bookingsFinanceRuntimePort,
} from "@voyant-travel/bookings/runtime-port"
import {
  defineExtension,
  defineModule,
  providePort,
  requirePort,
  type VoyantGraphJsonObject,
} from "@voyant-travel/core/project"
import { customFieldsRuntimePort } from "@voyant-travel/core/runtime-port"
import {
  financeAppApiRuntimePort,
  financeDepartureProfitabilityRuntimePort,
} from "@voyant-travel/finance-contracts/runtime-port"
import {
  financeReceivablesDatasetDefinition,
  financeReportingTemplates,
  financeReportingWidgets,
} from "./reporting-definitions.js"
import {
  financeAccommodationsPaymentPolicyRuntimePort,
  financeCheckoutPaymentStartersRuntimePort,
  financeCruisesPaymentPolicyRuntimePort,
  financeDistributionPaymentPolicyRuntimePort,
  financeHostRuntimePort,
  financeInventoryPaymentPolicyRuntimePort,
  financeInvoiceSettlementPollerRuntimePort,
  financeNotificationsRuntimePort,
  financeOperatorSettingsRuntimePort,
  financeProposalsPaymentPolicyRuntimePort,
} from "./runtime-port.js"
import { financeVoyantAdmin } from "./voyant-admin.js"
import {
  bookingContractDocumentRequestedPayloadSchema,
  bookingCreatedPayloadSchema,
  bookingPaymentSchedulePaidPayloadSchema,
  invoiceDocumentGeneratedPayloadSchema,
  invoiceIssuanceExternalPayloadSchema,
  invoicePaymentRecordedExternalPayloadSchema,
  invoiceProformaConvertedExternalPayloadSchema,
  invoiceRenderedPayloadSchema,
  invoiceSettledPayloadSchema,
  invoiceVoidedExternalPayloadSchema,
  paymentCompletedPayloadSchema,
} from "./voyant-event-schemas.js"

const paymentAdapterRuntimePortReference = { id: "payments.adapter.runtime" } as const

/** Import-cheap deployment declaration owned by the finance package. */
export const financeVoyantModule = defineModule({
  id: "@voyant-travel/finance",
  packageName: "@voyant-travel/finance",
  localId: "finance",
  runtime: { entry: "@voyant-travel/finance", export: "createFinanceVoyantRuntime" },
  runtimePorts: [
    requirePort(financeHostRuntimePort),
    requirePort(customFieldsRuntimePort),
    requirePort(financeNotificationsRuntimePort),
    requirePort(financeOperatorSettingsRuntimePort),
    requirePort(financeCheckoutPaymentStartersRuntimePort, { optional: true }),
    { ...paymentAdapterRuntimePortReference, optional: true },
    requirePort(financeInvoiceSettlementPollerRuntimePort, {
      optional: true,
      cardinality: "many",
    }),
  ],
  provides: {
    capabilities: ["finance.data-owner", "finance.payment-sessions"],
    ports: [
      providePort(actionLedgerFinanceDriftRuntimePort),
      providePort(bookingsFinanceRuntimePort),
      providePort(bookingActionSourceRuntimePort),
      providePort(financeHostRuntimePort),
      providePort(financeAppApiRuntimePort),
      providePort(financeDepartureProfitabilityRuntimePort),
    ],
  },
  api: [
    {
      id: "@voyant-travel/finance#api.admin",
      surface: "admin",
      mount: "finance",
      openapi: { document: "finance" },
      transactional: true,
      runtime: {
        entry: "@voyant-travel/finance",
        export: "createFinanceApiModule",
      },
    },
    {
      id: "@voyant-travel/finance#api.public",
      surface: "public",
      mount: "finance",
      openapi: { document: "finance" },
      anonymous: [
        "/bookings",
        "/collections",
        "/payment-sessions",
        "/accountant",
        "/travel-credits",
      ],
      transactional: true,
      runtime: {
        entry: "@voyant-travel/finance",
        export: "createFinanceApiModule",
      },
    },
  ],
  schema: [
    {
      id: "@voyant-travel/finance#schema",
      source: "@voyant-travel/finance/schema",
    },
  ],
  reporting: {
    datasets: [
      {
        id: financeReceivablesDatasetDefinition.id,
        version: financeReceivablesDatasetDefinition.version,
        label: financeReceivablesDatasetDefinition.label,
        description: financeReceivablesDatasetDefinition.description,
        descriptor: financeReceivablesDatasetDefinition,
        requiredScopes: financeReceivablesDatasetDefinition.requiredScopes,
        runtime: {
          entry: "@voyant-travel/finance/reporting",
          export: "financeReceivablesDataset",
        },
      },
    ],
    widgets: financeReportingWidgets.map((widget) => ({
      id: widget.id,
      version: widget.version,
      label: widget.label,
      description: widget.description,
      datasetId: widget.query.dataset.id,
      ...(widget.query.dataset.version ? { datasetVersion: widget.query.dataset.version } : {}),
      query: {
        select: widget.query.select,
        filters: widget.query.filters,
        groupBy: widget.query.groupBy,
        orderBy: widget.query.orderBy,
        ...(widget.query.limit ? { limit: widget.query.limit } : {}),
      },
      visualization: {
        type: widget.visualization.type,
        options: omitUndefinedJsonOptions(widget.visualization.options),
      },
      defaultSize: widget.defaultSize,
      ...(widget.minimumSize ? { minSize: widget.minimumSize } : {}),
      ...(widget.maximumSize ? { maxSize: widget.maximumSize } : {}),
    })),
    templates: financeReportingTemplates.map((template) => ({
      id: template.id,
      version: template.version,
      label: template.label,
      description: template.description,
      requirements: template.widgets.map((widget) => ({
        kind: "widget" as const,
        id: widget.source.kind === "preset" ? widget.source.widgetId : widget.id,
      })),
      widgets: template.widgets.flatMap((widget) =>
        widget.source.kind === "preset"
          ? [
              {
                id: widget.id,
                widgetId: widget.source.widgetId,
                ...(widget.source.version ? { widgetVersion: widget.source.version } : {}),
                layout: widget.layout,
              },
            ]
          : [],
      ),
    })),
  },
  migrations: [
    {
      id: "@voyant-travel/finance#migrations",
      source: "./migrations",
    },
  ],
  links: [
    {
      id: "@voyant-travel/finance#linkable.creditNote",
      kind: "linkable",
      source: "@voyant-travel/finance/linkables",
    },
    {
      id: "@voyant-travel/finance#linkable.invoice",
      kind: "linkable",
      source: "@voyant-travel/finance/linkables",
    },
    {
      id: "@voyant-travel/finance#linkable.invoiceTemplate",
      kind: "linkable",
      source: "@voyant-travel/finance/linkables",
    },
    {
      id: "@voyant-travel/finance#linkable.supplierInvoice",
      kind: "linkable",
      source: "@voyant-travel/finance/linkables",
    },
  ],
  events: [
    {
      id: "@voyant-travel/finance#event.invoice.issued",
      eventType: "invoice.issued",
      version: "1.0.0",
      payloadSchema: invoiceIssuanceExternalPayloadSchema,
      visibility: "external",
      audit: { sourceModule: "finance", category: "domain" },
    },
    {
      id: "@voyant-travel/finance#event.invoice.proforma.issued",
      eventType: "invoice.proforma.issued",
      version: "1.0.0",
      payloadSchema: invoiceIssuanceExternalPayloadSchema,
      visibility: "external",
      audit: { sourceModule: "finance", category: "domain" },
    },
    {
      id: "@voyant-travel/finance#event.invoice.proforma.converted",
      eventType: "invoice.proforma.converted",
      version: "2.0.0",
      payloadSchema: invoiceProformaConvertedExternalPayloadSchema,
      visibility: "external",
      audit: { sourceModule: "finance", category: "domain" },
    },
    {
      id: "@voyant-travel/finance#event.invoice.voided",
      eventType: "invoice.voided",
      version: "2.0.0",
      payloadSchema: invoiceVoidedExternalPayloadSchema,
      visibility: "external",
      audit: { sourceModule: "finance", category: "domain" },
    },
    {
      id: "@voyant-travel/finance#event.invoice.settled",
      eventType: "invoice.settled",
      version: "1.0.0",
      payloadSchema: invoiceSettledPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "finance", category: "domain" },
    },
    {
      id: "@voyant-travel/finance#event.invoice.rendered",
      eventType: "invoice.rendered",
      version: "1.0.0",
      payloadSchema: invoiceRenderedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "finance", category: "domain" },
    },
    {
      id: "@voyant-travel/finance#event.invoice.document.generated",
      eventType: "invoice.document.generated",
      version: "1.0.0",
      payloadSchema: invoiceDocumentGeneratedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "finance", category: "domain" },
    },
    {
      id: "@voyant-travel/finance#event.invoice.payment.recorded",
      eventType: "invoice.payment.recorded",
      version: "2.0.0",
      payloadSchema: invoicePaymentRecordedExternalPayloadSchema,
      visibility: "external",
      audit: { sourceModule: "finance", category: "domain" },
    },
    {
      id: "@voyant-travel/finance#event.payment.completed",
      eventType: "payment.completed",
      version: "1.0.0",
      payloadSchema: paymentCompletedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "finance", category: "domain" },
    },
    {
      id: "@voyant-travel/finance#event.booking.created",
      eventType: "booking.created",
      version: "1.0.0",
      payloadSchema: bookingCreatedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "finance", category: "domain" },
    },
    {
      id: "@voyant-travel/finance#event.booking.contract-document.requested",
      eventType: "booking.contract_document.requested",
      version: "1.0.0",
      payloadSchema: bookingContractDocumentRequestedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "finance", category: "domain" },
    },
    {
      id: "@voyant-travel/finance#event.booking-payment-schedule.paid",
      eventType: "booking_payment_schedule.paid",
      version: "1.0.0",
      payloadSchema: bookingPaymentSchedulePaidPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "finance", category: "domain" },
    },
  ],
  webhooks: [
    {
      id: "@voyant-travel/finance#webhook.invoice-issued",
      direction: "outbound",
      eventId: "@voyant-travel/finance#event.invoice.issued",
    },
    {
      id: "@voyant-travel/finance#webhook.invoice-proforma-issued",
      direction: "outbound",
      eventId: "@voyant-travel/finance#event.invoice.proforma.issued",
    },
    {
      id: "@voyant-travel/finance#webhook.invoice-proforma-converted",
      direction: "outbound",
      eventId: "@voyant-travel/finance#event.invoice.proforma.converted",
    },
    {
      id: "@voyant-travel/finance#webhook.invoice-voided",
      direction: "outbound",
      eventId: "@voyant-travel/finance#event.invoice.voided",
    },
    {
      id: "@voyant-travel/finance#webhook.invoice-payment-recorded",
      direction: "outbound",
      eventId: "@voyant-travel/finance#event.invoice.payment.recorded",
    },
  ],
  setupMigrations: [
    {
      id: "@voyant-travel/finance#setup.vouchers-from-payment-instruments.v1",
      source: "@voyant-travel/finance/setup/travel-credits",
      runtime: {
        entry: "@voyant-travel/finance/setup/travel-credits",
        export: "runTravelCreditSetupMigration",
      },
      dependsOn: ["@voyant-travel/finance#migrations"],
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/finance#access.finance",
        resource: "finance",
        label: "Finance",
        description: "Read and manage invoices, payments, credits, and settlements.",
        actions: [
          {
            action: "read",
            label: "Read finance records",
            description: "Read invoices, payments, credits, and settlement state.",
          },
          {
            action: "write",
            label: "Manage finance records",
            description: "Create and update invoices, payments, credits, and settlements.",
            sensitive: true,
          },
          {
            action: "refund",
            label: "Issue invoice refunds",
            description: "Issue a credit note against an eligible invoice.",
            sensitive: true,
          },
          {
            action: "void",
            label: "Void invoices",
            description: "Irreversibly void an eligible invoice.",
            sensitive: true,
          },
        ],
      },
    ],
  },
  tools: [
    {
      id: "@voyant-travel/finance#tool.list-invoices",
      name: "list_invoices",
      runtime: { entry: "@voyant-travel/finance/tools", export: "listInvoicesTool" },
      requiredScopes: ["finance:read"],
      context: ["finance"],
      risk: "low",
    },
    {
      id: "@voyant-travel/finance#tool.get-invoice",
      name: "get_invoice",
      runtime: { entry: "@voyant-travel/finance/tools", export: "getInvoiceTool" },
      requiredScopes: ["finance:read"],
      context: ["finance"],
      risk: "low",
    },
    {
      id: "@voyant-travel/finance#tool.void-invoice",
      name: "void_invoice",
      runtime: { entry: "@voyant-travel/finance/tools", export: "voidInvoiceTool" },
      requiredScopes: ["finance:void"],
      context: ["finance"],
      risk: "critical",
    },
    {
      id: "@voyant-travel/finance#tool.issue-invoice-refund",
      name: "issue_invoice_refund",
      runtime: { entry: "@voyant-travel/finance/tools", export: "issueInvoiceRefundTool" },
      requiredScopes: ["finance:refund"],
      context: ["finance"],
      risk: "critical",
    },
    {
      id: "@voyant-travel/finance#tool.record-refund-settlement",
      name: "record_refund_settlement",
      runtime: {
        entry: "@voyant-travel/finance/tools",
        export: "recordRefundSettlementTool",
      },
      requiredScopes: ["finance:refund"],
      context: ["finance"],
      // `critical`, like issuing the refund itself: this is the leg where money
      // actually leaves. It is also the leg that cannot be undone by writing
      // another record.
      risk: "critical",
      // Declared rather than inferred. The trailing noun of these paths is
      // `refund-settlement`, but `/finance/payments/{paymentId}/refundable` and
      // `/finance/bookings/{bookingId}/refund-settlements` are reads that share
      // no noun with anything else finance exposes, so naming the write paths
      // explicitly is what keeps this Tool from claiming coverage it does not
      // have.
      adminWrites: [
        "/v1/admin/finance/refund-settlements",
        "/v1/admin/finance/refund-settlements/{id}",
        "/v1/admin/finance/refund-settlements/{id}/execute",
      ],
    },
    {
      id: "@voyant-travel/finance#tool.issue-invoice-from-booking",
      name: "issue_invoice_from_booking",
      runtime: {
        entry: "@voyant-travel/finance/tools",
        export: "issueInvoiceFromBookingTool",
      },
      requiredScopes: ["finance:write", "bookings:read"],
      context: ["finance"],
      risk: "high",
    },
    {
      id: "@voyant-travel/finance#tool.record-payment-dispute",
      name: "record_payment_dispute",
      runtime: {
        entry: "@voyant-travel/finance/tools",
        export: "recordPaymentDisputeTool",
      },
      requiredScopes: ["finance:write"],
      context: ["finance"],
      // `medium`, not `high`: recording a chargeback is a factual record of
      // something a processor already did. No money moves here — the money
      // moved when the card issuer pulled it — so what this changes is what the
      // booking honestly reports, which is the point.
      risk: "medium",
      // Declared rather than inferred: the trailing noun of `/finance/payments`
      // and `/finance/invoices/{id}/payments` is also `payment`, so the name
      // match reported recording a *payment* as covered by a Tool that only
      // records a dispute against one. This Tool fronts the dispute endpoints
      // and nothing else.
      adminWrites: [
        "/v1/admin/finance/payment-disputes",
        "/v1/admin/finance/payment-disputes/{id}",
      ],
    },
    {
      id: "@voyant-travel/finance#tool.preview-unsynced-proforma-from-booking",
      name: "preview_unsynced_proforma_from_booking",
      runtime: {
        entry: "@voyant-travel/finance/tools",
        export: "previewUnsyncedProformaFromBookingTool",
      },
      requiredScopes: ["finance:write", "bookings:read"],
      context: ["finance"],
      risk: "low",
    },
    {
      id: "@voyant-travel/finance#tool.invoice-booking",
      name: "invoice_booking",
      runtime: {
        entry: "@voyant-travel/finance/tools",
        export: "invoiceBookingTool",
      },
      requiredScopes: ["finance:write", "bookings:read"],
      context: ["finance"],
      risk: "high",
    },
    {
      id: "@voyant-travel/finance#tool.refund-cancelled-booking",
      name: "refund_cancelled_booking",
      runtime: {
        entry: "@voyant-travel/finance/tools",
        export: "refundCancelledBookingTool",
      },
      requiredScopes: ["finance:refund", "bookings:read"],
      context: ["finance"],
      risk: "critical",
    },
    {
      id: "@voyant-travel/finance#tool.issue-unsynced-proforma-from-booking",
      name: "issue_unsynced_proforma_from_booking",
      runtime: {
        entry: "@voyant-travel/finance/tools",
        export: "issueUnsyncedProformaFromBookingTool",
      },
      requiredScopes: ["finance:write", "bookings:read"],
      context: ["finance"],
      risk: "high",
    },
  ],
  actions: [
    {
      id: "@voyant-travel/finance#action.void-invoice",
      capabilityId: "@voyant-travel/finance#action.void-invoice",
      version: "v1",
      kind: "execute",
      targetType: "invoice",
      commandTargetField: "id",
      resource: "finance",
      action: "void",
      requiredScopes: ["finance:void"],
      risk: "critical",
      ledger: "required",
      approval: "required",
      reversible: false,
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      existingTarget: { durability: "handler-command-result-v1" },
      from: { tools: ["@voyant-travel/finance#tool.void-invoice"] },
    },
    {
      id: "@voyant-travel/finance#action.issue-invoice-refund",
      capabilityId: "finance:refund",
      version: "v1",
      kind: "execute",
      targetType: "invoice",
      commandTargetField: "invoiceId",
      resource: "finance",
      action: "refund",
      requiredScopes: ["finance:refund"],
      risk: "critical",
      ledger: "required",
      approval: "required",
      reversible: false,
      allowedActorTypes: ["staff", "system"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      existingTarget: { durability: "handler-command-result-v1" },
      from: { tools: ["@voyant-travel/finance#tool.issue-invoice-refund"] },
    },
    {
      id: "@voyant-travel/finance#action.refund-cancelled-booking",
      capabilityId: "finance:booking-cancellation-refund",
      version: "v1",
      kind: "execute",
      targetType: "booking",
      commandTargetField: "bookingId",
      resource: "finance",
      action: "refund",
      requiredScopes: ["finance:refund", "bookings:read"],
      risk: "critical",
      ledger: "required",
      approval: "required",
      reversible: false,
      allowedActorTypes: ["staff", "system"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      existingTarget: { durability: "handler-command-result-v1" },
      from: { tools: ["@voyant-travel/finance#tool.refund-cancelled-booking"] },
    },
    {
      id: "@voyant-travel/finance#action.record-refund-settlement",
      // Its own capability id because the graph keys one capability per action,
      // but not its own policy: `FINANCE_REFUND_SETTLEMENT_CAPABILITY` is spread
      // from `finance:refund`, so the grant it demands and the `required`
      // approval are the same values. The issue asked for the money leg to tie
      // into the existing approval "rather than inventing a second path", and
      // deriving it is what makes the two unable to drift.
      capabilityId: "finance:refund-settlement",
      version: "v1",
      kind: "execute",
      targetType: "credit_note",
      commandTargetField: "creditNoteId",
      resource: "finance",
      action: "refund",
      requiredScopes: ["finance:refund"],
      risk: "critical",
      ledger: "required",
      approval: "required",
      reversible: false,
      allowedActorTypes: ["staff", "system"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      existingTarget: { durability: "handler-command-result-v1" },
      from: { tools: ["@voyant-travel/finance#tool.record-refund-settlement"] },
    },
    {
      id: "@voyant-travel/finance#action.record-payment-dispute",
      capabilityId: "finance:payment-dispute-record",
      version: "v1",
      kind: "execute",
      targetType: "payment_session",
      commandTargetField: "paymentSessionId",
      resource: "finance",
      action: "write",
      requiredScopes: ["finance:write"],
      risk: "medium",
      ledger: "required",
      // `never`: the contest already happened at the processor and the record
      // only catches up with it. Gating that behind an approval would stall a
      // reconciliation sweep while the booking kept claiming money it no longer
      // holds — the exact failure this record exists to end.
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff", "system"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/finance#tool.record-payment-dispute"] },
    },
    {
      id: "@voyant-travel/finance#action.issue-invoice-from-booking",
      capabilityId: "finance:invoice-issue-from-booking",
      version: "v1",
      kind: "execute",
      targetType: "booking",
      commandTargetField: "bookingId",
      resource: "finance",
      action: "write",
      requiredScopes: ["finance:write", "bookings:read"],
      risk: "high",
      ledger: "required",
      approval: "required",
      reversible: false,
      allowedActorTypes: ["staff", "system"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      existingTarget: { durability: "handler-command-result-v1" },
      from: {
        tools: [
          "@voyant-travel/finance#tool.issue-invoice-from-booking",
          "@voyant-travel/finance#tool.issue-unsynced-proforma-from-booking",
          "@voyant-travel/finance#tool.invoice-booking",
        ],
      },
    },
  ],
  admin: financeVoyantAdmin,
  presentations: [
    {
      id: "@voyant-travel/finance#presentation.public",
      runtime: {
        entry: "@voyant-travel/finance-react/public-routes",
        export: "createFinancePublicRouteContribution",
      },
      contribution: "finance",
      routes: [
        { route: "/accountant/$token", member: "accountant" },
        { route: "/pay", member: "pay" },
        { route: "/pay_/$sessionId", member: "paymentLink" },
      ],
    },
  ],
  lifecycle: {
    uninstall: { default: "retain-data", purge: "not-supported" },
  },
  meta: {
    ownership: "package",
  },
})

// The booking-tax facets are two independent extensions so the selected-graph
// composition keeps them as separate composed extensions. Each `defineExtension`
// yields one composed extension keyed on its localId; declaring both api facets
// under a single extension would collapse them and drop the preview facet.
//
// Tax settings (GET/PATCH /tax-settings) live on the finance admin surface. On
// the managed runtime admin routes dispatch per-unit with prefix-first-match,
// so mounting them under `bookings` let the bookings `GET /{id}` route swallow
// `/tax-settings`; the finance surface already serves `/v1/admin/finance/*`
// settings safely.
export const financeBookingTaxSettingsVoyantPlugin = defineExtension({
  id: "@voyant-travel/finance#booking-tax-settings-extension",
  packageName: "@voyant-travel/finance",
  localId: "finance.booking-tax-settings-extension",
  runtime: { entry: "@voyant-travel/finance", export: "createBookingTaxSettingsVoyantRuntime" },
  runtimePorts: [requirePort(financeOperatorSettingsRuntimePort)],
  api: [
    {
      id: "@voyant-travel/finance#booking-tax-settings-extension.api",
      surface: "admin",
      mount: "finance",
      openapi: { document: "booking-tax-settings" },
      transactional: true,
      runtime: {
        entry: "@voyant-travel/finance",
        export: "createBookingTaxSettingsApiExtension",
      },
    },
  ],
  meta: {
    ownership: "package",
  },
})

// Tax preview (POST /tax-preview) stays on the bookings admin surface — POST
// does not collide with the bookings `GET /{id}` route and bookings-react
// consumes it at `/v1/admin/bookings/tax-preview`.
export const financeBookingTaxPreviewVoyantPlugin = defineExtension({
  id: "@voyant-travel/finance#booking-tax-preview-extension",
  packageName: "@voyant-travel/finance",
  localId: "finance.booking-tax-preview-extension",
  runtime: { entry: "@voyant-travel/finance", export: "createBookingTaxPreviewVoyantRuntime" },
  runtimePorts: [requirePort(financeOperatorSettingsRuntimePort)],
  api: [
    {
      id: "@voyant-travel/finance#booking-tax-preview-extension.api",
      surface: "admin",
      mount: "bookings",
      openapi: { document: "booking-tax-preview" },
      transactional: true,
      runtime: {
        entry: "@voyant-travel/finance",
        export: "createBookingTaxPreviewApiExtension",
      },
    },
  ],
  meta: {
    ownership: "package",
  },
})

export const financeBookingsCreateVoyantPlugin = defineExtension({
  id: "@voyant-travel/finance#bookings-create-extension",
  packageName: "@voyant-travel/finance",
  localId: "finance.bookings-create-extension",
  runtimePorts: [requirePort(bookingsCancellationPolicyRuntimePort)],
  tools: [
    {
      id: "@voyant-travel/finance#bookings-create-extension.tool.book-product",
      name: "book_product",
      runtime: { entry: "@voyant-travel/finance/tools", export: "bookProductTool" },
      requiredScopes: ["bookings:write", "finance:write"],
      context: ["finance"],
      risk: "high",
    },
    {
      id: "@voyant-travel/finance#bookings-create-extension.tool.create-booking",
      name: "create_booking",
      runtime: { entry: "@voyant-travel/finance/tools", export: "createBookingTool" },
      requiredScopes: ["bookings:write", "finance:write"],
      context: ["finance"],
      risk: "high",
    },
  ],
  actions: [
    {
      id: "@voyant-travel/finance#bookings-create-extension.action.create-booking",
      capabilityId: "@voyant-travel/finance#bookings-create-extension.action.create-booking",
      version: "v1",
      kind: "execute",
      targetType: "booking",
      availability: { status: "available" },
      effectBoundary: "multistage",
      durability: {
        strategy: "outbox",
        testReference: "tests/integration/booking-create.test.ts",
      },
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "finance_booking_create_command",
        resultReferenceType: "booking",
        durability: "handler-command-claim-v1",
      },
      resource: "bookings",
      action: "write",
      requiredScopes: ["bookings:write", "finance:write"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      from: {
        tools: ["@voyant-travel/finance#bookings-create-extension.tool.create-booking"],
      },
    },
    {
      // Intent-level workflow action (voyant#3933). Same durable command and
      // created target as create-booking; a distinct capability identity so the
      // two admissions stay unconfusable and the server-resolved reference and
      // idempotency key belong to this action's audit trail.
      id: "@voyant-travel/finance#bookings-create-extension.action.book-product",
      capabilityId: "@voyant-travel/finance#bookings-create-extension.action.book-product",
      version: "v1",
      kind: "execute",
      targetType: "booking",
      availability: { status: "available" },
      effectBoundary: "multistage",
      durability: {
        strategy: "outbox",
        testReference: "tests/integration/booking-create.test.ts",
      },
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "finance_booking_create_command",
        resultReferenceType: "booking",
        durability: "handler-command-claim-v1",
      },
      resource: "bookings",
      action: "write",
      requiredScopes: ["bookings:write", "finance:write"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      from: {
        tools: ["@voyant-travel/finance#bookings-create-extension.tool.book-product"],
      },
    },
    {
      id: "@voyant-travel/finance#bookings-create-extension.action.create-booking-self-service",
      capabilityId:
        "@voyant-travel/finance#bookings-create-extension.action.create-booking-self-service",
      version: "v1",
      kind: "execute",
      targetType: "booking",
      // Catalog Booking Session Commit derives the command and consumes its
      // Quote/Hold under the same root transaction.
      availability: { status: "available" },
      effectBoundary: "multistage",
      durability: {
        strategy: "outbox",
        testReference: "tests/integration/booking-create.test.ts",
      },
      targetLifecycle: "created",
      // The same durable command the staff action composes. Only the admission
      // identity, actor, and transport differ.
      createdTarget: {
        commandTargetType: "finance_booking_create_command",
        resultReferenceType: "booking",
        durability: "handler-command-claim-v1",
      },
      resource: "bookings",
      action: "write",
      requiredScopes: [],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["customer"],
      // Booking Session Commit is served by Catalog and settles through
      // Finance's admitted command.
      from: {
        routes: ["@voyant-travel/catalog#booking-engine.api.public"],
      },
    },
  ],
  meta: {
    ownership: "package",
  },
})

export const financeBookingScheduleVoyantPlugin = defineExtension({
  id: "@voyant-travel/finance#booking-schedule-extension",
  packageName: "@voyant-travel/finance",
  localId: "finance.booking-schedule-extension",
  runtime: {
    entry: "@voyant-travel/finance",
    export: "createBookingScheduleVoyantRuntime",
  },
  runtimePorts: [
    requirePort(financeHostRuntimePort),
    requirePort(financeOperatorSettingsRuntimePort),
    requirePort(financeDistributionPaymentPolicyRuntimePort),
    requirePort(financeAccommodationsPaymentPolicyRuntimePort),
    requirePort(financeCruisesPaymentPolicyRuntimePort),
    requirePort(financeInventoryPaymentPolicyRuntimePort),
    // Optional: the proposal layer only exists where proposals do.
    requirePort(financeProposalsPaymentPolicyRuntimePort, { optional: true }),
  ],
  api: [
    {
      id: "@voyant-travel/finance#booking-schedule-extension.api.admin",
      surface: "admin",
      mount: "bookings",
      openapi: { document: "bookings" },
      transactional: true,
      runtime: {
        entry: "@voyant-travel/finance",
        export: "createBookingScheduleApiExtension",
      },
    },
    {
      id: "@voyant-travel/finance#booking-schedule-extension.api.public",
      surface: "public",
      mount: "payment-policy",
      openapi: { document: "bookings" },
      anonymous: true,
      runtime: {
        entry: "@voyant-travel/finance",
        export: "createBookingScheduleApiExtension",
      },
    },
  ],
  subscribers: [
    {
      id: "@voyant-travel/finance#subscriber.booking-schedule-confirmed",
      eventType: "booking.confirmed",
      source: "@voyant-travel/finance/booking-schedule-subscriber",
      runtime: {
        entry: "@voyant-travel/finance/booking-schedule-subscriber",
        export: "bookingScheduleConfirmedSubscriber",
      },
    },
    {
      id: "@voyant-travel/finance#subscriber.proforma-conversion",
      eventType: "invoice.settled",
      source: "@voyant-travel/finance/proforma-conversion-subscriber",
      runtime: {
        entry: "@voyant-travel/finance/proforma-conversion-subscriber",
        export: "proformaConversionSubscriber",
      },
    },
  ],
  meta: {
    ownership: "package",
  },
})

function omitUndefinedJsonOptions(options: Record<string, unknown>): VoyantGraphJsonObject {
  const jsonOptions: Record<string, VoyantGraphJsonObject[string]> = {}
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) jsonOptions[key] = value as VoyantGraphJsonObject[string]
  }
  return jsonOptions
}

export default financeVoyantModule
