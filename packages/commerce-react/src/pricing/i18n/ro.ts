import type { PricingUiMessages } from "./messages.js"

export const pricingUiRo = {
  common: {
    cancel: "Anuleaza",
    saveChanges: "Salveaza modificarile",
    create: "Creeaza",
    add: "Adauga",
    loading: "Se incarca...",
    none: "—",
    previous: "Anterior",
    next: "Urmator",
    page: "Pagina",
    active: "Activ",
    inactive: "Inactiv",
    categoryTypeLabels: {
      adult: "Adult",
      child: "Copil",
      infant: "Infant",
      senior: "Senior",
      group: "Grup",
      room: "Camera",
      vehicle: "Vehicul",
      service: "Serviciu",
      other: "Altul",
    },
    dependencyTypeLabels: {
      requires: "Necesita",
      limits_per_master: "Limiteaza per master",
      limits_sum: "Limiteaza suma",
      excludes: "Exclude",
    },
    chargeTypeLabels: {
      none: "Niciunul",
      amount: "Suma",
      percentage: "Procent",
    },
    addonPricingModeLabels: {
      included: "Inclus",
      per_person: "Per persoana",
      per_booking: "Per rezervare",
      on_request: "La cerere",
      unavailable: "Indisponibil",
    },
    optionPriceRulePricingModeLabels: {
      per_person: "Per persoana",
      per_booking: "Per rezervare",
      starting_from: "De la",
      free: "Gratuit",
      on_request: "La cerere",
    },
    startTimeRuleModeLabels: {
      included: "Inclus",
      excluded: "Exclus",
      override: "Suprascriere",
      adjustment: "Ajustare",
    },
    adjustmentTypeLabels: {
      fixed: "Fix",
      percentage: "Procent",
    },
    unitPricingModeLabels: {
      per_unit: "Per unitate",
      per_person: "Per persoana",
      per_booking: "Per rezervare",
      included: "Inclus",
      free: "Gratuit",
      on_request: "La cerere",
    },
  },
  comboboxes: {
    pricingCategory: {
      placeholder: "Cauta categorii de pret...",
      empty: "Nu au fost gasite categorii de pret.",
    },
    priceCatalog: {
      placeholder: "Cauta cataloage de pret...",
      empty: "Nu au fost gasite cataloage de pret.",
    },
    priceSchedule: {
      placeholder: "Cauta calendare de pret...",
      empty: "Nu au fost gasite calendare de pret.",
    },
    cancellationPolicy: {
      placeholder: "Cauta politici de taxe de anulare...",
      empty: "Nu au fost gasite politici de taxe de anulare.",
    },
    optionPriceRule: {
      placeholder: "Cauta reguli de pret pentru optiuni...",
      empty: "Nu au fost gasite reguli de pret pentru optiuni.",
    },
    product: {
      placeholder: "Cauta produse...",
      empty: "Nu au fost gasite produse.",
    },
    productOption: {
      placeholder: "Selecteaza optiunea produsului...",
      empty: "Nu au fost gasite optiuni de produs.",
      missingParent: "Selecteaza mai intai un produs.",
    },
    optionUnit: {
      placeholder: "Selecteaza unitatea optiunii...",
      empty: "Nu au fost gasite unitati de optiune.",
      missingParent: "Selecteaza mai intai o optiune.",
    },
    optionUnitPriceRule: {
      placeholder: "Selecteaza regula de pret pe unitate...",
      empty: "Nu au fost gasite reguli de pret pe unitate.",
    },
    pickupPoint: {
      placeholder: "Cauta puncte de preluare...",
      empty: "Nu au fost gasite puncte de preluare.",
    },
    productExtra: {
      placeholder: "Cauta extra-uri...",
      empty: "Nu au fost gasite extra-uri.",
    },
  },
  pricingCategoriesPage: {
    title: "Categorii de tarifare",
    description:
      "Categorii reutilizabile pentru varsta, camera, vehicul si alte dimensiuni de tarifare.",
  },
  priceCatalogsPage: {
    title: "Cataloage de pret",
    description: "Creeaza liste de preturi cu o moneda si un scop (public, contract, net etc.).",
    addCatalog: "Adauga catalog",
    empty:
      "Nu exista cataloage de pret momentan. Creeaza un catalog pentru a defini rate in functie de moneda.",
    default: "Implicit",
    edit: "Editeaza",
    delete: "Sterge",
    deleteConfirm: "Stergi acest catalog de pret?",
    showingSummary: "Afisare {count} din {total}",
    selectCurrencyPlaceholder: "Selecteaza moneda...",
    noCurrenciesFound: "Nu au fost gasite monede.",
    editSheetTitle: "Editeaza catalogul",
    newSheetTitle: "Catalog de pret nou",
    nameLabel: "Nume",
    namePlaceholder: "EUR Public Rates",
    codeLabel: "Cod",
    codePlaceholder: "EUR-PUBLIC",
    currencyLabel: "Moneda",
    typeLabel: "Tip",
    defaultCatalogLabel: "Catalog implicit",
    activeLabel: "Activ",
    notesLabel: "Note",
    notesPlaceholder: "Note optionale",
    cancel: "Anuleaza",
    saveChanges: "Salveaza modificarile",
    createCatalog: "Creeaza catalogul",
    catalogTypeLabels: {
      public: "Public",
      contract: "Contract",
      net: "Net",
      gross: "Brut",
      promo: "Promo",
      internal: "Intern",
      other: "Altul",
    },
    validation: {
      nameRequired: "Numele este obligatoriu",
      codeRequired: "Codul este obligatoriu",
      currencyLength: "Foloseste cod ISO din 3 litere",
    },
  },
  pricingCategoryDialog: {
    titles: {
      create: "Categorie noua de pret",
      edit: "Editeaza categoria de pret",
    },
    descriptions: {
      create: "Creeaza o categorie reutilizabila de pret pentru produse si optiuni.",
      edit: "Actualizeaza regulile si eligibilitatea categoriei reutilizabile de pret.",
    },
  },
  pricingCategoryForm: {
    fields: {
      name: "Nume",
      code: "Cod",
      type: "Tip",
      seatOccupancy: "Ocupare loc",
      ageQualified: "Calificata dupa varsta",
      minAge: "Varsta minima",
      maxAge: "Varsta maxima",
      sortOrder: "Ordine sortare",
      active: "Activ",
    },
    placeholders: {
      name: "Adult",
      code: "adult",
    },
    validation: {
      nameRequired: "Numele categoriei este obligatoriu.",
      saveFailed: "Salvarea categoriei de pret a esuat.",
    },
    actions: {
      create: "Creeaza categoria",
    },
  },
  pricingCategoryList: {
    searchPlaceholder: "Cauta categorii de pret...",
    add: "Categorie noua",
    columns: {
      name: "Nume",
      code: "Cod",
      type: "Tip",
      age: "Varsta",
      seat: "Loc",
      sort: "Ordine",
      status: "Status",
      actions: "Actiuni",
    },
    loadingError: "Incarcarea categoriilor de pret a esuat.",
    empty: "Nu au fost gasite categorii de pret.",
    edit: "Editeaza",
    delete: "Sterge",
    deleteConfirm: 'Stergi categoria "{name}"?',
    showingSummary: "Afisezi {count} din {total}",
  },
  pricingCategoryDependencyDialog: {
    titles: {
      create: "Adauga dependenta de categorie",
      edit: "Editeaza dependenta de categorie",
    },
    description:
      "Reguli intre categorii de pret, cum ar fi necesita, exclude si limite de cantitate.",
  },
  pricingCategoryDependencyForm: {
    fields: {
      masterCategory: "Categorie master",
      dependentCategory: "Categorie dependenta",
      dependencyType: "Tip dependenta",
      maxPerMaster: "Maxim per master",
      maxDependentSum: "Maxim suma dependenta",
      active: "Activ",
      notes: "Note",
    },
    placeholders: {
      categorySearch: "Cauta categorie",
    },
    validation: {
      categoriesRequired: "Atat categoria master, cat si cea dependenta sunt obligatorii.",
      saveFailed: "Salvarea dependentei de categorie a esuat.",
    },
    actions: {
      create: "Adauga dependenta",
    },
  },
  priceScheduleDialog: {
    titles: {
      create: "Calendar nou de pret",
      edit: "Editeaza Calendarul de Pret",
    },
    fields: {
      catalog: "Catalog",
      name: "Nume",
      code: "Cod",
      recurrenceRule: "Cand se repeta",
      validFrom: "Valabil de la",
      validTo: "Valabil pana la",
      timezone: "Fus orar",
      priority: "Prioritate",
      active: "Activ",
      notes: "Note",
    },
    placeholders: {
      catalog: "Cauta cataloage de pret...",
      name: "Sezon de varf",
      code: "high-season",
      recurrenceRule: "FREQ=YEARLY;BYMONTH=6,7,8",
      validFrom: "Optional",
      validTo: "Optional",
      timezone: "Europe/Bucharest",
    },
    validation: {
      catalogRequired: "Catalogul este obligatoriu",
      nameRequired: "Numele este obligatoriu",
      recurrenceRuleRequired: "RRULE este obligatoriu",
    },
    helpText: {
      recurrenceRuleExample:
        "De exemplu, in fiecare an in iunie-august: FREQ=YEARLY;BYMONTH=6,7,8.",
    },
    actions: {
      create: "Creeaza calendarul",
    },
  },
  recurrence: {
    frequencyLabel: "Frecventa",
    frequencyOptions: {
      yearly: "Anual",
      monthly: "Lunar",
      weekly: "Saptamanal",
      custom: "Personalizat",
    },
    monthsLabel: "Luni",
    weekdaysLabel: "Zile",
    monthDayLabel: "Ziua din luna",
    monthDayPlaceholder: "ex. 15",
    advancedLabel: "Avansat",
    rawRuleLabel: "Regula recurenta bruta (RRULE)",
    rawRulePlaceholder: "FREQ=YEARLY;BYMONTH=6,7,8",
  },
  cancellationPolicyRuleDialog: {
    titles: {
      create: "Adauga regula de anulare",
      edit: "Editeaza regula de anulare",
    },
    fields: {
      cutoffMinutesBefore: "Cutoff (minute inainte)",
      sortOrder: "Ordine sortare",
      chargeType: "Tip taxa",
      chargeAmount: "Valoare taxa",
      chargePercent: "Procent taxa (0-100)",
      active: "Activ",
      notes: "Note",
    },
    placeholders: {
      cutoffMinutesBefore: "2880",
      chargePercent: "50",
    },
    helpText: {
      cutoffMinutesBefore: "48h = 2880m · 24h = 1440m",
    },
    actions: {
      create: "Adauga regula",
    },
  },
  optionPriceRuleDialog: {
    titles: {
      create: "Adauga regula de pret pentru optiune",
      edit: "Editeaza regula de pret pentru optiune",
    },
    fields: {
      product: "Produs",
      option: "Optiune",
      name: "Nume",
      code: "Cod",
      catalog: "Catalog",
      schedule: "Calendar (optional)",
      cancellationPolicy: "Politica de anulare (optional)",
      pricingMode: "Mod tarifare",
      occupancyPriceBasis: "Pret ocupare",
      baseSell: "Pret baza vanzare",
      baseCost: "Cost baza",
      minPerBooking: "Minim per rezervare",
      maxPerBooking: "Maxim per rezervare",
      description: "Descriere",
      allPricingCategories: "Toate categoriile de pret",
      defaultRule: "Regula implicita",
      active: "Activ",
      notes: "Note",
    },
    occupancyPriceBasisLabels: {
      supplement: "Supliment adaugat la tariful de baza",
      all_in: "Tarif total pentru ocupare",
    },
    helpText: {
      occupancyPriceBasis:
        "Alegeti daca pretul camerei se adauga la tariful de baza sau il include deja.",
    },
    validation: {
      productRequired: "Produsul este obligatoriu",
      optionRequired: "Optiunea este obligatorie",
      catalogRequired: "Catalogul este obligatoriu",
      nameRequired: "Numele este obligatoriu",
    },
    actions: {
      create: "Creeaza regula",
    },
  },
  locationPriceRuleDialog: {
    fields: {
      optionPriceRule: "Regula de pret pentru optiune",
      optionId: "Optiune",
      facilityId: "Facilitate (optional)",
      pickupPointId: "Punct de preluare",
      dropoffName: "Nume dropoff",
      dropoffCode: "Cod dropoff (optional)",
      pricingMode: "Mod tarifare",
      sellAmount: "Pret vanzare",
      costAmount: "Cost",
      sortOrder: "Ordine sortare",
      active: "Activ",
      notes: "Note",
    },
    placeholders: {
      optionId: "Selecteaza optiunea...",
      facilityId: "Cauta facilitati…",
      pickupPointId: "Cauta puncte de preluare…",
    },
    validation: {
      optionPriceRuleRequired: "Regula de pret pentru optiune este obligatorie",
      optionIdRequired: "Optiunea este obligatorie",
      pickupPointIdRequired: "Punctul de preluare este obligatoriu",
      dropoffNameRequired: "Numele dropoff este obligatoriu",
    },
    actions: {
      createRule: "Adauga regula",
      saveRule: "Salveaza modificarile",
    },
    pickup: {
      titles: {
        create: "Adauga regula de pret pentru pickup",
        edit: "Editeaza regula de pret pentru pickup",
      },
    },
    dropoff: {
      titles: {
        create: "Adauga regula de pret pentru dropoff",
        edit: "Editeaza regula de pret pentru dropoff",
      },
    },
    extra: {
      titles: {
        create: "Adauga regula de pret pentru extra",
        edit: "Editeaza regula de pret pentru extra",
      },
      fields: {
        productExtraId: "Extra produs (optional)",
        optionExtraConfigId: "Extra optiune (optional)",
      },
      placeholders: {
        productExtraId: "Cauta extra-uri…",
        optionExtraConfigId: "Cauta extra-uri de optiune…",
      },
    },
  },
  optionStartTimeRuleDialog: {
    titles: {
      create: "Adauga regula pentru ora de start",
      edit: "Editeaza regula pentru ora de start",
    },
    fields: {
      optionPriceRule: "Regula de pret pentru optiune",
      optionId: "Optiune",
      startTimeId: "ID ora start",
      ruleMode: "Mod regula",
      adjustmentType: "Tip ajustare",
      sellAdjustment: "Ajustare vanzare",
      costAdjustment: "Ajustare cost",
      adjustmentPercent: "Ajustare (%)",
      active: "Activ",
      notes: "Note",
    },
    placeholders: {
      optionId: "Selecteaza optiunea...",
      startTimeId: "pst_…",
      select: "Selecteaza...",
    },
    validation: {
      optionPriceRuleRequired: "Regula de pret pentru optiune este obligatorie",
      optionIdRequired: "Optiunea este obligatorie",
      startTimeIdRequired: "ID-ul orei de start este obligatoriu",
    },
    actions: {
      create: "Adauga regula",
    },
  },
  optionUnitPriceRuleDialog: {
    titles: {
      create: "Adauga regula de pret pe unitate",
      edit: "Editeaza regula de pret pe unitate",
    },
    fields: {
      optionPriceRule: "Regula de pret pentru optiune",
      option: "Optiune",
      unit: "Unitate",
      pricingCategory: "Categorie de pret (optional)",
      pricingMode: "Mod tarifare",
      sellAmount: "Pret vanzare",
      costAmount: "Cost",
      minQuantity: "Cantitate minima",
      maxQuantity: "Cantitate maxima",
      sortOrder: "Ordine sortare",
      active: "Activ",
      notes: "Note",
    },
    placeholders: {
      pricingCategory: "Cauta categorii de pret...",
    },
    validation: {
      optionPriceRuleRequired: "Regula de pret pentru optiune este obligatorie",
      optionRequired: "Optiunea este obligatorie",
      unitRequired: "Unitatea este obligatorie",
    },
    actions: {
      create: "Adauga regula",
    },
  },
  optionUnitTierDialog: {
    titles: {
      create: "Adauga tier de unitate",
      edit: "Editeaza tier-ul de unitate",
    },
    fields: {
      optionUnitPriceRule: "Regula de pret pe unitate",
      minQuantity: "Cantitate minima",
      maxQuantity: "Cantitate maxima",
      sellAmount: "Pret vanzare",
      costAmount: "Cost",
      sortOrder: "Ordine sortare",
      active: "Activ",
    },
    placeholders: {
      optionUnitPriceRule: "Selecteaza regula de pret pe unitate...",
    },
    validation: {
      optionUnitPriceRuleRequired: "Regula de pret pe unitate este obligatorie",
      minQuantityMin: "Cantitatea minima trebuie sa fie cel putin 1",
    },
    actions: {
      create: "Adauga tier",
    },
  },
} satisfies PricingUiMessages
