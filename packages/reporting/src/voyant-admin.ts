const reportingAdminRuntime = {
  entry: "@voyant-travel/reporting-react/admin",
  export: "createReportingAdminExtension",
} as const

/**
 * Static admin contribution metadata used by the Reporting deployment manifest.
 * The selected factory contributes the operator navigation group and both
 * routes; the per-route runtime carries the neutral factory the host binds.
 */
export const reportingVoyantAdmin = {
  compositionOrder: 60,
  loading: "lazy-routes",
  runtime: {
    entry: "@voyant-travel/reporting-react/admin",
    export: "createSelectedReportingAdminExtension",
  },
  routes: [
    {
      id: "@voyant-travel/reporting#admin.route.index",
      path: "/reporting",
      requiredScopes: ["reports:read"],
      runtime: reportingAdminRuntime,
    },
    {
      id: "@voyant-travel/reporting#admin.route.detail",
      path: "/reporting/$id",
      requiredScopes: ["reports:read"],
      runtime: reportingAdminRuntime,
    },
  ],
} as const
