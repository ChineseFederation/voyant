import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { getTableName, isTable } from "drizzle-orm/table"

type TemporaryPackageKind = "facade" | "orphan"

interface TemporaryPackage {
  name: string
  kind: TemporaryPackageKind
  owner: string
  ownerDependencies: string[]
}

const repoRoot = process.cwd()
const failOnTemporary = process.argv.includes("--fail-on-temporary")

const skipDirs = new Set([".git", ".turbo", ".wrangler", "coverage", "dist", "node_modules"])

const sourceExtensions = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"])

const removedRuntimePackages = [
  "@voyant-travel/checkout",
  "@voyant-travel/checkout-react",
  "@voyant-travel/crm",
  "@voyant-travel/crm-react",
  "@voyant-travel/transactions",
  "@voyant-travel/transactions-react",
  "@voyant-travel/travel-composer",
  "@voyant-travel/travel-composer-react",
]

function packageList(value: string): TemporaryPackage[] {
  return value
    .trim()
    .split("\n")
    .map((line) => {
      const [name, kind, owner, ownerDependencies] = line.trim().split("|")
      if (!name || (kind !== "facade" && kind !== "orphan") || !owner || !ownerDependencies) {
        throw new Error(`Invalid temporary package row: ${line}`)
      }
      return {
        name,
        kind,
        owner,
        ownerDependencies: ownerDependencies.split(","),
      }
    })
}

const temporaryPackages = packageList(`
  @voyant-travel/allocation-ui|orphan|@voyant-travel/operations-react/availability/allocation|@voyant-travel/operations-react
  @voyant-travel/availability-react|facade|@voyant-travel/operations-react/availability|@voyant-travel/operations-react
  @voyant-travel/booking-requirements|orphan|@voyant-travel/bookings/requirements|@voyant-travel/bookings
  @voyant-travel/booking-requirements-react|orphan|@voyant-travel/bookings-react/requirements|@voyant-travel/bookings-react
  @voyant-travel/customer-portal|orphan|@voyant-travel/storefront/customer-portal|@voyant-travel/storefront
  @voyant-travel/customer-portal-react|orphan|@voyant-travel/storefront-react/customer-portal|@voyant-travel/storefront-react
  @voyant-travel/external-refs|facade|@voyant-travel/distribution/external-refs|@voyant-travel/distribution
  @voyant-travel/external-refs-react|facade|@voyant-travel/distribution-react/external-refs|@voyant-travel/distribution-react
  @voyant-travel/extras|orphan|@voyant-travel/inventory/extras + @voyant-travel/bookings/extras|@voyant-travel/inventory,@voyant-travel/bookings
  @voyant-travel/extras-react|orphan|@voyant-travel/inventory-react/extras + @voyant-travel/bookings-react/extras|@voyant-travel/inventory-react,@voyant-travel/bookings-react
  @voyant-travel/facilities|orphan|@voyant-travel/operations/places|@voyant-travel/operations
  @voyant-travel/facilities-react|orphan|@voyant-travel/operations-react/places|@voyant-travel/operations-react
  @voyant-travel/ground|orphan|@voyant-travel/operations/ground|@voyant-travel/operations
  @voyant-travel/ground-react|orphan|@voyant-travel/operations-react/ground|@voyant-travel/operations-react
  @voyant-travel/markets|facade|@voyant-travel/commerce/markets|@voyant-travel/commerce
  @voyant-travel/markets-react|facade|@voyant-travel/commerce-react/markets|@voyant-travel/commerce-react
  @voyant-travel/places|orphan|@voyant-travel/operations/places|@voyant-travel/operations
  @voyant-travel/places-react|orphan|@voyant-travel/operations-react/places|@voyant-travel/operations-react
  @voyant-travel/pricing|facade|@voyant-travel/commerce/pricing|@voyant-travel/commerce
  @voyant-travel/pricing-react|facade|@voyant-travel/commerce-react/pricing|@voyant-travel/commerce-react
  @voyant-travel/products|facade|@voyant-travel/inventory|@voyant-travel/inventory
  @voyant-travel/products-react|facade|@voyant-travel/inventory-react|@voyant-travel/inventory-react
  @voyant-travel/promotions|facade|@voyant-travel/commerce/promotions|@voyant-travel/commerce
  @voyant-travel/promotions-react|facade|@voyant-travel/commerce-react/promotions|@voyant-travel/commerce-react
  @voyant-travel/resources|facade|@voyant-travel/operations/resources|@voyant-travel/operations
  @voyant-travel/resources-react|facade|@voyant-travel/operations-react/resources|@voyant-travel/operations-react
  @voyant-travel/sellability|facade|@voyant-travel/commerce/sellability|@voyant-travel/commerce
  @voyant-travel/sellability-react|facade|@voyant-travel/commerce-react/sellability|@voyant-travel/commerce-react
  @voyant-travel/suppliers|facade|@voyant-travel/distribution/suppliers|@voyant-travel/distribution
  @voyant-travel/suppliers-react|facade|@voyant-travel/distribution-react/suppliers|@voyant-travel/distribution-react
`)

const temporaryOwnerExports = new Map<string, string[]>([
  ["@voyant-travel/commerce", []],
  ["@voyant-travel/operations", []],
  ["@voyant-travel/distribution", []],
])

const temporaryOwnerExportPrefixes = new Map<string, string[]>([
  ["@voyant-travel/commerce", ["./markets", "./pricing", "./promotions", "./sellability"]],
  ["@voyant-travel/operations", ["./availability", "./resources", "./ground", "./places"]],
  [
    "@voyant-travel/distribution",
    ["./booking-extension", "./channel-push", "./suppliers", "./external-refs"],
  ],
])

function findPackageJsonFiles(dir: string): string[] {
  const files: string[] = []
  if (!fs.existsSync(dir)) return files

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue

    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...findPackageJsonFiles(fullPath))
      continue
    }

    if (entry.name === "package.json") files.push(fullPath)
  }

  return files
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>
}

function dependencyNames(pkg: Record<string, unknown>) {
  const names = new Set<string>()
  for (const field of [
    "dependencies",
    "peerDependencies",
    "optionalDependencies",
    "devDependencies",
  ]) {
    const deps = pkg[field]
    if (!deps || typeof deps !== "object") continue
    for (const name of Object.keys(deps)) names.add(name)
  }
  return names
}

function walkSourceFiles(dir: string, files: string[] = []) {
  if (!fs.existsSync(dir)) return files

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue

    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkSourceFiles(fullPath, files)
      continue
    }

    if (sourceExtensions.has(path.extname(entry.name))) files.push(fullPath)
  }

  return files
}

function packageImportPatterns(packageName: string) {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const specifier = `["']${escaped}(?:/[^"']*)?["']`
  return [
    new RegExp(`\\bfrom\\s+${specifier}`),
    new RegExp(`\\bimport\\s+${specifier}`),
    new RegExp(`\\bimport\\s*\\(\\s*${specifier}\\s*\\)`),
    new RegExp(`\\brequire\\s*\\(\\s*${specifier}\\s*\\)`),
  ]
}

function findSourceImporters(packageName: string, ownPackageJsonPath: string | undefined) {
  const ownPackageDir = ownPackageJsonPath ? path.dirname(ownPackageJsonPath) : undefined
  const searchRoots = ["packages", "apps", "scripts"]
    .map((entry) => path.join(repoRoot, entry))
    .filter((entry) => fs.existsSync(entry))
  const patterns = packageImportPatterns(packageName)
  const importers: string[] = []

  for (const root of searchRoots) {
    for (const filePath of walkSourceFiles(root)) {
      if (
        ownPackageDir &&
        (filePath === ownPackageDir || filePath.startsWith(`${ownPackageDir}${path.sep}`))
      ) {
        continue
      }
      const source = fs.readFileSync(filePath, "utf8")
      if (patterns.some((pattern) => pattern.test(source)))
        importers.push(path.relative(repoRoot, filePath))
    }
  }

  return importers.sort()
}

function exportKeys(value: unknown) {
  if (!value || typeof value !== "object") return []
  return Object.keys(value as Record<string, unknown>).sort()
}

function isTemporaryOwnerExport(packageName: string, exportKey: string) {
  const prefixes = temporaryOwnerExportPrefixes.get(packageName) ?? []
  return prefixes.some((prefix) => exportKey === prefix || exportKey.startsWith(`${prefix}/`))
}

function collectTableNames(module: Record<string, unknown>) {
  return new Set(
    Object.values(module)
      .filter((value) => isTable(value))
      .map((value) => getTableName(value))
      .sort(),
  )
}

function diffSet(left: Set<string>, right: Set<string>) {
  return [...left].filter((entry) => !right.has(entry)).sort()
}

function formatList(entries: string[]) {
  return entries.length === 0 ? "(none)" : entries.join(", ")
}

async function importSchemaFile(relativePath: string) {
  const filePath = path.join(repoRoot, relativePath)
  if (!fs.existsSync(filePath)) return undefined
  return (await import(pathToFileURL(filePath).href)) as Record<string, unknown>
}

async function main() {
  const packageJsonFiles = findPackageJsonFiles(path.join(repoRoot, "packages"))
  const packagesByName = new Map<
    string,
    { packageJsonPath: string; pkg: Record<string, unknown> }
  >()

  for (const packageJsonPath of packageJsonFiles) {
    const pkg = readJson(packageJsonPath)
    if (typeof pkg.name === "string") {
      packagesByName.set(pkg.name, { packageJsonPath, pkg })
    }
  }

  const problems: string[] = []
  const presentTemporaryPackages: TemporaryPackage[] = []
  const presentTemporaryExports: Array<{ packageName: string; exportKey: string; source: string }> =
    []

  for (const packageName of removedRuntimePackages) {
    const existing = packagesByName.get(packageName)
    if (existing) {
      problems.push(
        `${path.relative(repoRoot, existing.packageJsonPath)}: ${packageName} is retired and must not re-enter the workspace`,
      )
    }
  }

  for (const temporaryPackage of temporaryPackages) {
    const existing = packagesByName.get(temporaryPackage.name)
    if (!existing) continue

    presentTemporaryPackages.push(temporaryPackage)

    const deps = dependencyNames(existing.pkg)
    if (!temporaryPackage.ownerDependencies.some((dependencyName) => deps.has(dependencyName))) {
      problems.push(
        `${path.relative(repoRoot, existing.packageJsonPath)}: ${temporaryPackage.name} is a temporary ${temporaryPackage.kind} for ${temporaryPackage.owner}, but does not depend on one of ${temporaryPackage.ownerDependencies.join(", ")}`,
      )
    }

    if (temporaryPackage.kind === "orphan") {
      const importers = findSourceImporters(temporaryPackage.name, existing.packageJsonPath)
      if (importers.length > 0) {
        problems.push(
          `${temporaryPackage.name} is classified as a zero-importer orphan but is still imported by ${formatList(importers)}`,
        )
      }
    }
  }

  for (const [packageName, allowedTemporaryExports] of temporaryOwnerExports) {
    const existing = packagesByName.get(packageName)
    if (!existing) {
      problems.push(
        `${packageName} owns temporary export cleanup entries but the package is missing`,
      )
      continue
    }

    const allowed = new Set(allowedTemporaryExports)
    for (const [sourceName, exportContainer] of [
      ["exports", existing.pkg.exports],
      [
        "publishConfig.exports",
        (existing.pkg.publishConfig as Record<string, unknown> | undefined)?.exports,
      ],
    ] as const) {
      for (const exportKey of exportKeys(exportContainer)) {
        if (!isTemporaryOwnerExport(packageName, exportKey)) continue
        if (!allowed.has(exportKey)) {
          problems.push(
            `${path.relative(repoRoot, existing.packageJsonPath)}: ${sourceName} contains unclassified temporary owner export ${exportKey}`,
          )
          continue
        }
        presentTemporaryExports.push({ packageName, exportKey, source: sourceName })
      }
    }
  }

  const legacyExtrasSchema = await importSchemaFile("packages/extras/src/schema.ts")
  const inventoryExtrasSchema = await importSchemaFile("packages/inventory/src/extras/schema.ts")
  const bookingsExtrasSchema = await importSchemaFile("packages/bookings/src/extras/schema.ts")
  const legacyExtrasTables = legacyExtrasSchema
    ? collectTableNames(legacyExtrasSchema)
    : new Set<string>()

  if (packagesByName.has("@voyant-travel/extras") && !legacyExtrasSchema) {
    problems.push("@voyant-travel/extras exists but packages/extras/src/schema.ts is missing")
  }

  if (legacyExtrasSchema) {
    if (!inventoryExtrasSchema) {
      problems.push(
        "Inventory extras owner schema is missing at packages/inventory/src/extras/schema.ts",
      )
    }
    if (!bookingsExtrasSchema) {
      problems.push(
        "Bookings extras owner schema is missing at packages/bookings/src/extras/schema.ts",
      )
    }

    const ownerExtrasTables = new Set([
      ...collectTableNames(inventoryExtrasSchema ?? {}),
      ...collectTableNames(bookingsExtrasSchema ?? {}),
    ])
    const legacyOnlyExtrasTables = diffSet(legacyExtrasTables, ownerExtrasTables)
    const ownerOnlyExtrasTables = diffSet(ownerExtrasTables, legacyExtrasTables)

    if (legacyExtrasTables.size === 0) {
      problems.push("@voyant-travel/extras legacy schema does not export any Drizzle tables")
    }

    if (legacyOnlyExtrasTables.length > 0 || ownerOnlyExtrasTables.length > 0) {
      problems.push(
        [
          "@voyant-travel/extras legacy schema table names must exactly mirror Inventory/Bookings extras owner tables.",
          `legacy-only: ${formatList(legacyOnlyExtrasTables)}`,
          `owner-only: ${formatList(ownerOnlyExtrasTables)}`,
        ].join(" "),
      )
    }
  }

  if (failOnTemporary) {
    for (const temporaryPackage of presentTemporaryPackages) {
      problems.push(
        `${temporaryPackage.name} still exists as a temporary ${temporaryPackage.kind}; remove it or explicitly reclassify it before v1`,
      )
    }

    const temporaryExportSummaries = [
      ...new Set(presentTemporaryExports.map((entry) => `${entry.packageName}${entry.exportKey}`)),
    ].sort()
    for (const summary of temporaryExportSummaries) {
      problems.push(`${summary} is still exported as a temporary owner-path subpath`)
    }
  }

  if (problems.length > 0) {
    console.error("V1 package cleanup gate failed:\n")
    for (const problem of problems) {
      console.error(`  - ${problem}`)
    }
    process.exit(1)
  }

  console.log("V1 package cleanup gate")
  console.log(
    `  temporary wrappers/facades inventoried: ${presentTemporaryPackages.length} (${presentTemporaryPackages.filter((entry) => entry.kind === "orphan").length} orphan, ${presentTemporaryPackages.filter((entry) => entry.kind === "facade").length} facade)`,
  )
  console.log(`  temporary owner subpath exports inventoried: ${presentTemporaryExports.length}`)
  console.log(`  legacy extras schema tables: ${formatList([...legacyExtrasTables].sort())}`)
  console.log(
    failOnTemporary
      ? "  strict mode: no temporary package or owner subpath exports remain"
      : "  normal mode: temporary surfaces are explicit; run with --fail-on-temporary for the v1 release cut",
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
