// agent-quality: file-size exception -- owner: distribution-react; existing locale dictionary stays co-located until a dedicated split preserves behavior and tests.
import type { DistributionUiMessages } from "./messages.js"

export const distributionUiRo = {
  common: {
    open: "Deschide",
    view: "Vezi",
    cancel: "Anuleaza",
    create: "Creeaza",
    save: "Salveaza",
    delete: "Sterge",
    clearFilters: "Sterge Filtrele",
    clearSelection: "Goleste selectia",
    backToDistribution: "Inapoi la Distributie",
    loading: "Se incarca...",
    none: "-",
    openEnded: "Fara termen",
    noReference: "Fara referinta",
    unmappedStatus: "Status nerecunoscut",
    yes: "Da",
    searchPlaceholder: "Cauta distributie...",
    allChannels: "Toate canalele",
    received: "Primit",
    supplier: "Furnizor",
    channelLabel: "Canal",
    contractLabel: "Contract",
    productLabel: "Produs",
    bookingLabel: "Rezervare",
    supplierLabel: "Furnizor",
    createdLabel: "Creat",
    updatedLabel: "Actualizat",
    emptyValue: "-",
    dateTimeFallback: "Indisponibil",
    active: "Activ",
    inactive: "Inactiv",
    selectionSummary: "{count} selectate",
    resultSummary: "{verb} {countLabel}.",
    deleteSummary: "S-au sters {countLabel}.",
    entities: {
      channel: { one: "canal", other: "canale" },
      contract: { one: "contract", other: "contracte" },
      commissionRule: { one: "regula de comision", other: "reguli de comision" },
      mapping: { one: "mapare", other: "mapari" },
      bookingLink: { one: "legatura de rezervare", other: "legaturi de rezervare" },
      webhookEvent: { one: "eveniment webhook", other: "evenimente webhook" },
    },
    cancellationOwnerLabels: {
      operator: "Operator",
      channel: "Canal",
      mixed: "Mixt",
    },
    channelKindLabels: {
      direct: "Direct",
      affiliate: "Afiliat",
      ota: "OTA",
      reseller: "Revanzator",
      marketplace: "Marketplace",
      api_partner: "Partener API",
      connect: "Connect",
    },
    channelStatusLabels: {
      active: "Activ",
      inactive: "Inactiv",
      pending: "In asteptare",
      archived: "Arhivat",
    },
    contractStatusLabels: {
      draft: "Ciorna",
      active: "Activ",
      expired: "Expirat",
      terminated: "Terminat",
    },
    paymentOwnerLabels: {
      operator: "Operator",
      channel: "Canal",
      split: "Impartit",
    },
    commissionScopeLabels: {
      booking: "Rezervare",
      product: "Produs",
      rate: "Tarif",
      category: "Categorie",
    },
    commissionTypeLabels: {
      fixed: "Fix",
      percentage: "Procent",
    },
    webhookStatusLabels: {
      pending: "In asteptare",
      processed: "Procesat",
      failed: "Esuat",
      ignored: "Ignorat",
    },
  },
  page: {
    title: "Distributie",
    description:
      "Gestioneaza canalele de vanzare, contractele comerciale, maparile externe si evenimentele de sincronizare.",
    tabs: {
      channels: "Canale",
      contracts: "Contracte",
      commissions: "Reguli de comision",
      mappings: "Mapari produse",
      bookingLinks: "Legaturi rezervari",
      webhooks: "Evenimente webhook",
    },
    bulkVerbs: {
      activated: "Au fost activate",
      archived: "Au fost arhivate",
      deleted: "Au fost sterse",
      expired: "Au fost expirate",
      deactivated: "Au fost dezactivate",
      processed: "Au fost procesate",
      ignored: "Au fost ignorate",
    },
  },
  overview: {
    metrics: {
      activeChannels: {
        title: "Canale Active",
        description: "Endpoint-uri de vanzare si revanzare active",
      },
      activeContracts: {
        title: "Contracte Active",
        description: "Acorduri comerciale aflate in vigoare",
      },
      activeMappings: {
        title: "Mapari Active",
        description: "Produse expuse catre canale externe",
      },
      syncQueue: {
        title: "Coada de Sincronizare",
        description: "Evenimente inbound in asteptare sau esuate",
      },
    },
    webhookQueue: {
      title: "Coada Webhook",
      empty: "Nu exista evenimente in asteptare sau esuate in coada.",
    },
    contractsToReview: {
      title: "Contracte de Revizuit",
      empty: "Toate contractele sunt active in acest moment.",
    },
    filters: {
      allChannelsPlaceholder: "Toate canalele",
    },
  },
  channelSync: {
    title: "Distributie",
    description: "Configureaza distributia pe canale separat de monitorizarea livrarilor live.",
    setup: {
      title: "Configurare",
      description:
        "Distributia incepe cu un conector, mapari de produse si cel putin o cale de livrare.",
      connector: {
        title: "Conector",
        ready: "Cel putin un conector de canal este configurat.",
        missing:
          "Conecteaza un canal de vanzare inainte ca rezervarile, disponibilitatea sau continutul sa fie trimise.",
      },
      mapping: {
        title: "Mapare",
        ready: "Legaturile rezervare-canal sunt create din produse mapate.",
        missing: "Leaga produsele de canal ca rezervarile confirmate sa stie unde sa mearga.",
      },
      delivery: {
        title: "Livrare",
        ready: "Un canal a confirmat sau a primit o incercare de livrare.",
        missing:
          "Livrarile apar dupa ce o rezervare mapata este trimisa, reincercata sau reconciliata.",
      },
    },
    monitoring: {
      title: "Operatiuni",
      description:
        "Urmareste statusul livrarilor, inspecteaza jurnalele de livrare, reincearca trimiterile esuate sau reverifica si retrimite.",
    },
    throttledTitle: "Limitat.",
    throttledBody:
      "{count} livrari au fost incetinite in ultima ora pe {channels} {channelLabel}. Daca se repeta, redu rata de trimitere pentru aceste canale in setari.",
    statusLabels: {
      pending: "In asteptare",
      ok: "OK",
      failed: "Esuat",
      compensated: "Compensat",
    },
    statusTiles: {
      pending: { label: "In asteptare", description: "In curs" },
      ok: { label: "Livrat", description: "Canalul a confirmat" },
      failed: { label: "Esuat", description: "Necesita atentie" },
      compensated: { label: "Compensat", description: "Revenit" },
    },
    filters: {
      booking: "Rezervare",
      bookingPlaceholder: "Cauta dupa numarul rezervarii...",
      bookingSearching: "Se cauta...",
      bookingEmpty: "Nicio rezervare nu corespunde cautarii.",
      channel: "Canal",
      channelPlaceholder: "Alege un canal...",
      channelEmpty: "Nu exista canale configurate.",
    },
    table: {
      title: "Monitor livrari",
      filteredDescription: "Se afiseaza {count} dintre cele mai recente trimiteri potrivite.",
      defaultDescription: "Cele mai recente incercari de trimitere per canal.",
      noMatchesTitle: "Nicio potrivire",
      noLinksTitle: "Distributia nu livreaza inca",
      noMatchesDescription: "Sterge filtrele sau alege alta rezervare ori alt canal.",
      noLinksDescription:
        "Verifica mai intai configurarea: trebuie sa existe un conector, produsele au nevoie de mapari pe canal, iar o rezervare confirmata si mapata trebuie sa creeze o livrare.",
      booking: "Rezervare",
      channel: "Canal",
      status: "Status",
      attempts: "Incercari",
      lastPush: "Ultima trimitere",
      externalRef: "Referinta canal",
      actions: "Actiuni",
      itemPrefix: "element: {id}",
      deliveries: "Jurnal livrari",
      retry: "Reincearca trimiterea",
    },
    reconcile: {
      trigger: "Reverifica si retrimite",
      menuLabel: "Reverifica si retrimite",
      bookings: "Rezervari",
      priority: "prioritar",
      availability: "Disponibilitate",
      content: "Continut",
      lastRun: "Rezultat: verificate {scanned}, retrimise {triggered}.",
    },
    feedback: {
      dismiss: "Inchide feedbackul",
      retry: {
        title: "Rezultat reincercare",
        processed:
          "Procesate {attempted} legaturi in asteptare: {succeeded} reusite, {failed} esuate, {compensated} compensate.",
        bookingMissing: "Acea rezervare nu mai exista, deci nu a fost trimis nimic.",
        noPendingLinks: "Nu au existat legaturi in asteptare de reincercat pentru {bookingId}.",
        noTargets:
          "Niciun element de rezervare activ sau nicio mapare de canal nu a produs legaturi de livrare pentru {bookingId}.",
        noAdapter: "Acest canal nu este inca pregatit sa primeasca rezervari.",
        noMapping: "Acest produs nu este inca legat de canal.",
        ok: "Reincercarea s-a finalizat pentru {bookingId}, dar serverul nu a raportat legaturi procesate.",
        failed: "Reincercarea a esuat pentru {bookingId}: {message}",
        unknownError: "eroare necunoscută",
      },
      reconcile: {
        title: "Reverifica si retrimite",
        success: "Verificate {scanned} rezervari si retrimise {triggered}.",
        failed: "Reverificarea si retrimiterea au esuat: {message}",
      },
    },
    refresh: {
      loading: "Se incarca...",
      title: "Se actualizeaza automat la fiecare {seconds}s",
      refreshing: "Se actualizeaza...",
      updatedAgo: "Actualizat acum {duration}",
    },
    drawer: {
      title: "Jurnal livrari - {bookingId}",
      bookingScopeDescription:
        "Jurnal la nivel de rezervare. Poate include livrari pentru toate elementele legate de aceasta rezervare.",
      itemScopeDescription:
        "Jurnal la nivel de rezervare deschis din elementul {itemId}. Poate include livrari pentru elemente surori din aceeasi rezervare.",
      emptyTitle: "Nu exista livrari",
      emptyDescription: "Incercarile de trimitere catre acest canal vor aparea aici.",
      attempt: "incercarea #{number}",
      httpStatus: "Status {status}",
    },
  },
  tables: {
    channel: {
      channel: "Canal",
      kind: "Tip",
      status: "Status",
      website: "Website",
    },
    contract: {
      channel: "Canal",
      supplier: "Furnizor",
      status: "Status",
      payment: "Plata",
      start: "Inceput",
    },
    commission: {
      contract: "Contract",
      scope: "Domeniu",
      product: "Produs",
      type: "Tip",
      amount: "Valoare",
    },
    mapping: {
      channel: "Canal",
      product: "Produs",
      externalProduct: "Produs Extern",
      status: "Status",
    },
    bookingLink: {
      channel: "Canal",
      booking: "Rezervare",
      externalBooking: "Rezervare Externa",
      externalStatus: "Status Extern",
      synced: "Sincronizat",
    },
    webhook: {
      channel: "Canal",
      eventType: "Tip Eveniment",
      status: "Status",
      received: "Primit",
      processed: "Procesat",
    },
  },
  tabs: {
    channels: {
      title: "Canale",
      description: "Parteneri de vanzare, afiliati, OTA-uri, marketplace-uri si canale directe.",
      actionLabel: "Canal nou",
      empty: "Niciun canal nu corespunde filtrelor curente.",
      actions: {
        activate: {
          button: "Activeaza",
          confirm: "Activeaza canalele",
          title: "Activezi {countLabel}?",
          description: "Aceasta actiune reactiveaza canalele selectate pentru distributie live.",
        },
        archive: {
          button: "Arhiveaza",
          confirm: "Arhiveaza canalele",
          title: "Arhivezi {countLabel}?",
          description:
            "Aceasta actiune pastreaza canalele selectate in istoric, dar le scoate din uzul comercial activ.",
        },
        delete: {
          button: "Sterge selectia",
          confirm: "Sterge canalele",
          title: "Stergi {countLabel}?",
          description:
            "Aceasta actiune sterge definitiv canalele selectate. Foloseste Arhiveaza daca vrei doar sa le retragi din uzul activ.",
        },
      },
    },
    contracts: {
      title: "Contracte",
      description: "Termeni comerciali pentru fiecare relatie canal-furnizor.",
      actionLabel: "Contract nou",
      empty: "Niciun contract nu corespunde filtrelor curente.",
      actions: {
        activate: {
          button: "Activeaza",
          confirm: "Activeaza contractele",
          title: "Activezi {countLabel}?",
          description:
            "Aceasta actiune marcheaza contractele selectate ca active din punct de vedere comercial.",
        },
        expire: {
          button: "Expira",
          confirm: "Expira contractele",
          title: "Expiri {countLabel}?",
          description:
            "Aceasta actiune pastreaza contractele selectate, dar le marcheaza ca iesite din vigoare.",
        },
        delete: {
          button: "Sterge selectia",
          confirm: "Sterge contractele",
          title: "Stergi {countLabel}?",
          description:
            "Aceasta actiune sterge definitiv contractele selectate si configurarea lor comerciala.",
        },
      },
    },
    commissions: {
      title: "Reguli de comision",
      description: "Defineste logica de comision pentru rezervare, produs, tarif si categorie.",
      actionLabel: "Regula de comision noua",
      empty: "Nicio regula de comision nu corespunde filtrelor curente.",
      actions: {
        delete: {
          button: "Sterge selectia",
          confirm: "Sterge regulile de comision",
          title: "Stergi {countLabel}?",
          description:
            "Aceasta actiune sterge definitiv regulile de comision selectate din configurarea canalului.",
        },
      },
    },
    mappings: {
      title: "Mapari produse",
      description: "Mapeaza produsele Voyant la identificatorii de catalog ai canalelor externe.",
      actionLabel: "Mapare noua",
      empty: "Nicio mapare de produs nu corespunde filtrelor curente.",
      actions: {
        activate: {
          button: "Activeaza",
          confirm: "Activeaza maparile",
          title: "Activezi {countLabel}?",
          description:
            "Aceasta actiune reactiveaza maparile externe selectate pentru utilizare live pe canal.",
        },
        deactivate: {
          button: "Dezactiveaza",
          confirm: "Dezactiveaza maparile",
          title: "Dezactivezi {countLabel}?",
          description:
            "Aceasta actiune pastreaza maparile selectate ca referinta, dar le scoate din sincronizarea activa.",
        },
        delete: {
          button: "Sterge selectia",
          confirm: "Sterge maparile",
          title: "Stergi {countLabel}?",
          description: "Aceasta actiune sterge definitiv maparile externe de produs selectate.",
        },
      },
    },
    bookingLinks: {
      title: "Legaturi rezervari",
      description:
        "Urmareste ID-urile de rezervare externe si starea sincronizarii pentru rezervarile venite din canale.",
      actionLabel: "Legatura noua",
      empty: "Nicio legatura de rezervare nu corespunde filtrelor curente.",
      actions: {
        delete: {
          button: "Sterge selectia",
          confirm: "Sterge legaturile",
          title: "Stergi {countLabel}?",
          description:
            "Aceasta actiune sterge definitiv referintele externe si legaturile de sincronizare selectate.",
        },
      },
    },
    webhooks: {
      title: "Evenimente webhook",
      description: "Inspecteaza evenimentele primite de la parteneri si cazurile cu probleme.",
      actionLabel: "Eveniment webhook nou",
      empty: "Niciun eveniment webhook nu corespunde filtrelor curente.",
      actions: {
        markProcessed: {
          button: "Marcheaza procesat",
          confirm: "Marcheaza procesat",
          title: "Marchezi {countLabel} ca procesate?",
          description:
            "Aceasta actiune marcheaza evenimentele selectate ca procesate si le scoate din coada activa de sincronizare.",
        },
        ignore: {
          button: "Ignora",
          confirm: "Ignora evenimentele",
          title: "Ignori {countLabel}?",
          description:
            "Aceasta actiune pastreaza evenimentele selectate in istoric, dar le marcheaza ca ignorate intentionat.",
        },
        delete: {
          button: "Sterge selectia",
          confirm: "Sterge evenimentele",
          title: "Stergi {countLabel}?",
          description:
            "Aceasta actiune sterge definitiv evenimentele webhook selectate din jurnalul de evenimente.",
        },
      },
    },
  },
  settings: {
    channelsPage: {
      title: "Canale",
      description:
        "Defineste unde sunt vandute produsele tale: canale directe, OTA, reseller si marketplace.",
      addChannel: "Adauga canal",
      empty:
        "Nu exista canale momentan. Creeaza canale precum Website, Mobile App sau Viator pentru a controla unde sunt vandute produsele.",
      edit: "Editeaza",
      delete: "Sterge",
      deleteConfirm: "Stergi acest canal?",
      deleteDescription: "Produsele alocate acestui canal vor fi deconectate.",
      editSheetTitle: "Editeaza canal",
      newSheetTitle: "Canal nou",
      nameLabel: "Nume",
      namePlaceholder: "Website",
      kindLabel: "Tip",
      statusLabel: "Status",
      websiteLabel: "Website",
      websitePlaceholder: "https://partner.example.com",
      primaryContactLabel: "Contact principal",
      primaryContactPlaceholder: "Jane Doe",
      contactEmailLabel: "Email contact",
      contactEmailPlaceholder: "partner@example.com",
      saveChanges: "Salveaza modificarile",
      createChannel: "Creeaza canal",
      validationNameRequired: "Numele este obligatoriu",
      validationInvalidUrl: "Trebuie sa fie un URL valid",
      validationInvalidEmail: "Trebuie sa fie un email valid",
      paginationShowing: "Afisare {count} din {total}",
      paginationPage: "Pagina {page} / {pageCount}",
      paginationPrevious: "Anterior",
      paginationNext: "Urmator",
      publication: {
        open: "Publicare",
        title: "Publicare: {channel}",
        titleEmpty: "Publicare",
        defaultDeny:
          "Publicarea este default-deny. Produsele nu sunt disponibile pe acest canal fara o regula Include aplicabila.",
        precedence:
          "Precedenta: canalul inactiv sau lipsa respinge primul, apoi Include/Exclude pe produs, apoi Include/Exclude pe furnizor, apoi default-deny.",
        inactiveWarning:
          "Acest canal este inactiv. Publicarea efectiva respinge fiecare produs pana cand canalul este activ.",
        productsTitle: "Produse Include/Exclude",
        suppliersTitle: "Furnizori Include/Exclude",
        productLabel: "Produs",
        supplierLabel: "Furnizor",
        productPlaceholder: "Selecteaza produs",
        supplierPlaceholder: "Selecteaza furnizor",
        supplierOptional: "Deduce furnizorul",
        decisionLabel: "Decizie",
        include: "Include",
        exclude: "Exclude",
        reasonLabel: "Motiv",
        reasonPlaceholder: "De ce exista aceasta decizie de publicare",
        saveProduct: "Salveaza regula produsului",
        saveSupplier: "Salveaza regula furnizorului",
        previewSupplier: "Previzualizeaza impactul",
        supplierImpact: "{count} produse afectate",
        confirmSupplierImpact:
          "Confirma salvarea acestei reguli de furnizor pentru {count} produse afectate.",
        previewRequiredCurrent:
          "Previzualizeaza intrarile curente pentru furnizor inainte de salvare.",
        productsEmpty: "Nu exista reguli de publicare pentru produse pe acest canal.",
        suppliersEmpty: "Nu exista reguli de publicare pentru furnizori pe acest canal.",
        noReason: "Nu exista motiv inregistrat.",
        editRule: "Editeaza",
        deleteRule: "Sterge",
        whyTitle: "De ce efectiv",
        whyDescription: "Inspecteaza decizia efectiva fara sa folosesti maparile de produse.",
        published: "Publicat",
        denied: "Respins",
        source: "Sursa: {source}",
        reason: "Motiv: {reason}",
      },
    },
  },
  details: {
    channel: {
      notFound: "Canalul nu a fost gasit",
      title: "Detalii canal",
      deleteConfirm: "Stergi acest canal?",
      deleteDescription:
        "Aceasta actiune sterge definitiv canalul si configurarea sa de distributie.",
      deleteButton: "Sterge",
      sections: {
        details: "Detalii canal",
        metadata: "Metadata",
        contracts: "Contracte",
        mappings: "Mapari produse",
        bookingLinks: "Legaturi rezervari",
        webhooks: "Evenimente webhook",
      },
      labels: {
        website: "Website",
        contactName: "Nume contact",
        contactEmail: "Email contact",
        supplier: "Furnizor",
        payment: "Plata",
        cancellation: "Anulare",
        externalProduct: "Produs extern",
        externalBooking: "Rezervare externa",
        reference: "Referinta",
        lastSynced: "Ultima sincronizare",
        rate: "Tarif",
        category: "Categorie",
        booking: "Rezervare",
      },
      empty: {
        metadata: "Nu exista metadata setata.",
        contracts: "Nu exista contracte pentru acest canal.",
        mappings: "Nu exista mapari de produse pentru acest canal.",
        bookingLinks: "Nu exista legaturi de rezervare pentru acest canal.",
        webhooks: "Nu exista evenimente webhook pentru acest canal.",
      },
    },
    contract: {
      notFound: "Contractul nu a fost gasit",
      title: "Contract canal",
      deleteConfirm: "Stergi acest contract?",
      deleteDescription:
        "Aceasta actiune sterge definitiv contractul si configurarea sa comerciala de distributie.",
      deleteButton: "Sterge",
      openChannel: "Deschide canalul",
      sections: {
        details: "Detalii contract",
        notes: "Note comerciale",
        commissionRules: "Reguli de comision",
      },
      labels: {
        supplier: "Furnizor",
        endsAt: "Se termina la",
        paymentOwner: "Responsabil plata",
        cancellationOwner: "Responsabil anulare",
        settlementTerms: "Termeni de decontare",
        notes: "Note",
        amount: "Valoare",
        basisPoints: "Puncte baza",
        rate: "Tarif",
        category: "Categorie",
        valid: "Valabil",
      },
      empty: {
        commissionRules: "Nu exista reguli de comision pentru acest contract.",
      },
    },
    commissionRule: {
      notFound: "Regula de comision nu a fost gasita",
      title: "Regula de comision",
      deleteConfirm: "Stergi aceasta regula de comision?",
      deleteDescription:
        "Aceasta actiune sterge definitiv regula de comision din preturile canalului.",
      deleteButton: "Sterge",
      openContract: "Deschide contractul",
      openProduct: "Deschide produsul",
      sections: {
        details: "Detalii regula",
      },
      labels: {
        amount: "Valoare",
        basisPoints: "Puncte baza",
        externalRate: "Tarif extern",
        externalCategory: "Categorie externa",
        valid: "Valabil",
      },
    },
    bookingLink: {
      notFound: "Legatura rezervarii nu a fost gasita",
      title: "Legatura rezervare",
      deleteConfirm: "Stergi aceasta legatura de rezervare?",
      deleteDescription:
        "Aceasta actiune sterge definitiv referinta externa a rezervarii si legatura de sincronizare.",
      deleteButton: "Sterge",
      openChannel: "Deschide canalul",
      openBooking: "Deschide rezervarea",
      sections: {
        details: "Detalii legatura rezervare",
      },
      labels: {
        externalBooking: "Rezervare externa",
        reference: "Referinta",
        bookedAtExternal: "Rezervata extern",
        lastSynced: "Ultima sincronizare",
      },
    },
    webhookEvent: {
      notFound: "Evenimentul webhook nu a fost gasit",
      title: "Eveniment webhook",
      deleteConfirm: "Stergi acest eveniment webhook?",
      deleteDescription:
        "Aceasta actiune sterge definitiv evenimentul webhook din jurnalul de evenimente.",
      deleteButton: "Sterge",
      openChannel: "Deschide canalul",
      sections: {
        details: "Detalii eveniment",
        payload: "Payload",
      },
      labels: {
        externalEvent: "Eveniment extern",
        received: "Primit",
        processed: "Procesat",
        error: "Eroare",
      },
    },
    mapping: {
      notFound: "Maparea produsului nu a fost gasita",
      title: "Mapare produs",
      deleteConfirm: "Stergi aceasta mapare de produs?",
      deleteDescription:
        "Aceasta actiune sterge definitiv maparea produsului extern din distributia canalului.",
      deleteButton: "Sterge",
      openChannel: "Deschide canalul",
      openProduct: "Deschide produsul",
      sections: {
        details: "Detalii mapare",
      },
      labels: {
        externalProduct: "Produs extern",
        externalRate: "Tarif extern",
        externalCategory: "Categorie externa",
      },
    },
  },
} satisfies DistributionUiMessages
