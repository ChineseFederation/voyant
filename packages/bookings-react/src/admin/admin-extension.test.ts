import { buildAdminExtensionDestinations } from "@voyant-travel/admin/app/extension-routes"
import { describe, expect, it } from "vitest"

import { BOOKING_STATUS_ALL } from "../booking-list-constants.js"
import { getBookingsQueryOptions } from "../query-options.js"
import { BookingDetailHost } from "./booking-detail-host.js"
import { BookingInvoiceSheet } from "./booking-invoice-sheet.js"
import { BookingsHost } from "./bookings-host.js"
import {
  BookingDetailSkeleton,
  BookingsListSkeleton,
  bookingDetailPaymentControllerSlot,
  bookingDetailSearchSchema,
  bookingNewSearchSchema,
  bookingsFiltersToSearch,
  bookingsIndexSearchSchema,
  bookingsListHeaderActionsSlot,
  bookingsSearchToFilters,
  createBookingsAdminExtension,
  createSelectedBookingsAdminExtension,
} from "./index.js"

describe("createBookingsAdminExtension", () => {
  it("leaves standard navigation to the graph-selected factory", () => {
    const extension = createBookingsAdminExtension()
    expect(extension.id).toBe("bookings")
    expect(extension.navigation).toBeUndefined()
  })

  it("describes the booking routes with unique ids and paths", () => {
    const extension = createBookingsAdminExtension()
    const routes = extension.routes ?? []
    expect(routes).toHaveLength(4)
    expect(new Set(routes.map((route) => route.id)).size).toBe(4)
    expect(routes.map((route) => route.path)).toEqual([
      "/bookings",
      "/bookings/new",
      "/bookings/$id",
      "/bookings/compose",
    ])
  })

  it("honors basePath and labels", () => {
    const extension = createBookingsAdminExtension({
      basePath: "/reservations",
      labels: { bookings: "Rezervări" },
    })
    const index = extension.routes?.find((route) => route.id === "bookings-index")
    expect(index?.path).toBe("/reservations")
    expect(index?.title).toBe("Rezervări")
    const detail = extension.routes?.find((route) => route.id === "bookings-detail")
    expect(detail?.path).toBe("/reservations/$id")
    const create = extension.routes?.find((route) => route.id === "bookings-new")
    expect(create?.path).toBe("/reservations/new")
    expect(create?.destination).toBe("booking.create")
    expect(create?.destinationSearchParams).toEqual(["productId", "slotId"])
    const compose = extension.routes?.find((route) => route.id === "bookings-compose")
    expect(compose?.path).toBe("/reservations/compose")
  })

  it("carries product and departure preselection into the create route", () => {
    const destinations = buildAdminExtensionDestinations([createBookingsAdminExtension()])
    expect(destinations["booking.create"]?.({ productId: "prod_1", slotId: "slot_1" })).toBe(
      "/bookings/new?productId=prod_1&slotId=slot_1",
    )
    expect(destinations["booking.create"]?.({ productId: "prod_1" })).toBe(
      "/bookings/new?productId=prod_1",
    )
  })

  it("carries the packaged search contracts", () => {
    const extension = createBookingsAdminExtension()
    const index = extension.routes?.find((route) => route.id === "bookings-index")
    expect(index?.validateSearch?.({ status: "confirmed", offset: "20" })).toMatchObject({
      status: "confirmed",
      offset: 20,
    })
    const detail = extension.routes?.find((route) => route.id === "bookings-detail")
    expect(detail?.validateSearch?.({ tab: "finance" })).toMatchObject({ tab: "finance" })
    const create = extension.routes?.find((route) => route.id === "bookings-new")
    expect(create?.validateSearch?.({ productId: "prod_1", slotId: "slot_1" })).toEqual({
      productId: "prod_1",
      slotId: "slot_1",
    })
    expect(bookingNewSearchSchema.safeParse({ productId: "" }).success).toBe(false)
  })

  it("carries full route implementations as lazy pages (RFC §4.8)", () => {
    // Contributions ship the route IMPLEMENTATION: a lazy `page` module
    // loader (never an eager `component` — the host binder code-splits the
    // page into its own chunk) and, for the data-backed list/detail pages,
    // a loader that prefetches through the host-supplied runtime plus the
    // per-route SSR mode.
    const extension = createBookingsAdminExtension()
    const routes = extension.routes ?? []
    expect(routes).toHaveLength(4)
    for (const route of routes) {
      expect(route.component).toBeUndefined()
      expect(typeof route.page).toBe("function")
    }
    for (const id of ["bookings-index", "bookings-detail"]) {
      const route = routes.find((candidate) => candidate.id === id)
      expect(typeof route?.loader).toBe("function")
      expect(route?.ssr).toBe("data-only")
      expect(typeof route?.pendingComponent).toBe("function")
    }
  })

  it("resolves every page loader to a module with a default component", async () => {
    const extension = createBookingsAdminExtension()
    for (const route of extension.routes ?? []) {
      const module = await route.page?.()
      expect(typeof module?.default).toBe("function")
    }
  })

  it("contributes the person-bookings widget on crm-ui's bookings-tab slot", () => {
    // The crm-ui ↔ bookings-ui cycle resolution (RFC §4.7): crm-ui's
    // PersonDetailHost mounts its Bookings tab off this contribution.
    const extension = createBookingsAdminExtension()
    const widget = extension.widgets?.find((entry) => entry.id === "bookings-person-bookings")
    expect(widget?.slot).toBe("person.details.bookings-tab")
    expect(typeof widget?.component).toBe("function")
  })

  it("owns selected copy and cross-domain slots without host options", () => {
    const extension = createSelectedBookingsAdminExtension({
      navMessages: { bookings: "Rezervari" },
    })
    expect(
      extension.routes?.every((route) => route.redirectTo || route.routeMessagesProvider),
    ).toBe(true)
    expect(extension.navigation?.[0]).toMatchObject({
      order: -100,
      items: [{ id: "bookings", title: "Rezervari", url: "/bookings" }],
    })
    expect(extension.navigation?.[0]?.items[0]?.icon).toBeDefined()
    expect(bookingsListHeaderActionsSlot).toBe("bookings.list.header-actions")
    expect(bookingDetailPaymentControllerSlot).toBe("booking.details.payment-controller")
  })

  it("falls back to stable English selected navigation copy", () => {
    const extension = createSelectedBookingsAdminExtension({ navMessages: {} })
    expect(extension.navigation?.[0]?.items[0]?.title).toBe("Bookings")
    expect(extension.routes?.find((route) => route.id === "bookings-index")?.title).toBe("Bookings")
  })
})

describe("bookings list search contract", () => {
  it("round-trips a filter snapshot through the URL projection", () => {
    const search = bookingsIndexSearchSchema.parse({
      search: "smith",
      status: "confirmed",
      sortBy: "startDate",
      sortDir: "asc",
      offset: "40",
    })
    const filters = bookingsSearchToFilters(search)
    expect(filters).toMatchObject({
      search: "smith",
      status: "confirmed",
      sortBy: "startDate",
      sortDir: "asc",
      offset: 40,
    })
  })

  it("drops defaults so the unfiltered list keeps a clean URL", () => {
    const projected = bookingsFiltersToSearch({
      search: "",
      status: BOOKING_STATUS_ALL,
      productId: null,
      optionId: null,
      supplierId: null,
      productCategoryId: null,
      personId: null,
      organizationId: null,
      availabilitySlotId: null,
      dateFrom: null,
      dateTo: null,
      paxMin: "",
      paxMax: "",
      sortBy: "createdAt",
      sortDir: "desc",
      offset: 0,
    })
    expect(Object.values(projected).every((value) => value === undefined)).toBe(true)
  })

  it("omits the all-status sentinel from direct bookings API requests", async () => {
    const urls: string[] = []
    const options = getBookingsQueryOptions(
      {
        baseUrl: "https://example.test",
        fetcher: async (url) => {
          urls.push(url)
          return Response.json({ data: [], total: 0, limit: 25, offset: 0 })
        },
      },
      { status: BOOKING_STATUS_ALL, limit: 25, offset: 0 },
    )

    const queryFn = options.queryFn
    if (typeof queryFn !== "function") throw new Error("Expected bookings query function")

    await queryFn({} as Parameters<typeof queryFn>[0])

    expect(urls).toEqual(["https://example.test/v1/admin/bookings?limit=25&offset=0"])
  })

  it("rejects unknown tabs on the detail contract", () => {
    expect(() => bookingDetailSearchSchema.parse({ tab: "nope" })).toThrow()
    expect(bookingDetailSearchSchema.parse({})).toEqual({})
  })
})

describe("packaged bookings admin hosts", () => {
  // Importable + renderable component types — host apps bind these from
  // their SPECIFIC modules (the admin barrel re-exports types only, so the
  // workspace-chrome chunk that evaluates the factory never pins the heavy
  // hosts). A broken import surface fails here, not in an app build.
  // (Behavioral rendering needs the workspace provider stack and lives with
  // the host apps.)
  it("exports the page hosts as components from their specific modules", () => {
    for (const host of [
      BookingDetailHost,
      BookingDetailSkeleton,
      BookingInvoiceSheet,
      BookingsHost,
      BookingsListSkeleton,
    ]) {
      expect(typeof host).toBe("function")
    }
  })
})
