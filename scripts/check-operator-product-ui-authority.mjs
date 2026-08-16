import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const defaultRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const rootArg = process.argv.indexOf("--root")
const root = rootArg >= 0 ? resolve(process.argv[rootArg + 1]) : defaultRoot
const applicationSource = join(root, "apps/operator/src")
const failures = []
const applicationFileRatchet = 16

const applicationFiles = readdirSync(applicationSource, {
  recursive: true,
  withFileTypes: true,
}).filter((entry) => entry.isFile())
if (applicationFiles.length > applicationFileRatchet) {
  failures.push(
    `operator application source grew to ${applicationFiles.length} files; ratchet is ${applicationFileRatchet}`,
  )
}

for (const relativePath of [
  "packages/proposals-react/src/public-api/public-proposal-page.tsx",
  "packages/finance-react/src/public-api/payment-link-resolver-page.tsx",
  "packages/finance-react/src/public-api/public-payment-link-page.tsx",
  "packages/finance-react/src/public-api/payment-link-booking-summary.tsx",
  "packages/finance-react/src/public-api/payment-link-trip-summary.tsx",
  "packages/public-api-react/src/public-api/confirmation-page.tsx",
  "packages/public-api-react/src/public-api/customer-account-page.tsx",
  "packages/public-api-react/src/public-api/customer-account-provider.tsx",
  "packages/public-api-react/src/public-api/customer-auth-pages.tsx",
  "packages/public-api-react/src/public-api/market-selector.tsx",
  "packages/public-api-react/src/public-api/messages.tsx",
  "packages/public-api-react/src/public-api/scope.tsx",
  "packages/public-api-react/src/public-api/shell.tsx",
  "packages/trips-react/src/public-api/public-api-composer-block.tsx",
]) {
  const path = join(root, relativePath)
  if (!existsSync(path)) {
    failures.push(`${relativePath} is required`)
    continue
  }
  const source = readFileSync(path, "utf8")
  if (source.includes('from "@/')) {
    failures.push(`${relativePath} must not import Operator application aliases`)
  }
  if (source.includes("@tanstack/react-router")) {
    failures.push(`${relativePath} must remain router-independent`)
  }
}

for (const relativePath of [
  "apps/operator/src/admin/README.md",
  "apps/operator/src/extensions/README.md",
  "apps/operator/src/modules/README.md",
]) {
  if (!existsSync(join(root, relativePath))) {
    failures.push(`project override folder authority requires ${relativePath}`)
  }
}

if (existsSync(join(root, "apps/operator/src/custom-fields"))) {
  failures.push(
    "project override folder authority must stay deleted: apps/operator/src/custom-fields",
  )
}

const requiredTokens = new Map([
  ["packages/bookings-react/src/public-api/index.ts", ["resolveContractVariables"]],
  ["packages/bookings-react/package.json", ['"./public-api": "./src/public-api/index.ts"']],
  ["packages/proposals-react/package.json", ['"./public-api": "./src/public-api/index.ts"']],
  ["packages/finance-react/package.json", ['"./public-api": "./src/public-api/index.ts"']],
  ["packages/proposals-react/src/public-api/index.ts", ["PublicProposalPage"]],
  [
    "packages/finance-react/src/public-api/index.ts",
    ["PaymentLinkResolverPage", "PublicPaymentLinkPage"],
  ],
  [
    "packages/catalog-react/src/public-api/index.ts",
    ["fetchContent", "buildPublicCatalogSlotsUrl"],
  ],
  ["packages/catalog-react/package.json", ['"./public-api": "./src/public-api/index.ts"']],
  ["packages/cruises-react/src/public-api/index.ts", ["CruiseDetailPage"]],
  ["packages/cruises-react/package.json", ['"./public-api": "./src/public-api/index.ts"']],
  ["packages/inventory-react/src/public-api/index.ts", ["ProductDetailPageProducts"]],
  ["packages/inventory-react/package.json", ['"./public-api": "./src/public-api/index.ts"']],
  [
    "packages/public-api-react/src/public-api/index.ts",
    [
      "PublicApiBrowsePage",
      "AccommodationDetailPage",
      "PublicApiUiProvider",
      "CustomerAccountPage",
      "CustomerSignInPage",
      "PublicApiConfirmationPage",
      "PublicApiMarketSelector",
      "PublicApiMessagesProvider",
      "PublicApiScopeProvider",
      "PublicApiShell",
      "createPublicApiPresentationContribution",
    ],
  ],
  ["packages/public-api-react/package.json", ['"./public-api": "./src/public-api/index.ts"']],
  [
    "packages/trips-react/src/public-api/index.ts",
    ["PublicApiComposerBlock", "PublicApiComposerPage"],
  ],
  ["packages/trips-react/package.json", ['"./public-api": "./src/public-api/index.ts"']],
  [
    "packages/operator-standard/src/standard-route-files.ts",
    [
      '"(storefront)/shop.tsx"',
      '"(storefront)/shop_.products.$entityModule.$entityId.tsx"',
      '"(storefront)/shop_.account.tsx"',
      '"(storefront)/shop_.confirmation.$bookingId.tsx"',
      '"(storefront)/shop_.composer.tsx"',
      '"shop"',
      '"productDetail"',
      '"account"',
      '"confirmation"',
      '"composer"',
    ],
  ],
  [
    "packages/operator-standard/src/standard-frontend.tsx",
    [
      '"@voyant-travel/cruises-react/public-api"',
      '"@voyant-travel/inventory-react/public-api"',
      '"@voyant-travel/public-api-react/public-api/presentation-routes"',
      '"@voyant-travel/trips-react/public-api"',
      "presentationFactories",
      '"@voyant-travel/public-api#presentation.customer"',
      "createFinancePublicRouteContribution",
      "createProposalsPublicRouteContribution",
      "createAdminHostPresentation",
      "buildAdminExtensionRoutes",
    ],
  ],
  [
    "packages/finance-react/src/public-routes.tsx",
    [
      "createFinancePublicRouteContribution",
      "PaymentLinkResolverPage",
      "PublicPaymentLinkPage",
      "AccountantPortal",
    ],
  ],
  [
    "packages/proposals-react/src/public-routes.tsx",
    ["createProposalsPublicRouteContribution", "PublicProposalPage"],
  ],
  [
    "packages/operator-standard/src/standard-route-files.ts",
    [
      "../../admin/selected-graph-admin.generated",
      "../../presentations/selected-graph-presentations.generated",
      "selectedGraphPresentationFactories",
      'import.meta.glob("../../../src/admin/*/index.tsx"',
    ],
  ],
])

const standardFrontend = readFileSync(
  join(root, "packages/operator-standard/src/standard-frontend.tsx"),
  "utf8",
)
if (standardFrontend.includes("createPublicApiPresentationContribution")) {
  failures.push("operator-standard must consume the graph-selected Storefront presentation factory")
}

for (const [relativePath, tokens] of requiredTokens) {
  const path = join(root, relativePath)
  if (!existsSync(path)) {
    failures.push(`${relativePath} is required`)
    continue
  }
  const source = readFileSync(path, "utf8")
  for (const token of tokens) {
    if (!source.includes(token)) failures.push(`${relativePath} must contain ${token}`)
  }
}

const adminHostPackage = JSON.parse(
  readFileSync(join(root, "packages/admin-host/package.json"), "utf8"),
)
const productReactPackages = [
  "@voyant-travel/auth-react",
  "@voyant-travel/bookings-react",
  "@voyant-travel/catalog-react",
  "@voyant-travel/commerce-react",
  "@voyant-travel/cruises-react",
  "@voyant-travel/distribution-react",
  "@voyant-travel/finance-react",
  "@voyant-travel/flights-react",
  "@voyant-travel/inventory-react",
  "@voyant-travel/legal-react",
  "@voyant-travel/mice-react",
  "@voyant-travel/operations-react",
  "@voyant-travel/proposals-react",
  "@voyant-travel/realtime-react",
  "@voyant-travel/relationships-react",
  "@voyant-travel/public-api-react",
  "@voyant-travel/trips-react",
]
for (const packageName of productReactPackages) {
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    if (adminHostPackage[field]?.[packageName]) {
      failures.push(`packages/admin-host/package.json retains ${field} entry ${packageName}`)
    }
  }
}
for (const exportPath of [
  "./standard-frontend",
  "./standard-route-files",
  "./standard-styles.css",
]) {
  if (
    adminHostPackage.exports?.[exportPath] ||
    adminHostPackage.publishConfig?.exports?.[exportPath]
  ) {
    failures.push(`packages/admin-host/package.json retains product export ${exportPath}`)
  }
}
for (const retiredPath of [
  "packages/admin-host/src/standard-api-docs.tsx",
  "packages/admin-host/src/standard-frontend.tsx",
  "packages/admin-host/src/standard-route-files.ts",
  "packages/admin-host/src/standard-styles.css",
]) {
  if (existsSync(join(root, retiredPath))) {
    failures.push(`standard product frontend must not remain in generic admin host: ${retiredPath}`)
  }
}

if (failures.length > 0) {
  console.error("Operator product UI authority check failed:\n")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(
  `Operator product UI authority: OK (${applicationFiles.length}/${applicationFileRatchet} application source files)`,
)
