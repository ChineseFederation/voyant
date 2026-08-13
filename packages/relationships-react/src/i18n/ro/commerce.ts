export const crmUiRoCommerceMessages = {
  createActivityDialog: {
    title: "Activitate noua",
    description: "Inregistreaza un apel, email, intalnire sau sarcina.",
    fields: {
      subject: "Subiect",
      type: "Tip",
      status: "Status",
      description: "Descriere",
      linkTo: "Leaga de",
      entityId: "Legat de",
    },
    placeholders: {
      subject: "Apel de descoperire cu Acme",
      entityId: "Cauta o persoana, companie sau oferta",
    },
    validation: {
      subjectRequired: "Subiectul este obligatoriu",
      createFailed: "Crearea activitatii a esuat",
    },
  },
  createProposalDialog: {
    title: "Propunere noua",
    fields: {
      title: "Titlu",
      stage: "Etapa",
    },
    placeholders: {
      title: "Propunere noua",
      stage: "Selecteaza etapa...",
    },
    validation: {
      titleRequired: "Titlul este obligatoriu",
      stageRequired: "Etapa este obligatorie",
      createFailed: "Crearea propunerii a esuat",
    },
  },
  proposalsBoard: {
    fallbackName: "Etapa fara nume",
  },
  proposalSummaryCard: {
    unknown: "Necunoscut",
    expectedClose: "Inchidere estimata",
  },
  inlineEditor: {
    failedToSave: "Salvarea a esuat.",
    notSet: "Nesetat",
    selectPlaceholder: "Selecteaza...",
    noneOption: "Niciunul",
    invalidNumber: "Introdu un numar valid.",
    minNumber: "Trebuie sa fie cel putin {min}.",
    maxNumber: "Trebuie sa fie cel mult {max}.",
    searchCurrencyPlaceholder: "Cauta moneda...",
    noCurrenciesFound: "Nu au fost gasite monede.",
    searchLanguagePlaceholder: "Cauta limba...",
    noLanguagesFound: "Nu au fost gasite limbi.",
    addTemplate: "Adauga {label}",
    editTemplate: "Editeaza {label}",
    addTagPlaceholder: "Adauga eticheta...",
    tagAlreadyAdded: "Eticheta este deja adaugata.",
    addTagFailed: "Adaugarea etichetei a esuat.",
    removeTagFailed: "Stergerea etichetei a esuat.",
  },
  createProposalVersionDialog: {
    title: "Versiune de propunere noua",
    fields: {
      proposal: "Oferta",
      currency: "Moneda",
      validUntil: "Valabila pana la",
    },
    placeholders: {
      searchProposals: "Cauta propuneri...",
      selectCurrency: "Selecteaza moneda...",
      pickDate: "Alege o data",
    },
    empty: {
      loading: "Se incarca...",
      noProposals: "Nu au fost gasite propuneri.",
    },
    validation: {
      selectProposal: "Selecteaza o propunere",
      selectCurrency: "Selecteaza o moneda",
      createFailed: "Crearea versiunii de oferta a esuat",
    },
    actions: {
      create: "Creeaza",
    },
  },
  proposalVersionLinesCard: {
    title: "Linii versiune propunere",
    empty: "Nu exista inca linii.",
    fields: {
      description: "Descriere",
      quantity: "Cant.",
      priceCents: "Pret",
    },
    validation: {
      descriptionRequired: "Descrierea este obligatorie",
      addFailed: "Adaugarea liniei a esuat",
    },
    subtotal: "Subtotal",
  },
  activitiesPage: {
    title: "Activitati",
    description: "Apelurile, emailurile si intalnirile inregistrate.",
    create: "Activitate noua",
    filters: {
      type: "Tip",
      status: "Status",
      allTypes: "Toate tipurile",
      allStatuses: "Toate statusurile",
    },
    empty: "Nicio activitate nu corespunde filtrelor.",
  },
  proposalVersionsPage: {
    title: "Versiuni oferta",
    description: "Versiuni emise pentru ofertele din pipeline.",
    create: "Versiune oferta noua",
    filters: {
      status: "Status",
      allStatuses: "Toate statusurile",
    },
    columns: {
      proposalVersion: "Versiune",
      status: "Status",
      total: "Total",
      validUntil: "Valabila pana la",
      updated: "Actualizat",
    },
    loadFailed: "Incarcarea ofertelor a esuat.",
    empty: "Nu au fost gasite propuneri.",
  },
} as const
