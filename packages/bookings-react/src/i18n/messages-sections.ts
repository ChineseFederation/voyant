export type BookingsUiSectionsMessages = {
  bookingItemDialog: {
    titles: {
      create: string
      edit: string
    }
    itemTypeLabels: Record<
      | "unit"
      | "extra"
      | "service"
      | "fee"
      | "tax"
      | "discount"
      | "adjustment"
      | "accommodation"
      | "transport"
      | "other",
      string
    >
    itemStatusLabels: Record<
      "draft" | "on_hold" | "confirmed" | "cancelled" | "expired" | "fulfilled",
      string
    >
    fields: {
      title: string
      type: string
      status: string
      quantity: string
      sellCurrency: string
      unitSellAmountCents: string
      totalSellAmountCents: string
      costCurrency: string
      unitCostAmountCents: string
      totalCostAmountCents: string
      serviceDate: string
      description: string
      notes: string
    }
    placeholders: {
      title: string
      unitSellAmountCents: string
      totalSellAmountCents: string
      unitCostAmountCents: string
      totalCostAmountCents: string
      serviceDate: string
      description: string
      notes: string
    }
    validation: {
      titleRequired: string
      costCurrencyRequired: string
    }
    actions: {
      addItem: string
    }
  }
  bookingItemTravelers: {
    title: string
    empty: string
    selectTravelerPlaceholder: string
    primaryBadge: string
    roleLabels: Record<
      "traveler" | "occupant" | "primary_contact" | "service_assignee" | "beneficiary" | "other",
      string
    >
    actions: {
      assign: string
      removeConfirm: string
    }
  }
  paymentScheduleDialog: {
    titles: {
      create: string
      edit: string
    }
    scheduleTypeLabels: Record<"deposit" | "installment" | "balance" | "hold" | "other", string>
    scheduleStatusLabels: Record<
      "pending" | "due" | "paid" | "waived" | "cancelled" | "expired",
      string
    >
    fields: {
      type: string
      status: string
      dueDate: string
      currency: string
      amountCents: string
      notes: string
    }
    placeholders: {
      dueDate: string
      notes: string
    }
    validation: {
      dueDateRequired: string
      amountRequired: string
    }
    actions: {
      addSchedule: string
    }
  }
  fileDropzone: {
    helperText: string
    uploading: string
    acceptedPrefix: string
    removeFileAriaLabel: string
    validation: {
      fileTooLarge: string
      uploadFailedWithStatus: string
      uploadFailed: string
    }
  }
  travelCreditPickerSection: {
    labels: {
      heading: string
      codePlaceholder: string
      apply: string
      clear: string
      remainingLabel: string
      invalidLabel: string
    }
    reasonMessages: Record<
      | "not_found"
      | "inactive"
      | "not_started"
      | "expired"
      | "booking_mismatch"
      | "currency_mismatch"
      | "insufficient_balance",
      string
    >
    validation: {
      invalid: string
      lookupFailed: string
      amountUnavailable: string
    }
  }
  productPickerSection: {
    labels: {
      product: string
      productSearchPlaceholder: string
      productSelectPlaceholder: string
      productEmpty: string
      option: string
      optionNone: string
      /** Badge for an owned-inventory product in a catalog-aware picker. */
      owned: string
      /** Badge for a supplier-sourced product in a catalog-aware picker. */
      supplier: string
    }
  }
  personPickerSection: {
    labels: {
      person: string
      organization: string
      billTo: string
      billToPerson: string
      billToOrganization: string
      createNewPerson: string
      createNewOrganization: string
      createPersonSheetTitle: string
      createOrganizationSheetTitle: string
      editPerson: string
      editOrganization: string
      editPersonSheetTitle: string
      editOrganizationSheetTitle: string
      selectExistingPerson: string
      personSearchPlaceholder: string
      personSelectPlaceholder: string
      personEmpty: string
      firstName: string
      firstNamePlaceholder: string
      lastName: string
      lastNamePlaceholder: string
      email: string
      emailPlaceholder: string
      phone: string
      phonePlaceholder: string
      organizationSearchPlaceholder: string
      organizationSelectPlaceholder: string
      organizationEmpty: string
      organizationNone: string
    }
  }
  travelersSection: {
    labels: {
      heading: string
      addTraveler: string
      firstName: string
      lastName: string
      email: string
      role: string
      category: string
      dateOfBirth: string
      roleLead: string
      roleAdult: string
      roleChild: string
      roleInfant: string
      room: string
      noRoom: string
      remove: string
      empty: string
      person: string
      personSearchPlaceholder: string
      personEmpty: string
      createNewPerson: string
      createPersonSheetTitle: string
      editPerson: string
      editPersonSheetTitle: string
      addBillingPerson: string
      relatedPeopleHeading: string
      addRelatedPerson: string
    }
    relationshipKindLabels: {
      spouse: string
      partner: string
      parent: string
      child: string
      sibling: string
      guardian: string
      ward: string
      emergency_contact: string
      friend: string
      travel_companion: string
      other: string
    }
  }
  paymentScheduleSection: {
    labels: {
      heading: string
      modeUnpaid: string
      modeFull: string
      modeAdvance: string
      modeSplit: string
      dueDate: string
      /** Placeholder for the due-date picker while no date is chosen. */
      dueDatePlaceholder: string
      amount: string
      firstInstallment: string
      secondInstallment: string
      /**
       * Row heading for the third and later installments. `{index}` is the
       * 1-based row number. The first two rows use `firstInstallment` /
       * `secondInstallment` so each locale can spell its own ordinal.
       */
      installmentN: string
      preset5050: string
      unpaidHint: string
      totalDue: string
      scheduledTotal: string
      remaining: string
      alreadyPaid: string
      paymentDate: string
      /** Placeholder for the payment-date picker while no date is chosen. */
      paymentDatePlaceholder: string
      paymentMethod: string
      paymentReference: string
      /** Label for the "+" button below the split installments. */
      addInstallment: string
      /** Aria label for the per-row remove button (only shown when ≥3 installments). */
      removeInstallment: string
    }
  }
  roomsStepperSection: {
    labels: {
      heading: string
      noOption: string
      noSlot: string
      noUnits: string
      remaining: string
      unlimited: string
      fillsSlotCapacity: string
      decreaseUnitPrefix: string
      increaseUnitPrefix: string
      reviewLine: string
    }
  }
  sharedRoomSection: {
    labels: {
      toggle: string
      createMode: string
      joinMode: string
      selectPlaceholder: string
      noGroups: string
      createHint: string
      createSheetTitle: string
      groupLabel: string
      groupLabelPlaceholder: string
      createAction: string
      remove: string
    }
  }
  priceBreakdownSection: {
    labels: {
      heading: string
      total: string
      onRequest: string
      groupRate: string
      empty: string
      noPricing: string
      confirmedTotal: string
      manualTotal: string
      useCatalogTotal: string
      overrideReason: string
      overrideReasonPlaceholder: string
      overrideReasonRequired: string
      perPerson: string
      perUnit: string
      perBooking: string
    }
  }
  bookingDocumentDialog: {
    title: string
    documentTypeLabels: Record<"visa" | "insurance" | "health" | "passport_copy" | "other", string>
    fields: {
      type: string
      traveler: string
      file: string
      expiresAt: string
      notes: string
    }
    placeholders: {
      travelerUnassigned: string
      helperText: string
      expiresAt: string
      notes: string
    }
    validation: {
      fileRequired: string
      fileNameRequired: string
      fileUrlInvalid: string
    }
    actions: {
      addDocument: string
    }
  }
  bookingDocumentList: {
    title: string
    addDocument: string
    empty: string
    values: {
      travelerUnavailable: string
      expiresUnavailable: string
      notesUnavailable: string
    }
    columns: {
      type: string
      file: string
      traveler: string
      expires: string
      notes: string
    }
    actions: {
      deleteConfirm: string
    }
  }
}
