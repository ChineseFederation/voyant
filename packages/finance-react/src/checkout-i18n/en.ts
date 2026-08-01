import type { CheckoutUiMessages } from "./messages.js"

export const checkoutUiEn: CheckoutUiMessages = {
  paymentLinkLandingPage: {
    cardTab: "Pay by card",
    bankTab: "Bank transfer",
    expires: "Expires {date}",
    noMethods: {
      title: "No payment method available",
      body: "This payment link doesn't have any payment methods configured. Please contact your travel agent.",
    },
    card: {
      description: "You'll be redirected to the secure payment page hosted by the card processor.",
      payAmount: "Pay {amount}",
      startFailed: "Card payment couldn't be prepared.",
      errorAdvice:
        "{message} If the issue persists, please pay by bank transfer or contact your travel agent.",
    },
    bank: {
      instructions:
        "Wire {amount} to the account below. Your booking is confirmed once payment is received (typically 1-3 business days).",
      beneficiary: "Beneficiary",
      iban: "IBAN",
      bicSwift: "BIC / SWIFT",
      bank: "Bank",
      reference: "Reference",
    },
    copy: {
      copied: "Copied",
      copyValue: "Copy {value}",
    },
    terminal: {
      paid: {
        title: "Payment received",
        body: "Thanks - your booking is confirmed. You'll receive a confirmation email shortly.",
      },
      failed: {
        title: "Payment failed",
        body: "The payment couldn't be processed. Please try again or contact support.",
      },
      expired: {
        title: "Payment link expired",
        body: "This payment link has expired. Please request a new one from your travel agent.",
      },
      cancelled: {
        title: "Payment cancelled",
        body: "This payment was cancelled. Please contact your travel agent if this is unexpected.",
      },
      tryAgain: "Try again",
    },
    processing: {
      title: "Processing payment...",
      body: "We're confirming the payment with the processor. This usually takes a few seconds.",
    },
    descriptions: {
      booking: "Booking payment",
      booking_session: "Booking session payment",
      booking_payment_schedule: "Booking deposit",
      booking_guarantee: "Booking guarantee",
      invoice: "Invoice payment",
      order: "Order payment",
      flight_order: "Flight payment",
      other: "Payment",
      default: "Payment",
    },
  },
  paymentStep: {
    title: "Payment",
    description: "Pick a saved method or use a different payment option.",
    savedMethods: {
      title: "Saved payment methods",
      countOnFile: "{count} on file",
      empty: "No saved methods on file for this contact.",
      defaultBadge: "Default",
      expires: "Expires {month}/{year}",
      selected: "Selected",
    },
    otherOptions: {
      title: "Other payment options",
      newCard: {
        title: "New credit / debit card",
        body: "Charge a one-off card now.",
        cardholderName: "Cardholder name",
        cardNumber: "Card number",
        expiry: "MM/YY",
        cardNumberPlaceholder: ".... .... .... ....",
        expiryPlaceholder: "08/29",
      },
      hold: {
        title: "Hold - generate payment link",
        body: "Lock the order and generate a payment link the customer can open to pay by card or bank transfer. Share it however you prefer.",
      },
      cardSecurityNote:
        "Card details are handled securely by the payment provider and never stored here.",
      brandFallback: "card",
    },
  },
  collectPaymentDialog: {
    title: "Generate payment link",
    description: "Share with the customer to collect payment.",
    scheduleLabel: "Charge",
    scheduleHelp: "",
    scheduleCustomPlaceholder: "Custom amount",
    scheduleClear: "Clear schedule",
    scheduleFullAmount: "Full amount ({amount})",
    scheduleTypeLabels: {
      deposit: "Deposit",
      installment: "Installment",
      balance: "Balance",
      hold: "Hold",
      other: "Other",
    },
    amountLabel: "Amount ({currency})",
    amountLabelShort: "Amount",
    currencyLabel: "Currency",
    amountHelp: "",
    cancel: "Cancel",
    done: "Done",
    generateLink: "Generate link",
    validation: {
      amountAboveZero: "Enter an amount above zero.",
      linkReady: "Payment link ready - copy or share it with the customer.",
    },
    result: {
      noLink: "The session was created but no link could be built. Session id: {sessionId}.",
      noSession: "-",
      ready: "Payment link ready",
      body: "Share this link with the customer. They'll choose card or bank transfer on the page.",
      copyLink: "Copy link",
      openLink: "Open link",
    },
  },
}
