import type { BookingsUiOperationsMessages } from "./messages-operations.js"

export const bookingsUiRoOperations = {
  statusChangeDialog: {
    title: "Schimba statusul rezervarii",
    fields: {
      status: "Status nou",
      note: "Nota (optional)",
      suppressNotifications: "Nu notifica clientul",
    },
    placeholders: {
      note: "Motivul schimbarii statusului...",
    },
    helpers: {
      suppressNotifications:
        "Confirma silentios — sari peste emailul de confirmare si pachetul de documente care ar fi trimise in mod normal.",
    },
    actions: {
      updateStatus: "Actualizeaza statusul",
    },
  },
  supplierStatusDialog: {
    titles: {
      create: "Adauga status furnizor",
      edit: "Actualizeaza statusul furnizorului",
    },
    fields: {
      serviceName: "Nume serviciu",
      status: "Status",
      costCurrency: "Moneda cost",
      costAmountCents: "Cost",
      supplierReference: "Referinta furnizor",
      notes: "Note",
    },
    placeholders: {
      serviceName: "Hotel Dubrovnik Palace",
      supplierReference: "CONF-12345",
      notes: "Note suplimentare...",
    },
    validation: {
      serviceNameRequired: "Numele serviciului este obligatoriu",
      costCurrencyInvalid: "Foloseste un cod ISO din 3 litere",
    },
    actions: {
      addSupplierStatus: "Adauga",
    },
  },
  bookingItemList: {
    title: "Articole",
    addItem: "Adauga articol",
    empty: "Nu exista articole inca.",
    values: {
      totalUnavailable: "-",
      costUnavailable: "-",
      serviceDateUnavailable: "-",
    },
    columns: {
      title: "Titlu",
      option: "Optiune",
      unit: "Unitate",
      type: "Tip",
      status: "Status",
      quantity: "Cant.",
      total: "Total",
      cost: "Cost",
      serviceDate: "Date",
    },
    detail: {
      description: "Descriere",
      dates: "Date",
      cost: "Cost",
      catalogSource: "Sursa catalog",
      productLink: "Deschide produs",
      noDescription: "Nu exista descriere pentru acest articol.",
    },
    actions: {
      deleteConfirm: {
        title: "Stergi acest articol?",
        description: "Articolul va fi sters din rezervare. Aceasta actiune nu poate fi anulata.",
        cancel: "Anuleaza",
        confirm: "Sterge",
      },
      expandItem: "Extinde articolul",
      collapseItem: "Restrange articolul",
      viewItem: "Vezi articolul",
      editItem: "Editeaza articolul",
      deleteItem: "Sterge articolul",
    },
    snapshot: {
      title: "Snapshot articol",
      subtitle: "Capturat la momentul rezervarii — nu se actualizeaza.",
      sectionSummary: "Sumar",
      sectionPricing: "Preturi",
      sectionMeta: "Meta",
      productLabel: "Produs",
      optionLabel: "Optiune",
      unitLabel: "Unitate",
      descriptionLabel: "Descriere",
      typeLabel: "Tip",
      statusLabel: "Status",
      datesLabel: "Date",
      quantityLabel: "Cantitate",
      unitSellLabel: "Pret unitar",
      totalSellLabel: "Total vanzare",
      unitCostLabel: "Cost unitar",
      totalCostLabel: "Total cost",
      notesLabel: "Note",
      createdAtLabel: "Creat",
      updatedAtLabel: "Actualizat",
      empty: "—",
    },
  },
  bookingPaymentScheduleList: {
    title: "Scadentar",
    addSchedule: "Adauga scadenta",
    empty: "Nu exista scadente inca.",
    values: {
      notesUnavailable: "-",
      proformaSuffix: "proforma",
    },
    columns: {
      type: "Tip",
      status: "Status",
      dueDate: "Data scadenta",
      amount: "Suma",
      notes: "Note",
      invoice: "Factura",
    },
    actions: {
      deleteConfirm: {
        title: "Stergi aceasta scadenta?",
        description: "Scadenta va fi stearsa din rezervare. Aceasta actiune nu poate fi anulata.",
        cancel: "Anuleaza",
        confirm: "Sterge",
      },
      editSchedule: "Editeaza scadenta",
      deleteSchedule: "Sterge scadenta",
      issueDocument: "Emite document",
      issueInvoice: "Emite factura",
      issueProforma: "Emite proforma",
      issueDocumentSuccess: "Document emis.",
      issueDocumentFailure: "Documentul nu a putut fi emis",
      issueDocumentErrors: {
        invoice_number_series_not_found:
          "Seria de numere selectata nu a fost gasita. Verifica Financiar > Serii numere inainte de emitere.",
        invoice_number_series_inactive:
          "Seria de numere selectata este inactiva. Activeaz-o in Financiar > Serii numere inainte de emitere.",
        invoice_number_series_scope_mismatch:
          "Seria de numere selectata nu corespunde tipului de document. Alege o serie potrivita in Financiar > Serii numere.",
        no_active_series_for_scope:
          "Nu exista o serie de numere activa pentru acest tip de document. Creeaza sau activeaza una in Financiar > Serii numere.",
      },
    },
  },
  bookingDisputeBanner: {
    title: "Plata contestata",
    description:
      "Clientul a contestat o plata de pe aceasta rezervare. Banii sunt retrasi sau blocati pana la solutionare, deci rezervarea nu este achitata curat.",
    contested: "Contestat",
    respondBy: "Raspunde pana la",
    noDeadline: "Fara termen comunicat",
    statuses: {
      opened: "Deschisa",
      under_review: "In analiza",
      won: "Castigata",
      lost: "Pierduta",
      withdrawn: "Retrasa",
    },
    resolvedTitle: "Contestatii anterioare",
    resolvedDescription:
      "Toate contestatiile de pe aceasta rezervare s-au solutionat. Nimic nu este contestat acum.",
  },
  bookingRefundBanner: {
    title: "Restituire datorata",
    description:
      "O restituire de pe aceasta rezervare nu a ajuns inca la client. Nota de credit este emisa, dar banii nu au plecat.",
    owed: "Datorat",
    settledTitle: "Restituiri platite",
    settledDescription:
      "Toate restituirile de pe aceasta rezervare au fost platite inapoi clientului.",
    methods: {
      processor_reversal: "Stornare pe card",
      bank_transfer: "Transfer bancar",
      cash: "Numerar",
      cheque: "Cec",
      travel_credit: "Credit de calatorie",
      voucher: "Voucher",
      counterparty_offset: "Credit in contul lor",
      other: "Altfel",
    },
    statuses: {
      pending: "Inca neplatita",
      settled: "Platita",
      failed: "Esuata",
    },
  },
  bookingPaymentReconciliationBanner: {
    title: "Reconciliere plati",
    loading: "Se verifica sursele de plata...",
    empty: "Nu exista facturi, plati sau scadente inregistrate inca.",
    reconciledDescription: "Sumele achitate coincid pe facturi, plati si scadentar.",
    driftDescription:
      "Sumele achitate nu coincid pe facturi, plati si scadentar. Verifica-le inainte de a incasa alte plati.",
    reconciledBadge: "Reconciliat",
    driftBadge: "Necesita verificare",
    billed: "Facturat",
    invoicePaid: "Achitat pe facturi",
    recordedPayments: "Plati inregistrate",
    schedulePaid: "Scadente platite",
    drift: "Nepotrivire",
    emptyValue: "-",
  },
  supplierStatusList: {
    title: "Confirmari furnizori",
    addSupplier: "Adauga furnizor",
    empty: "Nu exista statusuri de furnizor inca.",
    values: {
      costUnavailable: "-",
      referenceUnavailable: "-",
      confirmedUnavailable: "-",
    },
    columns: {
      service: "Serviciu",
      status: "Status",
      cost: "Cost",
      reference: "Referinta",
      confirmed: "Confirmat",
      actions: "Actiuni",
    },
    actions: {
      edit: "Editeaza statusul furnizorului",
    },
  },
  bookingCancellationDialog: {
    title: "Anuleaza rezervarea",
    summary: {
      booking: "Rezervare",
      startDate: "Data inceput",
      total: "Total",
      daysBeforeDeparture: "Zile pana la plecare",
    },
    values: {
      startDateTbd: "De stabilit",
      amountUnavailable: "-",
      ruleFallback: "-",
      ruleDaysBeforeDeparture: ">= {days} zile",
    },
    policy: {
      applicablePolicy: "Politica aplicabila",
      refund: "Rambursare",
      penalty: "Penalizare",
      rule: "Regula",
      resolving: "Se rezolva politica de anulare...",
      missing: "Nu exista o politica de anulare configurata pentru aceasta rezervare.",
      missingHint:
        "Continuarea va anula rezervarea fara o previzualizare a rambursarii. Rezervarile platite vor fi marcate pentru revizuirea decontarii.",
      calculating: "Se calculeaza rambursarea...",
      noTotalAmount: "Rezervarea nu are o suma totala. Rambursarea nu poate fi calculata.",
    },
    paidSettlement: {
      title: "Decontarea rezervarii platite este necesara",
      description:
        "Facturile si platile existente raman neschimbate. Departamentul financiar va fi notificat sa decida asupra unei rambursari, note de credit sau fara rambursare.",
    },
    refundTypeLabels: {
      cash: "Rambursare cash",
      credit: "Credit",
      cash_or_credit: "Cash sau credit",
      none: "Fara rambursare",
    },
    fields: {
      reason: "Motiv",
    },
    placeholders: {
      reason: "De ce este anulata aceasta rezervare?",
    },
    validation: {
      cancellationFailed: "Anularea a esuat",
    },
    actions: {
      close: "Inchide",
      confirm: "Confirma anularea",
    },
  },
  bookingBillingDialog: {
    title: "Editeaza contactul de facturare",
    fields: {
      partyType: "Tip facturare",
      firstName: "Prenume",
      lastName: "Nume",
      companyName: "Denumire",
      taxId: "Cod fiscal",
      email: "Email",
      phone: "Telefon",
      addressLine1: "Adresa linia 1",
      addressLine2: "Adresa linia 2",
      city: "Oras",
      region: "Judet / regiune",
      postalCode: "Cod postal",
      country: "Tara",
    },
    partyTypeLabels: {
      individual: "Persoana fizica",
      company: "Companie",
    },
    crmPicker: {
      label: "Sursa contact",
      personSearchPlaceholder: "Cauta persoane...",
      personEmpty: "Nicio persoana gasita.",
      organizationSearchPlaceholder: "Cauta organizatii...",
      organizationEmpty: "Nicio organizatie gasita.",
    },
    actions: {
      cancel: "Anuleaza",
      selectFromCrm: "Selecteaza din contacte",
      hideCrmPicker: "Ascunde selectorul de contacte",
      save: "Salveaza modificarile",
    },
  },
  bookingGuaranteeDialog: {
    titles: {
      create: "Adauga garantie",
      edit: "Editeaza garantia",
    },
    guaranteeTypeLabels: {
      deposit: "Depozit",
      credit_card: "Card de credit",
      preauth: "Preautorizare",
      card_on_file: "Card salvat",
      bank_transfer: "Transfer bancar",
      voucher: "Voucher",
      agency_letter: "Scrisoare de agentie",
      other: "Altul",
    },
    guaranteeStatusLabels: {
      pending: "In asteptare",
      active: "Activa",
      released: "Eliberata",
      failed: "Esuata",
      cancelled: "Anulata",
      expired: "Expirata",
    },
    fields: {
      type: "Tip",
      status: "Status",
      currency: "Moneda",
      amountCents: "Suma",
      provider: "Furnizor",
      referenceNumber: "Numar referinta",
      expiresAt: "Expira la",
      notes: "Note",
    },
    placeholders: {
      provider: "Stripe, nume banca...",
      referenceNumber: "Referinta externa...",
      expiresAt: "Selecteaza data si ora expirarii",
      notes: "Note garantie...",
    },
    actions: {
      addGuarantee: "Adauga garantia",
    },
  },
  bookingGuaranteeList: {
    title: "Garantii",
    addGuarantee: "Adauga garantie",
    empty: "Nu exista garantii inca.",
    values: {
      amountUnavailable: "-",
      providerUnavailable: "-",
      referenceUnavailable: "-",
      expiresUnavailable: "-",
    },
    columns: {
      type: "Tip",
      status: "Status",
      amount: "Suma",
      provider: "Furnizor",
      reference: "Referinta",
      expires: "Expira",
    },
    actions: {
      deleteConfirm: {
        title: "Stergi aceasta garantie?",
        description: "Garantia va fi stearsa din rezervare. Aceasta actiune nu poate fi anulata.",
        cancel: "Anuleaza",
        confirm: "Sterge",
      },
      editGuarantee: "Editeaza garantia",
      deleteGuarantee: "Sterge garantia",
    },
  },
  bookingGroupLinkDialog: {
    title: "Leaga rezervarea la o camera shared",
    modes: {
      join: "Alatura-te unui grup existent",
      create: "Creeaza grup nou",
    },
    fields: {
      existingGroups: "Grupuri existente",
      groupLabel: "Eticheta grupului",
    },
    placeholders: {
      selectGroup: "Selecteaza un grup...",
      noExistingGroups: "Nu exista grupuri",
      groupLabel: "ex. Popescu + Ionescu, Camera 204",
    },
    hints: {
      productFiltered: "Filtrat la grupurile pentru produsul rezervarii.",
      primaryMember: "Aceasta rezervare va fi rezervarea principala pentru camera.",
    },
    validation: {
      selectGroup: "Selecteaza un grup la care sa te alaturi",
      linkFailed: "Legarea rezervarii a esuat",
    },
    actions: {
      createAndLink: "Creeaza si leaga",
      linkToGroup: "Leaga la grup",
    },
    labels: {
      generatedLabelPrefix: "Camera shared",
    },
  },
  bookingGroupSection: {
    title: "Camera shared",
    empty: "Aceasta rezervare nu partajeaza inca o camera.",
    group: "Grup",
    siblingBookings: "Alte rezervari din camera ({count})",
    noSiblingBookings:
      "Nu exista alte rezervari legate inca. Leaga o alta rezervare pentru a partaja aceasta camera.",
    primaryBadge: "Principal",
    sharedRoomKind: "Camera shared",
    actions: {
      removeFromGroup: "Scoate din grup",
      linkToSharedRoom: "Leaga la camera shared",
      removeConfirm: "Scoti aceasta rezervare din grupul de camera shared?",
    },
  },
} satisfies BookingsUiOperationsMessages
