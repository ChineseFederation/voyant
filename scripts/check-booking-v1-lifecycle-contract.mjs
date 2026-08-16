import { existsSync, readFileSync } from "node:fs"
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

function rejectText(path, source, text) {
  if (source.includes(text)) failures.push(`${path}: forbidden ${JSON.stringify(text)}`)
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

const publicBookingRoutes = read("packages/bookings/src/routes-public.ts")
rejectText("packages/bookings/src/routes-public.ts", publicBookingRoutes, '"/sessions')

const bookingsEntryPoint = read("packages/bookings/src/index.ts")
for (const legacyCreateSurface of [
  "createSelfServiceBookingRoutes",
  "bookingsSelfServiceCreateRuntimePort",
]) {
  rejectText("packages/bookings/src/index.ts", bookingsEntryPoint, legacyCreateSurface)
}

const bookingSchema = read("packages/bookings/src/schema-operations.ts")
rejectText("packages/bookings/src/schema-operations.ts", bookingSchema, "bookingSessionStates")

const bookingSharedSchema = read("packages/bookings/src/schema-shared.ts")
for (const legacyBookingStatus of ['"draft"', '"on_hold"', '"awaiting_payment"', '"expired"']) {
  rejectText(
    "packages/bookings/src/schema-shared.ts",
    bookingSharedSchema.slice(
      bookingSharedSchema.indexOf("bookingStatusEnum"),
      bookingSharedSchema.indexOf("supplierConfirmationStatusEnum"),
    ),
    legacyBookingStatus,
  )
}

const bookingItemsSchema = read("packages/bookings/src/schema-items.ts")
rejectText("packages/bookings/src/schema-items.ts", bookingItemsSchema, '.default("confirmed")')

const bookingItemStatusSlice = bookingSharedSchema.slice(
  bookingSharedSchema.indexOf("bookingItemStatusEnum"),
  bookingSharedSchema.indexOf("bookingAllocationTypeEnum"),
)
for (const legacyBookingItemStatus of ['"pending"', '"reserved"']) {
  rejectText(
    "packages/bookings/src/schema-shared.ts",
    bookingItemStatusSlice,
    legacyBookingItemStatus,
  )
}

const bookingCoreSchema = read("packages/bookings/src/schema-core.ts")
for (const forbiddenBookingField of [
  '.default("draft")',
  "holdExpiresAt",
  "expiredAt",
  "awaitingPaymentAt",
  "paidAt",
]) {
  rejectText("packages/bookings/src/schema-core.ts", bookingCoreSchema, forbiddenBookingField)
}

const bookingCreateContract = read("packages/finance/src/service-booking-create.ts")
rejectText("packages/finance/src/service-booking-create.ts", bookingCreateContract, "initialStatus")
requireText(
  "packages/finance/src/service-booking-create.ts",
  bookingCreateContract,
  "WHERE b.status IN ('confirmed', 'in_progress')",
)
rejectText(
  "packages/finance/src/service-booking-create.ts",
  bookingCreateContract,
  "b.status NOT IN",
)

for (const retiredBookingLifecycleFile of [
  "packages/bookings/src/stale-holds-job.ts",
  "packages/bookings/src/stale-holds-job-runtime-port.ts",
  "packages/bookings/src/tasks/expire-stale-holds.ts",
]) {
  if (existsSync(resolve(root, retiredBookingLifecycleFile))) {
    failures.push(
      `${retiredBookingLifecycleFile}: retired Booking lifecycle surface must stay deleted`,
    )
  }
}

const bookingAdminRoutes = read("packages/bookings/src/routes-admin.ts")
for (const legacyBookingRoute of [
  '"/bookings/{id}/confirm"',
  '"/bookings/{id}/extend-hold"',
  '"/bookings/{id}/expire"',
  '"/bookings/expire-stale"',
]) {
  rejectText("packages/bookings/src/routes-admin.ts", bookingAdminRoutes, legacyBookingRoute)
}

const adminBookingContracts = read("packages/admin-contracts/src/bookings.ts")
for (const legacyAdminContract of [
  "confirmBookingSchema",
  'id: "bookings.confirm"',
  'pathTemplate: "/v1/admin/bookings/:id/confirm"',
]) {
  rejectText("packages/admin-contracts/src/bookings.ts", adminBookingContracts, legacyAdminContract)
}

const adminClient = read("packages/admin-react/src/client/client.ts")
rejectText("packages/admin-react/src/client/client.ts", adminClient, "bookingsOperations.confirm")

const notificationsManifest = read("packages/notifications/src/voyant.ts")
rejectText("packages/notifications/src/voyant.ts", notificationsManifest, '"booking.expired"')

for (const path of [
  "packages/bookings/openapi/admin/bookings.json",
  "packages/bookings/openapi/public-api/bookings.json",
]) {
  const document = read(path)
  for (const legacyBookingStatus of ['"on_hold"', '"awaiting_payment"']) {
    rejectText(path, document, legacyBookingStatus)
  }
  for (const legacyBookingPath of [
    "/v1/admin/bookings/expire-stale",
    "/v1/admin/bookings/{id}/confirm",
    "/v1/admin/bookings/{id}/extend-hold",
    "/v1/admin/bookings/{id}/expire",
  ]) {
    rejectText(path, document, legacyBookingPath)
  }
}

for (const legacyCatalogFile of [
  "packages/catalog/src/booking-engine/drafts-schema.ts",
  "packages/catalog/src/booking-engine/drafts-service.ts",
  "packages/catalog/src/booking-engine/draft-capability.ts",
  "packages/catalog/src/booking-engine/routes.ts",
  "packages/catalog/src/booking-engine/self-service-source.ts",
  "packages/catalog/src/draft-reaper-job.ts",
]) {
  if (existsSync(resolve(root, legacyCatalogFile))) {
    failures.push(`${legacyCatalogFile}: retired beta booking path must stay deleted`)
  }
}

const catalogRoutes = read("packages/catalog/src/booking-engine/operator-routes.ts")
for (const legacyPath of [
  '"/v1/admin/catalog/quote"',
  '"/v1/public/catalog/quote"',
  '"/v1/admin/catalog/drafts',
  '"/v1/public/catalog/drafts',
  '"/v1/admin/catalog/holds/place"',
  '"/v1/public/catalog/holds/place"',
]) {
  rejectText("packages/catalog/src/booking-engine/operator-routes.ts", catalogRoutes, legacyPath)
}

const catalogSchema = read("packages/catalog/src/schema.ts")
rejectText("packages/catalog/src/schema.ts", catalogSchema, "bookingDraftsTable")

for (const [path, canonicalPath, legacyPath] of [
  [
    "packages/catalog/openapi/admin/catalog-booking.json",
    '"/v1/admin/catalog/booking-sessions"',
    '"/v1/admin/catalog/drafts',
  ],
  [
    "packages/catalog/openapi/public-api/catalog-booking.json",
    '"/v1/public/catalog/booking-sessions"',
    '"/v1/public/catalog/drafts',
  ],
]) {
  const document = read(path)
  requireText(path, document, canonicalPath)
  rejectText(path, document, legacyPath)
}

const betaDraftCutover = read(
  "packages/catalog/migrations/20260802190000_booking_v1_beta_draft_cutover.sql",
)
for (const requiredCutoverRule of [
  "ambiguous external effect",
  "booking_v1_legacy_holds_to_release",
  "genuine_commitment",
  "resumable_staff_attempt",
  'DROP TABLE "booking_drafts"',
]) {
  requireText(
    "packages/catalog/migrations/20260802190000_booking_v1_beta_draft_cutover.sql",
    betaDraftCutover,
    requiredCutoverRule,
  )
}

const betaBookingStatusCutover = read(
  "packages/bookings/migrations/20260802200000_booking_v1_status_cutover.sql",
)
for (const requiredCutoverRule of [
  "ambiguous supplier effect",
  "unresolved external payment effect",
  "booking_v1_legacy_allocations_to_release",
  "genuine_commitment",
  "abandoned_attempt",
  'DROP TABLE IF EXISTS "booking_session_states"',
  "CREATE TYPE \"booking_status\" AS ENUM ('confirmed', 'in_progress', 'completed', 'cancelled')",
]) {
  requireText(
    "packages/bookings/migrations/20260802200000_booking_v1_status_cutover.sql",
    betaBookingStatusCutover,
    requiredCutoverRule,
  )
}

const storefrontSdkPackage = JSON.parse(read("packages/public-api-client/package.json"))
for (const legacyExport of ["./booking-engine", "./engine-state"]) {
  if (storefrontSdkPackage.exports?.[legacyExport]) {
    failures.push(`packages/public-api-client/package.json: forbidden export ${legacyExport}`)
  }
  if (storefrontSdkPackage.publishConfig?.exports?.[legacyExport]) {
    failures.push(
      `packages/public-api-client/package.json: forbidden published export ${legacyExport}`,
    )
  }
}

const storefrontSdkDocs = read("docs/architecture/custom-public-api-client.md")
for (const legacyRoute of [
  "/v1/public/bookings/sessions",
  "bookingEngine.getSnapshot",
  "booking_session_states",
]) {
  rejectText("docs/architecture/custom-public-api-client.md", storefrontSdkDocs, legacyRoute)
}

if (failures.length > 0) {
  console.error("Booking v1 lifecycle contract check failed.")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("OK booking v1 lifecycle contract")
