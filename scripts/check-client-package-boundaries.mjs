import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"

const repoRoot = process.cwd()

const browserRoots = [
  "packages/commerce-react/src",
  "packages/distribution-react/src",
  "packages/finance-react/src",
  "packages/identity-react/src",
  "packages/inventory-react/src",
  "packages/legal-react/src",
  "packages/mice-react/src",
  "packages/notifications-react/src",
  "packages/operations-react/src",
  "packages/storefront-react/src",
  "apps/operator/src/components",
  "apps/operator/src/links",
  "apps/operator/src/routes",
]

const browserFiles = [
  "packages/admin-host/src/workspace.tsx",
  "apps/operator/src/entry.ts",
  "apps/operator/src/lib/admin-presentation.tsx",
  "apps/operator/src/lib/custom-fields.ts",
  "apps/operator/src/lib/observability.ts",
  "apps/operator/src/router.tsx",
  "apps/operator/src/start.ts",
]

const forbiddenImports = [
  {
    module: "@voyant-travel/storefront/customer-portal",
    replacement: "@voyant-travel/storefront/customer-portal/public-validation",
    reason:
      "the customer-portal barrel mixes browser schemas with Hono routes and Node runtime code; browser code must use the validation subpath",
  },
  {
    module: "@voyant-travel/bookings/extras",
    replacement: "@voyant-travel/bookings/extras/validation",
    reason:
      "the bookings extras barrel mixes browser schemas with Hono routes, services, and database schema; browser code must use the validation subpath",
  },
  {
    module: "@voyant-travel/finance",
    replacement: "@voyant-travel/finance/payment-policy",
    reason:
      "the finance root barrel eagerly imports Hono routes and server runtime code; browser code must use a narrow client-safe subpath",
  },
  {
    module: "@voyant-travel/hono/observability",
    replacement: "@voyant-travel/hono/observability/reporter",
    reason:
      "the observability barrel also exports request async context and imports node:async_hooks; reporter-only code must use the reporter subpath",
  },
  {
    module: "@voyant-travel/catalog/booking-engine",
    replacement: "@voyant-travel/catalog-contracts/booking-engine/contracts",
    reason:
      "the catalog booking-engine barrel mixes client contracts with server workflows, persistence, and Hono routes; browser code must import contracts from the contracts package",
  },
  {
    module: "@voyant-travel/notifications",
    replacement:
      "@voyant-travel/notifications/validation or @voyant-travel/notifications/template-authoring",
    reason:
      "the notifications root barrel mixes client schemas and authoring metadata with server routes, tasks, and services; browser code must use a narrow client-safe subpath",
  },
  {
    module: "@voyant-travel/commerce",
    replacement: "@voyant-travel/commerce/validation",
    reason:
      "the commerce root barrel mixes client schemas with checkout, workflow, route, and booking-engine runtime code; browser code must use narrow validation subpaths",
  },
  {
    module: "@voyant-travel/identity",
    replacement: "@voyant-travel/identity/validation",
    reason:
      "the identity root barrel mixes client schemas with Hono routes and services; browser code must use the validation subpath",
  },
  {
    module: "@voyant-travel/operations",
    replacement:
      "@voyant-travel/operations/validation, @voyant-travel/operations/scheduling, or @voyant-travel/operations/linkables",
    reason:
      "the operations root and section barrels mix client schemas/static metadata with Hono routes and services; browser code must use narrow client-safe subpaths",
  },
  {
    module: "@voyant-travel/distribution",
    replacement: "@voyant-travel/distribution/validation or @voyant-travel/distribution/linkables",
    reason:
      "the distribution root barrel mixes client schemas/static metadata with routes, services, and job runtime code; browser code must use narrow client-safe subpaths",
  },
  {
    module: "@voyant-travel/mice",
    replacement: "@voyant-travel/mice/validation or @voyant-travel/mice/linkables",
    reason:
      "the mice root barrel mixes client schemas/static metadata with Hono routes and services; browser code must use narrow client-safe subpaths",
  },
  {
    module: "@voyant-travel/accommodations",
    replacement: "@voyant-travel/accommodations/linkables",
    reason:
      "the accommodations root barrel mixes static linkables with booking-engine, route, and service runtime code; browser code must use the linkables subpath",
  },
  {
    module: "@voyant-travel/bookings",
    replacement: "@voyant-travel/bookings/linkables",
    reason:
      "the bookings root barrel mixes static linkables with route, task, and service runtime code; browser code must use the linkables subpath",
  },
  {
    module: "@voyant-travel/legal",
    replacement:
      "@voyant-travel/legal/linkables, @voyant-travel/legal/contracts/template-authoring, or a narrow legal validation subpath",
    reason:
      "the legal root barrel mixes static linkables with route and document-generation runtime code; browser code must use narrow client-safe subpaths",
  },
  {
    module: "@voyant-travel/legal/contracts",
    replacement:
      "@voyant-travel/legal/contracts/linkables, @voyant-travel/legal/contracts/template-authoring, or @voyant-travel/legal/contracts/validation",
    reason:
      "the legal contracts barrel mixes client metadata with routes, services, document generation, and action-ledger runtime code; browser code must use narrow client-safe subpaths",
  },
  {
    module: "@voyant-travel/proposals",
    replacement: "@voyant-travel/proposals/linkables",
    reason:
      "the proposals root barrel mixes static linkables with route and proposal runtime code; browser code must use the linkables subpath",
  },
  {
    module: "@voyant-travel/relationships",
    replacement:
      "@voyant-travel/relationships/linkables, @voyant-travel/relationships/custom-fields-registry, or @voyant-travel/relationships/validation",
    reason:
      "the relationships root barrel mixes client schemas/static helpers with Hono routes and services; browser code must use narrow client-safe subpaths",
  },
  {
    module: "@voyant-travel/inventory",
    replacement: "@voyant-travel/inventory/linkables or a narrow inventory validation subpath",
    reason:
      "the inventory root barrel mixes static linkables with product routes, booking-engine, and service runtime code; browser code must use narrow client-safe subpaths",
  },
]

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx"])
const violations = []

for (const root of browserRoots) {
  collectSourceFiles(path.join(repoRoot, root)).forEach(checkFile)
}

for (const file of browserFiles) {
  const fullPath = path.join(repoRoot, file)
  if (existsSync(fullPath)) checkFile(fullPath)
}

function collectSourceFiles(dir) {
  if (!existsSync(dir)) return []

  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".turbo") {
      continue
    }

    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath))
      continue
    }

    if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(fullPath)
    }
  }
  return files
}

function checkFile(file) {
  const source = readFileSync(file, "utf8")
  for (const forbidden of forbiddenImports) {
    for (const match of findStaticImports(source, forbidden.module)) {
      if (match.typeOnly) continue
      violations.push({
        file: path.relative(repoRoot, file),
        line: lineOf(source, match.index),
        module: forbidden.module,
        replacement: forbidden.replacement,
        reason: forbidden.reason,
      })
    }
  }
}

function findStaticImports(source, moduleName) {
  const imports = []
  const escapedModule = moduleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(
    `(^|\\n)\\s*import\\s+((?:(?!\\n\\s*import\\s)[\\s\\S])*?)\\s+from\\s+["']${escapedModule}["']`,
    "g",
  )

  let match = pattern.exec(source)
  while (match !== null) {
    const clause = match[2]?.trim() ?? ""
    imports.push({
      index: match.index + (match[1] === "\n" ? 1 : 0),
      typeOnly: clause.startsWith("type "),
    })
    match = pattern.exec(source)
  }

  return imports
}

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length
}

if (violations.length > 0) {
  console.error("Client package boundary check failed:\n")
  for (const violation of violations) {
    console.error(`  - ${violation.file}:${violation.line}`)
    console.error(`    imports ${violation.module}`)
    console.error(`    use ${violation.replacement} instead`)
    console.error(`    ${violation.reason}`)
  }
  console.error("\nKeep browser-facing code on client-safe package subpaths.")
  process.exit(1)
}

console.log("check-client-package-boundaries: OK")
