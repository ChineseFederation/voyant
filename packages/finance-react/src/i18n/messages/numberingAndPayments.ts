import type { InvoiceNumberResetStrategy, InvoiceNumberSeriesScope } from "./core.js"

export type InvoiceNumberSeriesPageMessages = {
  title: string
  description: string
  actions: {
    create: string
  }
  columns: {
    code: string
    name: string
    prefix: string
    current: string
    reset: string
    scope: string
    default: string
    status: string
    external: string
  }
  filters: {
    scopeLabel: string
    scopeAll: string
    activeLabel: string
    activeAll: string
    activeOnly: string
    inactiveOnly: string
  }
  scopeLabels: Record<InvoiceNumberSeriesScope, string>
  resetStrategyLabels: Record<InvoiceNumberResetStrategy, string>
  active: string
  inactive: string
  default: string
  notDefault: string
  noExternalProvider: string
  empty: string
  loadFailed: string
  deleteConfirm: string
}

export type InvoiceNumberSeriesDialogMessages = {
  titleNew: string
  titleEdit: string
  fields: {
    code: string
    name: string
    prefix: string
    separator: string
    padLength: string
    currentSequence: string
    resetStrategy: string
    scope: string
    isDefault: string
    externalProvider: string
    externalConfigKey: string
    active: string
  }
  advancedLabel: string
  placeholders: {
    code: string
    name: string
    prefix: string
    separator: string
    externalProvider: string
    externalConfigKey: string
  }
  help: {
    previewLabel: string
    previewSample: string
    default: string
    external: string
  }
  actions: {
    create: string
  }
  validation: {
    codeRequired: string
    nameRequired: string
    padLengthInvalid: string
    currentSequenceInvalid: string
  }
}

export type PaymentsPageMessages = {
  title: string
  description: string
  searchPlaceholder: string
  actions: {
    recordPayment: string
  }
  kindLabels: {
    customer: string
    supplier: string
  }
  filters: {
    button: string
    kindLabel: string
    kindAll: string
    statusLabel: string
    statusAll: string
    methodLabel: string
    methodAll: string
    supplierLabel: string
    supplierAny: string
    supplierEmpty: string
    currencyLabel: string
    currencyAny: string
    paymentDateLabel: string
    dateAny: string
    clear: string
  }
  columns: {
    kind: string
    reference: string
    party: string
    amount: string
    status: string
    date: string
    method: string
  }
  noValue: string
  empty: string
  loadFailed: string
  pagination: {
    showing: string
    page: string
    previous: string
    next: string
  }
}

export type PaymentDetailPageMessages = {
  actions: {
    back: string
    viewInvoice: string
    viewBooking: string
    viewPerson: string
    viewOrganization: string
    viewSupplier: string
    edit: string
    delete: string
    deleteTitle: string
    deleteDescription: string
  }
  titles: {
    summary: string
    links: string
    metadata: string
  }
  fields: {
    amount: string
    baseAmount: string
    fxRate: string
    status: string
    method: string
    date: string
    refundable: string
    reference: string
    notes: string
    kind: string
    paidBy: string
    paidTo: string
    organization: string
    invoice: string
    booking: string
    createdAt: string
    updatedAt: string
  }
  states: {
    loading: string
    loadFailed: string
    notFound: string
    noValue: string
    refundPending: string
  }
}

export type PaymentPolicyMessages = {
  form: {
    inherit: {
      label: string
      help: string
      tooltipLabel: string
    }
    depositKind: {
      label: string
      options: Record<"none" | "percent" | "fixed_cents", string>
    }
    depositValue: {
      percentLabel: string
      fixedLabel: string
    }
    depositHints: Record<"none" | "percent" | "fixed_cents", string>
    days: {
      minDaysLabel: string
      minDaysHelp: string
      balanceDaysLabel: string
      balanceDaysHelp: string
      graceDaysLabel: string
      graceDaysHelp: string
      tooltipLabel: string
      suffix: string
    }
  }
  preview: {
    inheriting: string
    sample: string
    scheduleTypes: Record<"deposit" | "balance" | "full", string>
    due: string
  }
  supplierCard: {
    title: string
    description: string
    missingCurrency: string
    save: string
    savedToast: string
    saveFailed: string
  }
}

export type RecordBookingPaymentDialogMessages = {
  title: string
  /** Title used when the dialog runs in edit mode. */
  editTitle: string
  /** Body intro. Includes the `{generateLink}` placeholder bolded by the dialog. */
  description: string
  /** Inline emphasized label used inside `description`. */
  generateLinkLabel: string
  fields: {
    invoice: string
    amountCents: string
    currency: string
    /** Override-rate input label. Placeholders: `{invoiceCurrency} {paymentCurrency}`. */
    fxRate: string
    paymentDate: string
    paymentMethod: string
    status: string
    referenceNumber: string
    notes: string
    /** Switch shown when the selected invoice is a proforma. */
    convertProformaAfter: string
    /** Helper copy under the convert-proforma switch. */
    convertProformaAfterHint: string
  }
  placeholders: {
    invoice: string
    currency: string
    /** Placeholder for manual FX rate. Placeholders: `{invoiceCurrency} {paymentCurrency}`. */
    fxRate: string
    referenceNumber: string
  }
  fx: {
    title: string
    /** Pre-conversion help text. Placeholders: `{invoiceCurrency} {paymentCurrency}`. */
    help: string
    loadingRate: string
    /** Conversion summary. Placeholders: `{amount} {paymentCurrency} {baseAmount} {invoiceCurrency} {rate}`. */
    summary: string
    /** Commission note. Placeholders: `{rawRate} {commission} {invoiceCurrency} {paymentCurrency}`. */
    commissionNote: string
    /** Source attribution when commission is zero. */
    source: string
    /** Shown when the auto rate can't be fetched. Placeholders: `{invoiceCurrency} {paymentCurrency}`. */
    rateUnavailable: string
    /** Action button to switch to manual rate. */
    override: string
    /** Action button to switch back to auto rate. */
    useAuto: string
  }
  /** Per-row option label. Placeholders: `{number} {status} {balance} {currency}`. */
  invoiceOption: string
  /** Caption under the picker. Placeholders: `{total} {paid} {due} {currency}`. */
  invoiceMeta: string
  loadingInvoices: string
  noInvoices: string
  /** Explains why positive-balance draft / external-allocation rows are not payable here. */
  payableStatusHint: string
  actions: {
    record: string
    save: string
  }
  validation: {
    invoiceRequired: string
    amountMinimum: string
    baseAmountRequired: string
    recordFailed: string
  }
}
