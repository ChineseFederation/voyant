/** Copy for the money leg of a refund (voyant#4303). */

export type RefundSettlementMethodMessages = {
  processor_reversal: string
  bank_transfer: string
  cash: string
  cheque: string
  travel_credit: string
  voucher: string
  counterparty_offset: string
  other: string
}

export type RefundSettlementStatusMessages = {
  pending: string
  settled: string
  failed: string
}

export type BookingRefundPanelMessages = {
  title: string
  description: string
  empty: string
  notRefunded: string
  owed: string
  paidBack: string
  recordAction: string
  rowRecordAction: string
  rowActions: string
  settleAction: string
  failAction: string
  executeAction: string
  executeHint: string
  reference: string
  noReference: string
  instrumentWorth: string
  methods: RefundSettlementMethodMessages
  statuses: RefundSettlementStatusMessages
  outcomes: {
    settled: string
    pending: string
    failed: string
    indeterminate: string
    not_applicable: string
  }
}

export type RecordRefundSettlementDialogMessages = {
  title: string
  description: string
  paymentLabel: string
  paymentPlaceholder: string
  noPayments: string
  paymentHint: string
  methodLabel: string
  methodHint: string
  amountLabel: string
  currencyLabel: string
  alreadyPaidLabel: string
  alreadyPaidHint: string
  referenceLabel: string
  referenceHint: string
  instrumentAmountLabel: string
  instrumentAmountHint: string
  counterpartyLabel: string
  counterpartyHint: string
  paymentSessionLabel: string
  paymentSessionPlaceholder: string
  noPaymentSessions: string
  paymentSessionHint: string
  notesLabel: string
  refundableLabel: string
  refundableHint: string
  pendingHeldNote: string
  submit: string
  cancel: string
  approvalRequiredTitle: string
  approvalRequiredDescription: string
  approvalIdLabel: string
  approvalRetry: string
  methods: RefundSettlementMethodMessages
  errors: {
    amountRequired: string
    amountExceedsRefundable: string
    paymentSessionRequired: string
    generic: string
  }
}
