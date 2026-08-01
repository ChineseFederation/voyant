import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const rootArg = process.argv.indexOf("--root")
const repoRoot = rootArg >= 0 ? path.resolve(process.argv[rootArg + 1]) : defaultRoot

const paths = {
  manifest: "packages/commerce/src/voyant.ts",
  descriptor: "packages/commerce/src/promotions/subscriber-runtime.ts",
  catalogBridge: "apps/operator/src/api/subscribers/catalog-bridge.ts",
  contributor: "packages/commerce/src/runtime-contributor.ts",
  runtime: "packages/commerce/src/runtime.ts",
  composition: "packages/runtime/src/deployment-resources.ts",
}

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([name, relativePath]) => [
      name,
      await readFile(path.join(repoRoot, relativePath), "utf8").catch((error) => {
        if (name === "catalogBridge" && error?.code === "ENOENT") return ""
        throw error
      }),
    ]),
  ),
)

const failures = []
for (const retiredPath of [
  "apps/operator/src/api/app.ts",
  "apps/operator/src/api/runtime/runtime-adapter.ts",
  "apps/operator/src/api/runtime/operator-workflow-services.ts",
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

const promotionRuntimeReferences = sources.manifest.match(
  /entry:\s*["']@voyant-travel\/commerce\/promotion-redemption-subscriber["'][\s\S]*?export:\s*["']createPromotionRedemptionSubscriberGraphRuntime["']/g,
)
if (promotionRuntimeReferences?.length !== 1) {
  failures.push(
    "Commerce manifest must own the promotion-redemption subscriber runtime reference exactly once",
  )
}
for (const port of ["promotionRedemptionDatabaseRuntimePort", "promotionsBulkReindexRuntimePort"]) {
  requireMatch(
    sources.manifest,
    new RegExp(`requirePort\\(${port}\\)`),
    `Commerce manifest must require ${port}`,
  )
  requireMatch(
    sources.descriptor,
    new RegExp(`getPort\\(${port}\\)`),
    `Commerce subscriber runtime must resolve ${port}`,
  )
  requireMatch(
    sources.contributor,
    new RegExp(`\\[${port}\\.id\\]`),
    `Commerce contributor must provide ${port} through the runtime port map`,
  )
}
requireMatch(
  sources.descriptor,
  /eventBus\.subscribe<BookingConfirmedPayload>\(["']booking\.confirmed["']/,
  "Commerce descriptor must subscribe to booking.confirmed",
)
requireMatch(
  sources.descriptor,
  /container\.register\([\s\S]*BULK_REINDEX_SERVICE_KEY[\s\S]*await descriptor\.register\(context\)/,
  "Commerce runtime must register the bulk-reindex service before the redemption subscriber",
)
requireMatch(
  sources.runtime,
  /promotionRedemptionDatabase:\s*\{[\s\S]*?primitives\.database\.transaction\(bindings/,
  "Commerce promotion redemption must use generic database primitives",
)
requireMatch(
  sources.runtime,
  /primitives\.database\.transaction\(bindings/,
  "Commerce database runtime must preserve the host transaction lifecycle",
)
requireMatch(
  sources.runtime,
  /promotionsBulkReindex:\s*\{[\s\S]*createService:[\s\S]*catalog\.createProductsDocumentBuilder/,
  "Commerce must own bulk-reindex service composition",
)
rejectMatch(
  sources.composition,
  /loadCommerceRuntime|createOperatorCommerceRuntime|createBulkReindexProductsService/,
  "Operator deployment resources must not retain Commerce runtime assembly",
)
rejectMatch(
  sources.catalogBridge,
  /recordPromotionRedemptionsForBooking|promotion redemption recorder failed/,
  "Catalog bridge must not retain promotion-redemption subscriber authority",
)
rejectMatch(
  sources.composition,
  /eventBus\.subscribe[^\n]*booking\.confirmed|createPromotionRedemptionSubscriberRuntime\(/,
  "Operator composition must leave promotion subscriber registration to graph lowering",
)

if (failures.length > 0) {
  console.error("Commerce promotion subscriber authority check failed:\n")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Commerce promotion subscriber authority: OK")
