export interface FinanceDepartureProfitabilityFilters {
  from?: string | undefined
  to?: string | undefined
  productId?: string | undefined
  departureId?: string | undefined
  currency?: string | undefined
  baseCurrency?: string | undefined
}

export interface FinanceProductProfitabilityFilters {
  from?: string | undefined
  to?: string | undefined
  currency?: string | undefined
  baseCurrency?: string | undefined
}

export interface FinanceTravelerProfitabilityFilters {
  departureId: string
  currency: string
}

export type FinanceInvoiceListSortField =
  | "invoiceNumber"
  | "status"
  | "totalCents"
  | "paidCents"
  | "balanceDueCents"
  | "issueDate"
  | "dueDate"
  | "createdAt"

export type FinanceInvoiceListSortDir = "asc" | "desc"

export interface FinanceInvoiceListFilters {
  search?: string | undefined
  /**
   * Filter to invoices for a specific booking. Drives the booking
   * detail page's "Facturi" card. Server-side check is by exact
   * `bookings.id`, no fuzzy matching.
   */
  bookingId?: string | undefined
  /** Filter by invoice status (draft, issued, paid, ...). */
  status?: string | undefined
  personId?: string | undefined
  organizationId?: string | undefined
  currency?: string | undefined
  dueDateFrom?: string | undefined
  dueDateTo?: string | undefined
  sortBy?: FinanceInvoiceListSortField | undefined
  sortDir?: FinanceInvoiceListSortDir | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export type FinanceInvoiceNumberSeriesScope = "invoice" | "proforma" | "credit_note"

export interface FinanceInvoiceNumberSeriesListFilters {
  scope?: FinanceInvoiceNumberSeriesScope | undefined
  active?: boolean | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export type FinanceSupplierInvoiceListSortField =
  | "issueDate"
  | "dueDate"
  | "totalCents"
  | "balanceDueCents"
  | "status"
  | "createdAt"

export type FinanceSupplierInvoiceListSortDir = "asc" | "desc"

export interface FinanceSupplierInvoiceListFilters {
  supplierId?: string | undefined
  status?: string | undefined
  currency?: string | undefined
  dueDateFrom?: string | undefined
  dueDateTo?: string | undefined
  departureId?: string | undefined
  productId?: string | undefined
  bookingId?: string | undefined
  search?: string | undefined
  sortBy?: FinanceSupplierInvoiceListSortField | undefined
  sortDir?: FinanceSupplierInvoiceListSortDir | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export type FinanceSupplierPaymentListSortField =
  | "amountCents"
  | "status"
  | "paymentDate"
  | "createdAt"

export type FinanceSupplierPaymentListSortDir = "asc" | "desc"

export interface FinanceSupplierPaymentListFilters {
  bookingId?: string | undefined
  supplierId?: string | undefined
  status?: string | undefined
  paymentMethod?: string | undefined
  currency?: string | undefined
  paymentDateFrom?: string | undefined
  paymentDateTo?: string | undefined
  sortBy?: FinanceSupplierPaymentListSortField | undefined
  sortDir?: FinanceSupplierPaymentListSortDir | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export type FinancePaymentKind = "customer" | "supplier"

export type FinanceAllPaymentsListSortField = "amountCents" | "status" | "paymentDate" | "createdAt"

export type FinanceAllPaymentsListSortDir = "asc" | "desc"

export interface FinanceAllPaymentsListFilters {
  kind?: FinancePaymentKind | undefined
  status?: string | undefined
  paymentMethod?: string | undefined
  currency?: string | undefined
  invoiceId?: string | undefined
  bookingId?: string | undefined
  supplierId?: string | undefined
  paymentDateFrom?: string | undefined
  paymentDateTo?: string | undefined
  search?: string | undefined
  sortBy?: FinanceAllPaymentsListSortField | undefined
  sortDir?: FinanceAllPaymentsListSortDir | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface FinanceTravelCreditListFilters {
  status?: string | undefined
  seriesCode?: string | undefined
  issuedToPersonId?: string | undefined
  issuedToOrganizationId?: string | undefined
  search?: string | undefined
  hasBalance?: boolean | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface PublicBookingPaymentOptionsFilters {
  personId?: string | undefined
  organizationId?: string | undefined
  provider?: string | undefined
  instrumentType?: string | undefined
  includeInactive?: boolean | undefined
}

export interface PublicFinanceDocumentLookupFilters {
  reference?: string | undefined
}

export type FinancePaymentSessionStatusFilter =
  | "pending"
  | "requires_redirect"
  | "processing"
  | "authorized"
  | "paid"
  | "failed"
  | "cancelled"
  | "expired"

export interface FinancePaymentSessionListFilters {
  bookingId?: string | undefined
  legacyOrderId?: string | undefined
  invoiceId?: string | undefined
  bookingPaymentScheduleId?: string | undefined
  bookingGuaranteeId?: string | undefined
  status?: FinancePaymentSessionStatusFilter | undefined
  provider?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface FinanceActionLedgerListCursor {
  occurredAt: string
  id: string
}

export interface FinanceActionLedgerListFilters {
  cursorOccurredAt?: string | undefined
  cursorId?: string | undefined
  limit?: number | undefined
}

export interface FinanceInvoiceFxRateFilters {
  baseCurrency?: string | undefined
  quoteCurrency?: string | undefined
  date?: string | undefined
}

export const financeQueryKeys = {
  all: ["voyant", "finance"] as const,

  invoices: () => [...financeQueryKeys.all, "invoices"] as const,
  invoicesList: (filters: FinanceInvoiceListFilters) =>
    [...financeQueryKeys.invoices(), "list", filters] as const,
  invoice: (id: string) => [...financeQueryKeys.invoices(), "detail", id] as const,
  invoiceActionLedger: (id: string, filters: FinanceActionLedgerListFilters = {}) =>
    [...financeQueryKeys.invoice(id), "action-ledger", filters] as const,
  lineItems: (invoiceId: string) => [...financeQueryKeys.invoice(invoiceId), "line-items"] as const,
  payments: (invoiceId: string) => [...financeQueryKeys.invoice(invoiceId), "payments"] as const,
  creditNotes: (invoiceId: string) =>
    [...financeQueryKeys.invoice(invoiceId), "credit-notes"] as const,
  notes: (invoiceId: string) => [...financeQueryKeys.invoice(invoiceId), "notes"] as const,
  attachments: (invoiceId: string) =>
    [...financeQueryKeys.invoice(invoiceId), "attachments"] as const,

  bookingPaymentSchedules: (bookingId: string) =>
    [...financeQueryKeys.all, "booking-payment-schedules", bookingId] as const,
  bookingGuarantees: (bookingId: string) =>
    [...financeQueryKeys.all, "booking-guarantees", bookingId] as const,
  invoiceFxRate: (filters: FinanceInvoiceFxRateFilters) =>
    [...financeQueryKeys.all, "invoice-fx-rate", filters] as const,

  invoiceNumberSeries: () => [...financeQueryKeys.all, "invoice-number-series"] as const,
  invoiceNumberSeriesList: (filters: FinanceInvoiceNumberSeriesListFilters) =>
    [...financeQueryKeys.invoiceNumberSeries(), "list", filters] as const,
  invoiceNumberSeriesDetail: (id: string) =>
    [...financeQueryKeys.invoiceNumberSeries(), "detail", id] as const,

  supplierInvoices: () => [...financeQueryKeys.all, "supplier-invoices"] as const,
  supplierInvoicesList: (filters: FinanceSupplierInvoiceListFilters) =>
    [...financeQueryKeys.supplierInvoices(), "list", filters] as const,
  supplierInvoice: (id: string) => [...financeQueryKeys.supplierInvoices(), "detail", id] as const,
  supplierInvoicePayments: (id: string) =>
    [...financeQueryKeys.supplierInvoice(id), "payments"] as const,
  supplierInvoiceAttachments: (id: string) =>
    [...financeQueryKeys.supplierInvoice(id), "attachments"] as const,

  departureProfitability: (filters: FinanceDepartureProfitabilityFilters) =>
    [...financeQueryKeys.all, "profitability", "departures", filters] as const,
  productProfitability: (filters: FinanceProductProfitabilityFilters) =>
    [...financeQueryKeys.all, "profitability", "products", filters] as const,
  travelerProfitability: (filters: FinanceTravelerProfitabilityFilters) =>
    [...financeQueryKeys.all, "profitability", "travelers", filters] as const,
  costCategories: () => [...financeQueryKeys.all, "cost-categories"] as const,
  accountantShares: () => [...financeQueryKeys.all, "accountant-shares"] as const,
  accountantSummary: (token: string, baseCurrency?: string) =>
    [...financeQueryKeys.all, "accountant-portal", token, "summary", baseCurrency ?? ""] as const,
  accountantInvoices: (token: string) =>
    [...financeQueryKeys.all, "accountant-portal", token, "invoices"] as const,

  supplierPayments: () => [...financeQueryKeys.all, "supplier-payments"] as const,
  supplierPaymentsList: (filters: FinanceSupplierPaymentListFilters) =>
    [...financeQueryKeys.supplierPayments(), "list", filters] as const,

  allPayments: () => [...financeQueryKeys.all, "all-payments"] as const,
  allPaymentsList: (filters: FinanceAllPaymentsListFilters) =>
    [...financeQueryKeys.allPayments(), "list", filters] as const,
  payment: (id: string) => [...financeQueryKeys.allPayments(), "detail", id] as const,
  paymentSessions: () => [...financeQueryKeys.all, "payment-sessions"] as const,
  paymentSessionsList: (filters: FinancePaymentSessionListFilters) =>
    [...financeQueryKeys.paymentSessions(), "list", filters] as const,
  paymentSessionActionLedger: (id: string, filters: FinanceActionLedgerListFilters = {}) =>
    [...financeQueryKeys.paymentSessions(), id, "action-ledger", filters] as const,

  publicCheckout: () => [...financeQueryKeys.all, "public-checkout"] as const,
  publicFinanceDocumentLookup: (filters: PublicFinanceDocumentLookupFilters) =>
    [...financeQueryKeys.publicCheckout(), "document-lookup", filters] as const,
  publicBookingDocuments: (bookingId: string) =>
    [...financeQueryKeys.publicCheckout(), "booking-documents", bookingId] as const,
  publicBookingPayments: (bookingId: string) =>
    [...financeQueryKeys.publicCheckout(), "booking-payments", bookingId] as const,
  adminBookingPayments: (bookingId: string) =>
    [...financeQueryKeys.all, "admin-booking-payments", bookingId] as const,
  bookingPaymentDisputes: (bookingId: string) =>
    [...financeQueryKeys.all, "booking-payment-disputes", bookingId] as const,
  bookingRefundSettlements: (bookingId: string) =>
    [...financeQueryKeys.all, "booking-refund-settlements", bookingId] as const,
  refundSettlements: (filters: FinanceRefundSettlementListFilters) =>
    [...financeQueryKeys.all, "refund-settlements", filters] as const,
  paymentRefundableRemainder: (paymentId: string) =>
    [...financeQueryKeys.all, "payment-refundable-remainder", paymentId] as const,
  publicBookingPaymentOptions: (bookingId: string, filters: PublicBookingPaymentOptionsFilters) =>
    [...financeQueryKeys.publicCheckout(), "booking-payment-options", bookingId, filters] as const,
  publicPaymentSession: (sessionId: string) =>
    [...financeQueryKeys.publicCheckout(), "payment-session", sessionId] as const,
  publicTravelCreditValidation: () =>
    [...financeQueryKeys.publicCheckout(), "travel-credit-validation"] as const,

  travelCredits: () => [...financeQueryKeys.all, "travel-credits"] as const,
  travelCreditsList: (filters: FinanceTravelCreditListFilters) =>
    [...financeQueryKeys.travelCredits(), "list", filters] as const,
  travelCredit: (id: string) => [...financeQueryKeys.travelCredits(), "detail", id] as const,
} as const

/** Filters accepted by `GET /v1/admin/finance/refund-settlements` (voyant#4303). */
export interface FinanceRefundSettlementListFilters {
  bookingId?: string
  creditNoteId?: string
  paymentId?: string
  invoiceId?: string
  method?: string
  status?: string
  owed?: boolean
  limit?: number
  offset?: number
}
