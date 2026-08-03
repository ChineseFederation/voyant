import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"

const root = process.cwd()
const nodeRuntime = await read("packages/framework/src/node-runtime.ts")
const operatorResourcesPath = "packages/runtime/src/deployment-resources.ts"
const operatorResources = await read(operatorResourcesPath)
const operatorRuntimePath = "packages/runtime/src/index.ts"
const operatorRuntime = await read(operatorRuntimePath)
const retiredOperatorAdapterPath = "apps/operator/src/api/runtime/runtime-adapter.ts"
const violations = []

if (existsSync(path.join(root, retiredOperatorAdapterPath))) {
  violations.push(`${retiredOperatorAdapterPath} must stay deleted after package-side extraction`)
}

const migratedRuntimeLoaders = [
  "loadBookingsRuntime",
  "loadBookingRequirementsRuntime",
  "loadFinanceRuntime",
  "loadBookingScheduleRuntime",
  "loadBookingTaxRuntime",
  "loadCatalogRuntime",
]
const migratedContributors = await Promise.all(
  ["bookings", "finance", "catalog"].map((name) =>
    read(`packages/${name}/src/runtime-contributor.ts`),
  ),
)
const movedRuntimeFactories = await Promise.all([
  read("packages/bookings/src/runtime.ts"),
  read("packages/finance/src/runtime.ts"),
  read("packages/catalog/src/runtime.ts"),
  read("packages/catalog/src/runtime/booking-engine-runtime.ts"),
  read("packages/catalog/src/runtime/booking-runtime.ts"),
  read("packages/catalog/src/runtime/offers-runtime.ts"),
  read("packages/catalog/src/runtime/subscriber-runtime.ts"),
])
for (const loader of migratedRuntimeLoaders) {
  if (operatorResources.includes(loader)) {
    violations.push(`${operatorResourcesPath} must not retain migrated capability loader ${loader}`)
  }
  if (migratedContributors.some((source) => source.includes(`capabilities.${loader}`))) {
    violations.push(`package contributor must not consume migrated capability loader ${loader}`)
  }
}
for (const packageId of [
  "@voyant-travel/bookings",
  "@voyant-travel/finance",
  "@voyant-travel/catalog",
  "@voyant-travel/catalog-node",
]) {
  if (operatorResources.includes(packageId)) {
    violations.push(`${operatorResourcesPath} must not name migrated package ${packageId}`)
  }
}
for (const forbidden of ["GraphSelectedNodeRuntimeAdapters", "runtimeAdapters", "new Map("]) {
  if (operatorResources.includes(forbidden)) {
    violations.push(`${operatorResourcesPath} retains central adapter authority ${forbidden}`)
  }
}
for (const required of [
  "config?: Readonly<Record<string, unknown>>",
  "Object.hasOwn(options.config ?? {}, key)",
  "Reflect.get(bindingsEnv(bindings), key)",
]) {
  if (!nodeRuntime.includes(required)) {
    violations.push(`generic Node config primitive is missing ${required}`)
  }
}
if (!operatorRuntime.includes("...options.host")) {
  violations.push(`${operatorRuntimePath} must pass deployment host configuration to Node runtime`)
}
for (const removedBridge of [
  'key === "invoiceSettlementPollers"',
  "createOperatorInvoiceSettlementPollers",
  "operatorSmartbillRuntimeHost",
]) {
  if (`${operatorResources}\n${operatorRuntime}\n${nodeRuntime}`.includes(removedBridge)) {
    violations.push(`operator generic config primitive retains SmartBill bridge ${removedBridge}`)
  }
}
if (`${operatorResources}\n${operatorRuntime}\n${nodeRuntime}`.includes("loadMcpAdminRoutes")) {
  violations.push("operator deployment resources must not retain dormant loadMcpAdminRoutes")
}
for (const primitive of ["env:", "database:", "storage:", "events:", "config:"]) {
  if (!nodeRuntime.includes(primitive)) {
    violations.push(`generic Node primitive contract is missing ${primitive}`)
  }
}
if (
  migratedContributors.some((source) => !source.includes("primitives: VoyantRuntimeHostPrimitives"))
) {
  violations.push("Node adapter contributors must accept the generic runtime primitive contract")
}
for (const [source, required] of [
  [
    `${movedRuntimeFactories[0]}\n${migratedContributors[0]}`,
    [
      "relationships.upsertPersonFromContact",
      "accommodation.enrichOverviewItems",
      "finance.createStaleBookingHoldsJobRuntime",
      "inventory.resolveProductSnapshot",
    ],
  ],
  [
    movedRuntimeFactories[1],
    [
      "createFinanceRuntime",
      "createFinanceBookingScheduleRuntime",
      "checkoutPaymentStarters?.resolvePaymentStarters",
      "settings.resolveBookingTaxSettings",
      "inventory.createPaymentPolicyRuntime",
      "createVoyantDataFxExchangeRateResolver",
      "aggregateFinanceInvoiceSettlementPollers",
    ],
  ],
  [
    movedRuntimeFactories[2],
    [
      "createOperatorCatalogBookingRouteModuleOptions",
      "createOperatorCatalogOffersRouteModuleOptions",
      "createOperatorCatalogProjectionRuntime",
      "createOperatorCatalogBookingSnapshotRuntime",
    ],
  ],
  // The booking engine resolves its inventory channel from the sources port
  // rather than constructing Voyant Connect itself; the channel package owns
  // that construction now. Still package-owned, which is what this asserts.
  [movedRuntimeFactories[3], ["sources?.registerFallback", "createOwnedBookingHandlersRegistry"]],
  [
    movedRuntimeFactories[4],
    [
      "applyOperatorTaxToQuoteResult",
      "inventory.getProductContent",
      "operations.listAvailabilitySlots",
    ],
  ],
  [
    movedRuntimeFactories[5],
    ["createVoyantConnectClient", "createCatalogOffersSearchResolvers", "resolveAirportLabels"],
  ],
  [
    movedRuntimeFactories[6],
    [
      "createCatalogProjectionRuntimeAdapter",
      "createCatalogBookingSnapshotRuntimeAdapter",
      "inventory.buildSnapshotInput",
    ],
  ],
]) {
  for (const token of required) {
    if (!source.includes(token))
      violations.push(`package-owned standard runtime is missing ${token}`)
  }
}
for (const forbidden of [
  "createCatalogOffersTypesenseResolvers",
  "bookings: { options: {} }",
  "noPolicy",
  "resolveConnectClient: () => null",
  "reindexEntity: async () => undefined",
  "findBookingProductIds: async () => []",
  "buildSnapshotInput: async () => null",
]) {
  if (
    migratedContributors.some((source) => source.includes(forbidden)) ||
    movedRuntimeFactories.some((source) => source.includes(forbidden))
  ) {
    violations.push(`package-owned standard runtime must not retain fallback ${forbidden}`)
  }
}
for (const removedPath of [
  "apps/operator/src/api/runtime/catalog-booking-runtime.ts",
  "apps/operator/src/api/runtime/catalog-booking-shape-enricher.ts",
  "apps/operator/src/api/runtime/catalog-offers-runtime.ts",
  "apps/operator/src/api/runtime/catalog-subscriber-runtime.ts",
  "apps/operator/src/api/lib/booking-engine-runtime.ts",
  "apps/operator/src/api/lib/catalog-runtime.ts",
  "apps/operator/src/api/lib/catalog-listability.ts",
  "apps/operator/src/api/lib/cruise-adapters-runtime.ts",
  "apps/operator/src/api/lib/owned-booking-handlers.ts",
  "apps/operator/src/api/lib/booking-engine-db.ts",
  "apps/operator/src/api/lib/booking-requirements-product-snapshot.ts",
  "packages/bookings-node/package.json",
  "packages/finance/src/standard-node-runtime.ts",
  "packages/catalog-node",
]) {
  if (existsSync(path.join(root, removedPath))) {
    violations.push(
      `package-owned Catalog implementation must not retain application shim ${removedPath}`,
    )
  }
}
const operatorLineDelta = lineCount(operatorResources) - 686
const operatorImportDelta = importCount(operatorResources) - 25
if (operatorLineDelta > 0 || operatorImportDelta > 0) {
  violations.push(
    `operator application authority must not grow; found ${signed(operatorLineDelta)} lines and ${signed(operatorImportDelta)} imports from 4c94a014b0`,
  )
}

// The resident host may import only generic process, database, storage,
// and composition infrastructure. Each exception is intentionally
// exact so adding another first-party dependency requires architectural review.
const allowedInfrastructureImports = new Map([
  [
    "@voyant-travel/action-ledger/capability",
    "lowers graph action declarations into the generic runtime capability registry",
  ],
  ["@voyant-travel/core", "types the domain-neutral runtime host primitive contract"],
  ["@voyant-travel/db/runtime", "constructs the Node database and database-backed stores"],
  ["@voyant-travel/hono", "provides the generic HTTP, auth, database, and rate-limit contracts"],
  ["@voyant-travel/hono/composition", "types deployment-local graph factories"],
  ["@voyant-travel/runtime-core", "provides the resident Node server and storage shims"],
  ["@voyant-travel/storage/runtime", "adapts the generic Node document object store"],
  ["@voyant-travel/storage/types", "types the provider-neutral object storage contract"],
  ["@voyant-travel/utils/cache", "types the generic cache resource"],
  ["@voyant-travel/utils/redis-client", "types the generic lazy Redis client contract"],
  ["@voyant-travel/utils/redis-kv", "adapts Redis to the generic cache resource"],
  ["@voyant-travel/utils/tiered-kv", "composes process and durable cache resources"],
])

const firstPartyImports = extractFirstPartyImports(nodeRuntime)
const productImports = firstPartyImports.filter(
  (specifier) => !allowedInfrastructureImports.has(specifier),
)
if (productImports.length > 0) {
  violations.push(
    `framework node-runtime must have zero first-party product imports; found ${productImports.join(", ")}`,
  )
}

for (const [specifier, justification] of allowedInfrastructureImports) {
  if (!justification.trim()) {
    violations.push(`infrastructure import ${specifier} has no justification`)
  }
  if (!firstPartyImports.includes(specifier)) {
    violations.push(`stale infrastructure import exception must be removed: ${specifier}`)
  }
}

for (const forbidden of [
  "ManagedProfileProviders",
  "VoyantNodeRuntimeProviders",
  "createManagedProfileProviders",
  "buildManagedToolContext",
  "createManagedMcpAdminRoutes",
  "loadFlightAdminRoutes",
  "loadMcpAdminRoutes",
  "loadProposalAdminRoutes",
  "loadProposalPublicRoutes",
  "loadProposalVersionSnapshotRoutes",
  "resolveNotificationProviders",
  "storefrontIntakePersistence",
]) {
  if (nodeRuntime.includes(forbidden)) {
    violations.push(`framework node-runtime must not retain product authority ${forbidden}`)
  }
}

for (const required of ["VoyantNodeRuntimeResources", "runtimePorts?:"]) {
  if (!nodeRuntime.includes(required)) {
    violations.push(`generic graph runtime host contract is missing ${required}`)
  }
}

const packageAuthority = [
  ["packages/accommodations/src/voyant.ts", "createAccommodationsContentVoyantRuntime"],
  ["packages/bookings/src/voyant.ts", "createBookingsVoyantRuntime"],
  ["packages/bookings/src/voyant.ts", "createBookingRequirementsVoyantRuntime"],
  ["packages/catalog/src/graph-runtime.ts", "createCatalogBookingVoyantRuntime"],
  ["packages/catalog/src/graph-runtime.ts", "createCatalogOffersVoyantRuntime"],
  ["packages/catalog/src/mcp-runtime.ts", "voyantToolContextContribution"],
  ["packages/commerce/src/voyant.ts", "commerceCatalogCheckoutVoyantPlugin"],
  ["packages/commerce/src/voyant.ts", "commerceBookingMaintenanceVoyantPlugin"],
  ["packages/finance/src/voyant.ts", "financeBookingScheduleVoyantPlugin"],
  ["packages/flights/src/voyant.ts", "createFlightsVoyantRuntime"],
  ["packages/inventory/src/voyant.ts", "createInventoryVoyantRuntime"],
  ["packages/legal/src/voyant.ts", "legalVoyantModule"],
  ["packages/notifications/src/voyant.ts", "createNotificationsVoyantRuntime"],
  ["packages/proposals/src/voyant.ts", "createProposalsVoyantRuntime"],
  ["packages/relationships/src/voyant.ts", "createRelationshipsVoyantRuntime"],
  ["packages/storage/src/voyant.ts", "storageMediaRuntimePort"],
  ["packages/storefront/src/voyant.ts", "createStorefrontVoyantRuntime"],
  ["packages/trips/src/voyant.ts", "createTripsVoyantRuntime"],
]

for (const [relativePath, required] of packageAuthority) {
  const source = await read(relativePath)
  if (!source.includes(required)) {
    violations.push(`package authority is missing ${required} in ${relativePath}`)
  }
}

if (violations.length > 0) {
  throw new Error(`check-node-runtime-product-authority:\n- ${violations.join("\n- ")}`)
}

console.log(
  `check-node-runtime-product-authority: OK (0 framework product imports; ${firstPartyImports.length} explicitly justified infrastructure imports; operator ${signed(operatorLineDelta)} lines, ${signed(operatorImportDelta)} imports from 4c94a014b0)`,
)

function signed(value) {
  return `${value >= 0 ? "+" : ""}${value}`
}

function lineCount(source) {
  return source.trimEnd().split("\n").length
}

function importCount(source) {
  return [...source.matchAll(/^import\b/gm)].length
}

function extractFirstPartyImports(source) {
  const imports = [
    ...source.matchAll(/\bfrom\s+["'](@voyant-travel\/[A-Za-z0-9@._/-]+)["']/g),
    ...source.matchAll(/\bimport\s*\(\s*["'](@voyant-travel\/[A-Za-z0-9@._/-]+)["']\s*\)/g),
  ].map((match) => match[1])
  return [...new Set(imports)].sort()
}

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8")
}
