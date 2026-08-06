const financeAdminRuntime = {
  entry: "@voyant-travel/finance-react/admin",
  export: "createFinanceAdminExtension",
} as const

/** Static admin contribution metadata used by the Finance deployment manifest. */
export const financeVoyantAdmin = {
  compositionOrder: 40,
  setupSteps: [{ id: "@voyant-travel/finance#setup.fiscal-settings", skippable: true }],
  runtime: {
    entry: "@voyant-travel/finance-react/admin",
    export: "createSelectedFinanceAdminExtension",
  },
  copy: [
    {
      id: "@voyant-travel/finance#admin.copy",
      namespace: "finance.admin",
      fallbackLocale: "en",
      runtime: {
        entry: "@voyant-travel/finance-react/i18n",
        export: "financeUiMessageDefinitions",
      },
    },
  ],
  routes: (
    [
      ["index", "/finance"],
      ["invoices-index", "/finance/invoices"],
      ["invoices-detail", "/finance/invoices/$id"],
      ["invoice-number-series", "/finance/invoice-number-series"],
      ["payments-index", "/finance/payments"],
      ["payments-detail", "/finance/payments/$id"],
      ["supplier-invoices-index", "/finance/supplier-invoices"],
      ["supplier-invoices-detail", "/finance/supplier-invoices/$id"],
      ["profitability", "/finance/profitability"],
    ] as const
  ).map(([id, path]) => ({
    id: `@voyant-travel/finance#admin.route.${id}`,
    path,
    requiredScopes: ["finance:read"],
    runtime: financeAdminRuntime,
  })),
  nav: [
    {
      id: "@voyant-travel/finance#admin.nav.finance",
      routeId: "@voyant-travel/finance#admin.route.invoices-index",
      label: {
        namespace: "finance.admin",
        key: "invoicesPage.title",
      },
    },
  ],
  contributions: (
    [
      ["booking-payment-controller", "booking.details.payment-controller"],
      ["booking-invoices", "booking.details.invoices-tab"],
      ["booking-pending-payment-sessions", "booking.details.finance-start"],
      ["booking-refunds", "booking.details.finance-start"],
      ["booking-payment-policy", "booking.details.finance-end"],
      ["supplier-payment-policy", "supplier.details.payment-policy"],
    ] as const
  ).map(([id, slotId]) => ({
    id: `@voyant-travel/finance#admin.contribution.${id}`,
    slotId,
    requiredScopes: ["finance:read"],
    runtime: financeAdminRuntime,
  })),
} as const
