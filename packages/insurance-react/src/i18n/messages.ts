/**
 * The message catalogue's shape.
 *
 * Every string the package renders is a key here, so `verify:ui-literals` (an
 * AST scan for hardcoded copy) has nothing to find and a deployment can
 * override any of it. The `en` and `ro` catalogues both satisfy this type, so
 * adding a key without translating it does not compile.
 */
export type InsuranceUiMessages = {
  bookingCard: {
    heading: string
    empty: string
    coverWindow: string
    premium: string
    policyNumber: string
    provider: string
    insuredPersons: string
    documents: string
    noDocuments: string
    attempts: string
  }
  issueState: {
    pending: string
    issued: string
    issueFailed: string
    cancelled: string
  }
  applicationStatus: {
    open: string
    submitted: string
    accepted: string
    declined: string
    expired: string
    withdrawn: string
  }
  eligibility: {
    eligible: string
    ineligible: string
    referral: string
  }
  failure: {
    heading: string
    retryable: string
    notRetryable: string
  }
  cancellation: {
    heading: string
    refund: string
    noRefund: string
  }
  identity: {
    /** Shown when the viewer lacks `insurance-pii:read`. */
    redacted: string
    /** Shown when nothing identifying was ever stored. */
    absent: string
    insuredPerson: string
  }
  actions: {
    retryIssue: string
    retryingIssue: string
    cancelPolicy: string
    cancellingPolicy: string
    reasonPlaceholder: string
  }
}
