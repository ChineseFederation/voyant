export type NotificationTemplateVariableType =
  | "string"
  | "number"
  | "currency"
  | "date"
  | "datetime"
  | "boolean"
  | "email"
  | "phone"
  | "url"
  | "array"

export interface NotificationTemplateVariableDefinition {
  key: string
  label: string
  example: string
  type: NotificationTemplateVariableType
  description?: string
}

export interface NotificationTemplateVariableCategory {
  id: string
  label: string
  description?: string
  variables: NotificationTemplateVariableDefinition[]
}

export interface NotificationLiquidSnippet {
  id: string
  label: string
  description: string
  code: string
}

export const notificationTemplateVariableCatalog: NotificationTemplateVariableCategory[] = [
  {
    id: "traveler",
    label: "Traveler",
    description:
      "Primary traveler/recipient context commonly available in booking, invoice, and reminder notifications.",
    variables: [
      { key: "traveler.firstName", label: "First name", example: "Arthur", type: "string" },
      { key: "traveler.lastName", label: "Last name", example: "Silva", type: "string" },
      { key: "traveler.fullName", label: "Full name", example: "Arthur Silva", type: "string" },
      { key: "traveler.name", label: "Display name", example: "Arthur Silva", type: "string" },
      { key: "traveler.email", label: "Email", example: "arthur@example.com", type: "email" },
      { key: "traveler.phone", label: "Phone", example: "+40 721 111 222", type: "phone" },
      {
        key: "traveler.participantType",
        label: "Traveler type",
        example: "traveler",
        type: "string",
      },
      { key: "traveler.role", label: "Role", example: "traveler", type: "string" },
      { key: "traveler.isPrimary", label: "Is primary", example: "true", type: "boolean" },
    ],
  },
  {
    id: "billingPerson",
    label: "Billing person",
    description: "Alias of the primary traveler for friendlier template naming.",
    variables: [
      { key: "billingPerson.firstName", label: "First name", example: "Arthur", type: "string" },
      { key: "billingPerson.lastName", label: "Last name", example: "Silva", type: "string" },
      {
        key: "billingPerson.fullName",
        label: "Full name",
        example: "Arthur Silva",
        type: "string",
      },
      { key: "billingPerson.email", label: "Email", example: "arthur@example.com", type: "email" },
      { key: "billingPerson.phone", label: "Phone", example: "+40 721 111 222", type: "phone" },
    ],
  },
  {
    id: "travelers",
    label: "Travelers (loop)",
    description: "All booking travelers. Use in `{% for traveler in travelers %}` loops.",
    variables: [
      {
        key: "travelers",
        label: "Travelers array",
        example: '[{ firstName: "Arthur" }]',
        type: "array",
      },
      {
        key: "travelers[0].firstName",
        label: "First traveler first name",
        example: "Arthur",
        type: "string",
      },
      {
        key: "travelers[0].lastName",
        label: "First traveler last name",
        example: "Silva",
        type: "string",
      },
      {
        key: "travelers[0].fullName",
        label: "First traveler full name",
        example: "Arthur Silva",
        type: "string",
      },
      {
        key: "travelers[0].email",
        label: "First traveler email",
        example: "arthur@example.com",
        type: "email",
      },
      {
        key: "travelers[0].participantType",
        label: "First traveler type",
        example: "traveler",
        type: "string",
      },
      {
        key: "travelers[0].isPrimary",
        label: "First traveler is primary",
        example: "true",
        type: "boolean",
      },
    ],
  },
  {
    id: "booking",
    label: "Booking",
    description:
      "Available for booking, invoice, payment-session, reminder, and document notifications.",
    variables: [
      { key: "booking.id", label: "Booking ID", example: "book_01abcxyz", type: "string" },
      {
        key: "booking.bookingNumber",
        label: "Booking number",
        example: "BKG-2026-00125",
        type: "string",
      },
      { key: "booking.reference", label: "Reference", example: "BKG-2026-00125", type: "string" },
      { key: "booking.code", label: "Code", example: "BKG-2026-00125", type: "string" },
      { key: "booking.status", label: "Status", example: "confirmed", type: "string" },
      { key: "booking.startDate", label: "Start date", example: "2026-06-15", type: "date" },
      { key: "booking.endDate", label: "End date", example: "2026-06-22", type: "date" },
      {
        key: "booking.dateRange",
        label: "Date range",
        example: "2026-06-15 - 2026-06-22",
        type: "string",
      },
      {
        key: "booking.sellAmountCents",
        label: "Total amount (cents)",
        example: "249900",
        type: "number",
      },
      { key: "booking.total", label: "Total amount", example: "2499", type: "currency" },
      { key: "booking.totalAmount", label: "Total amount", example: "2499", type: "currency" },
      { key: "booking.totalPrice", label: "Total price", example: "2499", type: "currency" },
      { key: "booking.currency", label: "Currency", example: "EUR", type: "string" },
    ],
  },
  {
    id: "portal",
    label: "Customer portal",
    description:
      "Deployment-provided customer portal links. Values are empty when no portal is configured.",
    variables: [
      {
        key: "portal.url",
        label: "Portal URL",
        example: "https://portal.example.com",
        type: "url",
      },
      {
        key: "portal.bookingUrl",
        label: "Booking portal URL",
        example: "https://portal.example.com/bookings/book_01abcxyz",
        type: "url",
      },
    ],
  },
  {
    id: "invoice",
    label: "Invoice",
    description: "Available in invoice notifications and invoice reminder flows.",
    variables: [
      { key: "invoice.id", label: "Invoice ID", example: "inv_01abcxyz", type: "string" },
      {
        key: "invoice.invoiceNumber",
        label: "Invoice number",
        example: "INV-2026-0042",
        type: "string",
      },
      {
        key: "invoice.number",
        label: "Invoice number alias",
        example: "INV-2026-0042",
        type: "string",
      },
      { key: "invoice.invoiceType", label: "Invoice type", example: "customer", type: "string" },
      { key: "invoice.type", label: "Invoice type alias", example: "customer", type: "string" },
      { key: "invoice.status", label: "Invoice status", example: "issued", type: "string" },
      { key: "invoice.issueDate", label: "Issue date", example: "2026-04-20", type: "date" },
      { key: "invoice.dueDate", label: "Due date", example: "2026-05-01", type: "date" },
      { key: "invoice.subtotalAmount", label: "Subtotal", example: "1299", type: "currency" },
      { key: "invoice.taxAmount", label: "Tax", example: "200", type: "currency" },
      { key: "invoice.totalAmount", label: "Total amount", example: "1499", type: "currency" },
      { key: "invoice.paidAmount", label: "Paid amount", example: "500", type: "currency" },
      { key: "invoice.balanceDueAmount", label: "Balance due", example: "999", type: "currency" },
      { key: "invoice.currency", label: "Currency", example: "EUR", type: "string" },
    ],
  },
  {
    id: "payment",
    label: "Payment",
    description: "Normalized reminder/payment object. Best option for generic payment templates.",
    variables: [
      { key: "payment.amount", label: "Amount", example: "500", type: "currency" },
      { key: "payment.currency", label: "Currency", example: "EUR", type: "string" },
      { key: "payment.dueDate", label: "Due date", example: "2026-05-01", type: "date" },
      { key: "payment.daysLeft", label: "Days left", example: "3", type: "number" },
      { key: "payment.reference", label: "Reference", example: "INV-2026-0042", type: "string" },
      { key: "payment.method", label: "Method", example: "card", type: "string" },
      {
        key: "payment.link",
        label: "Payment link",
        example: "https://pay.example.com/session/123",
        type: "url",
      },
      { key: "payment.payMode", label: "Pay mode", example: "deposit", type: "string" },
      { key: "payment.paidAmount", label: "Paid amount", example: "500", type: "currency" },
      { key: "payment.balanceDue", label: "Balance due", example: "999", type: "currency" },
      { key: "payment.isPaidInFull", label: "Is paid in full", example: "false", type: "boolean" },
    ],
  },
  {
    id: "paymentSession",
    label: "Payment session",
    description:
      "Available in payment-session notifications and invoice flows with active payment links.",
    variables: [
      { key: "paymentSession.id", label: "Session ID", example: "ps_01abcxyz", type: "string" },
      { key: "paymentSession.status", label: "Status", example: "pending", type: "string" },
      { key: "paymentSession.provider", label: "Provider", example: "stripe", type: "string" },
      { key: "paymentSession.currency", label: "Currency", example: "EUR", type: "string" },
      { key: "paymentSession.amount", label: "Amount", example: "500", type: "currency" },
      {
        key: "paymentSession.paymentMethod",
        label: "Payment method",
        example: "card",
        type: "string",
      },
      { key: "paymentSession.method", label: "Method alias", example: "card", type: "string" },
      {
        key: "paymentSession.paymentUrl",
        label: "Payment URL",
        example: "https://pay.example.com/session/123",
        type: "url",
      },
      {
        key: "paymentSession.redirectUrl",
        label: "Redirect URL",
        example: "https://pay.example.com/session/123",
        type: "url",
      },
      {
        key: "paymentSession.returnUrl",
        label: "Return URL",
        example: "https://app.example.com/return",
        type: "url",
      },
      {
        key: "paymentSession.cancelUrl",
        label: "Cancel URL",
        example: "https://app.example.com/cancel",
        type: "url",
      },
      {
        key: "paymentSession.expiresAt",
        label: "Expires at",
        example: "2026-05-01T23:59:59Z",
        type: "datetime",
      },
      {
        key: "paymentSession.externalReference",
        label: "External reference",
        example: "PAY-2026-00456",
        type: "string",
      },
      {
        key: "paymentSession.reference",
        label: "Reference alias",
        example: "PAY-2026-00456",
        type: "string",
      },
    ],
  },
  {
    id: "paymentSchedule",
    label: "Payment schedule",
    description: "Available in booking payment reminders.",
    variables: [
      { key: "paymentSchedule.id", label: "Schedule ID", example: "bps_01abcxyz", type: "string" },
      { key: "paymentSchedule.dueDate", label: "Due date", example: "2026-05-01", type: "date" },
      { key: "paymentSchedule.amountDue", label: "Amount due", example: "500", type: "currency" },
      { key: "paymentSchedule.currency", label: "Currency", example: "EUR", type: "string" },
      { key: "paymentSchedule.type", label: "Schedule type", example: "deposit", type: "string" },
      {
        key: "paymentSchedule.scheduleType",
        label: "Schedule type raw",
        example: "deposit",
        type: "string",
      },
      { key: "paymentSchedule.status", label: "Status", example: "pending", type: "string" },
      { key: "paymentSchedule.daysLeft", label: "Days left", example: "3", type: "number" },
    ],
  },
  {
    id: "items",
    label: "Items (loop)",
    description: "Booking items. Use in `{% for item in items %}` loops.",
    variables: [
      { key: "items", label: "Items array", example: '[{ title: "Double Room" }]', type: "array" },
      { key: "items[0].title", label: "First item title", example: "Double Room", type: "string" },
      {
        key: "items[0].description",
        label: "First item description",
        example: "Double Room",
        type: "string",
      },
      { key: "items[0].quantity", label: "First item quantity", example: "1", type: "number" },
      { key: "items[0].currency", label: "First item currency", example: "EUR", type: "string" },
      {
        key: "items[0].unitPrice",
        label: "First item unit price",
        example: "650",
        type: "currency",
      },
      { key: "items[0].total", label: "First item total", example: "650", type: "currency" },
      {
        key: "items[0].serviceDate",
        label: "First item service date",
        example: "2026-06-15",
        type: "date",
      },
      { key: "items[0].itemType", label: "First item type", example: "unit", type: "string" },
    ],
  },
  {
    id: "product",
    label: "Product",
    description: "Convenience alias to the first booking item title when available.",
    variables: [
      { key: "product.title", label: "Title", example: "Circuit Maroc 7 zile", type: "string" },
    ],
  },
  {
    id: "documents",
    label: "Documents",
    description: "Available in booking document bundle notifications.",
    variables: [
      {
        key: "documents",
        label: "Documents array",
        example: '[{ name: "Invoice" }]',
        type: "array",
      },
      {
        key: "documents[0].name",
        label: "First document name",
        example: "Invoice 42",
        type: "string",
      },
      {
        key: "documents[0].type",
        label: "First document type",
        example: "invoice",
        type: "string",
      },
      {
        key: "documents[0].key",
        label: "First document key",
        example: "invoice_pdf",
        type: "string",
      },
      { key: "documentsCount", label: "Document count", example: "2", type: "number" },
    ],
  },
]

export const notificationLiquidSnippets: NotificationLiquidSnippet[] = [
  {
    id: "output-default",
    label: "Output with default",
    description: "Render a value and fall back if it is missing.",
    code: '{{ traveler.firstName | default: "traveler" }}',
  },
  {
    id: "currency",
    label: "Currency formatting",
    description: "Format a number as currency.",
    code: "{{ booking.total | currency: booking.currency }}",
  },
  {
    id: "date",
    label: "Date formatting",
    description: "Format a date-like value for display.",
    code: "{{ paymentSchedule.dueDate | date_format }}",
  },
  {
    id: "if-booking",
    label: "Conditional booking section",
    description: "Render a section only when booking data exists.",
    code: "{% if booking.reference %}\nBooking reference: {{ booking.reference }}\n{% endif %}",
  },
  {
    id: "if-balance-due",
    label: "Conditional balance due",
    description: "Show a payment CTA only when there is an outstanding balance.",
    code: "{% if invoice.balanceDueAmount > 0 %}\nBalance due: {{ invoice.balanceDueAmount | currency: invoice.currency }}\n{% endif %}",
  },
  {
    id: "for-travelers",
    label: "Loop over travelers",
    description: "Iterate through all travelers on the booking.",
    code: "{% for traveler in travelers %}\n- {{ traveler.fullName | default: traveler.firstName }}\n{% endfor %}",
  },
  {
    id: "for-items",
    label: "Loop over items",
    description: "Render a compact booking line-item summary.",
    code: "{% for item in items %}\n- {{ item.title }} × {{ item.quantity }} — {{ item.total | currency: item.currency }}\n{% endfor %}",
  },
  {
    id: "for-documents",
    label: "Loop over documents",
    description: "Iterate through the attached documents list.",
    code: "{% for document in documents %}\n- {{ document.name }}\n{% endfor %}",
  },
  {
    id: "payment-link",
    label: "Payment link CTA",
    description: "Link to the latest active payment session when one exists.",
    code: "{% if payment.link %}\nPay now: {{ payment.link }}\n{% endif %}",
  },
  {
    id: "portal-booking-link",
    label: "Portal booking CTA",
    description: "Link to the booking in the customer portal when one is configured.",
    code: "{% if portal.bookingUrl %}\nView booking: {{ portal.bookingUrl }}\n{% endif %}",
  },
]
