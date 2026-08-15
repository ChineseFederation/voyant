import type { PublicPaymentSession } from "@voyant-travel/finance/public-validation"

export type CheckoutPaymentTargetType = PublicPaymentSession["targetType"]

export type CheckoutUiMessages = {
  paymentLinkLandingPage: {
    cardTab: string
    bankTab: string
    expires: string
    noMethods: {
      title: string
      body: string
    }
    card: {
      description: string
      /** Shown instead of `description` when the form is mounted in place. */
      embeddedDescription: string
      payAmount: string
      startFailed: string
      errorAdvice: string
      /** The processor offered an in-page form this deployment cannot mount. */
      embeddedUnavailableTitle: string
      embeddedUnavailableBody: string
    }
    bank: {
      instructions: string
      beneficiary: string
      iban: string
      bicSwift: string
      bank: string
      reference: string
    }
    copy: {
      copied: string
      copyValue: string
    }
    terminal: {
      paid: {
        title: string
        body: string
      }
      failed: {
        title: string
        body: string
      }
      expired: {
        title: string
        body: string
      }
      cancelled: {
        title: string
        body: string
      }
      tryAgain: string
    }
    processing: {
      title: string
      body: string
    }
    descriptions: Record<CheckoutPaymentTargetType | "default", string>
  }
  paymentStep: {
    title: string
    description: string
    savedMethods: {
      title: string
      countOnFile: string
      empty: string
      defaultBadge: string
      expires: string
      selected: string
    }
    otherOptions: {
      title: string
      newCard: {
        title: string
        body: string
        cardholderName: string
        cardNumber: string
        expiry: string
        cardNumberPlaceholder: string
        expiryPlaceholder: string
      }
      hold: {
        title: string
        body: string
      }
      cardSecurityNote: string
      brandFallback: string
    }
  }
  collectPaymentDialog: {
    title: string
    description: string
    /** Picker label above the schedule dropdown. */
    scheduleLabel: string
    /** Caption under the picker. */
    scheduleHelp: string
    /** Placeholder when no schedule is selected — operator types a custom amount. */
    scheduleCustomPlaceholder: string
    /** Aria-label / tooltip for the X button that clears the picked schedule. */
    scheduleClear: string
    /** "Full amount ({amount})" option label. */
    scheduleFullAmount: string
    /** Localized labels for each `payment_schedule_type` enum value. */
    scheduleTypeLabels: Record<"deposit" | "installment" | "balance" | "hold" | "other", string>
    /**
     * Label used instead of `scheduleTypeLabels` when the obligation was
     * raised by a Booking Amendment — "Change difference" reads better to
     * an operator than "Other".
     */
    scheduleAmendmentLabel: string
    amountLabel: string
    amountLabelShort: string
    currencyLabel: string
    amountHelp: string
    cancel: string
    done: string
    generateLink: string
    validation: {
      amountAboveZero: string
      linkReady: string
    }
    result: {
      noLink: string
      noSession: string
      ready: string
      body: string
      copyLink: string
      openLink: string
    }
    send: {
      /** Heading for the "email this link" block under a ready link. */
      title: string
      /** Label for the template picker. */
      templateLabel: string
      templatePlaceholder: string
      /** Primary action. */
      action: string
      /** Toast on a successful dispatch. */
      sent: string
      /**
       * Shown instead of the picker when the deployment has published no
       * email templates — the link is still copyable.
       */
      noTemplates: string
    }
  }
}
