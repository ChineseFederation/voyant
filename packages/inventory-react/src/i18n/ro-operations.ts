import type { ProductsUiOperationsMessages } from "./messages-operations.js"

export const productsUiOperationsRo = {
  productDayDialog: {
    titles: {
      create: "Adauga zi de itinerar",
      edit: "Editeaza ziua de itinerar",
    },
    descriptions: {
      create: "Creeaza o zi structurata in itinerarul produsului.",
      edit: "Actualizeaza titlul, locatia si prezentarea acestei zile.",
    },
  },
  productDayForm: {
    fields: {
      dayNumber: "Numar zi",
      location: "Locatie",
      title: "Titlu",
      description: "Descriere",
    },
    placeholders: {
      location: "Dubrovnik",
      title: "Sosire in Dubrovnik",
      description: "Prezentare si activitati pentru aceasta zi",
    },
    validation: {
      dayNumberMin: "Numarul zilei trebuie sa fie cel putin 1.",
      saveFailed: "Salvarea zilei a esuat.",
    },
    actions: {
      addDay: "Adauga zi",
      saveDay: "Salveaza ziua",
    },
  },
  productDayServiceForm: {
    fields: {
      supplierService: "Serviciu furnizor",
      serviceType: "Tip serviciu",
      countryCode: "Cod tara",
      name: "Nume",
      description: "Descriere",
      costCurrency: "Moneda",
      costAmount: "Cost",
      quantity: "Cantitate",
      sortOrder: "Ordine sortare",
      notes: "Note",
    },
    placeholders: {
      supplierService: "Selecteaza un serviciu furnizor",
      countryCode: "RO",
      name: "Cazare hotel",
      description: "Detalii operationale ale serviciului",
      notes: "Note interne",
    },
    serviceTypes: {
      accommodation: "Cazare",
      transfer: "Transfer",
      experience: "Experienta",
      guide: "Ghid",
      meal: "Masa",
      other: "Altul",
    },
    validation: {
      nameRequired: "Numele serviciului este obligatoriu.",
      currencyRequired: "Moneda trebuie sa fie un cod ISO din 3 litere.",
      costNonNegative: "Costul trebuie sa fie zero sau mai mare.",
      quantityMin: "Cantitatea trebuie sa fie cel putin 1.",
      saveFailed: "Salvarea serviciului a esuat.",
    },
    actions: {
      addService: "Adauga serviciu",
      saveService: "Salveaza serviciul",
    },
  },
  productDayServiceDialog: {
    titles: {
      create: "Adauga serviciu",
      edit: "Editeaza serviciu",
    },
    descriptions: {
      create: "Adauga un serviciu operational pentru aceasta zi de itinerar.",
      edit: "Actualizeaza serviciul operational pentru aceasta zi de itinerar.",
    },
  },
  productItineraryDayRow: {
    dayLabel: "Ziua {dayNumber}",
    emptyServices: "Nu exista servicii configurate pentru aceasta zi.",
    servicesLoadingError: "Incarcarea serviciilor zilei a esuat.",
    columns: {
      name: "Nume",
      type: "Tip",
      cost: "Cost",
      quantity: "Cantitate",
    },
  },
  productItineraryDialog: {
    titles: {
      create: "Itinerar nou",
      edit: "Redenumeste itinerarul",
    },
    descriptions: {
      create: "Adauga o alta varianta de itinerar pentru acest produs.",
      edit: "Actualizeaza numele itinerarului si starea implicita.",
    },
    fields: {
      name: "Nume",
      defaultItinerary: "Seteaza ca itinerar implicit",
      notesDefaultLocked:
        "Acesta este itinerarul implicit. Seteaza alt itinerar ca implicit pentru a-l schimba.",
      notesFirstDefault: "Primul itinerar este automat cel implicit.",
    },
    placeholders: {
      name: "ex. Itinerar principal, Varianta familie",
    },
    validation: {
      nameRequired: "Numele este obligatoriu",
      saveFailed: "Salvarea itinerarului a esuat.",
    },
    actions: {
      createItinerary: "Creeaza itinerarul",
    },
  },
  optionUnitDialog: {
    titles: {
      create: "Unitate vandabila noua",
      edit: "Editeaza unitatea vandabila",
    },
    descriptions: {
      create: "Ce se vinde: de exemplu un bilet adult, o camera dubla sau un loc in autocar.",
      edit: "Actualizeaza limitele de inventar, regulile de varsta si ocuparea cand unitatea este o camera.",
    },
  },
  optionUnitForm: {
    fields: {
      name: "Nume",
      code: "Cod",
      unitType: "Ce este aceasta?",
      sortOrder: "Ordine sortare",
      minQuantity: "Minim per plecare",
      maxQuantity: "Disponibil per plecare",
      minAge: "Varsta minima",
      maxAge: "Varsta maxima",
      occupancyMin: "Oaspeti minim",
      occupancyMax: "Oaspeti maxim",
      description: "Descriere",
      required: "Obligatoriu",
      hidden: "Ascuns",
    },
    placeholders: {
      name: "Bilet adult",
      code: "adult",
      description: "Nota interna optionala despre aceasta unitate vandabila",
    },
    validation: {
      nameRequired: "Numele unitatii este obligatoriu.",
      saveFailed: "Salvarea unitatii optiunii a esuat.",
    },
    actions: {
      createUnit: "Creeaza unitatea",
    },
  },
  productReadinessPanel: {
    title: "Gata de vanzare",
    descriptions: {
      ready: "Acest produs poate fi publicat.",
      blocked: "Rezolva acestea inainte ca produsul sa poata fi publicat.",
    },
    badges: {
      ready: "Gata",
      blocking: "De rezolvat",
      warning: "De verificat",
    },
    empty: "Nimic de rezolvat.",
    loadingError: "Nu am putut verifica daca produsul este gata de vanzare.",
    issues: {
      noFutureOpenDeparture: {
        title: "Nicio plecare viitoare",
        fix: "Adauga o plecare in viitor si deschide-o pentru vanzare.",
      },
      missingDefaultOption: {
        title: "Nicio optiune implicita",
        fix: "Creeaza o optiune si marcheaz-o ca implicita.",
      },
      defaultOptionNotActive: {
        title: "Optiunea implicita nu este activa",
        fix: "Seteaza optiunea implicita pe activa.",
      },
      noOptionUnits: {
        title: "Optiunea implicita nu are unitati",
        fix: "Adauga cel putin o unitate, de exemplu bilet adult.",
      },
      noPrice: {
        title: "Niciun pret",
        fix: "Seteaza un pret pe produs sau adauga un pret pentru unitatile sale.",
      },
      missingItinerary: {
        title: "Niciun itinerar",
        fix: "Creeaza un itinerar si marcheaza-l ca implicit.",
      },
      emptyItinerary: {
        title: "Itinerarul nu are zile",
        fix: "Adauga zilele in care se desfasoara produsul.",
      },
      nonConsecutiveItineraryDays: {
        title: "Zilele itinerarului nu sunt in ordine",
        fix: "Renumeroteaza zilele ca sa fie 1, 2, 3 fara goluri.",
      },
      unresolvedDuration: {
        title: "Nicio durata",
        fix: "Introdu cat dureaza acest produs.",
      },
      missingFamily: {
        title: "Nicio familie de produs",
        fix: "Alege o familie: tur, activitate, atractie, eveniment sau transport.",
      },
      missingCapacitySource: {
        title: "Niciun numar de locuri",
        fix: "Seteaza cate locuri are produsul, pe produs sau pe plecarile sale.",
      },
      missingMeetingPoint: {
        title: "Niciun punct de intalnire",
        fix: "Adauga un punct de intalnire sau punctele de preluare disponibile.",
      },
      missingAllocationTemplate: {
        title: "Camerele sau locurile nu sunt configurate",
        fix: "Adauga un sablon de camere sau locuri, ori configureaza resurse pe plecare.",
      },
      missingDefaultLanguage: {
        title: "Nicio limba implicita",
        fix: "Alege limba in care este scris acest produs.",
      },
      missingDescription: {
        title: "Nicio descriere",
        fix: "Scrie descrierea pe care o vor citi calatorii.",
      },
      missingContractTemplate: {
        title: "Niciun sablon de contract",
        fix: "Alege un sablon de contract daca produsul are termeni proprii.",
      },
      incompleteCostBasis: {
        title: "Unele servicii nu au cost",
        fix: "Introdu cat te costa fiecare serviciu din itinerar.",
      },
      noActiveChannel: {
        title: "Nu este la vanzare nicaieri",
        fix: "Adauga produsul intr-un canal de vanzare activ.",
      },
      unknown: {
        title: "Ceva necesita atentie",
        fix: "Deschide produsul si verifica-i configurarea.",
      },
    },
  },
  productVersionDialog: {
    title: "Creeaza snapshot de versiune",
    description: "Salveaza un snapshot al acestui produs, inclusiv itinerarul si optiunile sale.",
    fields: {
      notes: "Note",
    },
    placeholders: {
      notes: "Ce s-a schimbat in aceasta versiune?",
    },
    validation: {
      saveFailed: "Crearea snapshot-ului de versiune a esuat.",
    },
    actions: {
      createVersion: "Creeaza versiunea",
    },
  },
  productVersionsSection: {
    titles: {
      default: "Versiuni",
    },
    descriptions: {
      default: "Salveaza un snapshot al acestui produs pe care sa il poti consulta ulterior.",
    },
    actions: {
      createVersion: "Creeaza versiunea",
    },
    loadingError: "Incarcarea versiunilor produsului a esuat.",
    empty: "Nu exista inca snapshot-uri de versiune.",
    versionLabel: "Versiunea",
  },
  productOptionDialog: {
    titles: {
      create: "Optiune de rezervare noua",
      edit: "Editeaza optiunea de rezervare",
    },
    descriptions: {
      create:
        "Creeaza o alegere vizibila clientului: Default, bilet adult, Double, Single, cabina standard sau transfer VIP.",
      edit: "Actualizeaza disponibilitatea, ordonarea si optiunea afisata prima clientilor.",
    },
  },
  productOptionForm: {
    fields: {
      name: "Nume",
      code: "Cod",
      description: "Descriere",
      status: "Status",
      sortOrder: "Ordine sortare",
      availableFrom: "Disponibil de la",
      availableTo: "Disponibil pana la",
      defaultOption: "Afiseaza primul clientilor",
    },
    placeholders: {
      name: "Default",
      code: "default",
      description: "Nota interna optionala despre aceasta optiune de rezervare",
      availableFrom: "Selecteaza data de inceput",
      availableTo: "Selecteaza data de sfarsit",
    },
    validation: {
      nameRequired: "Numele optiunii este obligatoriu.",
      saveFailed: "Salvarea optiunii de produs a esuat.",
    },
    actions: {
      createOption: "Creeaza optiunea",
    },
  },
  productOptionsSection: {
    titles: {
      default: "Optiuni de rezervare si preturi",
      units: "Inventar pentru aceasta optiune",
      personUnits: "Tipuri de calatori pentru aceasta optiune",
      roomUnits: "Inventar camere pentru aceasta optiune",
    },
    descriptions: {
      default:
        "Configureaza ce alege clientul, ce inventar sau tipuri de calatori sunt disponibile si cat plateste fiecare calator.",
      units:
        "Defineste unitatea fizica, tipul de bilet, camera, locul, cabina sau serviciul din spatele acestei optiuni.",
      personUnits:
        "Defineste intervalele de varsta ale calatorilor care pot fi rezervati. Capacitatea plecarii controleaza cate persoane pot calatori.",
      roomUnits: "Defineste camerele fizice disponibile pentru aceasta optiune.",
    },
    actions: {
      addOption: "Adauga optiune",
      addUnit: "Adauga unitate vandabila",
      addPersonUnit: "Adauga tip calator",
      addRoomUnit: "Adauga unitate camera",
      duplicate: "Duplica optiunea",
      edit: "Editeaza",
      delete: "Sterge",
    },
    loadingError: {
      options: "Incarcarea optiunilor produsului a esuat.",
      units: "Incarcarea unitatilor optiunii a esuat.",
    },
    empty: {
      options: "Nu exista inca optiuni pentru clienti.",
      units: "Nu exista unitate vandabila configurata pentru aceasta optiune.",
    },
    configurationWarnings: {
      roomOptionsTitle: "Pare ca tipurile de camera sunt configurate ca optiuni",
      roomOptionsDescription:
        "{options} par tipuri de camera. Pune Single/Double/Triple sub o singura optiune, ca si camere separate. Foloseste optiuni separate doar pentru pachete cu adevarat diferite.",
    },
    deleteConfirm: {
      option: 'Stergi optiunea "{name}" si configurarea ei?',
      unit: 'Stergi unitatea vandabila "{name}"?',
    },
    columns: {
      unitType: "Tip",
      unitName: "Nume",
      quantity: "Inventar",
      personQuantity: "Cantitate rezervare",
      roomQuantity: "Inventar camere",
      age: "Varsta calator",
      occupancy: "Ocupare camera",
      actions: "Actiuni",
    },
    unitSummaries: {
      range: "{range}",
      rooms: "Camere pe plecare",
      roomsWithCount: "Pana la {count} camere pe plecare",
      vehicles: "Vehicule pe plecare",
      vehiclesWithCount: "Pana la {count} vehicule pe plecare",
      sleeps: "Capacitate {count}",
      sleepsRange: "Capacitate {range}",
    },
    badges: {
      defaultOption: "Afisata prima",
    },
  },
} satisfies ProductsUiOperationsMessages
