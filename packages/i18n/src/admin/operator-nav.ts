import type { LocaleMessageDefinitions } from "../runtime.js"

export type OperatorAdminNavMessages = {
  dashboard: string
  catalog: string
  catalogOrders: string
  flights: string
  flightOrders: string
  products: string
  categories: string
  bookings: string
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
  availability: string
  resources: string
  finance: string
  invoices: string
  invoiceNumberSeries: string
  payments: string
  legal: string
  contracts: string
  contractTemplates: string
  policies: string
  contractNumberSeries: string
  settings: string
  channelSync: string
  promotions: string
  actionLedger: string
}

export const operatorAdminNavMessages = {
  "zh-CN": {
    nav: {
      dashboard: "工作台",
      catalog: "产品目录",
      catalogOrders: "订单",
      flights: "机票",
      flightOrders: "机票订单",
      products: "旅行产品",
      categories: "产品分类",
      bookings: "预订",
      trips: "旅行团",
      allTrips: "全部旅行团",
      newTrip: "新建旅行团",
      notifications: "通知",
      notificationTemplates: "通知模板",
      notificationReminderRules: "提醒规则",
      notificationDeliveries: "发送记录",
      notificationReminderRuns: "提醒记录",
      notificationSettings: "通知设置",
      notificationPreview: "预览",
      suppliers: "供应商",
      people: "旅客",
      organizations: "机构",
      availability: "名额与库存",
      resources: "资源",
      finance: "财务",
      invoices: "发票",
      invoiceNumberSeries: "编号规则",
      payments: "收款",
      legal: "合同与规则",
      contracts: "合同",
      contractTemplates: "合同模板",
      policies: "政策",
      contractNumberSeries: "合同编号",
      settings: "设置",
      channelSync: "渠道同步",
      promotions: "促销",
      actionLedger: "操作日志",
    },
  },
  en: {
    nav: {
      dashboard: "Dashboard",
      catalog: "Catalog",
      catalogOrders: "Orders",
      flights: "Flights",
      flightOrders: "Orders",
      products: "Products",
      categories: "Categories",
      bookings: "Bookings",
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
      availability: "Availability",
      resources: "Resources",
      finance: "Finance",
      invoices: "Invoices",
      invoiceNumberSeries: "Number Series",
      payments: "Payments",
      legal: "Legal",
      contracts: "Contracts",
      contractTemplates: "Contract Templates",
      policies: "Policies",
      contractNumberSeries: "Number Series",
      settings: "Settings",
      channelSync: "Channel sync",
      promotions: "Promotions",
      actionLedger: "Logs",
    },
  },
  ro: {
    nav: {
      dashboard: "Panou",
      catalog: "Catalog",
      catalogOrders: "Comenzi",
      flights: "Zboruri",
      flightOrders: "Comenzi",
      products: "Produse",
      categories: "Categorii",
      bookings: "Rezervari",
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
      organizations: "Organizatii",
      availability: "Disponibilitate",
      resources: "Resurse",
      finance: "Financiar",
      invoices: "Facturi",
      invoiceNumberSeries: "Serii numere",
      payments: "Plati",
      legal: "Juridic",
      contracts: "Contracte",
      contractTemplates: "Sabloane contract",
      policies: "Politici",
      contractNumberSeries: "Serii numere",
      settings: "Setari",
      channelSync: "Sincronizare canale",
      promotions: "Promotii",
      actionLedger: "Jurnal actiuni",
    },
  },
} satisfies LocaleMessageDefinitions<{ nav: OperatorAdminNavMessages }>
