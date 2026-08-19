export type BookingsUiCreateListMessages = {
  manualBookingCreate: {
    sections: {
      bookingItem: string
      billing: string
      payment: string
    }
    fields: {
      departure: string
      sellAmount: string
      currency: string
      contactFirstName: string
      contactLastName: string
      contactEmail: string
      contactPhone: string
      billingAddress: string
      billingAddressRequired: string
      billingAddressLine1: string
      billingAddressLine2: string
      billingCity: string
      billingRegion: string
      billingPostalCode: string
      billingCountry: string
      billingTaxId: string
      addPayment: string
      notes: string
    }
    placeholders: {
      departure: string
      departureEmpty: string
      notes: string
    }
    hints: {
      departureOptional: string
      payment: string
      contactLoading: string
      contactUnavailable: string
      contactIncomplete: string
      billingAddress: string
      billingAddressRequired: string
      billingAddressLoading: string
    }
    validation: {
      product: string
      departure: string
      units: string
      person: string
      organization: string
      contact: string
      contactName: string
      contactMethod: string
      billingAddress: string
      billingTaxId: string
      email: string
      travelers: string
      travelerNames: string
      leadTraveler: string
      amount: string
      pricingPending: string
      pricingUnavailable: string
      sourcedBookingSessionRequired: string
      paymentGuaranteeRequired: string
      bookingSession: {
        revisionConflict: string
        quoteChanged: string
        availabilityChanged: string
        quoteUnavailable: string
        selectionIncomplete: string
        requirementsChanged: string
        commitRejected: string
        commitInFlight: string
        alreadyCommitted: string
        supplierUnavailable: string
        proposalAcceptanceRequired: string
        notAuthorized: string
        unknown: string
      }
      overrideReason: string
      payment: string
      paidPaymentDate: string
      sharedRoomGroup: string
      create: string
    }
    submitBlocked: {
      /** Wraps a reason with the name of the button it explains. `{reason}`. */
      label: string
      units: string
    }
    promotion: {
      heading: string
      code: string
      placeholder: string
      checking: string
      valid: string
      invalid: string
      notFound: string
      expired: string
      notYetValid: string
      notApplicable: string
      unavailable: string
      blocked: string
    }
    actions: {
      create: string
      confirmCreate: string
      retryContact: string
    }
    confirm: {
      title: string
      description: string
    }
    summary: {
      title: string
      product: string
      departure: string
      billing: string
      travelers: string
      total: string
      missing: string
      openDated: string
    }
    priceOverrideReason: string
  }
  bookingDialog: {
    editTitle: string
    fields: {
      bookingNumber: string
      status: string
      sellCurrency: string
      travelDates: string
      sellAmountCents: string
      costAmountCents: string
      pax: string
      internalNotes: string
    }
    placeholders: {
      bookingNumber: string
      travelDates: string
      pax: string
      internalNotes: string
    }
    validation: {
      bookingNumberRequired: string
      sellCurrencyInvalid: string
    }
  }
  bookingCreateDialog: {
    title: string
    fields: {
      departure: string
      internalNotes: string
      notifyTraveler: string
      notifyTravelerHint: string
    }
    placeholders: {
      departure: string
      departureNone: string
      departureEmpty: string
      internalNotes: string
    }
    validation: {
      selectProduct: string
      selectDeparture: string
      selectUnits: string
      selectPerson: string
      selectOrganization: string
      billingContactRequired: string
      billingEmailInvalid: string
      travelerRequired: string
      firstAndLastNameRequired: string
      roomCapacityExceeded: string
      selectSharedRoomGroup: string
      createFailed: string
      payloadResolverMismatchDetails: string
      payloadResolverMismatchFallback: string
      payloadResolverMismatchLine: string
      paidPaymentDateRequired: string
    }
    actions: {
      createBooking: string
    }
    labels: {
      currency: string
      remainingCapacity: string
      noSpecificOption: string
      createNewPerson: string
      selectExistingPerson: string
      organizationNone: string
      billingHeading: string
      addTraveler: string
      travelerHeading: string
      travelerRole: string
      travelerLead: string
      travelerAdult: string
      travelerChild: string
      travelerInfant: string
      travelerRoom: string
      travelerNoRoom: string
      travelerRemove: string
      travelerEmpty: string
      travelerPerson: string
      travelerPersonSearchPlaceholder: string
      travelerPersonEmpty: string
      createPersonSheetTitle: string
      addBillingPersonAsTraveler: string
      roomsHeading: string
      roomsNoOption: string
      roomsNoSlot: string
      roomsNoUnits: string
      roomsRemaining: string
      roomsUnlimited: string
      extrasHeading: string
      extrasEmpty: string
      extrasIncluded: string
      extrasOnRequest: string
      extrasPerPerson: string
      sharedRoomToggle: string
      sharedRoomCreateMode: string
      sharedRoomJoinMode: string
      sharedRoomSelectPlaceholder: string
      sharedRoomNoGroups: string
      sharedRoomCreateHint: string
      sharedRoomRemove: string
      sharedRoomGeneratedLabelPrefix: string
      travelCreditHeading: string
      travelCreditCodePlaceholder: string
      travelCreditApply: string
      travelCreditClear: string
      travelCreditRemainingLabel: string
      travelCreditInvalidLabel: string
      paymentHeading: string
      previewHeading: string
      previewEmpty: string
      previewProduct: string
      previewDeparture: string
      previewOptions: string
      previewRooms: string
      previewTravelers: string
      previewTotal: string
      previewLoading: string
      previewTravelerUnnamed: string
      paymentModeUnpaid: string
      paymentModeFull: string
      paymentModeAdvance: string
      paymentModeSplit: string
      paymentDueDate: string
      /** Placeholder for the due-date picker while no date is chosen. */
      paymentDueDatePlaceholder: string
      paymentAmount: string
      paymentFirstInstallment: string
      paymentSecondInstallment: string
      /**
       * Row heading for the third and later installments. `{index}` is the
       * 1-based row number. The first two rows use their own ordinal entries.
       */
      paymentInstallmentN: string
      paymentPreset5050: string
      paymentUnpaidHint: string
      paymentTotalDue: string
      paymentScheduledTotal: string
      paymentRemaining: string
      paymentAlreadyPaid: string
      paymentDate: string
      /** Placeholder for the payment-date picker while no date is chosen. */
      paymentDatePlaceholder: string
      paymentMethod: string
      paymentReference: string
      documentGenerationHeading: string
      generateContractDocument: string
      generateInvoiceDocument: string
      /** Mutually exclusive with `generateInvoiceAndContract`. */
      generateProforma: string
      /** Mutually exclusive with `generateProforma`. */
      generateInvoiceAndContract: string
      /**
       * Shown in place of the contract option when the deployment has no
       * customer contract template to render, so ticking it could only ever
       * produce the invoice half. See voyant#4634.
       */
      generateInvoiceAndContractUnavailable: string
      breakdownHeading: string
      breakdownTotal: string
      breakdownOnRequest: string
      breakdownGroupRate: string
      breakdownEmpty: string
      breakdownNoPricing: string
      breakdownConfirmedTotal: string
      breakdownManualTotal: string
      breakdownUseCatalogTotal: string
      breakdownOverrideReason: string
      breakdownOverrideReasonPlaceholder: string
      breakdownOverrideReasonRequired: string
      breakdownPerTraveler: string
      breakdownPerRoom: string
      breakdownPerBooking: string
      breakdownSubtotal: string
      breakdownTax: string
      breakdownTaxIncluded: string
    }
  }
  bookingList: {
    searchPlaceholder: string
    columns: {
      bookingNumber: string
      whatBooked: string
      status: string
      sellAmount: string
      pax: string
      startDate: string
      endDate: string
      lead: string
      createdAt: string
    }
    filters: {
      button: string
      statusLabel: string
      statusAll: string
      productLabel: string
      product: string
      productEmpty: string
      optionLabel: string
      option: string
      optionEmpty: string
      optionNeedsProduct: string
      categoryLabel: string
      category: string
      categoryEmpty: string
      supplierLabel: string
      supplier: string
      supplierEmpty: string
      personLabel: string
      person: string
      personEmpty: string
      organizationLabel: string
      organization: string
      organizationEmpty: string
      departureLabel: string
      departure: string
      departureEmpty: string
      departureNeedsProduct: string
      dateRangeLabel: string
      dateRange: string
      paxLabel: string
      paxMin: string
      paxMax: string
      clear: string
    }
    /** "+{count} more" suffix when a booking has multiple items in the list cell. */
    itemsMore: string
    /** Compact day-count tag next to the primary item: e.g. "(2 days)". */
    itemDays: string
    loadingError: string
    empty: string
    showingSummary: string
    previousPage: string
    nextPage: string
  }
  bookingPaymentsSummary: {
    title: string
    empty: string
    /** Header summary line. Placeholders: `{amount}` (already currency-formatted). */
    totalReceived: string
    columns: {
      /** Allocated invoice — shown as a secondary "For" link, not lead. */
      invoice: string
      method: string
      status: string
      amount: string
      /** Equivalent in the booking's currency when the payment was made in a different currency. */
      fx: string
      date: string
      reference: string
      /** Row actions column header (visually hidden, used by screen readers). */
      actions: string
    }
    paymentMethodLabels: Record<
      "card" | "bank_transfer" | "cash" | "travel_credit" | "other",
      string
    >
    paymentStatusLabels: Record<"pending" | "completed" | "failed" | "refunded", string>
    actions: {
      /** Trigger button screen-reader label. */
      open: string
      view: string
      convertToInvoice: string
      edit: string
      delete: string
    }
    deleteConfirm: {
      title: string
      /** Body. Placeholders: `{amount}` (already currency-formatted). */
      description: string
      cancel: string
      confirm: string
    }
  }
  bookingNotes: {
    title: string
    addAction: string
    empty: string
    authorLabel: string
    actions: {
      edit: string
      delete: string
    }
    dialog: {
      createTitle: string
      editTitle: string
      contentLabel: string
      contentPlaceholder: string
      cancel: string
      create: string
      save: string
    }
    deleteConfirm: {
      title: string
      description: string
      cancel: string
      confirm: string
    }
  }
  bookingActivityTimeline: {
    title: string
    filters: {
      all: string
      activity: string
      document: string
      payment: string
      action: string
    }
    sourceLabels: {
      activity: string
      document: string
      payment: string
      action: string
    }
    empty: string
    activityTitles: Record<string, string>
    documentUploadedSuffix: string
    viewFile: string
    byActor: string
    paymentTitle: string
    paymentDescription: string
  }
}
