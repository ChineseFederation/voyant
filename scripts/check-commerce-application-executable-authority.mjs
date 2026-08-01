import { access, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const rootArg = process.argv.indexOf("--root")
const root = rootArg >= 0 ? path.resolve(process.argv[rootArg + 1]) : defaultRoot

const deletedApplicationFiles = [
  "apps/operator/src/api/routes/booking-schedule.ts",
  "apps/operator/src/api/routes/catalog-checkout.ts",
  "apps/operator/src/api/routes/catalog-content.ts",
  "apps/operator/src/api/subscribers/booking-cancellation-settlement.ts",
  "apps/operator/src/api/subscribers/booking-payment-cleanup.ts",
  "apps/operator/src/api/jobs/draft-reaper-scheduled.ts",
  "apps/operator/src/api/jobs/promotion-scheduled.ts",
  "apps/operator/src/api/runtime/runtime-adapter.ts",
]

const failures = []
for (const relativePath of deletedApplicationFiles) {
  await access(path.join(root, relativePath)).then(
    () => failures.push(`obsolete application implementation must stay deleted: ${relativePath}`),
    () => undefined,
  )
}

const [
  catalogManifest,
  catalogContributor,
  commerceManifest,
  composition,
  financeRuntime,
  notificationsRuntime,
] = await Promise.all(
  [
    "packages/catalog/src/voyant.ts",
    "packages/catalog/src/runtime-contributor.ts",
    "packages/commerce/src/voyant.ts",
    "packages/runtime/src/deployment-resources.ts",
    "packages/finance/src/index.ts",
    "packages/notifications/src/subscriber-runtime.ts",
  ].map((relativePath) => readFile(path.join(root, relativePath), "utf8")),
)

const requireMatch = (source, pattern, message) => {
  if (!pattern.test(source)) failures.push(message)
}
const rejectMatch = (source, pattern, message) => {
  if (pattern.test(source)) failures.push(message)
}

requireMatch(
  catalogManifest,
  /catalog\.reap-expired-booking-drafts[\s\S]*runCatalogDraftReaperJob/,
  "Catalog must own the draft-reaper job and schedule",
)
requireMatch(
  commerceManifest,
  /commerce\.process-promotion-boundaries[\s\S]*runPromotionBoundaryJob/,
  "Commerce must own the promotion-boundary job and schedule",
)
requireMatch(
  catalogContributor,
  /\[catalogContentRuntimePort\.id\]:/,
  "Catalog contributor must provide the shared content runtime port",
)
requireMatch(
  catalogContributor,
  /services\.ensureSourceRegistry\(host\.primitives\.env\(bindings\)\)/,
  "Catalog contributor must resolve the shared source registry from host primitives",
)
requireMatch(
  financeRuntime,
  /registerBookingFinancialLifecycle\(context\.container, financeBookingLifecycle\)/,
  "Finance graph runtime must register the booking financial lifecycle",
)
requireMatch(
  notificationsRuntime,
  /skipQueuedBookingPaymentReminders\(db, data\.bookingId, "cancelled"\)[\s\S]*skipQueuedBookingPaymentReminders\(db, data\.bookingId, "expired"\)/,
  "Notifications subscribers must own terminal booking reminder cleanup",
)
rejectMatch(
  composition,
  /["']@voyant-travel\/(?:bookings|catalog|commerce|finance)[^"']*["']\s*:/,
  "Operator composition must not bind commerce/catalog/finance/bookings by package id",
)
rejectMatch(
  composition,
  /routes\/(?:booking-schedule|catalog-checkout|catalog-content)|subscribers\/(?:booking-cancellation-settlement|booking-payment-cleanup)/,
  "Operator composition must not reference migrated application implementations",
)

if (failures.length > 0) {
  console.error("Commerce application executable authority check failed:\n")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}
console.log("Commerce application executable authority: OK")
