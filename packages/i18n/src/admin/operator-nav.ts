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
  catalogCruises: string
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
  notificationPreview: string
  suppliers: string
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
      catalogExcursionsTagline: "Single-day trips with fixed departures.",
      catalogTours: "Tours",
      catalogToursTagline: "Multi-day circuits with fixed departures.",
      catalogCruises: "Cruises",
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
      notificationPreview: "Preview",
      suppliers: "Suppliers",
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
      catalogExcursionsTagline: "Excursii de o zi cu plecări fixe.",
      catalogTours: "Circuite",
      catalogToursTagline: "Circuite de mai multe zile cu plecări fixe.",
      catalogCruises: "Croaziere",
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
      notificationPreview: "Previzualizare",
      suppliers: "Furnizori",
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
