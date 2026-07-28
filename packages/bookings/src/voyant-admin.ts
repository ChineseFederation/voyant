const bookingsAdminRuntime = {
  entry: "@voyant-travel/bookings-react/admin",
  export: "createBookingsAdminExtension",
} as const

/** Static admin contribution metadata used by the Bookings deployment manifest. */
export const bookingsVoyantAdmin = {
  compositionOrder: 1,
  runtime: {
    entry: "@voyant-travel/bookings-react/admin",
    export: "createSelectedBookingsAdminExtension",
  },
  copy: [
    {
      id: "@voyant-travel/bookings#admin.copy",
      namespace: "bookings.admin",
      fallbackLocale: "en",
      runtime: {
        entry: "@voyant-travel/bookings-react/i18n",
        export: "bookingsUiMessageDefinitions",
      },
    },
  ],
  routes: [
    {
      id: "@voyant-travel/bookings#admin.route.index",
      path: "/bookings",
      requiredScopes: ["bookings:read"],
      runtime: bookingsAdminRuntime,
    },
    {
      id: "@voyant-travel/bookings#admin.route.detail",
      path: "/bookings/$id",
      requiredScopes: ["bookings:read"],
      runtime: bookingsAdminRuntime,
    },
    {
      id: "@voyant-travel/bookings#admin.route.new",
      path: "/bookings/new",
      requiredScopes: ["bookings:write", "finance:write"],
      runtime: bookingsAdminRuntime,
    },
    {
      id: "@voyant-travel/bookings#admin.route.compose",
      path: "/bookings/compose",
      requiredScopes: ["bookings:write"],
      runtime: bookingsAdminRuntime,
    },
    {
      id: "@voyant-travel/bookings#admin.route.journey",
      path: "/catalog/journey/$entityModule/$entityId",
      requiredScopes: ["bookings:read"],
      runtime: bookingsAdminRuntime,
    },
  ],
  nav: [
    {
      id: "@voyant-travel/bookings#admin.nav.bookings",
      routeId: "@voyant-travel/bookings#admin.route.index",
      label: {
        namespace: "bookings.admin",
        key: "bookingsPage.title",
      },
    },
  ],
  slots: [
    {
      id: "bookings.list.header-actions",
      routeId: "@voyant-travel/bookings#admin.route.index",
    },
    {
      id: "booking.details.payment-controller",
      routeId: "@voyant-travel/bookings#admin.route.detail",
      contract: { bookingId: "string", onActionsChange: "function" },
    },
    {
      id: "booking.details.invoices-tab",
      routeId: "@voyant-travel/bookings#admin.route.detail",
    },
    {
      id: "booking.details.finance-start",
      routeId: "@voyant-travel/bookings#admin.route.detail",
    },
    {
      id: "booking.details.finance-end",
      routeId: "@voyant-travel/bookings#admin.route.detail",
    },
  ],
  contributions: [
    {
      id: "@voyant-travel/bookings#admin.contribution.person-bookings",
      slotId: "person.details.bookings-tab",
      requiredScopes: ["bookings:read"],
      runtime: bookingsAdminRuntime,
    },
  ],
} as const
