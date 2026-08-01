export const crmUiRoListsMessages = {
  personCard: {
    unnamed: "Fara nume",
  },
  personCardConnected: {
    loadFailed: "Incarcarea persoanei a esuat:",
  },
  personList: {
    searchPlaceholder: "Cauta persoane...",
    create: "Persoana noua",
    columns: {
      name: "Nume",
      email: "Email",
      phone: "Telefon",
      relation: "Relatie",
      status: "Status",
    },
    filters: {
      button: "Filtre",
      relationLabel: "Relatie",
      relationAll: "Toate relatiile",
      statusLabel: "Status",
      statusAll: "Toate statusurile",
      organizationLabel: "Organizatie",
      organizationAny: "Orice organizatie",
      organizationEmpty: "Nicio organizatie gasita.",
      clear: "Sterge filtre",
    },
    loadFailed: "Incarcarea persoanelor a esuat.",
    empty: "Nu au fost gasite persoane.",
  },
  peoplePage: {
    title: "Persoane",
    description: "Toti cei cu care lucrezi.",
  },
  organizationList: {
    searchPlaceholder: "Cauta organizatii...",
    create: "Organizatie noua",
    columns: {
      name: "Nume",
      industry: "Industrie",
      relation: "Relatie",
      website: "Website",
      status: "Status",
      updated: "Actualizat",
    },
    filters: {
      button: "Filtre",
      relationLabel: "Relatie",
      relationAll: "Toate relatiile",
      statusLabel: "Status",
      statusAll: "Toate statusurile",
      clear: "Sterge filtre",
    },
    loadFailed: "Incarcarea organizatiilor a esuat.",
    empty: "Nu au fost gasite organizatii.",
  },
  organizationsPage: {
    title: "Organizatii",
    description: "Companii si furnizori.",
  },
  entityComboboxes: {
    person: {
      placeholder: "Cauta persoane...",
      empty: "Nu s-au gasit persoane.",
      loading: "Se incarca persoanele...",
    },
    organization: {
      placeholder: "Cauta organizatii...",
      empty: "Nu s-au gasit organizatii.",
      loading: "Se incarca organizatiile...",
    },
  },
} as const
