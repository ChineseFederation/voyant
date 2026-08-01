import { describe, expect, it } from "vitest"
import type { AdminExtension } from "../../src/extensions.js"
import {
  createOperatorAdminNavigation,
  resolveOperatorAdminNavigation,
} from "../../src/navigation/operator-navigation.js"
import type { OperatorAdminMessages } from "../../src/providers/operator-admin-messages.js"

const navMessages: OperatorAdminMessages["nav"] = {
  availability: "Availability",
  bookings: "Bookings",
  catalog: "Catalog",
  catalogAccommodations: "Accommodations",
  catalogCharters: "Charters",
  catalogCruises: "Cruises",
  catalogOrders: "Orders",
  catalogProducts: "Products",
  catalogProductsTagline: "Packages tagline",
  catalogExcursions: "Excursions",
  catalogExcursionsTagline: "Excursions tagline",
  catalogTours: "Tours",
  catalogToursTagline: "Tours tagline",
  categories: "Categories",
  actionLedger: "Logs",
  allTrips: "All trips",
  channelSync: "Distribution",
  contractNumberSeries: "Number Series",
  contractTemplates: "Contract Templates",
  contracts: "Contracts",
  dashboard: "Dashboard",
  finance: "Finance",
  flightOrders: "Orders",
  flights: "Flights",
  legal: "Legal",
  notificationDeliveries: "Deliveries",
  notificationReminderRules: "Reminder Rules",
  notificationReminderRuns: "Reminder Runs",
  notificationTemplates: "Templates",
  notifications: "Notifications",
  newTrip: "New trip",
  organizations: "Organizations",
  people: "People",
  policies: "Policies",
  products: "Products",
  promotions: "Promotions",
  resources: "Resources",
  settings: "Settings",
  suppliers: "Suppliers",
  trips: "Trips",
}

describe("createOperatorAdminNavigation", () => {
  it("keeps only generic host navigation", () => {
    const items = createOperatorAdminNavigation({ messages: navMessages })

    expect(items).toEqual([{ id: "dashboard", title: "Dashboard", url: "/" }])
  })
})

describe("resolveOperatorAdminNavigation", () => {
  it("orders selected package items and preserves anchors without duplication", () => {
    const extensions: AdminExtension[] = [
      {
        id: "bookings",
        navigation: [
          { order: -100, items: [{ id: "bookings", title: "Bookings", url: "/bookings" }] },
        ],
      },
      {
        id: "action-ledger",
        navigation: [
          { order: 60, items: [{ id: "action-ledger", title: "Logs", url: "/action-ledger" }] },
        ],
      },
      {
        id: "proposals",
        navigation: [
          {
            insertAfter: "bookings",
            items: [{ id: "proposals", title: "Proposals", url: "/proposals" }],
          },
        ],
      },
      {
        id: "mice",
        navigation: [
          {
            insertAfter: "bookings",
            items: [{ id: "mice-programs", title: "Programs", url: "/mice" }],
          },
        ],
      },
    ]

    const items = resolveOperatorAdminNavigation({
      baseItems: createOperatorAdminNavigation({ messages: navMessages }),
      extensions,
    })
    const ids = items.map((item) => item.id)

    expect(ids).toEqual(["dashboard", "bookings", "proposals", "mice-programs", "action-ledger"])
    expect(new Set(ids).size).toBe(ids.length)
  })
})
