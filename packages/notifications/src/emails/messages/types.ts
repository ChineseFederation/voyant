/**
 * Copy for staff alert emails.
 *
 * Server-side and standalone rather than routed through `@voyant-travel/i18n`:
 * that package's runtime is a React context for the admin UI, and an email is
 * rendered in a subscriber with no provider tree. The shape is still a typed
 * message record so `en` and `ro` stay in lockstep — a missing key is a type
 * error, not a silently English email.
 */
export interface StaffAlertEmailMessages {
  common: {
    /** Footer attribution. */
    sentBy: (operatorName: string) => string
    viewInAdmin: string
    managePreferences: string
    whyReceiving: string
    notProvided: string
    unknownCustomer: string
    customer: string
    booking: string
    total: string
    travelDates: string
    travelers: string
  }
  bookingConfirmed: {
    eyebrow: string
    subject: (bookingNumber: string) => string
    preview: (customerName: string) => string
    headline: (bookingNumber: string) => string
    lead: string
  }
  bookingCancelled: {
    eyebrow: string
    subject: (bookingNumber: string) => string
    preview: (customerName: string) => string
    headline: (bookingNumber: string) => string
    lead: string
    reason: string
    previousStatus: string
  }
  bookingInquiryCreated: {
    eyebrow: string
    subject: (customerName: string) => string
    preview: (customerName: string) => string
    headline: (customerName: string) => string
    lead: string
    phone: string
    product: string
    departure: string
    locale: string
    message: string
  }
  paymentCompleted: {
    eyebrow: string
    subject: (amount: string) => string
    preview: (customerName: string) => string
    headline: (amount: string) => string
    lead: string
    provider: string
    paidInFull: string
    partialPayment: string
  }
  invoiceSettled: {
    eyebrow: string
    subject: (invoiceNumber: string) => string
    preview: (customerName: string) => string
    headline: (invoiceNumber: string) => string
    lead: string
    invoice: string
  }
  contractSigned: {
    eyebrow: string
    subject: (bookingNumber: string) => string
    preview: (signerName: string) => string
    headline: string
    lead: string
    signedBy: string
    signedAt: string
  }
  customerSignalCreated: {
    eyebrow: string
    subject: (personName: string) => string
    preview: (kind: string) => string
    headline: (personName: string) => string
    lead: string
    kind: string
    source: string
    priority: string
    interestedIn: string
    notes: string
    /** Rendered when the alert reached someone because they own the record. */
    assignedToYou: string
  }
}

export type StaffAlertEmailLocale = "en" | "ro"
