export const crmUiEnListsMessages = {
  personCard: {
    unnamed: "Unnamed",
  },
  personCardConnected: {
    loadFailed: "Failed to load person:",
  },
  personList: {
    searchPlaceholder: "Search people...",
    create: "New person",
    columns: {
      name: "Name",
      email: "Email",
      phone: "Phone",
      relation: "Relation",
      status: "Status",
    },
    filters: {
      button: "Filters",
      relationLabel: "Relation",
      relationAll: "All relations",
      statusLabel: "Status",
      statusAll: "All statuses",
      organizationLabel: "Organization",
      organizationAny: "Any organization",
      organizationEmpty: "No organizations found.",
      clear: "Clear",
    },
    loadFailed: "Failed to load people.",
    empty: "No people found.",
  },
  peoplePage: {
    title: "People",
    description: "Everyone you work with.",
  },
  organizationList: {
    searchPlaceholder: "Search organizations...",
    create: "New organization",
    columns: {
      name: "Name",
      industry: "Industry",
      relation: "Relation",
      website: "Website",
      status: "Status",
      updated: "Updated",
    },
    filters: {
      button: "Filters",
      relationLabel: "Relation",
      relationAll: "All relations",
      statusLabel: "Status",
      statusAll: "All statuses",
      clear: "Clear",
    },
    loadFailed: "Failed to load organizations.",
    empty: "No organizations found.",
  },
  organizationsPage: {
    title: "Organizations",
    description: "Companies and suppliers.",
  },
  entityComboboxes: {
    person: {
      placeholder: "Search people...",
      empty: "No people found.",
      loading: "Loading people...",
    },
    organization: {
      placeholder: "Search organizations...",
      empty: "No organizations found.",
      loading: "Loading organizations...",
    },
  },
} as const
