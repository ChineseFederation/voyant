import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  BOOKING_LIFECYCLE_CONFORMANCE_V1_REQUIRED_SCENARIO_IDS,
  bookingLifecycleConformanceScenariosV1,
} from "../packages/catalog-contracts/src/booking-engine/lifecycle-conformance.ts"

const rootFlag = process.argv.indexOf("--root")
const root = resolve(rootFlag === -1 ? process.cwd() : process.argv[rootFlag + 1])

const failures = []

function read(path) {
  try {
    return readFileSync(resolve(root, path), "utf8")
  } catch {
    failures.push(`${path}: missing or unreadable`)
    return ""
  }
}

function requireText(path, source, text) {
  if (!source.includes(text)) failures.push(`${path}: missing ${JSON.stringify(text)}`)
}

const adr = read("docs/adr/0019-booking-v1-commitment-point-policies.md")
requireText("docs/adr/0019-booking-v1-commitment-point-policies.md", adr, "Status:** Accepted")
requireText(
  "docs/adr/0019-booking-v1-commitment-point-policies.md",
  adr,
  "@voyant-travel/catalog-contracts/booking-engine/lifecycle-conformance",
)
requireText(
  "docs/adr/0019-booking-v1-commitment-point-policies.md",
  adr,
  "Finance state never becomes Booking status",
)
requireText(
  "docs/adr/0019-booking-v1-commitment-point-policies.md",
  adr,
  "runBookingLifecycleConformanceV1",
)
requireText(
  "docs/adr/0019-booking-v1-commitment-point-policies.md",
  adr,
  "assertBookingLifecycleConformanceV1",
)

const language = read("UBIQUITOUS_LANGUAGE.md")
for (const term of [
  "**Booking**",
  "**Commit**",
  "**Supplier Operation**",
  "Sourced-inventory **Commit** defaults to supplier-first",
]) {
  requireText("UBIQUITOUS_LANGUAGE.md", language, term)
}

const packageJson = JSON.parse(read("packages/catalog-contracts/package.json"))
const sourceExport = packageJson.exports?.["./booking-engine/lifecycle-conformance"]
if (sourceExport !== "./src/booking-engine/lifecycle-conformance.ts") {
  failures.push(
    "packages/catalog-contracts/package.json: missing source lifecycle-conformance export",
  )
}
const publishExport =
  packageJson.publishConfig?.exports?.["./booking-engine/lifecycle-conformance"]?.types
if (publishExport !== "./dist/booking-engine/lifecycle-conformance.d.ts") {
  failures.push(
    "packages/catalog-contracts/package.json: missing published lifecycle-conformance export",
  )
}

const scenarioIds = bookingLifecycleConformanceScenariosV1.map((scenario) => scenario.id)
if (
  JSON.stringify(scenarioIds) !==
  JSON.stringify(BOOKING_LIFECYCLE_CONFORMANCE_V1_REQUIRED_SCENARIO_IDS)
) {
  failures.push(
    "booking lifecycle conformance scenarios do not match the required scenario id list",
  )
}

const outcomeKinds = new Set(
  bookingLifecycleConformanceScenariosV1.map((scenario) => scenario.expected.outcomeKind),
)
for (const outcome of [
  "payment_required",
  "supplier_pending",
  "supplier_in_doubt",
  "supplier_failed",
  "revision_mismatch",
  "quote_failure",
  "hold_failure",
  "idempotent_replay",
]) {
  if (!outcomeKinds.has(outcome)) failures.push(`missing required outcome scenario ${outcome}`)
}

if (failures.length > 0) {
  console.error("Booking v1 lifecycle contract check failed.")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("OK booking v1 lifecycle contract")
