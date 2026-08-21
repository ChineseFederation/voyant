import type { LocaleMessageDefinitions } from "../runtime.js"

export type OperatorAdminNavMessages = {
  dashboard: string
  catalog: string
  catalogProducts: string
  catalogProductsTagline: string
  catalogExcursions: string
  catalogExcursionsTagline: string
  catalogTours: string
  catalogToursTagline: string
  catalogActivities: string
  catalogActivitiesTagline: string
  catalogAttractions: string
  catalogAttractionsTagline: string
  catalogEvents: string
  catalogEventsTagline: string
  catalogTransportation: string
  catalogTransportationTagline: string
  catalogSearchPlaceholder: string
  catalogCruises: string
  catalogShips: string
  catalogCharters: string
  catalogAccommodations: string
  catalogOrders: string
  flights: string
  flightsSearch: string
  flightOrders: string
  products: string
  categories: string
  bookings: string
  mediaLibrary: string
  trips: string
  allTrips: string
  newTrip: string
  notifications: string
  notificationTemplates: string
  notificationReminderRules: string
  notificationDeliveries: string
  notificationReminderRuns: string
  notificationSettings: string
  notificationStaffAlerts: string
  notificationMyNotifications: string
  notificationPreview: string
  suppliers: string
  inquiries: string
  people: string
  organizations: string
  customFields: string
  team: string
  markets: string
  navigation: string
  eventCatalog: string
  availability: string
  resources: string
  finance: string
  invoices: string
  invoiceNumberSeries: string
  payments: string
  supplierInvoices: string
  profitability: string
  legal: string
  contracts: string
  contractTemplates: string
  policies: string
  contractNumberSeries: string
  settings: string
  channelSync: string
  promotions: string
  proposals: string
  mice: string
  actionLedger: string
}

export const operatorAdminNavMessages = {
  en: {
    nav: {
      dashboard: "Dashboard",
      catalog: "Catalog",
      catalogProducts: "Packages",
      catalogProductsTagline: "Search flight + hotel packages and book live offers.",
      catalogExcursions: "Excursions",
      catalogExcursionsTagline: "Scheduled products shown in an excursion context.",
      catalogTours: "Tours",
      catalogToursTagline:
        "Guided and self-guided travel experiences — a half-day walk or a two-week itinerary.",
      catalogActivities: "Activities",
      catalogActivitiesTagline:
        "Booked things to do at a destination — lessons, tastings, workshops, sailings.",
      catalogAttractions: "Attractions",
      catalogAttractionsTagline:
        "Places of interest sold on admission — museums, parks, monuments, gardens.",
      catalogEvents: "Events",
      catalogEventsTagline: "Dated happenings — shows, concerts, festivals and matches.",
      catalogTransportation: "Transportation",
      catalogTransportationTagline:
        "Moving travellers from A to B — transfers, shuttles, coach and rail seats.",
      catalogSearchPlaceholder: "Search {surface} by name, destination or supplier...",
      catalogCruises: "Cruises",
      catalogShips: "Ships",
      catalogCharters: "Charters",
      catalogAccommodations: "Accommodations",
      catalogOrders: "Orders",
      flights: "Flights",
      flightsSearch: "Search",
      flightOrders: "Orders",
      products: "Products",
      categories: "Categories",
      bookings: "Bookings",
      mediaLibrary: "Media library",
      trips: "Trips",
      allTrips: "All trips",
      newTrip: "New trip",
      notifications: "Notifications",
      notificationTemplates: "Templates",
      notificationReminderRules: "Reminder Rules",
      notificationDeliveries: "Deliveries",
      notificationReminderRuns: "Reminder Runs",
      notificationSettings: "Settings",
      notificationStaffAlerts: "Staff alerts",
      notificationMyNotifications: "My notifications",
      notificationPreview: "Preview",
      suppliers: "Suppliers",
      inquiries: "Inquiries",
      people: "People",
      organizations: "Organizations",
      customFields: "Custom fields",
      team: "Team",
      markets: "Markets",
      navigation: "Navigation",
      eventCatalog: "Event catalog",
      availability: "Availability",
      resources: "Resources",
      finance: "Finance",
      invoices: "Invoices",
      invoiceNumberSeries: "Number Series",
      payments: "Payments",
      supplierInvoices: "Supplier invoices",
      profitability: "Profitability",
      legal: "Legal",
      contracts: "Contracts",
      contractTemplates: "Contract Templates",
      policies: "Policies",
      contractNumberSeries: "Number Series",
      settings: "Settings",
      channelSync: "Distribution",
      promotions: "Promotions",
      proposals: "Proposals",
      mice: "Programs",
      actionLedger: "Logs",
    },
  },
  ro: {
    nav: {
      dashboard: "Panou",
      catalog: "Catalog",
      catalogProducts: "Pachete",
      catalogProductsTagline: "Caută pachete zbor + cazare și rezervă oferte live.",
      catalogExcursions: "Excursii",
      catalogExcursionsTagline: "Produse programate prezentate in context de excursie.",
      catalogTours: "Tururi",
      catalogToursTagline:
        "Experiente de calatorie ghidate sau pe cont propriu — de la o plimbare de o zi la un itinerariu de doua saptamani.",
      catalogActivities: "Activitati",
      catalogActivitiesTagline:
        "Lucruri de facut la destinatie — lectii, degustari, ateliere, iesiri pe apa.",
      catalogAttractions: "Atractii",
      catalogAttractionsTagline:
        "Locuri de interes vandute cu bilet de intrare — muzee, parcuri, monumente, gradini.",
      catalogEvents: "Evenimente",
      catalogEventsTagline:
        "Evenimente cu data fixa — spectacole, concerte, festivaluri si meciuri.",
      catalogTransportation: "Transport",
      catalogTransportationTagline:
        "Transportul calatorilor de la A la B — transferuri, navete, locuri in autocar si tren.",
      catalogSearchPlaceholder: "Cauta in {surface} dupa nume, destinatie sau furnizor...",
      catalogCruises: "Croaziere",
      catalogShips: "Nave",
      catalogCharters: "Chartere",
      catalogAccommodations: "Cazari",
      catalogOrders: "Comenzi",
      flights: "Zboruri",
      flightsSearch: "Căutare",
      flightOrders: "Comenzi",
      products: "Produse",
      categories: "Categorii",
      bookings: "Rezervari",
      mediaLibrary: "Bibliotecă media",
      trips: "Calatorii",
      allTrips: "Toate calatoriile",
      newTrip: "Calatorie noua",
      notifications: "Notificari",
      notificationTemplates: "Sabloane",
      notificationReminderRules: "Reguli reminder",
      notificationDeliveries: "Livrari",
      notificationReminderRuns: "Executii reminder",
      notificationSettings: "Setari",
      notificationStaffAlerts: "Alerte echipa",
      notificationMyNotifications: "Notificarile mele",
      notificationPreview: "Previzualizare",
      suppliers: "Furnizori",
      inquiries: "Solicitări",
      people: "Persoane",
      organizations: "Organizații",
      customFields: "Câmpuri personalizate",
      team: "Echipă",
      markets: "Piețe",
      navigation: "Navigare",
      eventCatalog: "Catalog de evenimente",
      availability: "Disponibilitate",
      resources: "Resurse",
      finance: "Financiar",
      invoices: "Facturi",
      invoiceNumberSeries: "Serii numere",
      payments: "Plati",
      supplierInvoices: "Facturi furnizori",
      profitability: "Profitabilitate",
      legal: "Juridic",
      contracts: "Contracte",
      contractTemplates: "Sabloane contract",
      policies: "Politici",
      contractNumberSeries: "Serii numere",
      settings: "Setari",
      channelSync: "Distributie",
      promotions: "Promotii",
      proposals: "Oferte",
      mice: "Programe",
      actionLedger: "Jurnal actiuni",
    },
  },
} satisfies LocaleMessageDefinitions<{ nav: OperatorAdminNavMessages }>
