// agent-quality: file-size exception -- owner: relationships-react; existing locale dictionary stays co-located until a dedicated split preserves behavior and tests.
export const crmRelationTypes = ["client", "partner", "supplier", "other"] as const
export const crmRecordStatuses = ["active", "inactive", "archived"] as const
export const crmActivityTypes = ["note", "call", "email", "meeting", "task", "follow_up"] as const
export const crmActivityStatuses = ["planned", "done", "cancelled"] as const
export const crmEntityTypes = ["none", "person", "organization", "proposal", "activity"] as const
const crmProposalStatuses = ["open", "won", "lost", "archived"] as const
const crmProposalVersionStatuses = [
  "draft",
  "sent",
  "accepted",
  "declined",
  "superseded",
  "expired",
] as const

export type CrmRelationType = (typeof crmRelationTypes)[number]
export type CrmRecordStatus = (typeof crmRecordStatuses)[number]
export type CrmActivityType = (typeof crmActivityTypes)[number]
export type CrmActivityStatus = (typeof crmActivityStatuses)[number]
export type CrmEntityType = (typeof crmEntityTypes)[number]
export type CrmProposalStatus = (typeof crmProposalStatuses)[number]
export type CrmProposalVersionStatus = (typeof crmProposalVersionStatuses)[number]

export type CrmUiMessages = {
  common: {
    cancel: string
    done: string
    saveChanges: string
    create: string
    saving: string
    none: string
    unknownError: string
    today: string
    previous: string
    next: string
    page: string
    pageSummary: string
    loading: string
    activityTypeLabels: Record<CrmActivityType, string>
    activityStatusLabels: Record<CrmActivityStatus, string>
    relationTypeLabels: Record<CrmRelationType, string>
    recordStatusLabels: Record<CrmRecordStatus, string>
    entityTypeLabels: Record<CrmEntityType, string>
    proposalStatusLabels: Record<CrmProposalStatus, string>
    proposalVersionStatusLabels: Record<CrmProposalVersionStatus, string>
    relativeTime: {
      daysAgo: string
      weeksAgo: string
      monthsAgo: string
      yearsAgo: string
    }
  }
  organizationForm: {
    fields: {
      name: string
      legalName: string
      taxId: string
      website: string
      industry: string
      billingEmail: string
      billingAddressLine1: string
      billingAddressLine2: string
      billingCity: string
      billingRegion: string
      billingPostalCode: string
      billingCountry: string
    }
    actions: {
      create: string
    }
    validation: {
      nameRequired: string
      saveFailed: string
    }
  }
  personForm: {
    fields: {
      firstName: string
      lastName: string
      jobTitle: string
      email: string
      phone: string
      dateOfBirth: string
      addressLine1: string
      addressLine2: string
      addressCity: string
      addressRegion: string
      addressPostalCode: string
      addressCountry: string
    }
    sections: {
      identity: string
      contact: string
      address: string
      addresses: string
      relationships: string
      documents: string
    }
    relationships: {
      empty: string
      add: string
      personLabel: string
      personPlaceholder: string
      personEmpty: string
      kindLabel: string
      primaryToggle: string
      notesLabel: string
      remove: string
      saveFailed: string
    }
    addresses: {
      empty: string
      add: string
      edit: string
      remove: string
      saving: string
      saveFailed: string
      noValue: string
      primaryToggle: string
      typeLabel: string
      typePrimary: string
      typeBilling: string
      typeShipping: string
      typeMailing: string
      typeMeeting: string
      typeService: string
      typeLegal: string
      typeOther: string
      notesLabel: string
      dialogAddTitle: string
      dialogAddDescription: string
      dialogEditTitle: string
      dialogEditDescription: string
    }
    documents: {
      empty: string
      add: string
      type: string
      number: string
      issuingCountry: string
      expiryDate: string
      save: string
      remove: string
    }
    actions: {
      create: string
    }
    validation: {
      nameRequired: string
      saveFailed: string
    }
  }
  organizationDialog: {
    titles: {
      create: string
      edit: string
    }
    descriptions: {
      create: string
      edit: string
    }
  }
  personDialog: {
    titles: {
      create: string
      edit: string
    }
    descriptions: {
      create: string
      edit: string
    }
  }
  personCard: {
    unnamed: string
  }
  personCardConnected: {
    loadFailed: string
  }
  personList: {
    searchPlaceholder: string
    create: string
    columns: {
      name: string
      email: string
      phone: string
      relation: string
      status: string
    }
    filters: {
      button: string
      relationLabel: string
      relationAll: string
      statusLabel: string
      statusAll: string
      organizationLabel: string
      organizationAny: string
      organizationEmpty: string
      clear: string
    }
    loadFailed: string
    empty: string
  }
  peoplePage: {
    title: string
    description: string
  }
  organizationList: {
    searchPlaceholder: string
    create: string
    columns: {
      name: string
      industry: string
      relation: string
      website: string
      status: string
      updated: string
    }
    filters: {
      button: string
      relationLabel: string
      relationAll: string
      statusLabel: string
      statusAll: string
      clear: string
    }
    loadFailed: string
    empty: string
  }
  organizationsPage: {
    title: string
    description: string
  }
  entityComboboxes: {
    person: {
      placeholder: string
      empty: string
      loading: string
    }
    organization: {
      placeholder: string
      empty: string
      loading: string
    }
  }
  createActivityDialog: {
    title: string
    description: string
    fields: {
      subject: string
      type: string
      status: string
      description: string
      linkTo: string
      entityId: string
    }
    placeholders: {
      subject: string
      entityId: string
    }
    validation: {
      subjectRequired: string
      createFailed: string
    }
  }
  createProposalDialog: {
    title: string
    fields: {
      title: string
      stage: string
    }
    placeholders: {
      title: string
      stage: string
    }
    validation: {
      titleRequired: string
      stageRequired: string
      createFailed: string
    }
  }
  proposalsBoard: {
    fallbackName: string
  }
  proposalSummaryCard: {
    unknown: string
    expectedClose: string
  }
  inlineEditor: {
    failedToSave: string
    notSet: string
    selectPlaceholder: string
    noneOption: string
    invalidNumber: string
    minNumber: string
    maxNumber: string
    searchCurrencyPlaceholder: string
    noCurrenciesFound: string
    searchLanguagePlaceholder: string
    noLanguagesFound: string
    addTemplate: string
    addTagPlaceholder: string
    tagAlreadyAdded: string
    addTagFailed: string
    removeTagFailed: string
  }
  organizationDetailPage: {
    notFound: string
    backToOrganizations: string
  }
  organizationDetail: {
    topBar: {
      organizations: string
      merge: string
      delete: string
      deleteTitle: string
      deleteDescription: string
    }
    mergeDialog: {
      title: string
      description: string
      keepLabel: string
      mergeLabel: string
      placeholder: string
      empty: string
      selfError: string
      action: string
    }
    sidebar: {
      about: string
      tags: string
      fields: {
        name: string
        legalName: string
        taxId: string
        website: string
        industry: string
        relation: string
        status: string
        defaultCurrency: string
        preferredLanguage: string
        paymentTerms: string
        source: string
      }
    }
    metrics: {
      people: string
      openProposals: string
      pipelineValue: string
      won: string
    }
    tabs: {
      overview: string
      people: string
      contactMethods: string
      addresses: string
      namedContacts: string
      proposals: string
      activities: string
      bookings: string
      invoices: string
      payments: string
      contracts: string
    }
    sections: {
      created: string
      updated: string
      notes: string
    }
    empty: {
      noPeople: string
      unnamed: string
      noProposals: string
      noActivities: string
    }
    actions: {
      addPerson: string
      addActivity: string
    }
    hint: string
  }
  personDetailPage: {
    notFound: string
    backToPeople: string
  }
  personDetail: {
    topBar: {
      people: string
      edit: string
      merge: string
      delete: string
      deleteTitle: string
      deleteDescription: string
    }
    mergeDialog: {
      title: string
      description: string
      keepLabel: string
      mergeLabel: string
      placeholder: string
      empty: string
      selfError: string
      action: string
    }
    sidebar: {
      about: string
      tags: string
      openWebsite: string
      fields: {
        firstName: string
        lastName: string
        jobTitle: string
        email: string
        phone: string
        website: string
        relation: string
        status: string
        preferredCurrency: string
        preferredLanguage: string
        dateOfBirth: string
        source: string
      }
    }
    metrics: {
      openProposals: string
      pipelineValue: string
      documents: string
      activities: string
    }
    tabs: {
      overview: string
      proposals: string
      activities: string
      relationships: string
      documents: string
      paymentMethods: string
      communications: string
      addresses: string
      bookings: string
      invoices: string
      payments: string
      contracts: string
    }
    sections: {
      created: string
      updated: string
      organization: string
      notes: string
      travelProfile: string
      dateOfBirth: string
      dietaryRequirements: string
      accessibilityNeeds: string
      passportExpiry: string
      passportIssuingCountry: string
      passportIssuingAuthority: string
      primary: string
    }
    paymentMethods: {
      title: string
      add: string
      delete: string
      deleteTitle: string
      deleteDescription: string
      makeDefault: string
      ending: string
      fields: {
        brand: string
        holderName: string
        last4: string
        expMonth: string
        expYear: string
        processorToken: string
        default: string
      }
      brandLabels: {
        visa: string
        mastercard: string
        amex: string
        revolut: string
        bank_transfer: string
      }
    }
    communications: {
      title: string
      add: string
      noSubject: string
      fields: {
        channel: string
        direction: string
        subject: string
        content: string
        sentAt: string
      }
      channelLabels: {
        email: string
        phone: string
        whatsapp: string
        sms: string
        meeting: string
        other: string
      }
      directionLabels: {
        inbound: string
        outbound: string
      }
      /** Marks an entry the system sent, as opposed to one staff logged. */
      automaticBadge: string
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
    documentTypeLabels: {
      passport: string
      id_card: string
      driver_license: string
      visa: string
      other: string
    }
    empty: {
      noProposals: string
      noActivities: string
      noRelationships: string
      noDocuments: string
      noPaymentMethods: string
      noCommunications: string
      noTravelProfile: string
    }
    hint: string
  }
  personDocument: {
    /** Row-level inline reveal panel + per-row action icons. */
    row: {
      addButton: string
      makePrimary: string
      decrypting: string
      noNumberOnFile: string
      revealFailed: string
      revealAria: string
      hideAria: string
      editAria: string
      deleteButton: string
      deleteTitle: string
      deleteDescription: string
      deleteConfirm: string
    }
    /** Edit dialog (opens when the operator clicks the pencil). */
    dialog: {
      title: string
      addTitle: string
      description: string
      addDescription: string
      revealFailed: string
      fields: {
        type: string
        number: string
        issuingCountry: string
        issuingAuthority: string
        issueDate: string
        expiryDate: string
        primary: string
        notes: string
      }
      placeholders: {
        number: string
        issuingCountry: string
      }
      loading: string
      saveFailed: string
      cancel: string
      save: string
      saving: string
    }
  }
  createProposalVersionDialog: {
    title: string
    fields: {
      proposal: string
      currency: string
      validUntil: string
    }
    placeholders: {
      searchProposals: string
      selectCurrency: string
      pickDate: string
    }
    empty: {
      loading: string
      noProposals: string
    }
    validation: {
      selectProposal: string
      selectCurrency: string
      createFailed: string
    }
    actions: {
      create: string
    }
  }
  proposalVersionLinesCard: {
    title: string
    empty: string
    fields: {
      description: string
      quantity: string
      priceCents: string
    }
    validation: {
      descriptionRequired: string
      addFailed: string
    }
    subtotal: string
  }
  activitiesPage: {
    title: string
    description: string
    create: string
    filters: {
      type: string
      status: string
      allTypes: string
      allStatuses: string
    }
    empty: string
  }
  proposalVersionsPage: {
    title: string
    description: string
    create: string
    filters: {
      status: string
      allStatuses: string
    }
    columns: {
      proposalVersion: string
      status: string
      total: string
      validUntil: string
      updated: string
    }
    loadFailed: string
    empty: string
  }
}
