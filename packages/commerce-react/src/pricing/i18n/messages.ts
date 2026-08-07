import type {
  PriceCatalogRecord,
  PricingCategoryDependencyRecord,
  PricingCategoryRecord,
} from "../index.js"

export type PricingCategoryType = PricingCategoryRecord["categoryType"]
export type PricingDependencyType = PricingCategoryDependencyRecord["dependencyType"]
export type PriceCatalogType = PriceCatalogRecord["catalogType"]
export type ChargeType = "none" | "amount" | "percentage"
export type AddonPricingMode =
  | "included"
  | "per_person"
  | "per_booking"
  | "on_request"
  | "unavailable"
export type OptionPriceRulePricingMode =
  | "per_person"
  | "per_booking"
  | "starting_from"
  | "free"
  | "on_request"
export type StartTimeRuleMode = "included" | "excluded" | "override" | "adjustment"
export type AdjustmentType = "fixed" | "percentage"
export type UnitPricingMode =
  | "per_unit"
  | "per_person"
  | "per_booking"
  | "included"
  | "free"
  | "on_request"

export type PricingUiMessages = {
  common: {
    cancel: string
    saveChanges: string
    create: string
    add: string
    loading: string
    none: string
    previous: string
    next: string
    page: string
    active: string
    inactive: string
    categoryTypeLabels: Record<PricingCategoryType, string>
    dependencyTypeLabels: Record<PricingDependencyType, string>
    chargeTypeLabels: Record<ChargeType, string>
    addonPricingModeLabels: Record<AddonPricingMode, string>
    optionPriceRulePricingModeLabels: Record<OptionPriceRulePricingMode, string>
    startTimeRuleModeLabels: Record<StartTimeRuleMode, string>
    adjustmentTypeLabels: Record<AdjustmentType, string>
    unitPricingModeLabels: Record<UnitPricingMode, string>
  }
  comboboxes: {
    pricingCategory: {
      placeholder: string
      empty: string
    }
    priceCatalog: {
      placeholder: string
      empty: string
    }
    priceSchedule: {
      placeholder: string
      empty: string
    }
    cancellationPolicy: {
      placeholder: string
      empty: string
    }
    optionPriceRule: {
      placeholder: string
      empty: string
    }
    product: {
      placeholder: string
      empty: string
    }
    productOption: {
      placeholder: string
      empty: string
      missingParent: string
    }
    optionUnit: {
      placeholder: string
      empty: string
      missingParent: string
    }
    optionUnitPriceRule: {
      placeholder: string
      empty: string
    }
    pickupPoint: {
      placeholder: string
      empty: string
    }
    productExtra: {
      placeholder: string
      empty: string
    }
  }
  pricingCategoriesPage: {
    title: string
    description: string
  }
  priceCatalogsPage: {
    title: string
    description: string
    addCatalog: string
    empty: string
    default: string
    edit: string
    delete: string
    deleteConfirm: string
    showingSummary: string
    selectCurrencyPlaceholder: string
    noCurrenciesFound: string
    editSheetTitle: string
    newSheetTitle: string
    nameLabel: string
    namePlaceholder: string
    codeLabel: string
    codePlaceholder: string
    currencyLabel: string
    typeLabel: string
    defaultCatalogLabel: string
    activeLabel: string
    notesLabel: string
    notesPlaceholder: string
    cancel: string
    saveChanges: string
    createCatalog: string
    catalogTypeLabels: Record<PriceCatalogType, string>
    validation: {
      nameRequired: string
      codeRequired: string
      currencyLength: string
    }
  }
  pricingCategoryDialog: {
    titles: {
      create: string
      edit: string
    }
    descriptions: {
      create: string
      edit: string
    }
  }
  pricingCategoryForm: {
    fields: {
      name: string
      code: string
      type: string
      seatOccupancy: string
      ageQualified: string
      minAge: string
      maxAge: string
      sortOrder: string
      active: string
    }
    placeholders: {
      name: string
      code: string
    }
    validation: {
      nameRequired: string
      saveFailed: string
    }
    actions: {
      create: string
    }
  }
  pricingCategoryList: {
    searchPlaceholder: string
    add: string
    columns: {
      name: string
      code: string
      type: string
      age: string
      seat: string
      sort: string
      status: string
      actions: string
    }
    loadingError: string
    empty: string
    edit: string
    delete: string
    deleteConfirm: string
    showingSummary: string
  }
  pricingCategoryDependencyDialog: {
    titles: {
      create: string
      edit: string
    }
    description: string
  }
  pricingCategoryDependencyForm: {
    fields: {
      masterCategory: string
      dependentCategory: string
      dependencyType: string
      maxPerMaster: string
      maxDependentSum: string
      active: string
      notes: string
    }
    placeholders: {
      categorySearch: string
    }
    validation: {
      categoriesRequired: string
      saveFailed: string
    }
    actions: {
      create: string
    }
  }
  priceScheduleDialog: {
    titles: {
      create: string
      edit: string
    }
    fields: {
      catalog: string
      name: string
      code: string
      recurrenceRule: string
      validFrom: string
      validTo: string
      timezone: string
      priority: string
      active: string
      notes: string
    }
    placeholders: {
      catalog: string
      name: string
      code: string
      recurrenceRule: string
      validFrom: string
      validTo: string
      timezone: string
    }
    validation: {
      catalogRequired: string
      nameRequired: string
      recurrenceRuleRequired: string
    }
    helpText: {
      recurrenceRuleExample: string
    }
    actions: {
      create: string
    }
  }
  recurrence: {
    frequencyLabel: string
    frequencyOptions: {
      yearly: string
      monthly: string
      weekly: string
      custom: string
    }
    monthsLabel: string
    weekdaysLabel: string
    monthDayLabel: string
    monthDayPlaceholder: string
    advancedLabel: string
    rawRuleLabel: string
    rawRulePlaceholder: string
  }
  cancellationPolicyRuleDialog: {
    titles: {
      create: string
      edit: string
    }
    fields: {
      cutoffMinutesBefore: string
      sortOrder: string
      chargeType: string
      chargeAmount: string
      chargePercent: string
      active: string
      notes: string
    }
    placeholders: {
      cutoffMinutesBefore: string
      chargePercent: string
    }
    helpText: {
      cutoffMinutesBefore: string
    }
    actions: {
      create: string
    }
  }
  optionPriceRuleDialog: {
    titles: {
      create: string
      edit: string
    }
    fields: {
      product: string
      option: string
      name: string
      code: string
      catalog: string
      schedule: string
      cancellationPolicy: string
      pricingMode: string
      occupancyPriceBasis: string
      baseSell: string
      baseCost: string
      minPerBooking: string
      maxPerBooking: string
      description: string
      allPricingCategories: string
      defaultRule: string
      active: string
      notes: string
    }
    occupancyPriceBasisLabels: {
      supplement: string
      all_in: string
    }
    helpText: {
      occupancyPriceBasis: string
    }
    validation: {
      productRequired: string
      optionRequired: string
      catalogRequired: string
      nameRequired: string
    }
    actions: {
      create: string
    }
  }
  locationPriceRuleDialog: {
    fields: {
      optionPriceRule: string
      optionId: string
      facilityId: string
      pickupPointId: string
      dropoffName: string
      dropoffCode: string
      pricingMode: string
      sellAmount: string
      costAmount: string
      sortOrder: string
      active: string
      notes: string
    }
    placeholders: {
      optionId: string
      facilityId: string
      pickupPointId: string
    }
    validation: {
      optionPriceRuleRequired: string
      optionIdRequired: string
      pickupPointIdRequired: string
      dropoffNameRequired: string
    }
    actions: {
      createRule: string
      saveRule: string
    }
    pickup: {
      titles: {
        create: string
        edit: string
      }
    }
    dropoff: {
      titles: {
        create: string
        edit: string
      }
    }
    extra: {
      titles: {
        create: string
        edit: string
      }
      fields: {
        productExtraId: string
        optionExtraConfigId: string
      }
      placeholders: {
        productExtraId: string
        optionExtraConfigId: string
      }
    }
  }
  optionStartTimeRuleDialog: {
    titles: {
      create: string
      edit: string
    }
    fields: {
      optionPriceRule: string
      optionId: string
      startTimeId: string
      ruleMode: string
      adjustmentType: string
      sellAdjustment: string
      costAdjustment: string
      adjustmentPercent: string
      active: string
      notes: string
    }
    placeholders: {
      optionId: string
      startTimeId: string
      select: string
    }
    validation: {
      optionPriceRuleRequired: string
      optionIdRequired: string
      startTimeIdRequired: string
    }
    actions: {
      create: string
    }
  }
  optionUnitPriceRuleDialog: {
    titles: {
      create: string
      edit: string
    }
    fields: {
      optionPriceRule: string
      option: string
      unit: string
      pricingCategory: string
      pricingMode: string
      sellAmount: string
      costAmount: string
      minQuantity: string
      maxQuantity: string
      sortOrder: string
      active: string
      notes: string
    }
    placeholders: {
      pricingCategory: string
    }
    validation: {
      optionPriceRuleRequired: string
      optionRequired: string
      unitRequired: string
    }
    actions: {
      create: string
    }
  }
  optionUnitTierDialog: {
    titles: {
      create: string
      edit: string
    }
    fields: {
      optionUnitPriceRule: string
      minQuantity: string
      maxQuantity: string
      sellAmount: string
      costAmount: string
      sortOrder: string
      active: string
    }
    placeholders: {
      optionUnitPriceRule: string
    }
    validation: {
      optionUnitPriceRuleRequired: string
      minQuantityMin: string
    }
    actions: {
      create: string
    }
  }
}
