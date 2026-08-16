import type { UnsatisfiedRequirementReasonV1 } from "@voyant-travel/catalog-contracts/booking-engine/requirements-validation"

export type BookingsUiJourneyMessages = {
  bookingJourney: {
    steps: Record<
      | "departure"
      | "billing"
      | "travelers"
      | "options"
      | "accommodation"
      | "addons"
      | "ancillaries"
      | "payment"
      | "documents"
      | "review",
      string
    > & {
      billingAndContact: string
      reviewAndConfirm: string
    }
    navigation: {
      back: string
      next: string
      checking: string
      continue: string
      edit: string
      done: string
      cancel: string
    }
    values: {
      noValue: string
      notSet: string
      none: string
      selectPlaceholder: string
    }
    validation: {
      completeStepBeforeContinuing: string
      unableToContinue: string
      quoteFailed: string
      retryQuote: string
      quoteUnavailable: string
      pricingUnavailable: string
      checkoutFailed: string
      paidPaymentDateRequired: string
      addAtLeastTravelers: string
      maxTravelersPerBooking: string
      ageOutOfRange: string
      dependencyRequires: string
      dependencyExcludes: string
      dependencyLimitPerMaster: string
      dependencyLimitSum: string
      invalidEmail: string
    }
    warnings: {
      phoneMissing: string
      billingCountryMissing: string
      vatMissing: string
      travelerFieldRequired: string
      paymentIntentMissing: string
      noTravelers: string
    }
    /**
     * Copy for the Booking Requirements the server says the selection does not
     * satisfy — the `selection_incomplete.unsatisfied[]` list. Keyed by the
     * contract's `reason` enum so a reason the server can emit and this package
     * cannot render is a compile error, not a blank line; `fallback` covers a
     * server that ships a new reason ahead of this package.
     */
    unsatisfied: {
      title: string
      fallback: string
      reasons: Record<UnsatisfiedRequirementReasonV1, string>
    }
    configure: {
      travelers: string
      departureDate: string
      option: string
      timeOptional: string
      checkIn: string
      checkOutWithNights: string
      cabinCategory: string
      cabinNumber: string
      airArrangements: string
      airOptions: Record<
        "cruise_line" | "independent" | "none",
        { label: string; description: string }
      >
      ageHintRange: string
      ageHintMinimum: string
      ageHintMaximum: string
    }
    billing: {
      title: string
      buyerType: string
      individual: string
      company: string
      firstName: string
      lastName: string
      email: string
      phone: string
      addressLine1: string
      addressLine2Optional: string
      city: string
      region: string
      postalCode: string
      country: string
      companyName: string
      vatId: string
      leadContactSummaryNote: string
      leadContactSummaryEmpty: string
    }
    travelers: {
      title: string
      partySize: string
      details: string
      decrease: string
      increase: string
      empty: string
      addTraveler: string
      travelerType: string
      travelerNumber: string
      ageLabel: string
      copyFromBilling: string
      remove: string
    }
    accommodation: {
      title: string
      empty: string
      extensionsAvailable: string
      ratePlan: string
      cancellationPrefix: string
      includesPrefix: string
    }
    addons: {
      title: string
      empty: string
      otherBucket: string
    }
    /**
     * Copy for the live third-party offer step.
     *
     * Deliberately vertical-neutral: the step renders whatever ancillary kinds
     * the deployment has connected, and the group's own label comes from the
     * offer data. Nothing here may name a vertical.
     */
    ancillaries: {
      decisionLegend: string
      declineLabel: string
      declineDescription: string
      providedBy: string
      perPerson: string
      perBooking: string
      priceHeldUntil: string
      detailsToggle: string
      notAvailable: string
      documentsTitle: string
      documentOpensInNewTab: string
      acknowledgeLabel: string
      acknowledgeRequired: string
      multipleProvidersTitle: string
      multipleProvidersHint: string
      sourceUnavailableTitle: string
      sourceUnavailableBody: string
      travelerFieldsTitle: string
      travelerFieldsHint: string
      travelerNumber: string
      sensitiveHint: string
    }
    payment: {
      title: string
      empty: string
      redirectedAfterConfirm: string
      linkSentAfterConfirm: string
      cardOperatorLabel: string
      cardOperatorDescription: string
      generateLinkLabel: string
      generateLinkHint: string
      inquiryNotice: string
      bankTransferInstructions: string
      bankTransferDefaultNote: string
      intentLabels: Record<
        "card" | "bank_transfer" | "hold" | "ticket_on_credit" | "inquiry",
        string
      >
      intentDescriptions: Record<
        "card" | "bank_transfer" | "hold" | "ticket_on_credit" | "inquiry",
        string
      >
    }
    review: {
      title: string
      leadContact: string
      travelers: string
      customerNotes: string
      customerNotesPlaceholder: string
      internalNotes: string
      confirmBooking: string
      confirming: string
      completeToConfirm: string
      priceOverrideToggle: string
      priceOverrideAmount: string
      priceOverrideReason: string
      priceOverrideReasonPlaceholder: string
      priceOverrideReasonRequired: string
    }
    documents: {
      saveAsDraft: string
      saveAsDraftHint: string
    }
    contract: {
      defaultTitle: string
      description: string
      errorPrefix: string
      iframeTitle: string
      termsLabel: string
      marketingLabel: string
      cancel: string
      acceptAndContinue: string
      previewRequestFailed: string
      previewMissing: string
    }
    sidePanel: {
      youAreBooking: string
      total: string
      pricingHint: string
      pricingHintRooms: string
      guestSingular: string
      guestPlural: string
      filledOf: string
      roomSingular: string
      roomPlural: string
      addOnSingular: string
      addOnPlural: string
      card: string
      hold: string
      onCredit: string
      confirmAndBook: string
      reviewDetails: string
      noTravelersYet: string
      notSelected: string
      noAddonsSelected: string
      adults: string
      children: string
      infants: string
      departure: string
      date: string
      checkIn: string
      checkOut: string
      cabin: string
      name: string
      email: string
      phone: string
      buyer: string
      company: string
      individual: string
      vat: string
      address: string
      travelerNumber: string
      dob: string
      method: string
      schedule: string
      payByCard: string
      ticketOnCredit: string
      holdNoChargeYet: string
    }
  }
}
