import { readdirSync, readFileSync, statSync } from "node:fs"
import { relative, resolve } from "node:path"

const root = resolve(process.cwd())
const violations = []

const sourceRoots = [
  "packages/finance/src",
  "packages/finance-contracts/src",
  "packages/finance-react/src",
]

const forbidden = [
  /\bvouchersService\b/,
  /\bVoucherServiceError\b/,
  /\bvoucherRedemption\b/,
  /\bvoucherRedemptions\b/,
  /\bPublicVoucher\b/,
  /\bvalidatePublicVoucher\b/,
  /\/finance\/vouchers(?:\/|\b)/,
  /\/vouchers(?:\/|\b)/,
]

const historicalAllowlist = new Set(["packages/finance/src/service-travel-credits-migration.ts"])

for (const sourceRoot of sourceRoots) {
  for (const file of walk(resolve(root, sourceRoot))) {
    const path = relative(root, file)
    if (historicalAllowlist.has(path)) continue
    const source = readFileSync(file, "utf8")
    for (const pattern of forbidden) {
      if (pattern.test(source)) violations.push(`${path}: retained ${pattern}`)
    }
    if (/voucher/i.test(path)) violations.push(`${path}: ambiguous Finance stored-value filename`)
  }
}

for (const path of [
  "packages/catalog-contracts/src/booking-engine/selection-contracts.ts",
  "packages/inventory/src/booking-engine/handler.ts",
]) {
  const source = readFileSync(resolve(root, path), "utf8")
  if (/\bvoucherRedemption\b/.test(source)) {
    violations.push(`${path}: use travelCreditRedemption`)
  }
}

for (const path of [
  "packages/bookings/openapi/admin/bookings.json",
  "packages/bookings/openapi/storefront/bookings.json",
  "packages/inventory/openapi/admin/products.json",
  "packages/storefront/openapi/storefront/customer-portal.json",
]) {
  const source = readFileSync(resolve(root, path), "utf8")
  for (const pattern of [/"voucher"/, /\bvoucherRedemption\b/, /\bvoucherId\b/]) {
    if (pattern.test(source)) {
      violations.push(`${path}: generated contracts retain ambiguous voucher vocabulary`)
    }
  }
}

for (const path of [
  "packages/storefront/src/validation-settings.ts",
  "packages/storefront/src/service.ts",
]) {
  const source = readFileSync(resolve(root, path), "utf8")
  if (/\bvoucher\b/i.test(source)) {
    violations.push(`${path}: stored-value payment methods must use travel_credit`)
  }
}

const customerPortalSchemas = readFileSync(
  resolve(root, "packages/storefront/src/customer-portal/validation-public/common.ts"),
  "utf8",
)
const paymentMethodSchema = customerPortalSchemas.match(
  /customerPortalFinancePaymentMethodSchema\s*=\s*z\.enum\(\[([\s\S]*?)\]\)/,
)?.[1]
if (!paymentMethodSchema || /\bvoucher\b/i.test(paymentMethodSchema)) {
  violations.push(
    "packages/storefront/src/customer-portal/validation-public/common.ts: Finance payment methods must use travel_credit",
  )
}

for (const path of [
  "packages/bookings/src/schema-shared.ts",
  "packages/bookings/src/service-core.ts",
  "packages/bookings-contracts/src/validation-shared.ts",
  "packages/products-contracts/src/validation-shared.ts",
  "packages/products-contracts/src/validation-config.ts",
  "packages/inventory/src/schema-shared.ts",
  "packages/inventory/src/schema-settings.ts",
  "packages/inventory/src/routes-configuration.ts",
  "packages/storefront/src/customer-portal/validation-public/common.ts",
]) {
  const source = readFileSync(resolve(root, path), "utf8")
  for (const pattern of [
    /["']voucher["']/,
    /\bvoucher_required\b/,
    /\bvoucherMessage\b/,
    /\bvoucher_message\b/,
  ]) {
    if (pattern.test(source)) {
      violations.push(`${path}: Service Voucher surfaces must use service_voucher vocabulary`)
    }
  }
}

if (violations.length > 0) {
  process.stderr.write(
    `Travel Credit vocabulary check failed:\n${violations.map((v) => `- ${v}`).join("\n")}\n`,
  )
  process.exit(1)
}

process.stdout.write("Travel Credit vocabulary check passed.\n")

function* walk(directory) {
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry)
    if (statSync(path).isDirectory()) yield* walk(path)
    else if (/\.(?:ts|tsx)$/.test(entry)) yield path
  }
}
