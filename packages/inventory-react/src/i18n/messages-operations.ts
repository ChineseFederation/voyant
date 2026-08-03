/** One readiness issue: what is wrong, and what the operator should do. */
export type ProductReadinessIssueMessage = {
  title: string
  fix: string
}

export type ProductsUiOperationsMessages = {
  productDayDialog: {
    titles: {
      create: string
      edit: string
    }
    descriptions: {
      create: string
      edit: string
    }
  }
  productDayForm: {
    fields: {
      dayNumber: string
      location: string
      title: string
      description: string
    }
    placeholders: {
      location: string
      title: string
      description: string
    }
    validation: {
      dayNumberMin: string
      saveFailed: string
    }
    actions: {
      addDay: string
      saveDay: string
    }
  }
  productDayServiceForm: {
    fields: {
      supplierService: string
      serviceType: string
      countryCode: string
      name: string
      description: string
      costCurrency: string
      costAmount: string
      quantity: string
      sortOrder: string
      notes: string
    }
    placeholders: {
      supplierService: string
      countryCode: string
      name: string
      description: string
      notes: string
    }
    serviceTypes: {
      accommodation: string
      transfer: string
      experience: string
      guide: string
      meal: string
      other: string
    }
    validation: {
      nameRequired: string
      currencyRequired: string
      costNonNegative: string
      quantityMin: string
      saveFailed: string
    }
    actions: {
      addService: string
      saveService: string
    }
  }
  productDayServiceDialog: {
    titles: {
      create: string
      edit: string
    }
    descriptions: {
      create: string
      edit: string
    }
  }
  productItineraryDayRow: {
    dayLabel: string
    emptyServices: string
    servicesLoadingError: string
    columns: {
      name: string
      type: string
      cost: string
      quantity: string
    }
  }
  productItineraryDialog: {
    titles: {
      create: string
      edit: string
    }
    descriptions: {
      create: string
      edit: string
    }
    fields: {
      name: string
      defaultItinerary: string
      notesDefaultLocked: string
      notesFirstDefault: string
    }
    placeholders: {
      name: string
    }
    validation: {
      nameRequired: string
      saveFailed: string
    }
    actions: {
      createItinerary: string
    }
  }
  optionUnitDialog: {
    titles: {
      create: string
      edit: string
    }
    descriptions: {
      create: string
      edit: string
    }
  }
  optionUnitForm: {
    fields: {
      name: string
      code: string
      unitType: string
      sortOrder: string
      minQuantity: string
      maxQuantity: string
      minAge: string
      maxAge: string
      occupancyMin: string
      occupancyMax: string
      description: string
      required: string
      hidden: string
    }
    placeholders: {
      name: string
      code: string
      description: string
    }
    validation: {
      nameRequired: string
      saveFailed: string
    }
    actions: {
      createUnit: string
    }
  }
  productReadinessPanel: {
    title: string
    descriptions: {
      ready: string
      blocked: string
    }
    badges: {
      ready: string
      blocking: string
      warning: string
    }
    empty: string
    loadingError: string
    /**
     * Keyed by the stable readiness issue `code` returned by the API. Each
     * entry names what is wrong and the remedy; the API's English
     * `message`/`fix` are fallbacks that this package never renders.
     */
    issues: {
      noFutureOpenDeparture: ProductReadinessIssueMessage
      missingDefaultOption: ProductReadinessIssueMessage
      defaultOptionNotActive: ProductReadinessIssueMessage
      noOptionUnits: ProductReadinessIssueMessage
      noPrice: ProductReadinessIssueMessage
      missingItinerary: ProductReadinessIssueMessage
      emptyItinerary: ProductReadinessIssueMessage
      nonConsecutiveItineraryDays: ProductReadinessIssueMessage
      unresolvedDuration: ProductReadinessIssueMessage
      missingFamily: ProductReadinessIssueMessage
      missingCapacitySource: ProductReadinessIssueMessage
      missingMeetingPoint: ProductReadinessIssueMessage
      missingAllocationTemplate: ProductReadinessIssueMessage
      missingDefaultLanguage: ProductReadinessIssueMessage
      missingDescription: ProductReadinessIssueMessage
      missingContractTemplate: ProductReadinessIssueMessage
      incompleteCostBasis: ProductReadinessIssueMessage
      noActiveChannel: ProductReadinessIssueMessage
      unknown: ProductReadinessIssueMessage
    }
  }
  productVersionDialog: {
    title: string
    description: string
    fields: {
      notes: string
    }
    placeholders: {
      notes: string
    }
    validation: {
      saveFailed: string
    }
    actions: {
      createVersion: string
    }
  }
  productVersionsSection: {
    titles: {
      default: string
    }
    descriptions: {
      default: string
    }
    actions: {
      createVersion: string
    }
    loadingError: string
    empty: string
    versionLabel: string
  }
  productOptionDialog: {
    titles: {
      create: string
      edit: string
    }
    descriptions: {
      create: string
      edit: string
    }
  }
  productOptionForm: {
    fields: {
      name: string
      code: string
      description: string
      status: string
      sortOrder: string
      availableFrom: string
      availableTo: string
      defaultOption: string
    }
    placeholders: {
      name: string
      code: string
      description: string
      availableFrom: string
      availableTo: string
    }
    validation: {
      nameRequired: string
      saveFailed: string
    }
    actions: {
      createOption: string
    }
  }
  productOptionsSection: {
    titles: {
      default: string
      units: string
      personUnits: string
      roomUnits: string
    }
    descriptions: {
      default: string
      units: string
      personUnits: string
      roomUnits: string
    }
    actions: {
      addOption: string
      addUnit: string
      addPersonUnit: string
      addRoomUnit: string
      duplicate: string
      edit: string
      delete: string
    }
    loadingError: {
      options: string
      units: string
    }
    empty: {
      options: string
      units: string
    }
    configurationWarnings: {
      roomOptionsTitle: string
      roomOptionsDescription: string
    }
    deleteConfirm: {
      option: string
      unit: string
    }
    columns: {
      unitType: string
      unitName: string
      quantity: string
      personQuantity: string
      roomQuantity: string
      age: string
      occupancy: string
      actions: string
    }
    unitSummaries: {
      range: string
      rooms: string
      roomsWithCount: string
      vehicles: string
      vehiclesWithCount: string
      sleeps: string
      sleepsRange: string
    }
    badges: {
      defaultOption: string
    }
  }
}
