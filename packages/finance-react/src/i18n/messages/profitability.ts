export type ProfitabilityMessages = {
  title: string
  description: string
  loadFailed: string
  empty: string
  noDate: string
  noProduct: string
  exportCsv: string
  /** Accessible label for a departure row's deep-link; `{departure}` = its label. */
  openDeparture: string
  /** Accessible label for a product row's deep-link; `{product}` = its name. */
  openProduct: string
  /** Note shown in base-currency mode; `{currencies}` = comma list. */
  unconvertibleNote: string
  filters: {
    currency: string
    from: string
    to: string
    baseCurrency: string
    product: string
    departure: string
    allProducts: string
    allDepartures: string
  }
  kpis: {
    revenue: string
    actualCost: string
    profit: string
    margin: string
    plannedCost: string
    variance: string
    unattributed: string
    unallocated: string
  }
  charts: {
    departurePnl: string
    costByServiceType: string
    revenue: string
    actualCost: string
    profit: string
  }
  serviceTypeLabels: {
    transport: string
    flight: string
    accommodation: string
    guide: string
    meal: string
    experience: string
    insurance: string
    other: string
  }
  departures: {
    title: string
    none: string
    columns: {
      departure: string
      date: string
      product: string
      revenue: string
      actualCost: string
      plannedCost: string
      profit: string
      margin: string
      variance: string
    }
  }
  products: {
    title: string
    none: string
    columns: {
      product: string
      departures: string
      revenue: string
      actualCost: string
      plannedCost: string
      profit: string
      margin: string
      variance: string
    }
  }
  travelers: {
    /** Templated with `{departure}`. */
    title: string
    none: string
    loadFailed: string
    columns: {
      traveler: string
      booking: string
      revenue: string
      actualCost: string
      plannedCost: string
      profit: string
      margin: string
      variance: string
    }
  }
  share: {
    button: string
    title: string
    description: string
    from: string
    to: string
    baseCurrency: string
    ttlDays: string
    create: string
    creating: string
    active: string
    none: string
    copy: string
    copied: string
    revoke: string
    allTime: string
    /** Templated with `{date}`. */
    expires: string
    /** Templated with `{count}`. */
    opened: string
    neverOpened: string
  }
  portal: {
    title: string
    subtitle: string
    language: string
    allTime: string
    loadFailed: string
    gone: string
    invoices: string
    invoicesNone: string
    download: string
    downloadAll: string
    noFile: string
    kindClient: string
    kindSupplier: string
    columns: {
      type: string
      invoice: string
      status: string
      issueDate: string
      total: string
      balanceDue: string
      attachments: string
    }
  }
}

export type CostCategoriesMessages = {
  title: string
  description: string
  add: string
  adding: string
  namePlaceholder: string
  empty: string
  archive: string
  restore: string
  archivedBadge: string
  showArchived: string
}
