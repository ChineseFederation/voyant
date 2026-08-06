import type {
  BookingRefundPanelMessages,
  RecordRefundSettlementDialogMessages,
  RefundSettlementMethodMessages,
} from "../messages/refunds.js"

/**
 * Method names as an operator would say them, not as the enum spells them.
 * "Card reversal" is what an agent calls sending money back down the card, and
 * "Credit against their account" is what netting off a trade account is.
 */
const methods: RefundSettlementMethodMessages = {
  processor_reversal: "Card reversal",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  cheque: "Cheque",
  travel_credit: "Travel credit",
  voucher: "Voucher",
  counterparty_offset: "Credit against their account",
  other: "Other",
}

export const bookingRefundPanel: BookingRefundPanelMessages = {
  title: "Refunds",
  description:
    "A credit note says you owe the customer money back. This is where you say you paid it, and how.",
  empty: "You have not refunded anything on this booking.",
  notRefunded: "Not paid yet",
  owed: "Still owed",
  paidBack: "Already paid",
  recordAction: "Refund customer",
  rowRecordAction: "Refund",
  rowActions: "More",
  settleAction: "Mark as paid",
  failAction: "Mark as failed",
  executeAction: "Send the money back to the card",
  executeHint:
    "Sends the refund to the card. Whatever the processor answers is written down here, including a refusal.",
  reference: "Reference",
  noReference: "No reference",
  instrumentWorth: "Instrument worth",
  methods,
  statuses: {
    pending: "Not paid yet",
    settled: "Paid",
    failed: "Failed",
  },
  outcomes: {
    settled: "The processor accepted the refund. The customer has been paid.",
    pending: "The processor has not decided yet. The refund is still owed.",
    failed: "The processor refused the refund. The amount is available to refund again.",
    indeterminate:
      "We could not tell whether the refund went through. It is still counted as owed, so nobody can refund this money twice by accident. Check the processor and mark it paid or failed.",
    not_applicable: "Nothing was sent — this refund is not a card reversal, or it is already done.",
  },
}

export const recordRefundSettlementDialog: RecordRefundSettlementDialogMessages = {
  title: "Refund the customer",
  description:
    "Say how you paid the customer back. It does not have to be a card: a bank transfer, cash at the counter, a voucher, or a credit on their account are all normal.",
  paymentLabel: "Which payment is being refunded?",
  paymentPlaceholder: "Pick a payment",
  noPayments: "This booking has no completed payment to refund from.",
  paymentHint: "The payment the money comes back off. It is what limits how much can be refunded.",
  methodLabel: "How was it paid?",
  methodHint: "Pick a card reversal only when the money goes back down the card it came from.",
  amountLabel: "Amount refunded",
  currencyLabel: "Currency",
  alreadyPaidLabel: "The customer already has the money",
  alreadyPaidHint:
    "Leave this off for a bank transfer you have just sent. It will show as still owed until you mark it paid.",
  referenceLabel: "Reference",
  referenceHint: "The bank payment reference, the cheque number, or whatever the method has.",
  instrumentAmountLabel: "Voucher is worth",
  instrumentAmountHint:
    "Fill this in only when the voucher is worth more than the refund — offering 110% in credit instead of 100% in cash, for example.",
  counterpartyLabel: "Whose account is credited",
  counterpartyHint: "The organization whose balance this is netted against.",
  paymentSessionLabel: "Payment to reverse",
  paymentSessionPlaceholder: "Pick a card payment",
  noPaymentSessions:
    "This booking was never paid by card, so there is nothing to reverse. Pick another method — a bank transfer or cash refund works just as well.",
  paymentSessionHint: "The card payment the money goes back to.",
  notesLabel: "Notes",
  refundableLabel: "Still refundable",
  refundableHint: "What is left after refunds that are already paid or on their way.",
  pendingHeldNote:
    "A refund that has not arrived yet still counts against this, so nobody can send the same money twice.",
  submit: "Refund customer",
  cancel: "Cancel",
  approvalRequiredTitle: "This refund needs approval",
  approvalRequiredDescription:
    "Nothing has been paid yet. Once somebody approves it, come back here and record it again — the details are kept.",
  approvalIdLabel: "Approval",
  approvalRetry: "Record with approval",
  methods,
  errors: {
    amountRequired: "Enter how much was refunded.",
    amountExceedsRefundable: "That is more than is left to refund on this payment.",
    paymentSessionRequired: "Pick the card payment this reverses.",
    generic: "The refund could not be recorded.",
  },
}
