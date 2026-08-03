export type BookingsUiBaseMessages = {
  common: {
    cancel: string
    saveChanges: string
    add: string
    loading: string
    bookingStatusLabels: Record<"confirmed" | "in_progress" | "completed" | "cancelled", string>
    supplierStatusLabels: Record<"pending" | "confirmed" | "rejected" | "cancelled", string>
  }
  bookingsPage: {
    title: string
    description: string
    newBooking: string
  }
  bookingCreatePage: {
    title: string
    description: string
  }
  bookingCombobox: {
    placeholder: string
    empty: string
    loading: string
  }
  bookingQuickViewSheet: {
    loadingTitle: string
    viewFullAction: string
    paxSuffix: string
    travelerUnnamed: string
    sectionPayer: string
    sectionTravelers: string
    sectionTravelerDocuments: string
    travelerReveal: {
      showAction: string
      hideAction: string
      empty: string
      error: string
      dateOfBirth: string
      nationality: string
      documentType: string
      documentNumber: string
      documentExpiry: string
      documentIssuingCountry: string
      documentIssuingAuthority: string
      dietaryRequirements: string
      accessibilityNeeds: string
      bedPreference: string
      address: string
    }
    travelersEmpty: string
    travelerCategoryLabels: Record<"adult" | "child" | "infant" | "lead", string>
    sectionPayments: string
    paymentsPaid: string
    paymentsRemaining: string
    sectionInvoices: string
    invoicesEmpty: string
    invoiceStatusLabels: Record<
      "draft" | "sent" | "partially_paid" | "paid" | "overdue" | "void",
      string
    >
    sectionPaymentSchedule: string
    scheduleCountSuffix: string
    scheduleEmpty: string
    scheduleTypeLabels: Record<"deposit" | "installment" | "balance" | "hold" | "other", string>
    sectionContracts: string
    contractsEmpty: string
    contractStatusLabels: Record<
      "draft" | "issued" | "sent" | "signed" | "executed" | "expired" | "void",
      string
    >
  }
  bookingDetailPage: {
    notFound: string
    backToBookings: string
    breadcrumbBookings: string
    editAction: string
    changeStatusAction: string
    cancelBookingAction: string
    deleteAction: string
    deleteConfirm: string
    /** Body copy under the delete confirmation title. `{number}` interpolates the booking number. */
    deleteConfirmDescription: string
    /** Fallback description used when the booking has no number (rare). */
    deleteConfirmDescriptionFallback: string
    deleteConfirmAction: string
    deleteCancel: string
    collectPaymentAction: string
    recordPaymentAction: string
    noValue: string
    tbd: string
    summaryTotal: string
    summaryPaid: string
    summaryPriceOverride: string
    summaryCostMargin: string
    summaryDates: string
    summaryTravelers: string
    summaryPerson: string
    summaryOrganization: string
    summaryCreated: string
    summaryUpdated: string
    tabOverview: string
    tabMetadata: string
    tabTravelers: string
    tabFinance: string
    tabInvoices: string
    tabSuppliers: string
    tabDocuments: string
    tabActivity: string
    metadataSection: {
      title: string
      bookingId: string
      bookingNumber: string
      status: string
      communicationLanguage: string
      created: string
      updated: string
    }
    internalNotesLabel: string
    billingPayer: string
    billingTaxId: string
    billingEmail: string
    billingPhone: string
    billingAddress: string
    documentsSlotEmpty: string
  }
  travelerDialog: {
    titles: {
      create: string
      edit: string
    }
    fields: {
      firstName: string
      lastName: string
      travelerCategory: string
      email: string
      phone: string
      specialRequests: string
      travelDetailsHeading: string
      documentType: string
      documentNumber: string
      documentExpiry: string
      documentIssuingCountry: string
      documentIssuingAuthority: string
      dateOfBirth: string
      dietaryRequirements: string
      accessibilityNeeds: string
      linkedPerson: string
    }
    travelerCategoryLabels: Record<"adult" | "child" | "infant" | "senior" | "other", string>
    documentTypeLabels: Record<"passport" | "id_card" | "driver_license" | "visa" | "other", string>
    placeholders: {
      firstName: string
      lastName: string
      email: string
      phone: string
      specialRequests: string
      documentNumber: string
      documentExpiry: string
      documentIssuingCountry: string
      documentIssuingAuthority: string
      dateOfBirth: string
      dietaryRequirements: string
      accessibilityNeeds: string
    }
    validation: {
      firstNameRequired: string
      lastNameRequired: string
    }
    actions: {
      addTraveler: string
      prefillFromProfile: string
      saveToProfile: string
    }
    hints: {
      prefilledFromProfile: string
      savedToProfile: string
    }
  }
  travelerList: {
    title: string
    addTraveler: string
    empty: string
    values: {
      emailUnavailable: string
      phoneUnavailable: string
      documentsHidden: string
      documentsUnavailable: string
      fieldUnavailable: string
      noAdditionalContext: string
    }
    columns: {
      name: string
      email: string
      phone: string
      role: string
      dobAge: string
      documents: string
    }
    roles: {
      primary: string
      lead: string
    }
    context: {
      nationality: string
      document: string
      documentExpiry: string
      language: string
      dietary: string
      accessibility: string
      specialRequests: string
      notes: string
      documentLabel: string
    }
    loading: {
      decrypting: string
    }
    actions: {
      deleteConfirm: {
        title: string
        description: string
        cancel: string
        confirm: string
      }
      revealContactDetails: string
      hideContactDetails: string
      revealTravelerContactDetails: string
      hideTravelerContactDetails: string
      viewTraveler: string
      editTraveler: string
      deleteTraveler: string
    }
    snapshot: {
      title: string
      subtitle: string
      sectionContact: string
      sectionTravel: string
      sectionDocuments: string
      sectionMeta: string
      nameLabel: string
      emailLabel: string
      phoneLabel: string
      languageLabel: string
      roleLabel: string
      dobLabel: string
      nationalityLabel: string
      documentLabel: string
      documentExpiryLabel: string
      dietaryLabel: string
      accessibilityLabel: string
      specialRequestsLabel: string
      notesLabel: string
      noDocuments: string
      createdAtLabel: string
      updatedAtLabel: string
      empty: string
    }
    validation: {
      revealFailed: string
    }
  }
}
