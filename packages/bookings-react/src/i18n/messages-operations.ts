export type BookingsUiOperationsMessages = {
  statusChangeDialog: {
    title: string
    fields: {
      status: string
      note: string
      notifyCustomer: string
    }
    placeholders: {
      note: string
    }
    helpers: {
      notifyCustomer: string
      notificationsAlreadySilenced: string
    }
    actions: {
      updateStatus: string
    }
  }
  supplierStatusDialog: {
    titles: {
      create: string
      edit: string
    }
    fields: {
      serviceName: string
      status: string
      costCurrency: string
      costAmountCents: string
      supplierReference: string
      notes: string
    }
    placeholders: {
      serviceName: string
      supplierReference: string
      notes: string
    }
    validation: {
      serviceNameRequired: string
      costCurrencyInvalid: string
    }
    actions: {
      addSupplierStatus: string
    }
  }
  bookingItemList: {
    title: string
    addItem: string
    empty: string
    values: {
      totalUnavailable: string
      costUnavailable: string
      serviceDateUnavailable: string
    }
    columns: {
      title: string
      option: string
      unit: string
      type: string
      status: string
      quantity: string
      total: string
      cost: string
      serviceDate: string
    }
    /** Labels for the per-item expanded panel (description / dates / etc). */
    detail: {
      description: string
      dates: string
      cost: string
      catalogSource: string
      productLink: string
      noDescription: string
    }
    actions: {
      deleteConfirm: {
        title: string
        description: string
        cancel: string
        confirm: string
      }
      expandItem: string
      collapseItem: string
      viewItem: string
      editItem: string
      deleteItem: string
    }
    snapshot: {
      title: string
      subtitle: string
      sectionSummary: string
      sectionPricing: string
      sectionMeta: string
      productLabel: string
      optionLabel: string
      unitLabel: string
      descriptionLabel: string
      typeLabel: string
      statusLabel: string
      datesLabel: string
      quantityLabel: string
      unitSellLabel: string
      totalSellLabel: string
      unitCostLabel: string
      totalCostLabel: string
      notesLabel: string
      createdAtLabel: string
      updatedAtLabel: string
      empty: string
    }
  }
  bookingPaymentScheduleList: {
    title: string
    addSchedule: string
    empty: string
    values: {
      notesUnavailable: string
      /** Suffix shown after the invoice number when the matched doc is a proforma. */
      proformaSuffix: string
    }
    columns: {
      type: string
      status: string
      dueDate: string
      amount: string
      notes: string
      /** Invoice / proforma number covering this schedule row. */
      invoice: string
    }
    actions: {
      deleteConfirm: {
        title: string
        description: string
        cancel: string
        confirm: string
      }
      editSchedule: string
      deleteSchedule: string
      issueDocument: string
      issueInvoice: string
      issueProforma: string
      issueDocumentSuccess: string
      issueDocumentFailure: string
      issueDocumentErrors: {
        invoice_number_series_not_found: string
        invoice_number_series_inactive: string
        invoice_number_series_scope_mismatch: string
        no_active_series_for_scope: string
      }
    }
  }
  bookingDisputeBanner: {
    title: string
    description: string
    contested: string
    respondBy: string
    noDeadline: string
    statuses: {
      opened: string
      under_review: string
      won: string
      lost: string
      withdrawn: string
    }
    resolvedTitle: string
    resolvedDescription: string
  }
  bookingRefundBanner: {
    title: string
    description: string
    owed: string
    settledTitle: string
    settledDescription: string
    methods: {
      processor_reversal: string
      bank_transfer: string
      cash: string
      cheque: string
      travel_credit: string
      voucher: string
      counterparty_offset: string
      other: string
    }
    statuses: {
      pending: string
      settled: string
      failed: string
    }
  }
  bookingPaymentReconciliationBanner: {
    title: string
    loading: string
    empty: string
    reconciledDescription: string
    driftDescription: string
    reconciledBadge: string
    driftBadge: string
    billed: string
    invoicePaid: string
    recordedPayments: string
    schedulePaid: string
    drift: string
    emptyValue: string
  }
  supplierStatusList: {
    title: string
    addSupplier: string
    empty: string
    values: {
      costUnavailable: string
      referenceUnavailable: string
      confirmedUnavailable: string
    }
    columns: {
      service: string
      status: string
      cost: string
      reference: string
      confirmed: string
      /** Row actions column header (visually hidden, used by screen readers). */
      actions: string
    }
    actions: {
      edit: string
    }
  }
  bookingCancellationDialog: {
    title: string
    summary: {
      booking: string
      startDate: string
      total: string
      daysBeforeDeparture: string
    }
    values: {
      startDateTbd: string
      amountUnavailable: string
      ruleFallback: string
      ruleDaysBeforeDeparture: string
    }
    policy: {
      applicablePolicy: string
      refund: string
      penalty: string
      rule: string
      resolving: string
      missing: string
      missingHint: string
      calculating: string
      noTotalAmount: string
    }
    paidSettlement: {
      title: string
      description: string
    }
    refundTypeLabels: Record<"cash" | "credit" | "cash_or_credit" | "none", string>
    fields: {
      reason: string
    }
    placeholders: {
      reason: string
    }
    validation: {
      cancellationFailed: string
    }
    actions: {
      close: string
      confirm: string
    }
  }
  bookingBillingDialog: {
    title: string
    fields: {
      partyType: string
      firstName: string
      lastName: string
      companyName: string
      taxId: string
      email: string
      phone: string
      addressLine1: string
      addressLine2: string
      city: string
      region: string
      postalCode: string
      country: string
    }
    partyTypeLabels: Record<"individual" | "company", string>
    crmPicker: {
      label: string
      personSearchPlaceholder: string
      personEmpty: string
      organizationSearchPlaceholder: string
      organizationEmpty: string
    }
    actions: {
      cancel: string
      selectFromCrm: string
      hideCrmPicker: string
      save: string
    }
  }
  bookingGuaranteeDialog: {
    titles: {
      create: string
      edit: string
    }
    guaranteeTypeLabels: Record<
      | "deposit"
      | "credit_card"
      | "preauth"
      | "card_on_file"
      | "bank_transfer"
      | "voucher"
      | "agency_letter"
      | "other",
      string
    >
    guaranteeStatusLabels: Record<
      "pending" | "active" | "released" | "failed" | "cancelled" | "expired",
      string
    >
    fields: {
      type: string
      status: string
      currency: string
      amountCents: string
      provider: string
      referenceNumber: string
      expiresAt: string
      notes: string
    }
    placeholders: {
      provider: string
      referenceNumber: string
      expiresAt: string
      notes: string
    }
    actions: {
      addGuarantee: string
    }
  }
  bookingGuaranteeList: {
    title: string
    addGuarantee: string
    empty: string
    values: {
      amountUnavailable: string
      providerUnavailable: string
      referenceUnavailable: string
      expiresUnavailable: string
    }
    columns: {
      type: string
      status: string
      amount: string
      provider: string
      reference: string
      expires: string
    }
    actions: {
      deleteConfirm: {
        title: string
        description: string
        cancel: string
        confirm: string
      }
      editGuarantee: string
      deleteGuarantee: string
    }
  }
  bookingGroupLinkDialog: {
    title: string
    modes: {
      join: string
      create: string
    }
    fields: {
      existingGroups: string
      groupLabel: string
    }
    placeholders: {
      selectGroup: string
      noExistingGroups: string
      groupLabel: string
    }
    hints: {
      productFiltered: string
      primaryMember: string
    }
    validation: {
      selectGroup: string
      linkFailed: string
    }
    actions: {
      createAndLink: string
      linkToGroup: string
    }
    labels: {
      generatedLabelPrefix: string
    }
  }
  bookingGroupSection: {
    title: string
    empty: string
    group: string
    siblingBookings: string
    noSiblingBookings: string
    primaryBadge: string
    sharedRoomKind: string
    actions: {
      removeFromGroup: string
      linkToSharedRoom: string
      removeConfirm: string
    }
  }
}
