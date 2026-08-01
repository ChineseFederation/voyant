import { access, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const rootArg = process.argv.indexOf("--root")
const repoRoot = rootArg >= 0 ? path.resolve(process.argv[rootArg + 1]) : defaultRoot

const read = (relativePath) => readFile(path.join(repoRoot, relativePath), "utf8")
const [manifest, contributor, indexRuntime, snapshotRuntime] = await Promise.all([
  read("packages/catalog/src/voyant.ts"),
  read("packages/catalog/src/runtime-contributor.ts"),
  read("packages/catalog/src/index-subscriber-runtime.ts"),
  read("packages/catalog/src/booking-snapshot-subscriber-runtime.ts"),
])

const failures = []
const requireMatch = (source, pattern, message) => {
  if (!pattern.test(source)) failures.push(message)
}
const _rejectMatch = (source, pattern, message) => {
  if (pattern.test(source)) failures.push(message)
}

for (const port of ["catalogProjectionRuntimePort", "catalogBookingSnapshotRuntimePort"]) {
  requireMatch(manifest, new RegExp(`requirePort\\(${port}\\)`), `Catalog must require ${port}`)
  requireMatch(
    contributor,
    new RegExp(`\\[${port}\\.id\\]`),
    `Catalog contributor must provide ${port} through the runtime port map`,
  )
}

const indexRuntimeReferences = manifest.match(
  /export:\s*catalogIndexSubscriberRuntimeExports\[subscriber\.eventType\]/g,
)
if (indexRuntimeReferences?.length !== 1) {
  failures.push(
    "Catalog manifest must attach package runtimes to all index subscriber declarations",
  )
}
requireMatch(
  manifest,
  /createCatalogBookingSnapshotSubscriberGraphRuntime/,
  "Catalog manifest must own the booking snapshot runtime reference",
)
requireMatch(
  indexRuntime,
  /getPort\(catalogProjectionRuntimePort\)[\s\S]*container\.register\([\s\S]*await descriptor\.register\(context\)/,
  "Catalog index factories must register the selected projection port before each descriptor",
)
requireMatch(
  snapshotRuntime,
  /getPort\(catalogBookingSnapshotRuntimePort\)[\s\S]*container\.register\([\s\S]*await catalogBookingConfirmedSnapshotSubscriber\.register\(context\)/,
  "Catalog snapshot factory must register the selected snapshot port before its descriptor",
)
requireMatch(
  contributor,
  /projection:\s*RuntimePortValue<CatalogProjectionRuntimeProvider>/,
  "Catalog projection contribution must satisfy its package-owned type",
)
requireMatch(
  contributor,
  /bookingSnapshot:\s*RuntimePortValue<CatalogBookingSnapshotRuntimeProvider>/,
  "Catalog snapshot contribution must satisfy its package-owned type",
)

for (const legacyPath of [
  "starters/operator/src/api/subscribers/catalog-bridge.ts",
  "starters/operator/src/api/subscribers/catalog-bridge-bundle.ts",
  "starters/operator/src/api/subscribers/catalog-bridge.publication.test.ts",
]) {
  try {
    await access(path.join(repoRoot, legacyPath))
    failures.push(`Obsolete Operator Catalog bridge file remains: ${legacyPath}`)
  } catch {}
}

if (failures.length > 0) {
  console.error("Catalog subscriber authority check failed:\n")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Catalog subscriber authority: OK")
