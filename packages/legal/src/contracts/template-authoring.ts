// agent-quality: file-size exception -- owner: legal; existing module stays co-located until a dedicated split preserves behavior and tests.
export type ContractTemplateVariableType =
  | "string"
  | "number"
  | "currency"
  | "cents"
  | "date"
  | "datetime"
  | "boolean"
  | "email"
  | "phone"
  | "url"
  | "loop"

export interface ContractTemplateVariableDefinition {
  key: string
  label: string
  example: string
  type: ContractTemplateVariableType
  description?: string
  deprecated?: boolean
}

export interface ContractTemplateVariableCategory {
  id: string
  label: string
  description?: string
  variables: ContractTemplateVariableDefinition[]
}

export interface ContractTemplateLiquidSnippet {
  id: string
  label: string
  description: string
  code: string
}

/**
 * Catalog of variables exposed to contract templates. Mirrors the shape
 * supplied by the admitted durable document workflow and the
 * storefront's `resolveContractVariables` (preview render). Both code
 * paths emit the same keys, so a template authored once renders
 * identically in either context.
 *
 * Naming: camelCase first, with snake_case aliases listed only on the
 * keys the bundled `customer-sales-agreement` template actually uses
 * (`booking.number`, `contract.date`, `booking.startDate`, etc.).
 *
 * Money is exposed in cents — render with the `cents` filter:
 * `{{ booking.totalAmountCents | cents: booking.currency }}` →
 * `€2,499.00`. Decimal amounts can use `currency`. Dates render via
 * `format_date` (`"short"`, `"medium"`, `"long"`, `"iso"`).
 */
export const contractTemplateVariableCatalog: ContractTemplateVariableCategory[] = [
  {
    id: "system",
    label: "System",
    description: "Clocks evaluated at render time.",
    variables: [
      { key: "today", label: "Today (ISO date)", example: "2026-05-04", type: "date" },
      { key: "currentDate", label: "Current date (ISO)", example: "2026-05-04", type: "date" },
      {
        key: "currentDateTime",
        label: "Current date & time (ISO)",
        example: "2026-05-04T12:30:00Z",
        type: "datetime",
      },
      { key: "currentTime", label: "Current time", example: "12:30:00", type: "string" },
    ],
  },
  {
    id: "contract",
    label: "Contract",
    description: "Metadata about the contract row itself.",
    variables: [
      {
        key: "contract.contractNumber",
        label: "Contract number",
        example: "CTR-2026-0042",
        type: "string",
      },
      {
        key: "contract.number",
        label: "Contract number (alias)",
        example: "CTR-2026-0042",
        type: "string",
      },
      { key: "contract.date", label: "Issue date", example: "2026-05-04", type: "date" },
      {
        key: "contract.contractDate",
        label: "Issue date (alias)",
        example: "2026-05-04",
        type: "date",
      },
      {
        key: "contract.issuedAt",
        label: "Issued at",
        example: "2026-05-04T10:00:00Z",
        type: "datetime",
      },
      {
        key: "contract.signedAt",
        label: "Signed at",
        example: "2026-05-04T10:05:12Z",
        type: "datetime",
      },
      { key: "contract.status", label: "Status", example: "issued", type: "string" },
      {
        key: "contract.series",
        label: "Series",
        example: "A",
        type: "string",
        description: "Number-series the contract was allocated from.",
      },
      { key: "contract.channel", label: "Channel", example: "storefront", type: "string" },
      { key: "contract.source", label: "Source", example: "self_service", type: "string" },
      { key: "contract.isManual", label: "Manually issued?", example: "false", type: "boolean" },
    ],
  },
  {
    id: "booking",
    label: "Booking",
    description: "The booking the contract is attached to.",
    variables: [
      { key: "booking.bookingId", label: "Booking id", example: "book_…", type: "string" },
      {
        key: "booking.bookingNumber",
        label: "Booking number",
        example: "BKG-2026-00125",
        type: "string",
      },
      {
        key: "booking.number",
        label: "Booking number (alias)",
        example: "BKG-2026-00125",
        type: "string",
      },
      { key: "booking.status", label: "Status", example: "confirmed", type: "string" },
      {
        key: "booking.vertical",
        label: "Vertical",
        example: "products",
        type: "string",
        description: "products | cruises | accommodations | flights | charters | ground",
      },
      {
        key: "booking.productName",
        label: "Product name",
        example: "Iceland 7 days",
        type: "string",
      },
      {
        key: "booking.destination",
        label: "Destination",
        example: "Reykjavík, Iceland",
        type: "string",
      },
      // Pax
      { key: "booking.pax", label: "Total pax", example: "4", type: "number" },
      { key: "booking.paxAdult", label: "Adults", example: "2", type: "number" },
      { key: "booking.paxChild", label: "Children", example: "2", type: "number" },
      { key: "booking.paxInfant", label: "Infants", example: "0", type: "number" },
      // Dates
      {
        key: "booking.startDate",
        label: "Start date",
        example: "2026-06-15",
        type: "date",
        description: "Use with the `format_date` filter.",
      },
      { key: "booking.endDate", label: "End date", example: "2026-06-22", type: "date" },
      {
        key: "booking.travelDates.durationNights",
        label: "Duration (nights)",
        example: "7",
        type: "number",
      },
      // Money
      { key: "booking.sellCurrency", label: "Sell currency", example: "EUR", type: "string" },
      {
        key: "booking.sellAmountCents",
        label: "Sell total",
        example: "249900",
        type: "cents",
        description: "Render with `| cents: booking.sellCurrency`.",
      },
      {
        key: "booking.subtotalAmountCents",
        label: "Subtotal",
        example: "210000",
        type: "cents",
      },
      {
        key: "booking.taxAmountCents",
        label: "Tax total",
        example: "39900",
        type: "cents",
      },
      {
        key: "booking.discountAmountCents",
        label: "Discount",
        example: "0",
        type: "cents",
      },
      {
        key: "booking.totalAmountCents",
        label: "Total (alias)",
        example: "249900",
        type: "cents",
      },
      { key: "booking.currency", label: "Currency (alias)", example: "EUR", type: "string" },
      {
        key: "booking.paidAmountCents",
        label: "Paid so far",
        example: "50000",
        type: "cents",
        description: "Customer settlement total from completed payments.",
      },
      {
        key: "booking.balanceDueCents",
        label: "Balance due",
        example: "199900",
        type: "cents",
        description:
          "Current remaining amount owed after completed payments / invoice balances. Use this, `amountDueCents`, or `isPaidInFull` for settlement state.",
      },
      {
        key: "booking.amountDueCents",
        label: "Amount still due",
        example: "199900",
        type: "cents",
        description:
          "Alias for the current remaining amount owed. This is payment-aware; unlike scheduled installment amounts, it drops to 0 once settled.",
      },
      {
        key: "booking.isPaidInFull",
        label: "Paid in full",
        example: "false",
        type: "boolean",
        description:
          "True when the current amount due is 0 or completed payments cover the booking total.",
      },
      // Payment-schedule-derived (deposit / balance from
      // booking_payment_schedules)
      {
        key: "booking.depositAmountCents",
        label: "Deposit amount",
        example: "50000",
        type: "cents",
        description:
          "Gross scheduled deposit installment from booking_payment_schedules. Not reduced by payments; use paidAmountCents / amountDueCents / isPaidInFull for current settlement state.",
      },
      {
        key: "booking.depositDueDate",
        label: "Deposit due date",
        example: "2026-05-10",
        type: "date",
      },
      {
        key: "booking.balanceAmountCents",
        label: "Balance amount",
        example: "199900",
        type: "cents",
        description:
          "Gross scheduled balance installment from booking_payment_schedules. Not the remaining amount owed; use balanceDueCents or amountDueCents for that.",
      },
      {
        key: "booking.balanceDueDate",
        label: "Balance due date",
        example: "2026-06-01",
        type: "date",
      },
      // Accommodation summary
      {
        key: "booking.roomsSummary",
        label: "Rooms summary",
        example: "1× Double room",
        type: "string",
        description:
          "Free-form summary derived from accommodation booking_items. Empty for non-accommodation bookings.",
      },
      // Policy trace
      {
        key: "booking.paymentPolicy.source",
        label: "Payment policy source",
        example: "operator_default",
        type: "string",
        description:
          "Which cascade layer supplied the active payment policy: operator_default | supplier | category | listing | booking.",
      },
      // Source
      {
        key: "booking.source.kind",
        label: "Source kind",
        example: "owned",
        type: "string",
        description: "owned | sourced",
      },
      { key: "booking.source.supplier.name", label: "Supplier name", example: "", type: "string" },
      // Notes
      {
        key: "booking.customerNotes",
        label: "Customer notes",
        example: "Window seat please",
        type: "string",
      },
    ],
  },
  {
    id: "customer",
    label: "Customer",
    description: "The buyer (CRM person / organization driving the booking).",
    variables: [
      { key: "customer.fullName", label: "Full name", example: "Arthur Silva", type: "string" },
      { key: "customer.firstName", label: "First name", example: "Arthur", type: "string" },
      { key: "customer.lastName", label: "Last name", example: "Silva", type: "string" },
      { key: "customer.email", label: "Email", example: "arthur@example.com", type: "email" },
      { key: "customer.phone", label: "Phone", example: "+40 721 111 222", type: "phone" },
      {
        key: "customer.dateOfBirth",
        label: "Date of birth",
        example: "1985-03-12",
        type: "date",
      },
      {
        key: "customer.type",
        label: "Buyer type",
        example: "B2C",
        type: "string",
        description: "B2C | B2B",
      },
      { key: "customer.companyName", label: "Company name", example: "Acme SRL", type: "string" },
      { key: "customer.vatId", label: "VAT id", example: "RO12345678", type: "string" },
      {
        key: "customer.registrationNumber",
        label: "Registration number",
        example: "J40/123/2010",
        type: "string",
      },
      {
        key: "customer.address.line1",
        label: "Address line 1",
        example: "19 Example Street",
        type: "string",
      },
      { key: "customer.address.line2", label: "Address line 2", example: "Apt 4", type: "string" },
      { key: "customer.address.city", label: "City", example: "Bucharest", type: "string" },
      {
        key: "customer.address.region",
        label: "Region / state",
        example: "Sector 1",
        type: "string",
      },
      { key: "customer.address.postal", label: "Postal code", example: "010101", type: "string" },
      { key: "customer.address.country", label: "Country", example: "RO", type: "string" },
      {
        key: "customer.document.type",
        label: "ID document type",
        example: "passport",
        type: "string",
      },
      {
        key: "customer.document.number",
        label: "ID document number",
        example: "AX1234567",
        type: "string",
      },
      {
        key: "customer.document.expiryDate",
        label: "ID document expiry",
        example: "2032-08-04",
        type: "date",
      },
    ],
  },
  {
    id: "lead-traveler",
    label: "Lead traveler",
    description: "The primary traveler on the booking. May or may not equal the customer.",
    variables: [
      {
        key: "leadTraveler.fullName",
        label: "Full name",
        example: "Jane Doe",
        type: "string",
        description: "Renders empty when no traveler info is on file.",
      },
      { key: "leadTraveler.firstName", label: "First name", example: "Jane", type: "string" },
      { key: "leadTraveler.lastName", label: "Last name", example: "Doe", type: "string" },
      { key: "leadTraveler.email", label: "Email", example: "jane.doe@example.com", type: "email" },
      { key: "leadTraveler.phone", label: "Phone", example: "+40 721 333 444", type: "phone" },
    ],
  },
  {
    id: "travelers-loop",
    label: "Travelers loop",
    description:
      "Use these inside a Liquid loop: `{% for t in travelers %}{{ t.fullName }}{% endfor %}`. `passengers` is a synonym.",
    variables: [
      { key: "t.index", label: "Row index (1-based)", example: "1", type: "number" },
      { key: "t.fullName", label: "Full name", example: "Jane Doe", type: "string" },
      { key: "t.firstName", label: "First name", example: "Jane", type: "string" },
      { key: "t.lastName", label: "Last name", example: "Doe", type: "string" },
      { key: "t.email", label: "Email", example: "jane.doe@example.com", type: "email" },
      { key: "t.phone", label: "Phone", example: "+40 721 555 666", type: "phone" },
      { key: "t.dateOfBirth", label: "Date of birth", example: "1990-08-10", type: "date" },
      {
        key: "t.band",
        label: "Pax band",
        example: "adult",
        type: "string",
        description: "adult | child | infant | senior | student | (custom band code)",
      },
      {
        key: "t.participantType",
        label: "Participant type",
        example: "traveler",
        type: "string",
      },
      { key: "t.isLead", label: "Is lead traveler?", example: "true", type: "boolean" },
      {
        key: "t.document.type",
        label: "ID document type",
        example: "passport",
        type: "string",
      },
      {
        key: "t.document.number",
        label: "ID document number",
        example: "AX1234567",
        type: "string",
      },
      {
        key: "t.document.expiryDate",
        label: "ID document expiry",
        example: "2032-08-04",
        type: "date",
      },
    ],
  },
  {
    id: "items-loop",
    label: "Pricing items loop",
    description:
      "Loop over the line items rolled up from the booking's items / quote pricing: `{% for item in items %}…{% endfor %}`.",
    variables: [
      { key: "item.index", label: "Row index", example: "1", type: "number" },
      {
        key: "item.kind",
        label: "Kind",
        example: "base",
        type: "string",
        description: "base | accommodation | addon | supplement | discount | fee",
      },
      {
        key: "item.description",
        label: "Description",
        example: "Iceland 7 days",
        type: "string",
      },
      { key: "item.quantity", label: "Quantity", example: "2", type: "number" },
      {
        key: "item.unitAmountCents",
        label: "Unit amount",
        example: "124950",
        type: "cents",
      },
      {
        key: "item.totalAmountCents",
        label: "Total amount",
        example: "249900",
        type: "cents",
      },
      { key: "item.currency", label: "Currency", example: "EUR", type: "string" },
      { key: "item.taxIncluded", label: "Tax included?", example: "true", type: "boolean" },
    ],
  },
  {
    id: "product",
    label: "Product",
    description: "What's being booked (product, cruise sailing, hotel stay, …).",
    variables: [
      { key: "product.title", label: "Title", example: "Iceland 7 days", type: "string" },
      { key: "product.subtitle", label: "Subtitle", example: "7 days · Iceland", type: "string" },
      {
        key: "product.destination",
        label: "Destination",
        example: "Reykjavík",
        type: "string",
      },
      {
        key: "product.vertical",
        label: "Vertical",
        example: "products",
        type: "string",
      },
      { key: "product.heroImageUrl", label: "Hero image URL", example: "", type: "url" },
    ],
  },
  {
    id: "departure-slot",
    label: "Departure slot (products)",
    description: "Filled when the booking is for a tour-product departure slot.",
    variables: [
      { key: "departureSlot.slotId", label: "Slot id", example: "pdse_…", type: "string" },
      {
        key: "departureSlot.startAt",
        label: "Departs at",
        example: "2026-06-15T10:00:00Z",
        type: "datetime",
      },
      {
        key: "departureSlot.endAt",
        label: "Returns at",
        example: "2026-06-22T18:00:00Z",
        type: "datetime",
      },
      {
        key: "departureSlot.durationDays",
        label: "Duration (days)",
        example: "7",
        type: "number",
      },
      {
        key: "departureSlot.departureCity",
        label: "Departure city",
        example: "Reykjavík",
        type: "string",
      },
    ],
  },
  {
    id: "sailing",
    label: "Sailing (cruises)",
    description: "Filled when the booking is for a cruise sailing.",
    variables: [
      { key: "sailing.sailingId", label: "Sailing id", example: "", type: "string" },
      { key: "sailing.ship", label: "Ship name", example: "MS Nordic", type: "string" },
      {
        key: "sailing.embarkationPort",
        label: "Embarkation port",
        example: "Barcelona",
        type: "string",
      },
      {
        key: "sailing.disembarkationPort",
        label: "Disembarkation port",
        example: "Rome",
        type: "string",
      },
      { key: "sailing.startDate", label: "Start date", example: "2026-06-15", type: "date" },
      { key: "sailing.endDate", label: "End date", example: "2026-06-22", type: "date" },
      {
        key: "sailing.airArrangement",
        label: "Air arrangement",
        example: "cruise_line",
        type: "string",
      },
      {
        key: "sailing.cabinCategoryId",
        label: "Cabin category id",
        example: "",
        type: "string",
      },
    ],
  },
  {
    id: "stay",
    label: "Accommodation stay",
    description: "Filled when the booking is for a hotel stay.",
    variables: [
      { key: "stay.checkIn", label: "Check-in", example: "2026-06-15", type: "date" },
      { key: "stay.checkOut", label: "Check-out", example: "2026-06-18", type: "date" },
      { key: "stay.nights", label: "Nights", example: "3", type: "number" },
      { key: "stay.destination", label: "Destination", example: "Bucharest", type: "string" },
    ],
  },
  {
    id: "payment",
    label: "Payment",
    variables: [
      {
        key: "payment.intent",
        label: "Payment intent",
        example: "card",
        type: "string",
        description: "card | bank_transfer | hold | inquiry | ticket_on_credit",
      },
      {
        key: "payment.method",
        label: "Method label",
        example: "Bank Transfer",
        type: "string",
        description: "Alias for `payment.latestCompleted.methodLabel` when a payment exists.",
      },
      {
        key: "payment.amountCents",
        label: "Amount",
        example: "249900",
        type: "cents",
      },
      { key: "payment.currency", label: "Currency", example: "EUR", type: "string" },
      {
        key: "payment.capturedAt",
        label: "Captured at",
        example: "2026-05-04T10:05:12Z",
        type: "datetime",
        description: "Alias for `payment.latestCompleted.date` when a payment exists.",
      },
      {
        key: "payment.createdAt",
        label: "Created at (alias)",
        example: "2026-05-04T10:05:12Z",
        type: "datetime",
        description: "Alias for `payment.capturedAt`.",
      },
      {
        key: "payment.latestCompleted.method",
        label: "Latest payment method",
        example: "bank_transfer",
        type: "string",
      },
      {
        key: "payment.latestCompleted.methodLabel",
        label: "Latest payment method label",
        example: "Bank Transfer",
        type: "string",
      },
      {
        key: "payment.latestCompleted.date",
        label: "Latest payment date",
        example: "2026-05-04",
        type: "date",
      },
    ],
  },
  {
    id: "payment-schedule-loop",
    label: "Payment schedule loop",
    description:
      "Loop over the booking's payment installments: `{% for line in payment.schedule %}…{% endfor %}`. Empty when no schedule is set.",
    variables: [
      { key: "line.index", label: "Row index", example: "1", type: "number" },
      {
        key: "line.type",
        label: "Type",
        example: "deposit",
        type: "string",
        description: "deposit | installment | balance | hold | other",
      },
      { key: "line.amountCents", label: "Amount", example: "50000", type: "cents" },
      { key: "line.currency", label: "Currency", example: "EUR", type: "string" },
      { key: "line.dueDate", label: "Due date", example: "2026-05-10", type: "date" },
      {
        key: "line.status",
        label: "Status",
        example: "pending",
        type: "string",
        description: "pending | paid | overdue | cancelled",
      },
    ],
  },
  {
    id: "operator",
    label: "Operator",
    description:
      "The legal/trading entity contracting with the customer. Wired from Settings -> Organization.",
    variables: [
      { key: "operator.name", label: "Trading name", example: "Voyant Travel", type: "string" },
      {
        key: "operator.legalName",
        label: "Legal company name",
        example: "Voyant Travel S.R.L.",
        type: "string",
      },
      { key: "operator.vatId", label: "VAT id", example: "RO12345678", type: "string" },
      {
        key: "operator.registrationNumber",
        label: "Trade-register number",
        example: "J40/123/2010",
        type: "string",
      },
      {
        key: "operator.address",
        label: "Postal address",
        example: "1 Voyant Way, Bucharest",
        type: "string",
      },
      { key: "operator.phone", label: "Phone", example: "+40 721 000 000", type: "phone" },
      { key: "operator.email", label: "Email", example: "sales@voyant.travel", type: "email" },
      {
        key: "operator.website",
        label: "Website",
        example: "https://voyant.travel",
        type: "url",
      },
      {
        key: "operator.logoUrl",
        label: "Horizontal logo URL (light mode)",
        example: "data:image/png;base64,…",
        type: "url",
        description: "Uploaded in Settings → Organization. Empty when not configured.",
      },
      {
        key: "operator.logoDarkUrl",
        label: "Horizontal logo URL (dark mode)",
        example: "data:image/png;base64,…",
        type: "url",
        description: "Uploaded in Settings → Organization. Empty when not configured.",
      },
      {
        key: "operator.iconUrl",
        label: "Icon URL (light mode)",
        example: "data:image/png;base64,…",
        type: "url",
        description: "Uploaded in Settings → Organization. Empty when not configured.",
      },
      {
        key: "operator.iconDarkUrl",
        label: "Icon URL (dark mode)",
        example: "data:image/png;base64,…",
        type: "url",
        description: "Uploaded in Settings → Organization. Empty when not configured.",
      },
      { key: "operator.iban", label: "IBAN", example: "RO00BANK0000000000000000", type: "string" },
      { key: "operator.bank", label: "Bank name", example: "BCR", type: "string" },
      { key: "operator.license", label: "License number", example: "1234", type: "string" },
      {
        key: "operator.licenseAuthority",
        label: "Licensing authority",
        example: "ANPC",
        type: "string",
      },
      {
        key: "operator.signatoryName",
        label: "Signatory name",
        example: "Jane Smith",
        type: "string",
      },
      {
        key: "operator.signatoryRole",
        label: "Signatory role",
        example: "Managing Director",
        type: "string",
      },
    ],
  },
  {
    id: "acceptance",
    label: "Acceptance",
    description:
      "Captured when the customer ticks Accept in the contract dialog. Empty for previews and operator-issued contracts.",
    variables: [
      { key: "acceptance.ipAddress", label: "IP address", example: "203.0.113.42", type: "string" },
      {
        key: "acceptance.userAgent",
        label: "User-agent",
        example: "Mozilla/5.0 …",
        type: "string",
      },
      {
        key: "acceptance.acceptedAt",
        label: "Accepted at",
        example: "2026-05-04T10:05:12Z",
        type: "datetime",
      },
      {
        key: "acceptance.marketingConsent",
        label: "Marketing consent given?",
        example: "true",
        type: "boolean",
      },
      {
        key: "acceptance.templateSlug",
        label: "Template slug accepted",
        example: "customer-sales-agreement",
        type: "string",
      },
    ],
  },
]

/**
 * Liquid snippets surfaced by the authoring UI's "Insert snippet"
 * button. These cover the common cases — money formatting via `cents`,
 * dates via `format_date`, default values, conditionals, and loops.
 */
export const contractTemplateLiquidSnippets: ContractTemplateLiquidSnippet[] = [
  {
    id: "simple-variable",
    label: "Simple variable",
    description: "Output a single value from the render context.",
    code: "{{ booking.bookingNumber }}",
  },
  {
    id: "default-value",
    label: "Default value",
    description: "Fallback when a variable is missing or blank.",
    code: '{{ customer.phone | default: "—" }}',
  },
  {
    id: "money-cents",
    label: "Money (from cents)",
    description: "Format an integer cents amount as a localized currency string.",
    code: "{{ booking.totalAmountCents | cents: booking.currency }}",
  },
  {
    id: "money-cents-locale",
    label: "Money with explicit locale",
    description: "Localize the currency formatting (Romanian uses comma decimals).",
    code: '{{ booking.totalAmountCents | cents: booking.currency, "ro-RO" }}',
  },
  {
    id: "date-long",
    label: "Date — long format",
    description: "Format an ISO date as `January 15, 2026` (defaults to en-US).",
    code: '{{ booking.startDate | format_date: "long" }}',
  },
  {
    id: "date-locale",
    label: "Date — locale-aware",
    description: "Format the date in another locale (Romanian, French, …).",
    code: '{{ booking.startDate | format_date: "long", "ro-RO" }}',
  },
  {
    id: "time-short",
    label: "Time of day — short",
    description: "Hours + minutes (08:30). Useful for signed-at / captured-at stamps.",
    code: "{{ contract.signedAt | format_time }}",
  },
  {
    id: "time-medium",
    label: "Time of day — with seconds",
    description: "Hours + minutes + seconds (08:30:42).",
    code: '{{ contract.signedAt | format_time: "medium" }}',
  },
  {
    id: "if-block",
    label: "Conditional block",
    description: "Show content only when a condition is met.",
    code: `{% if leadTraveler %}
Lead traveler: {{ leadTraveler.fullName }}
{% else %}
No lead traveler on file.
{% endif %}`,
  },
  {
    id: "travelers-loop",
    label: "Travelers loop",
    description: "Repeat content for each traveler.",
    code: `{% for t in travelers %}
{{ forloop.index }}. {{ t.fullName }}{% if t.dateOfBirth %} — born {{ t.dateOfBirth | format_date: "short" }}{% endif %}
{% endfor %}`,
  },
  {
    id: "items-table",
    label: "Pricing line-items table",
    description: "Render the booking's line items as a simple HTML table.",
    code: `<table>
  <thead><tr><th>Item</th><th>Qty</th><th>Total</th></tr></thead>
  <tbody>
  {% for item in items %}
    <tr>
      <td>{{ item.description }}</td>
      <td>{{ item.quantity }}</td>
      <td>{{ item.totalAmountCents | cents: item.currency }}</td>
    </tr>
  {% endfor %}
  </tbody>
</table>`,
  },
  {
    id: "settlement-summary",
    label: "Settlement summary",
    description: "Render customer-paid and remaining amounts from actual settlement state.",
    code: `{% if booking.paidAmountCents > 0 %}
Achitat: {{ booking.paidAmountCents | cents: booking.currency, "ro-RO" }}{% if payment.latestCompleted %} prin {{ payment.latestCompleted.methodLabel }} în data de {{ payment.latestCompleted.date | format_date: "long", "ro-RO" }}{% endif %}.
{% endif %}
{% if booking.balanceDueCents > 0 %}
Diferență de plată: {{ booking.balanceDueCents | cents: booking.currency, "ro-RO" }}.
{% endif %}`,
  },
  {
    id: "deposit-balance",
    label: "Deposit + balance line",
    description:
      "Render the scheduled advance + balance policy without mistaking scheduled installments for the current amount still owed.",
    code: `{% if booking.isPaidInFull %}
Achitat integral: {{ booking.paidAmountCents | cents: booking.currency, "ro-RO" }}{% if payment.latestCompleted %} prin {{ payment.latestCompleted.methodLabel }} în data de {{ payment.latestCompleted.date | format_date: "long", "ro-RO" }}{% endif %}.
{% else %}
{% if booking.depositAmountCents > 0 %}
Avans programat: {{ booking.depositAmountCents | cents: booking.currency, "ro-RO" }}{% if booking.depositDueDate %}, scadent la {{ booking.depositDueDate | format_date: "long", "ro-RO" }}{% endif %}.
{% endif %}
{% if booking.balanceAmountCents > 0 %}
Diferență programată: {{ booking.balanceAmountCents | cents: booking.currency, "ro-RO" }}{% if booking.balanceDueDate %}, scadentă la {{ booking.balanceDueDate | format_date: "long", "ro-RO" }}{% endif %}.
{% endif %}
{% if booking.amountDueCents > 0 %}
Suma rămasă de plată: {{ booking.amountDueCents | cents: booking.currency, "ro-RO" }}.
{% endif %}
{% endif %}`,
  },
  {
    id: "payment-schedule-table",
    label: "Payment schedule table",
    description: "Render every installment in the booking's payment schedule.",
    code: `{% if payment.schedule.size > 0 %}
<table>
  <thead><tr><th>#</th><th>Type</th><th>Due</th><th>Amount</th><th>Status</th></tr></thead>
  <tbody>
  {% for line in payment.schedule %}
    <tr>
      <td>{{ line.index }}</td>
      <td>{{ line.type }}</td>
      <td>{{ line.dueDate | format_date: "long" }}</td>
      <td>{{ line.amountCents | cents: line.currency }}</td>
      <td>{{ line.status }}</td>
    </tr>
  {% endfor %}
  </tbody>
</table>
{% endif %}`,
  },
  {
    id: "acceptance-fingerprint",
    label: "Acceptance fingerprint",
    description: "Render the customer's acceptance metadata for the audit trail.",
    code: `{% if acceptance.ipAddress %}
Accepted online on {{ acceptance.acceptedAt | format_date: "long" }}
from IP {{ acceptance.ipAddress }} ({{ acceptance.userAgent }}).
{% endif %}`,
  },
]
