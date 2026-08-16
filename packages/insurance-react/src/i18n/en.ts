import type { InsuranceUiMessages } from "./messages.js"

export const insuranceUiEn: InsuranceUiMessages = {
  bookingCard: {
    heading: "Travel insurance",
    empty: "No travel insurance was bought with this booking.",
    coverWindow: "{from} to {to}",
    premium: "Premium",
    policyNumber: "Policy number",
    provider: "Insurer",
    insuredPersons: "Insured",
    documents: "Documents",
    noDocuments: "The insurer has not supplied a certificate yet.",
    attempts: "{count} issue attempts",
  },
  issueState: {
    pending: "Issuing",
    issued: "Issued",
    issueFailed: "Not issued",
    cancelled: "Cancelled",
  },
  applicationStatus: {
    open: "Open",
    submitted: "Submitted",
    accepted: "Accepted",
    declined: "Declined",
    expired: "Expired",
    withdrawn: "Withdrawn",
  },
  eligibility: {
    eligible: "Eligible",
    ineligible: "Not eligible",
    referral: "Needs review by the insurer",
  },
  failure: {
    heading: "The insurer did not issue this policy",
    retryable: "Asking again may succeed.",
    notRetryable: "Asking again will not succeed.",
  },
  cancellation: {
    heading: "Cancelled",
    refund: "Refunded {amount}",
    noRefund: "The insurer returned nothing.",
  },
  identity: {
    redacted: "You do not have permission to see the insured person's details.",
    absent: "No identity details were stored.",
    insuredPerson: "Insured person {initial}",
  },
  actions: {
    retryIssue: "Ask the insurer again",
    retryingIssue: "Asking the insurer...",
    cancelPolicy: "Cancel policy",
    cancellingPolicy: "Cancelling...",
    reasonPlaceholder: "Why?",
  },
}
