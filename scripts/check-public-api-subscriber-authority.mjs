import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const rootArg = process.argv.indexOf("--root")
const repoRoot = rootArg >= 0 ? path.resolve(process.argv[rootArg + 1]) : defaultRoot

const paths = {
  manifest: "packages/public-api/src/voyant.ts",
  storefrontModule: "packages/public-api/src/index.ts",
  operatorComposition: "packages/runtime/src/deployment-resources.ts",
  storefrontContributor: "packages/public-api/src/runtime-contributor.ts",
  relationshipsContributor: "packages/relationships/src/runtime-contributor.ts",
  notificationsContributor: "packages/notifications/src/runtime-contributor.ts",
  tripsContributor: "packages/trips/src/runtime-contributor.ts",
}

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([name, relativePath]) => [
      name,
      await readFile(path.join(repoRoot, relativePath), "utf8"),
    ]),
  ),
)

const failures = []
for (const retiredPath of [
  "packages/public-api/src/booking-bootstrap-subscriber-runtime.ts",
  "apps/operator/src/api/app.ts",
  "apps/operator/src/api/runtime/runtime-adapter.ts",
]) {
  if (existsSync(path.join(repoRoot, retiredPath)))
    failures.push(`${retiredPath} must stay deleted`)
}

const requireMatch = (source, pattern, message) => {
  if (!pattern.test(source)) failures.push(message)
}
const rejectMatch = (source, pattern, message) => {
  if (pattern.test(source)) failures.push(message)
}

for (const [name, source] of Object.entries({
  manifest: sources.manifest,
  storefrontModule: sources.storefrontModule,
  storefrontContributor: sources.storefrontContributor,
})) {
  rejectMatch(
    source,
    /booking-bootstrap-subscriber|storefrontBookingBootstrap|storefrontBookingIntentsRuntimePort|BOOKING_BOOTSTRAP_INTENT/i,
    `${name} must not restore the retired Storefront booking-bootstrap bridge`,
  )
}

requireMatch(
  sources.manifest,
  /runtime:\s*\{\s*entry:\s*["']@voyant-travel\/public-api["'],\s*export:\s*["']createPublicApiVoyantRuntime["']\s*\}[\s\S]*requirePort\(publicApiOffersRuntimePort\)[\s\S]*requirePort\(publicApiIntakeRuntimePort\)/,
  "Storefront manifest must compose through its retained typed runtime ports",
)
rejectMatch(
  sources.operatorComposition,
  /loadStorefrontRuntime|storefrontRuntimePort|createOperatorStorefrontRuntimeProvider|import\([^)]*storefront/,
  "Operator must not retain Storefront product runtime assembly",
)
requireMatch(
  sources.storefrontContributor,
  /\[publicApiOffersRuntimePort\.id\]:\s*createCommercePublicApiOfferResolvers[\s\S]*\[publicApiCustomerPortalRuntimePort\.id\]/,
  "Storefront contributor must retain offers and customer-portal projections",
)
requireMatch(
  sources.tripsContributor,
  /\[publicApiPaymentLinkRuntimePort\.id\]:\s*createStandardPaymentLinkRouteOptions/,
  "Trips contributor must own Storefront payment-link projection behavior",
)
requireMatch(
  sources.relationshipsContributor,
  /\[publicApiIntakeRuntimePortReference\.id\]:\s*createPublicApiIntakePersistence/,
  "Relationships contributor must own Storefront intake persistence",
)
requireMatch(
  sources.notificationsContributor,
  /\[customerVerificationRuntimePort\.id\]:\s*verification/,
  "Notifications contributor must own Storefront verification providers",
)
rejectMatch(
  sources.operatorComposition,
  /["']@voyant-travel\/public-api["']\s*:/,
  "Operator must not restore a package-id Storefront compatibility binding",
)

if (failures.length > 0) {
  console.error("Storefront authority check failed:\n")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Storefront authority: OK")
