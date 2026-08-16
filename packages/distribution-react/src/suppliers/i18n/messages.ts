import type {
  Supplier,
  SupplierAddress,
  SupplierContactPoint,
  SupplierContract,
  SupplierNamedContact,
  SupplierRate,
  SupplierService,
} from "../index.js"

export type SupplierType = Supplier["type"]
export type SupplierStatus = Supplier["status"]
export type SupplierServiceType = SupplierService["serviceType"]
export type SupplierRateUnit = SupplierRate["unit"]
export type SupplierContactPointKind = SupplierContactPoint["kind"]
export type SupplierNamedContactRole = SupplierNamedContact["role"]
export type SupplierAddressLabel = SupplierAddress["label"]
export type SupplierContractStatus = SupplierContract["status"]

export type SuppliersUiMessages = {
  common: {
    edit: string
    delete: string
    add: string
    save: string
    create: string
    cancel: string
    back: string
    open: string
    active: string
    inactive: string
    none: string
    unknown: string
    maxPax: string
    supplierTypeLabels: Record<SupplierType, string>
    supplierStatusLabels: Record<SupplierStatus, string>
    serviceTypeLabels: Record<SupplierServiceType, string>
    rateUnitLabels: Record<SupplierRateUnit, string>
    contactPointKindLabels: Record<SupplierContactPointKind, string>
    namedContactRoleLabels: Record<SupplierNamedContactRole, string>
    addressLabelLabels: Record<SupplierAddressLabel, string>
    contractStatusLabels: Record<SupplierContractStatus, string>
  }
  suppliersPage: {
    title: string
    description: string
    create: string
    searchPlaceholder: string
    summary: string
    previous: string
    next: string
    page: string
    filters: string
    clearFilters: string
    allTypes: string
    allStatuses: string
    countryPlaceholder: string
    currencyPlaceholder: string
    filterTypeLabel: string
    filterStatusLabel: string
    filterCountryLabel: string
    filterCurrencyLabel: string
    empty: string
    loadFailed: string
    columns: {
      name: string
      type: string
      status: string
      city: string
      country: string
      currency: string
    }
  }
  supplierDetailPage: {
    backToSuppliers: string
    notFound: string
    loadFailed: string
    details: string
    publication: {
      title: string
      description: string
      loading: string
      loadError: string
      noChannels: string
      states: {
        included: string
        excluded: string
        undecided: string
        channelInactive: string
      }
      undecidedHint: string
      publish: string
      hide: string
      clear: string
      confirm: string
      cancel: string
      impact: string
      channelsTruncated: string
      reindexNote: string
    }
    contact: string
    noContact: string
    services: string
    addService: string
    noServices: string
    notes: string
    notePlaceholder: string
    addNote: string
    noNotes: string
    contactPoints: string
    addContactPoint: string
    noContactPoints: string
    namedContacts: string
    addNamedContact: string
    noNamedContacts: string
    addresses: string
    addAddress: string
    noAddresses: string
    availability: string
    addAvailability: string
    noAvailability: string
    contracts: string
    addContract: string
    noContracts: string
    deleteSupplierConfirm: string
    deleteServiceConfirm: string
    deleteRateConfirm: string
    deleteContactPointConfirm: string
    deleteNamedContactConfirm: string
    deleteAddressConfirm: string
    deleteContractConfirm: string
    labels: {
      type: string
      status: string
      city: string
      country: string
      currency: string
      reservationTimeout: string
      email: string
      phone: string
      website: string
      address: string
      contactName: string
      contactEmail: string
      contactPhone: string
      role: string
      label: string
      value: string
      name: string
      title: string
      primary: string
      line1: string
      line2: string
      region: string
      postalCode: string
      timezone: string
      date: string
      available: string
      agreementNumber: string
      startDate: string
      endDate: string
      renewalDate: string
      terms: string
      created: string
      updated: string
    }
  }
  supplierCombobox: {
    placeholder: string
    empty: string
    loading: string
  }
  dialogs: {
    supplier: SupplierFormMessages
    service: ServiceFormMessages
    rate: RateFormMessages
    contactPoint: ContactPointFormMessages
    namedContact: NamedContactFormMessages
    address: AddressFormMessages
    availability: AvailabilityFormMessages
    contract: ContractFormMessages
  }
  supplierServiceRow: {
    rates: string
    addRate: string
    noRates: string
    columns: {
      name: string
      amount: string
      unit: string
      valid: string
      pax: string
    }
    validFallback: string
    invalidDateRange: string
    invalidPaxRange: string
  }
}

export type ContactPointFormMessages = {
  newTitle: string
  editTitle: string
  kindLabel: string
  labelLabel: string
  labelPlaceholder: string
  valueLabel: string
  valuePlaceholder: string
  normalizedValueLabel: string
  normalizedValuePlaceholder: string
  primaryLabel: string
  notesLabel: string
  notesPlaceholder: string
  validationValueRequired: string
}

export type NamedContactFormMessages = {
  newTitle: string
  editTitle: string
  roleLabel: string
  nameLabel: string
  namePlaceholder: string
  titleLabel: string
  titlePlaceholder: string
  emailLabel: string
  emailPlaceholder: string
  phoneLabel: string
  phonePlaceholder: string
  primaryLabel: string
  notesLabel: string
  notesPlaceholder: string
  validationNameRequired: string
  validationEmail: string
}

export type AddressFormMessages = {
  newTitle: string
  editTitle: string
  labelLabel: string
  fullTextLabel: string
  fullTextPlaceholder: string
  line1Label: string
  line1Placeholder: string
  line2Label: string
  line2Placeholder: string
  cityLabel: string
  cityPlaceholder: string
  regionLabel: string
  regionPlaceholder: string
  postalCodeLabel: string
  postalCodePlaceholder: string
  countryLabel: string
  countryPlaceholder: string
  timezoneLabel: string
  timezonePlaceholder: string
  primaryLabel: string
  notesLabel: string
  notesPlaceholder: string
}

export type AvailabilityFormMessages = {
  newTitle: string
  dateLabel: string
  availableLabel: string
  notesLabel: string
  notesPlaceholder: string
  validationDateRequired: string
}

export type ContractFormMessages = {
  newTitle: string
  editTitle: string
  agreementNumberLabel: string
  agreementNumberPlaceholder: string
  startDateLabel: string
  endDateLabel: string
  renewalDateLabel: string
  statusLabel: string
  termsLabel: string
  termsPlaceholder: string
  validationStartDateRequired: string
  validationEndDateRange: string
  validationRenewalDateRange: string
}

export type SupplierFormMessages = {
  newTitle: string
  editTitle: string
  nameLabel: string
  namePlaceholder: string
  typeLabel: string
  statusLabel: string
  descriptionLabel: string
  descriptionPlaceholder: string
  emailLabel: string
  emailPlaceholder: string
  phoneLabel: string
  phonePlaceholder: string
  websiteLabel: string
  websitePlaceholder: string
  addressLabel: string
  addressPlaceholder: string
  cityLabel: string
  cityPlaceholder: string
  countryLabel: string
  countryPlaceholder: string
  defaultCurrencyLabel: string
  defaultCurrencyPlaceholder: string
  reservationTimeoutLabel: string
  reservationTimeoutPlaceholder: string
  contactNameLabel: string
  contactNamePlaceholder: string
  contactEmailLabel: string
  contactEmailPlaceholder: string
  contactPhoneLabel: string
  contactPhonePlaceholder: string
  validationNameRequired: string
  validationIsoCurrency: string
  validationReservationTimeout: string
}

export type ServiceFormMessages = {
  newTitle: string
  editTitle: string
  serviceTypeLabel: string
  nameLabel: string
  namePlaceholder: string
  descriptionLabel: string
  descriptionPlaceholder: string
  durationLabel: string
  durationPlaceholder: string
  capacityLabel: string
  capacityPlaceholder: string
  activeLabel: string
  validationNameRequired: string
}

export type RateFormMessages = {
  newTitle: string
  editTitle: string
  seasonNameLabel: string
  seasonNamePlaceholder: string
  currencyLabel: string
  currencyPlaceholder: string
  amountLabel: string
  amountPlaceholder: string
  unitLabel: string
  validFromLabel: string
  validToLabel: string
  minPaxLabel: string
  minPaxPlaceholder: string
  maxPaxLabel: string
  maxPaxPlaceholder: string
  notesLabel: string
  notesPlaceholder: string
  validationNameRequired: string
  validationIsoCurrency: string
  validationNonNegative: string
  validationDateRange: string
  validationPaxRange: string
}
