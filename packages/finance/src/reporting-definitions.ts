import type {
  ReportDatasetDefinition,
  ReportTemplateDefinition,
  ReportWidgetDefinition,
} from "@voyant-travel/reporting-contracts"

export const FINANCE_RECEIVABLES_DATASET_ID = "finance.receivables"

/**
 * Finance-owned semantics for issued customer receivables.
 *
 * Amounts remain in the document currency. Consumers must group by currency
 * or constrain a query to one currency; the executor enforces that invariant.
 */
export const financeReceivablesDatasetDefinition = {
  id: FINANCE_RECEIVABLES_DATASET_ID,
  version: 1,
  label: "Receivables",
  description:
    "Final, non-void customer invoices with issued credit notes and completed or refunded collections attributed in the invoice currency. Proformas and draft documents are excluded.",
  grain: "One issued, partially paid, paid, or overdue final customer invoice.",
  requiredScopes: ["finance:read"],
  defaultLimit: 100,
  maximumLimit: 1_000,
  defaultDateField: "issueDate",
  fields: [
    {
      id: "issueDate",
      label: "Issue date",
      description: "The final invoice issue date; trends bucket this date in UTC calendar units.",
      role: "dimension",
      valueType: "date",
      sensitivity: "internal",
      requiredScopes: ["finance:read"],
      aggregations: [],
    },
    {
      id: "dueDate",
      label: "Due date",
      role: "dimension",
      valueType: "date",
      sensitivity: "internal",
      requiredScopes: ["finance:read"],
      aggregations: [],
    },
    {
      id: "status",
      label: "Invoice status",
      description:
        "Current status of the final invoice; draft, pending allocation, and void documents are outside this dataset.",
      role: "dimension",
      valueType: "string",
      sensitivity: "internal",
      requiredScopes: ["finance:read"],
      aggregations: ["count", "countDistinct"],
    },
    {
      id: "currency",
      label: "Document currency",
      description: "ISO currency of the final invoice. No report-time FX conversion is applied.",
      role: "dimension",
      valueType: "string",
      sensitivity: "internal",
      requiredScopes: ["finance:read"],
      aggregations: ["count", "countDistinct"],
    },
    {
      id: "grossIssuedCents",
      label: "Gross issued",
      description:
        "Final invoice total before issued or applied credit notes, in document-currency minor units.",
      role: "measure",
      valueType: "currency",
      sensitivity: "sensitive",
      requiredScopes: ["finance:read"],
      aggregations: ["sum"],
    },
    {
      id: "creditedCents",
      label: "Credited",
      description:
        "Issued or applied credit notes converted with their persisted invoice-currency snapshot, in minor units.",
      role: "measure",
      valueType: "currency",
      sensitivity: "sensitive",
      requiredScopes: ["finance:read"],
      aggregations: ["sum"],
    },
    {
      id: "netIssuedCents",
      label: "Net issued",
      description:
        "Gross final invoice value less issued or applied credit notes, attributed to the final invoice issue date.",
      role: "measure",
      valueType: "currency",
      sensitivity: "sensitive",
      requiredScopes: ["finance:read"],
      aggregations: ["sum"],
    },
    {
      id: "settledCents",
      label: "Settled",
      description:
        "Payments whose current status is completed, converted with their persisted invoice-currency snapshot.",
      role: "measure",
      valueType: "currency",
      sensitivity: "sensitive",
      requiredScopes: ["finance:read"],
      aggregations: ["sum"],
    },
    {
      id: "refundedCents",
      label: "Refunded",
      description:
        "Payments whose current status is refunded, converted with their persisted invoice-currency snapshot.",
      role: "measure",
      valueType: "currency",
      sensitivity: "sensitive",
      requiredScopes: ["finance:read"],
      aggregations: ["sum"],
    },
    {
      id: "outstandingBalanceCents",
      label: "Outstanding balance",
      description:
        "Net issued value less currently completed payments, floored at zero, in document-currency minor units.",
      role: "measure",
      valueType: "currency",
      sensitivity: "sensitive",
      requiredScopes: ["finance:read"],
      aggregations: ["sum"],
    },
  ],
} satisfies ReportDatasetDefinition

export const FINANCE_UNPERFORMED_SERVICES_DATASET_ID = "finance.unperformed-services"

/**
 * Contracted services not yet performed, and the cash already collected against
 * them (voyant#4704).
 *
 * Romanian tour operators file a periodic return on exactly this: how many
 * contracts are in progress, what they are worth in lei, and how much has been
 * collected. The measure itself is general — the value of services sold but not
 * delivered, and the operator's exposure on them — so the dataset is named for
 * what it measures rather than for the filing it was built for.
 *
 * **The count is booking-derived, not contract-derived.** `contracts` is not
 * populated on real deployments (14 issued rows out of 225 on the tenant this
 * came from), and the signed contracts of a period exist as PDFs attached to
 * bookings. A contract-record count would be silently wrong, so every label here
 * says booking.
 *
 * **"Performed" is derived from service dates.** A departure that has passed
 * does not set `completed_at`, so booking status cannot answer it. The rule
 * lives here, once, instead of in each widget's query.
 *
 * This dataset deliberately declares no `defaultDateField`: its period is two
 * bounds on two different fields, which the page-level date window — one field,
 * both bounds — cannot express. It reads `periodStart`/`periodEnd` itself.
 */
export const financeUnperformedServicesDatasetDefinition = {
  id: FINANCE_UNPERFORMED_SERVICES_DATASET_ID,
  version: 1,
  label: "Unperformed services",
  description:
    "Bookings concluded on or before period end whose services run on or after period start and are not fully performed by it, with the value and collections converted at each document's own stamped rate. Requires periodStart and periodEnd.",
  grain:
    "One booking concluded by period end whose services are not fully performed at period end.",
  requiredScopes: ["finance:read"],
  defaultLimit: 100,
  maximumLimit: 1_000,
  fields: [
    {
      id: "bookingId",
      label: "Booking id",
      description: "Stable identifier of the booking the contract was signed against.",
      role: "dimension",
      valueType: "string",
      sensitivity: "internal",
      requiredScopes: ["finance:read"],
      aggregations: ["count", "countDistinct"],
    },
    {
      id: "bookingNumber",
      label: "Booking number",
      description: "The reference an inspector quotes when asking about one contract.",
      role: "dimension",
      valueType: "string",
      sensitivity: "internal",
      requiredScopes: ["finance:read"],
      aggregations: ["count", "countDistinct"],
    },
    {
      id: "clientName",
      label: "Client",
      description:
        "Organization name, else the person on the booking, else the booking's own contact name.",
      role: "dimension",
      valueType: "string",
      sensitivity: "pii",
      requiredScopes: ["finance:read"],
      aggregations: ["count", "countDistinct"],
    },
    {
      id: "confirmedAt",
      label: "Concluded",
      description: "The date the booking was confirmed — when the contract was concluded.",
      role: "dimension",
      valueType: "date",
      sensitivity: "internal",
      requiredScopes: ["finance:read"],
      aggregations: [],
    },
    {
      id: "firstServiceDate",
      label: "First service",
      description: "Earliest dated service on the booking — the departure, for a package.",
      role: "dimension",
      valueType: "date",
      sensitivity: "internal",
      requiredScopes: ["finance:read"],
      aggregations: [],
    },
    {
      id: "lastServiceDate",
      label: "Last service",
      description: "Latest dated service on the booking; performance is judged against it.",
      role: "dimension",
      valueType: "date",
      sensitivity: "internal",
      requiredScopes: ["finance:read"],
      aggregations: [],
    },
    {
      id: "status",
      label: "Booking status",
      description:
        "Current booking status, so a departure cancelled inside the period is visible in the line list rather than only in the totals.",
      role: "dimension",
      valueType: "string",
      sensitivity: "internal",
      requiredScopes: ["finance:read"],
      aggregations: ["count", "countDistinct"],
    },
    {
      id: "sellCurrency",
      label: "Contract currency",
      description: "Currency the contract is priced in.",
      role: "dimension",
      valueType: "string",
      sensitivity: "internal",
      requiredScopes: ["finance:read"],
      aggregations: ["count", "countDistinct"],
    },
    {
      id: "reportingCurrency",
      label: "Reporting currency",
      description:
        "Currency the converted columns are denominated in, taken from the stamps the booking's own documents carry.",
      role: "dimension",
      valueType: "string",
      sensitivity: "internal",
      requiredScopes: ["finance:read"],
      aggregations: ["count", "countDistinct"],
    },
    {
      id: "fxRateSetId",
      label: "Rate set",
      description: "The captured rate set the contract's conversion is bound to.",
      role: "dimension",
      valueType: "string",
      sensitivity: "internal",
      requiredScopes: ["finance:read"],
      aggregations: ["count", "countDistinct"],
    },
    {
      id: "fxRateApplied",
      label: "Rate applied",
      description:
        "Reporting-currency units per one unit of contract currency, margin included — the rate printed on the operator's own paperwork.",
      role: "dimension",
      valueType: "number",
      sensitivity: "internal",
      requiredScopes: ["finance:read"],
      aggregations: [],
    },
    {
      id: "contractValueCents",
      label: "Contract value",
      description: "Booking sell total in contract-currency minor units.",
      role: "measure",
      valueType: "currency",
      sensitivity: "sensitive",
      requiredScopes: ["finance:read"],
      aggregations: ["sum"],
    },
    {
      id: "contractValueReportingCents",
      label: "Contract value (reporting)",
      description:
        "Booking sell total in the reporting currency, at the rate its own documents were stamped with. Null when nothing has stamped this contract yet.",
      role: "measure",
      valueType: "currency",
      sensitivity: "sensitive",
      requiredScopes: ["finance:read"],
      aggregations: ["sum"],
    },
    {
      id: "advancesStrictReportingCents",
      label: "Advances (balance still owed)",
      description:
        "Net collections in the reporting currency on contracts where a balance is still owed — the strict reading of an advance. Zero on contracts already collected in full.",
      role: "measure",
      valueType: "currency",
      sensitivity: "sensitive",
      requiredScopes: ["finance:read"],
      aggregations: ["sum"],
    },
    {
      id: "collectionsTotalReportingCents",
      label: "Collections (all)",
      description:
        "All net collections in the reporting currency on contracts in progress, whether or not a balance remains. Refunds and reversals are already netted off.",
      role: "measure",
      valueType: "currency",
      sensitivity: "sensitive",
      requiredScopes: ["finance:read"],
      aggregations: ["sum"],
    },
    {
      id: "balanceReportingCents",
      label: "Balance owed",
      description:
        "Contract value less all collections, floored at zero — the exposure on services not yet delivered.",
      role: "measure",
      valueType: "currency",
      sensitivity: "sensitive",
      requiredScopes: ["finance:read"],
      aggregations: ["sum"],
    },
    {
      id: "invoicedNotCollectedReportingCents",
      label: "Invoiced, not recorded collected",
      description:
        "Fiscal invoices issued against the contract whose value exceeds the payments recorded for it. A fiscal invoice means the money was taken, so anything here is a missing payment record rather than an uncollected sale — surfaced instead of being silently counted as collected.",
      role: "measure",
      valueType: "currency",
      sensitivity: "sensitive",
      requiredScopes: ["finance:read"],
      aggregations: ["sum"],
    },
  ],
} satisfies ReportDatasetDefinition

/**
 * The periodic return, as ordinary widgets over one dataset (voyant#4704).
 *
 * Every one groups by `reportingCurrency` rather than assuming a single one:
 * it is what gives each money column a currency to render with, and a
 * deployment whose documents were stamped in more than one reporting currency
 * gets two honest rows instead of one wrong total.
 */
const financeUnperformedServicesWidgets = [
  {
    id: "finance.unperformed-services-count",
    version: 1,
    label: "Contracts in progress",
    description:
      "Bookings concluded by period end whose services are not fully performed by it. Counted from bookings — contract records are not populated on real deployments.",
    query: {
      dataset: { id: FINANCE_UNPERFORMED_SERVICES_DATASET_ID, version: 1 },
      select: [{ kind: "aggregate", operation: "count", as: "contractCount" }],
      filters: [],
      groupBy: [],
      orderBy: [],
      limit: 1,
    },
    visualization: { type: "kpi", options: { value: "contractCount" } },
    defaultSize: { width: 3, height: 2 },
    minimumSize: { width: 2, height: 2 },
    maximumSize: { width: 6, height: 3 },
  },
  {
    id: "finance.unperformed-services-value",
    version: 1,
    label: "Value in progress",
    description:
      "Total value of contracts in progress, in the reporting currency, at the rate each contract's own documents were stamped with.",
    query: {
      dataset: { id: FINANCE_UNPERFORMED_SERVICES_DATASET_ID, version: 1 },
      select: [
        { kind: "field", field: "reportingCurrency" },
        {
          kind: "aggregate",
          operation: "sum",
          field: "contractValueReportingCents",
          as: "contractValueReportingCents",
        },
      ],
      filters: [],
      groupBy: [{ field: "reportingCurrency" }],
      orderBy: [{ by: "contractValueReportingCents", direction: "descending" }],
      limit: 5,
    },
    visualization: {
      type: "kpi",
      options: {
        value: "contractValueReportingCents",
        currencyField: "reportingCurrency",
        minorUnit: true,
      },
    },
    defaultSize: { width: 3, height: 2 },
    minimumSize: { width: 2, height: 2 },
    maximumSize: { width: 6, height: 3 },
  },
  {
    id: "finance.unperformed-services-advances",
    version: 1,
    label: "Advances collected",
    description:
      "Collections against contracts that still owe a balance — the strict reading of an advance. Refunds are already netted off, so a cancelled, refunded departure contributes nothing here.",
    query: {
      dataset: { id: FINANCE_UNPERFORMED_SERVICES_DATASET_ID, version: 1 },
      select: [
        { kind: "field", field: "reportingCurrency" },
        {
          kind: "aggregate",
          operation: "sum",
          field: "advancesStrictReportingCents",
          as: "advancesStrictReportingCents",
        },
        {
          kind: "aggregate",
          operation: "sum",
          field: "collectionsTotalReportingCents",
          as: "collectionsTotalReportingCents",
        },
      ],
      filters: [],
      groupBy: [{ field: "reportingCurrency" }],
      orderBy: [{ by: "advancesStrictReportingCents", direction: "descending" }],
      limit: 5,
    },
    // Both readings ship side by side, labelled. They differ materially and the
    // operator filing the return should be choosing between them knowingly
    // rather than discovering later which one the platform picked.
    visualization: {
      type: "table",
      options: { currencyField: "reportingCurrency", minorUnit: true },
    },
    defaultSize: { width: 3, height: 2 },
    minimumSize: { width: 3, height: 2 },
    maximumSize: { width: 6, height: 4 },
  },
  {
    id: "finance.unperformed-services-balance",
    version: 1,
    label: "Balance on undelivered services",
    description:
      "Contract value less collections — the exposure the return exists to measure, and what an operator's guarantee is sized against.",
    query: {
      dataset: { id: FINANCE_UNPERFORMED_SERVICES_DATASET_ID, version: 1 },
      select: [
        { kind: "field", field: "reportingCurrency" },
        {
          kind: "aggregate",
          operation: "sum",
          field: "balanceReportingCents",
          as: "balanceReportingCents",
        },
      ],
      filters: [],
      groupBy: [{ field: "reportingCurrency" }],
      orderBy: [{ by: "balanceReportingCents", direction: "descending" }],
      limit: 5,
    },
    visualization: {
      type: "kpi",
      options: {
        value: "balanceReportingCents",
        currencyField: "reportingCurrency",
        minorUnit: true,
      },
    },
    defaultSize: { width: 3, height: 2 },
    minimumSize: { width: 2, height: 2 },
    maximumSize: { width: 6, height: 3 },
  },
  {
    id: "finance.unperformed-services-lines",
    version: 1,
    label: "Contracts in progress — line list",
    description:
      "One row per contract behind the totals: reference, client, dates, value, converted value, the rate applied, collections and balance. An inspector asks about a single contract, not a sum.",
    query: {
      dataset: { id: FINANCE_UNPERFORMED_SERVICES_DATASET_ID, version: 1 },
      select: [
        { kind: "field", field: "bookingNumber" },
        { kind: "field", field: "clientName" },
        { kind: "field", field: "confirmedAt" },
        { kind: "field", field: "firstServiceDate" },
        { kind: "field", field: "lastServiceDate" },
        { kind: "field", field: "status" },
        { kind: "field", field: "sellCurrency" },
        { kind: "field", field: "contractValueCents" },
        { kind: "field", field: "reportingCurrency" },
        { kind: "field", field: "fxRateApplied" },
        { kind: "field", field: "contractValueReportingCents" },
        { kind: "field", field: "collectionsTotalReportingCents" },
        { kind: "field", field: "balanceReportingCents" },
        { kind: "field", field: "invoicedNotCollectedReportingCents" },
      ],
      filters: [],
      groupBy: [],
      orderBy: [{ by: "confirmedAt", direction: "ascending" }],
      limit: 1_000,
    },
    visualization: {
      type: "table",
      options: { currencyField: "reportingCurrency", minorUnit: true },
    },
    defaultSize: { width: 12, height: 6 },
    minimumSize: { width: 6, height: 3 },
    maximumSize: { width: 12, height: 12 },
  },
] satisfies readonly ReportWidgetDefinition[]

export const financeReportingWidgets = [
  {
    id: "finance.outstanding-by-currency",
    version: 1,
    label: "Outstanding by currency",
    description: "Current unpaid final-invoice balance, kept separate by document currency.",
    query: {
      dataset: { id: FINANCE_RECEIVABLES_DATASET_ID, version: 1 },
      select: [
        { kind: "field", field: "currency" },
        {
          kind: "aggregate",
          operation: "sum",
          field: "outstandingBalanceCents",
          as: "outstandingBalanceCents",
        },
        { kind: "aggregate", operation: "count", as: "invoiceCount" },
      ],
      filters: [],
      groupBy: [{ field: "currency" }],
      orderBy: [{ by: "outstandingBalanceCents", direction: "descending" }],
      limit: 20,
    },
    visualization: {
      type: "bar",
      options: {
        category: "currency",
        value: "outstandingBalanceCents",
        currencyField: "currency",
        minorUnit: true,
      },
    },
    defaultSize: { width: 4, height: 3 },
    minimumSize: { width: 3, height: 2 },
    maximumSize: { width: 12, height: 8 },
  },
  {
    id: "finance.net-issued-trend",
    version: 1,
    label: "Net issued trend",
    description:
      "Final invoices less issued/applied credit notes, attributed to the invoice issue month and separated by currency.",
    query: {
      dataset: { id: FINANCE_RECEIVABLES_DATASET_ID, version: 1 },
      select: [
        { kind: "field", field: "issueDate", as: "issueMonth" },
        { kind: "field", field: "currency" },
        {
          kind: "aggregate",
          operation: "sum",
          field: "netIssuedCents",
          as: "netIssuedCents",
        },
      ],
      filters: [],
      groupBy: [{ field: "issueDate", timeGrain: "month" }, { field: "currency" }],
      orderBy: [
        { by: "issueMonth", direction: "ascending" },
        { by: "currency", direction: "ascending" },
      ],
      limit: 240,
    },
    visualization: {
      type: "line",
      options: {
        x: "issueMonth",
        y: "netIssuedCents",
        series: "currency",
        currencyField: "currency",
        minorUnit: true,
      },
    },
    defaultSize: { width: 8, height: 3 },
    minimumSize: { width: 4, height: 3 },
    maximumSize: { width: 12, height: 8 },
  },
  {
    id: "finance.invoice-status-breakdown",
    version: 1,
    label: "Final invoice status",
    description: "Count of recognized final invoices by their current receivable status.",
    query: {
      dataset: { id: FINANCE_RECEIVABLES_DATASET_ID, version: 1 },
      select: [
        { kind: "field", field: "status" },
        { kind: "aggregate", operation: "count", as: "invoiceCount" },
      ],
      filters: [],
      groupBy: [{ field: "status" }],
      orderBy: [{ by: "invoiceCount", direction: "descending" }],
      limit: 10,
    },
    visualization: { type: "pie", options: { category: "status", value: "invoiceCount" } },
    defaultSize: { width: 4, height: 3 },
    minimumSize: { width: 3, height: 3 },
    maximumSize: { width: 8, height: 8 },
  },
  {
    id: "finance.collections-by-currency",
    version: 1,
    label: "Collections by currency",
    description: "Currently completed and refunded customer payments attributed to final invoices.",
    query: {
      dataset: { id: FINANCE_RECEIVABLES_DATASET_ID, version: 1 },
      select: [
        { kind: "field", field: "currency" },
        { kind: "aggregate", operation: "sum", field: "settledCents", as: "settledCents" },
        { kind: "aggregate", operation: "sum", field: "refundedCents", as: "refundedCents" },
      ],
      filters: [],
      groupBy: [{ field: "currency" }],
      orderBy: [{ by: "settledCents", direction: "descending" }],
      limit: 20,
    },
    visualization: {
      type: "table",
      options: { currencyField: "currency", minorUnit: true },
    },
    defaultSize: { width: 4, height: 3 },
    minimumSize: { width: 4, height: 2 },
    maximumSize: { width: 12, height: 8 },
  },
  ...financeUnperformedServicesWidgets,
] satisfies readonly ReportWidgetDefinition[]

export const financeReportingTemplates = [
  {
    id: "finance.overview",
    version: 1,
    label: "Finance overview",
    description:
      "Issued value, collections, outstanding receivables, and current final-invoice status.",
    parameters: [],
    widgets: [
      {
        id: "outstanding",
        source: { kind: "preset", widgetId: "finance.outstanding-by-currency", version: 1 },
        layout: { x: 0, y: 0, width: 4, height: 3 },
      },
      {
        id: "net-issued",
        source: { kind: "preset", widgetId: "finance.net-issued-trend", version: 1 },
        layout: { x: 4, y: 0, width: 8, height: 3 },
      },
      {
        id: "status",
        source: { kind: "preset", widgetId: "finance.invoice-status-breakdown", version: 1 },
        layout: { x: 0, y: 3, width: 4, height: 3 },
      },
      {
        id: "collections",
        source: { kind: "preset", widgetId: "finance.collections-by-currency", version: 1 },
        layout: { x: 4, y: 3, width: 8, height: 3 },
      },
    ],
  },
  {
    // Distinct from the dataset id: the graph namespaces entity ids across
    // datasets, widgets and templates alike, so reusing it collides.
    id: "finance.contracts-in-progress",
    version: 1,
    label: "Contracts in progress and unperformed services",
    description:
      "Contracts concluded by period end whose services are not fully performed by it: how many, what they are worth in the reporting currency, what has been collected against them, and the balance outstanding — with the line list behind every figure. Built for the periodic return Romanian tour operators file, and exportable because it gets attached to a filing.",
    parameters: [
      {
        id: "periodStart",
        label: "Period start",
        description: "First day of the reporting period.",
        valueType: "date",
        required: true,
      },
      {
        id: "periodEnd",
        label: "Period end",
        description:
          "Last day of the reporting period. Contracts are counted as concluded by this date and collections are counted up to it.",
        valueType: "date",
        required: true,
      },
    ],
    widgets: [
      {
        id: "contracts",
        source: { kind: "preset", widgetId: "finance.unperformed-services-count", version: 1 },
        layout: { x: 0, y: 0, width: 3, height: 2 },
      },
      {
        id: "value",
        source: { kind: "preset", widgetId: "finance.unperformed-services-value", version: 1 },
        layout: { x: 3, y: 0, width: 3, height: 2 },
      },
      {
        id: "advances",
        source: { kind: "preset", widgetId: "finance.unperformed-services-advances", version: 1 },
        layout: { x: 6, y: 0, width: 3, height: 2 },
      },
      {
        id: "balance",
        source: { kind: "preset", widgetId: "finance.unperformed-services-balance", version: 1 },
        layout: { x: 9, y: 0, width: 3, height: 2 },
      },
      {
        id: "lines",
        source: { kind: "preset", widgetId: "finance.unperformed-services-lines", version: 1 },
        layout: { x: 0, y: 2, width: 12, height: 6 },
      },
    ],
  },
] satisfies readonly ReportTemplateDefinition[]
