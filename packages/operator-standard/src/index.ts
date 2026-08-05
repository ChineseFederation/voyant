import type {
  DefineVoyantGraphProjectUnitInput,
  VoyantGraphProjectAccessDeclaration,
  VoyantGraphProjectDeployment,
  VoyantProductBomReference,
} from "@voyant-travel/core/project"

export const STANDARD_OPERATOR_PRODUCT_BOM_REFERENCE = {
  schemaVersion: "voyant.product-bom-reference.v1",
  id: "@voyant-travel/operator-standard",
  version: "1",
} as const satisfies VoyantProductBomReference

export const STANDARD_OPERATOR_ACCESS: VoyantGraphProjectAccessDeclaration = {
  presets: [
    {
      id: "catalog-read",
      kind: "api-token",
      label: "Catalog read",
      grants: [
        "catalog:read",
        "catalog:search",
        "products:read",
        "departures:read",
        "itineraries:read",
      ],
    },
    {
      id: "commerce-read",
      kind: "api-token",
      label: "Commerce read",
      grants: ["operations:read", "products:read", "pricing:read", "suppliers:read"],
    },
    {
      id: "automation",
      kind: "api-token",
      label: "Automation",
      grants: ["app-webhooks:replay"],
    },
    {
      id: "read-only",
      kind: "api-token",
      label: "Read only",
      grants: ["*:read"],
    },
    {
      id: "full-access",
      kind: "api-token",
      label: "Full access",
      grants: ["*:*"],
    },
    {
      id: "agent-customer",
      kind: "api-token-grant",
      label: "Agent (customer)",
      grants: ["catalog:read", "catalog:search", "products:read", "trips:read", "trips:write"],
      audience: "customer",
    },
    {
      id: "agent-staff",
      kind: "api-token-grant",
      label: "Agent (staff)",
      grants: [
        "bookings:read",
        "bookings:write",
        "catalog:read",
        "catalog:search",
        "finance:read",
        "operations:read",
        "products:read",
        "proposals:read",
        "proposals:write",
        "reports:export",
        "reports:read",
        "reports:write",
        "suppliers:read",
        "trips:read",
        "trips:write",
      ],
      audience: "staff",
    },
    {
      id: "public-catalog-reader",
      kind: "api-token-grant",
      label: "Public catalog reader",
      grants: ["catalog:read", "catalog:search", "products:read"],
      audience: "customer",
    },
    {
      id: "editor",
      kind: "staff",
      label: "Editor",
      grants: ["bookings:read", "bookings:write", "reports:read", "reports:write"],
    },
  ],
}

/**
 * The standard profile is a single-instance, self-hosted Node deployment that
 * runs on nothing but Postgres, so it declares the posture that follows from
 * that: no HTTP cache in front of the origin, and per-process `sharedState` and
 * `rateLimit`. The declaration does not endorse the posture — it makes it
 * visible, and the runtime reports the consequences at startup. A deployment
 * that puts a CDN or reverse proxy in front of the origin overrides
 * `responseCache` in its own `voyant.config.ts`.
 *
 * See docs/adr/0021-http-response-cache-tiers.md section 7 and
 * docs/architecture/caching-architecture.md section 12.
 */
export const STANDARD_OPERATOR_DEPLOYMENT: VoyantGraphProjectDeployment = {
  target: "node",
  mode: "self-hosted",
  responseCache: { edge: "none" },
  providers: {
    database: "postgres",
    storage: "memory",
    cache: "postgres",
    sharedState: "memory",
    rateLimit: "memory",
    search: "none",
    email: "none",
    sms: "none",
    adminAuth: "better-auth",
    customerAuth: "better-auth",
    realtime: "none",
    scheduledJobs: "node-cron",
    outboundWebhooks: "postgres",
    legalDocumentArtifact: "standard",
    payments: "custom",
  },
}

export interface OperatorDistributionDeclaration {
  id: string
  target: "node"
  modules: readonly DefineVoyantGraphProjectUnitInput[]
  extensions: readonly DefineVoyantGraphProjectUnitInput[]
}

/** Consumer-owned differences applied after the framework distribution. */
export interface OperatorDistributionDifferences {
  modules?: readonly DefineVoyantGraphProjectUnitInput[]
  extensions?: readonly DefineVoyantGraphProjectUnitInput[]
  plugins?: readonly DefineVoyantGraphProjectUnitInput[]
}

/** Resolver input after framework defaults and consumer differences are merged. */
export interface ResolvedOperatorDistribution {
  modules: readonly DefineVoyantGraphProjectUnitInput[]
  extensions: readonly DefineVoyantGraphProjectUnitInput[]
  plugins: readonly DefineVoyantGraphProjectUnitInput[]
}

interface StandardModuleSelection {
  resolve: string
  required?: true
}

interface StandardExtensionSelection {
  resolve: string
  /** Module selections whose removal also removes this extension. */
  owners: readonly string[]
}

export interface SelectStandardOperatorDistributionOptions {
  exclude?: readonly string[]
}

/**
 * Selection policy for the standard Operator distribution. Package facets are
 * not declared here: every selected unit is loaded from its owning package's
 * `./voyant` export after admission. This declaration owns only product closure,
 * required selections, stable order, and removal cascade policy.
 */
export const STANDARD_OPERATOR_DISTRIBUTION_POLICY: {
  readonly id: "operator-standard"
  readonly target: "node"
  readonly modules: readonly StandardModuleSelection[]
  readonly extensions: readonly StandardExtensionSelection[]
} = {
  id: "operator-standard",
  target: "node",
  modules: [
    { resolve: "@voyant-travel/action-ledger", required: true },
    { resolve: "@voyant-travel/event-catalog", required: true },
    { resolve: "@voyant-travel/webhook-delivery", required: true },
    { resolve: "@voyant-travel/mcp", required: true },
    { resolve: "@voyant-travel/relationships", required: true },
    { resolve: "@voyant-travel/custom-fields", required: true },
    { resolve: "@voyant-travel/apps", required: true },
    { resolve: "@voyant-travel/proposals" },
    { resolve: "@voyant-travel/operations" },
    { resolve: "@voyant-travel/operations/dashboard" },
    { resolve: "@voyant-travel/identity", required: true },
    { resolve: "@voyant-travel/auth/invitations", required: true },
    { resolve: "@voyant-travel/auth/team", required: true },
    { resolve: "@voyant-travel/auth/customer-business-accounts" },
    { resolve: "@voyant-travel/auth/storefront" },
    { resolve: "@voyant-travel/distribution" },
    { resolve: "@voyant-travel/inventory/extras" },
    { resolve: "@voyant-travel/bookings/requirements" },
    { resolve: "@voyant-travel/bookings/extras" },
    { resolve: "@voyant-travel/commerce", required: true },
    { resolve: "@voyant-travel/inventory" },
    { resolve: "@voyant-travel/catalog" },
    { resolve: "@voyant-travel/catalog/booking-engine" },
    { resolve: "@voyant-travel/accommodations" },
    { resolve: "@voyant-travel/bookings" },
    { resolve: "@voyant-travel/finance" },
    { resolve: "@voyant-travel/legal" },
    { resolve: "@voyant-travel/public-document-delivery" },
    { resolve: "@voyant-travel/notifications" },
    { resolve: "@voyant-travel/storage" },
    { resolve: "@voyant-travel/media" },
    { resolve: "@voyant-travel/storefront" },
    { resolve: "@voyant-travel/storefront/customer-portal" },
    { resolve: "@voyant-travel/storefront/verification" },
    { resolve: "@voyant-travel/storefront/payment-link" },
    { resolve: "@voyant-travel/trips" },
    { resolve: "@voyant-travel/flights" },
    { resolve: "@voyant-travel/setup", required: true },
    { resolve: "@voyant-travel/navigation-preferences", required: true },
    { resolve: "@voyant-travel/operator-settings" },
    { resolve: "@voyant-travel/charters" },
    { resolve: "@voyant-travel/cruises" },
    { resolve: "@voyant-travel/realtime" },
    { resolve: "@voyant-travel/mice" },
    { resolve: "@voyant-travel/db" },
    { resolve: "@voyant-travel/catalog-authoring" },
    { resolve: "@voyant-travel/reporting" },
  ],
  extensions: [
    {
      resolve: "@voyant-travel/bookings/booking-supplier-extension",
      owners: ["@voyant-travel/bookings"],
    },
    {
      resolve: "@voyant-travel/finance/bookings-create-extension",
      owners: ["@voyant-travel/finance", "@voyant-travel/bookings"],
    },
    {
      resolve: "@voyant-travel/inventory/booking-extension",
      owners: ["@voyant-travel/inventory", "@voyant-travel/bookings"],
    },
    {
      resolve: "@voyant-travel/inventory/authoring/extension",
      owners: ["@voyant-travel/inventory"],
    },
    {
      resolve: "@voyant-travel/proposals/booking-extension",
      owners: ["@voyant-travel/proposals", "@voyant-travel/bookings"],
    },
    {
      resolve: "@voyant-travel/distribution/extension",
      owners: ["@voyant-travel/distribution", "@voyant-travel/bookings"],
    },
    {
      resolve: "@voyant-travel/distribution/channel-push-extension",
      owners: ["@voyant-travel/distribution"],
    },
    {
      resolve: "@voyant-travel/finance/booking-tax-settings-extension",
      owners: ["@voyant-travel/finance", "@voyant-travel/operator-settings"],
    },
    {
      resolve: "@voyant-travel/finance/booking-tax-preview-extension",
      owners: ["@voyant-travel/finance", "@voyant-travel/bookings"],
    },
    {
      resolve: "@voyant-travel/inventory/content-extension",
      owners: ["@voyant-travel/inventory"],
    },
    {
      resolve: "@voyant-travel/cruises/content-extension",
      owners: ["@voyant-travel/catalog"],
    },
    {
      resolve: "@voyant-travel/accommodations/content-extension",
      owners: ["@voyant-travel/accommodations"],
    },
    {
      resolve: "@voyant-travel/inventory/brochure-extension",
      owners: ["@voyant-travel/inventory", "@voyant-travel/storage"],
    },
    {
      resolve: "@voyant-travel/finance/booking-schedule-extension",
      owners: [
        "@voyant-travel/finance",
        "@voyant-travel/bookings",
        "@voyant-travel/operator-settings",
      ],
    },
    {
      resolve: "@voyant-travel/proposals/proposal-version-snapshot-extension",
      owners: ["@voyant-travel/proposals", "@voyant-travel/trips"],
    },
    {
      resolve: "@voyant-travel/commerce/booking-maintenance-extension",
      owners: [
        "@voyant-travel/bookings",
        "@voyant-travel/commerce",
        "@voyant-travel/operator-settings",
      ],
    },
    {
      resolve: "@voyant-travel/action-ledger/health-extension",
      owners: ["@voyant-travel/action-ledger"],
    },
    {
      resolve: "@voyant-travel/proposals/presentation-extension",
      owners: ["@voyant-travel/proposals", "@voyant-travel/notifications"],
    },
    {
      resolve: "@voyant-travel/realtime/proposals-invalidation-extension",
      owners: ["@voyant-travel/realtime", "@voyant-travel/proposals"],
    },
    {
      resolve: "@voyant-travel/catalog/offers-extension",
      owners: ["@voyant-travel/catalog"],
    },
    {
      resolve: "@voyant-travel/commerce/catalog-checkout-extension",
      owners: ["@voyant-travel/catalog", "@voyant-travel/commerce"],
    },
    {
      resolve: "@voyant-travel/mice/booking-extension",
      owners: ["@voyant-travel/mice", "@voyant-travel/bookings"],
    },
    {
      resolve: "@voyant-travel/notifications/reminder-subscribers-extension",
      owners: ["@voyant-travel/notifications"],
    },
    {
      resolve: "@voyant-travel/legal/standard-product-links",
      owners: ["@voyant-travel/legal", "@voyant-travel/finance"],
    },
    {
      resolve: "@voyant-travel/mice/standard-product-links",
      owners: ["@voyant-travel/mice", "@voyant-travel/proposals"],
    },
  ],
}

/** Versioned standard product declaration expanded by defineConfig at build time. */
export const STANDARD_OPERATOR_PRODUCT_BOM = {
  ...STANDARD_OPERATOR_PRODUCT_BOM_REFERENCE,
  target: STANDARD_OPERATOR_DISTRIBUTION_POLICY.target,
  modules: STANDARD_OPERATOR_DISTRIBUTION_POLICY.modules.map(({ resolve }) => resolve),
  extensions: STANDARD_OPERATOR_DISTRIBUTION_POLICY.extensions.map(({ resolve }) => resolve),
  access: STANDARD_OPERATOR_ACCESS,
  deployment: STANDARD_OPERATOR_DEPLOYMENT,
}

/** The package selectors used to load the standard Node Operator graph. */
export const STANDARD_OPERATOR_DISTRIBUTION = {
  id: STANDARD_OPERATOR_DISTRIBUTION_POLICY.id,
  target: STANDARD_OPERATOR_PRODUCT_BOM.target,
  modules: STANDARD_OPERATOR_PRODUCT_BOM.modules,
  extensions: STANDARD_OPERATOR_PRODUCT_BOM.extensions,
} satisfies OperatorDistributionDeclaration

/** Resolve package selectors after applying product-removal policy. */
export function selectStandardOperatorDistribution({
  exclude = [],
}: SelectStandardOperatorDistributionOptions = {}): {
  modules: string[]
  extensions: string[]
} {
  const moduleSelections = STANDARD_OPERATOR_DISTRIBUTION_POLICY.modules
  const extensionSelections = STANDARD_OPERATOR_DISTRIBUTION_POLICY.extensions
  const moduleResolve = (selection: (typeof moduleSelections)[number]) => selection.resolve
  const extensionResolve = (selection: (typeof extensionSelections)[number]) => selection.resolve
  const known = new Set([
    ...moduleSelections.map(moduleResolve),
    ...extensionSelections.map(extensionResolve),
  ])
  const excludeSet = new Set(exclude)
  const unknown = [...excludeSet].filter((specifier) => !known.has(specifier)).sort()
  if (unknown.length > 0) {
    throw new Error(
      `exclude names ${unknown.length} selection(s) not in the standard set: ${unknown.join(", ")}.`,
    )
  }

  const required = moduleSelections
    .filter((selection) => selection.required && excludeSet.has(selection.resolve))
    .map(({ resolve }) => resolve)
  if (required.length > 0) {
    throw new Error(`cannot exclude required module(s): ${required.join(", ")}.`)
  }

  for (const selection of extensionSelections) {
    if (selection.owners.some((owner) => excludeSet.has(owner))) {
      excludeSet.add(extensionResolve(selection))
    }
  }

  return {
    modules: moduleSelections.map(moduleResolve).filter((resolve) => !excludeSet.has(resolve)),
    extensions: extensionSelections
      .map(extensionResolve)
      .filter((resolve) => !excludeSet.has(resolve)),
  }
}

/**
 * Applies the standard Operator product closure before consumer-owned
 * differences. Authored config describes differences and does not repeat the
 * standard declaration.
 */
export function mergeOperatorDistributionDefaults(
  differences: OperatorDistributionDifferences = {},
  distribution: OperatorDistributionDeclaration = STANDARD_OPERATOR_DISTRIBUTION,
): ResolvedOperatorDistribution {
  return {
    modules: [...distribution.modules, ...(differences.modules ?? [])],
    extensions: [...distribution.extensions, ...(differences.extensions ?? [])],
    plugins: [...(differences.plugins ?? [])],
  }
}
