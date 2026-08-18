/**
 * Keeps the @voyant-travel/operator-standard distribution in sync with the
 * standard product graph and keeps framework dependencies implementation-only.
 * RFC: docs/architecture/consolidated-deployments-rfc.md (Workstream A).
 *
 * The BOM pins exactly the packages selected by the authored standard Operator
 * distribution, plus workspace packages referenced by their manifests, as
 * `workspace:*` deps — pnpm publishes those as the EXACT current version, so the
 * published distribution is a deterministic, tested set. A deployment depends
 * on the one distribution version; `voyant upgrade` bumps it. Only the
 * distribution + actually-changed
 * packages republish, so there's no per-package email spam.
 *
 * This generator rewrites the distribution and framework publish dependencies.
 * The authored distribution and package manifests remain resolver authority;
 * generated dependency metadata is output-only. `--emit` writes; default mode
 * fails on publish dependency drift.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { writeOperatorApplicationManifest } from "./generate-operator-application-manifest.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")
const DISTRIBUTION_PKG = join(ROOT, "packages/operator-standard/package.json")
const FRAMEWORK_PKG = join(ROOT, "packages/framework/package.json")
const DISTRIBUTION = join(ROOT, "packages/operator-standard/src/index.ts")
const EMIT = process.argv.includes("--emit")

const standardPackages = [
  ...readFileSync(DISTRIBUTION, "utf8").matchAll(/resolve:\s*"(@voyant-travel\/[^"/]+)/g),
].map((match) => match[1])
const workspacePackages = readWorkspacePackages()
const manifestReferencePackages = manifestPackageClosure(standardPackages, workspacePackages)
const distributionSourcePackages = sourcePackageReferences(
  join(ROOT, "packages", "operator-standard", "src"),
  workspacePackages,
)
const bomPackages = [
  ...new Set([...standardPackages, ...manifestReferencePackages, ...distributionSourcePackages]),
].sort()
const distributionRuntimeEntryDeps = {
  // The api-key package and Better Auth core are a coupled release train. A
  // lockfile-less starter must not pair api-key 1.6.x with Better Auth 1.7.x:
  // api-key 1.6 imports core exports that 1.7 removed.
  "@better-auth/api-key": "1.6.23",
  "@fontsource-variable/inter-tight": "^5.2.7",
  "@scalar/api-reference-react": "0.9.51",
  "@tailwindcss/vite": "^4.3.2",
  "@tanstack/devtools-vite": "^0.8.1",
  "@tanstack/react-query": "^5.101.2",
  "@tanstack/react-router": "^1.170.17",
  "@tanstack/react-start": "^1.168.27",
  "@vitejs/plugin-react": "^6.0.3",
  "@voyant-travel/admin": "workspace:*",
  "@voyant-travel/admin-app": "workspace:*",
  "@voyant-travel/admin-host": "workspace:*",
  "@voyant-travel/admin-react": "workspace:*",
  "@voyant-travel/auth": "workspace:*",
  "@voyant-travel/auth-react": "workspace:*",
  "@voyant-travel/cloud-sdk": "^0.11.0",
  "@voyant-travel/connect-sdk": "0.9.1",
  "@voyant-travel/core": "workspace:*",
  "@voyant-travel/cruises-react": "workspace:*",
  "@voyant-travel/cruises": "workspace:*",
  "@voyant-travel/db": "workspace:*",
  "@voyant-travel/framework-migrations": "workspace:*",
  "@voyant-travel/identity-react": "workspace:*",
  "@voyant-travel/mcp": "workspace:*",
  "@voyant-travel/voyant-connect-adapter": "workspace:*",
  "@voyant-travel/runtime-core": "workspace:*",
  "@voyant-travel/storage": "workspace:*",
  "@voyant-travel/tools": "workspace:*",
  "@voyant-travel/types": "workspace:*",
  "@voyant-travel/ui": "workspace:*",
  "@voyant-travel/utils": "workspace:*",
  "@voyant-travel/vite-config": "workspace:*",
  "drizzle-orm": "catalog:",
  "better-auth": "1.6.23",
  pg: "^8.22.0",
  react: "^19.2.7",
  "react-dom": "^19.2.7",
  tailwindcss: "^4.3.2",
  "tw-animate-css": "^1.4.0",
  typescript: "catalog:",
}

const frameworkDependencies = {
  "@voyant-travel/action-ledger": "workspace:^",
  "@voyant-travel/cloud-sdk": "^0.11.0",
  "@voyant-travel/connect-sdk": "0.9.1",
  "@voyant-travel/core": "workspace:^",
  "@voyant-travel/cruises": "workspace:^",
  "@voyant-travel/db": "workspace:^",
  "@voyant-travel/framework-migrations": "workspace:^",
  "@voyant-travel/hono": "workspace:^",
  "@voyant-travel/operator-standard": "workspace:^",
  "@voyant-travel/voyant-connect-adapter": "workspace:^",
  "@voyant-travel/runtime-core": "workspace:^",
  "@voyant-travel/storage": "workspace:^",
  "@voyant-travel/tools": "workspace:^",
  "@voyant-travel/types": "workspace:^",
  "@voyant-travel/utils": "workspace:^",
  "drizzle-orm": "catalog:",
  hono: "catalog:",
  pg: "^8.22.0",
  redis: "^6.1.0",
}

// BOM dependencies include every standard product selection owner, not only
// packages with server runtime membership. Otherwise a minimal project cannot
// resolve manifest-only/admin-only selections without repeating dependencies.
const distributionDependencies = {}
for (const name of bomPackages) distributionDependencies[name] = "workspace:*"
for (const name of Object.keys(distributionRuntimeEntryDeps).sort()) {
  distributionDependencies[name] = distributionRuntimeEntryDeps[name]
}

const distributionPkg = JSON.parse(readFileSync(DISTRIBUTION_PKG, "utf-8"))
const frameworkPkg = JSON.parse(readFileSync(FRAMEWORK_PKG, "utf-8"))
const nextDistributionPkg = `${JSON.stringify(
  { ...distributionPkg, dependencies: distributionDependencies },
  null,
  2,
)}\n`
const nextFrameworkPkg = `${JSON.stringify(
  { ...frameworkPkg, dependencies: frameworkDependencies },
  null,
  2,
)}\n`

const violations = []
if (EMIT) {
  writeFileSync(DISTRIBUTION_PKG, nextDistributionPkg)
  writeFileSync(FRAMEWORK_PKG, nextFrameworkPkg)
  writeOperatorApplicationManifest(ROOT)
  console.log(
    `generate-standard-product-distribution: emitted ${bomPackages.length} standard product deps and the operator application manifest`,
  )
} else {
  if (readFileSync(DISTRIBUTION_PKG, "utf-8") !== nextDistributionPkg) {
    violations.push("packages/operator-standard/package.json dependencies are stale")
  }
  if (readFileSync(FRAMEWORK_PKG, "utf-8") !== nextFrameworkPkg) {
    violations.push("packages/framework/package.json implementation dependencies are stale")
  }
  if (writeOperatorApplicationManifest(ROOT, { check: true })) {
    violations.push("apps/operator/package.json is stale")
  }
  if (violations.length) {
    console.error(
      "Standard product distribution drift - run `node scripts/generate-standard-product-distribution.mjs --emit`:",
    )
    for (const v of violations) console.error(`  - ${v}`)
    process.exit(1)
  }
  console.log(`check-standard-product-distribution: OK (${bomPackages.length} product deps)`)
}

function readWorkspacePackages() {
  const packages = new Map()
  for (const root of [join(ROOT, "packages")]) {
    for (const entry of readdirSync(root)) {
      const directory = join(root, entry)
      if (!statSync(directory).isDirectory()) continue
      const packageJson = join(directory, "package.json")
      if (!existsSync(packageJson)) continue
      const name = JSON.parse(readFileSync(packageJson, "utf8")).name
      if (name) packages.set(name, directory)
    }
  }
  return packages
}

function manifestPackageClosure(seedPackages, workspacePackages) {
  const visited = new Set()
  const discovered = new Set()
  const queue = [...new Set(seedPackages)]
  while (queue.length > 0) {
    const packageName = queue.shift()
    if (visited.has(packageName)) continue
    visited.add(packageName)
    const directory = workspacePackages.get(packageName)
    if (!directory) continue
    for (const manifestPath of findManifestFiles(directory)) {
      const source = readFileSync(join(directory, manifestPath), "utf8")
      for (const match of source.matchAll(/["'](@voyant-travel\/[^"'/]+)(?:\/[^"']*)?["']/g)) {
        const referencedPackage = match[1]
        if (!workspacePackages.has(referencedPackage)) continue
        discovered.add(referencedPackage)
        if (!visited.has(referencedPackage)) queue.push(referencedPackage)
      }
    }
  }
  return [...discovered]
}

function sourcePackageReferences(directory, workspacePackages) {
  const references = new Set()
  for (const sourcePath of findSourceFiles(directory)) {
    const source = readFileSync(join(directory, sourcePath), "utf8")
    for (const match of source.matchAll(/["'](@voyant-travel\/[^"'/]+)(?:\/[^"']*)?["']/g)) {
      const packageName = match[1]
      if (
        packageName !== "@voyant-travel/operator-standard" &&
        workspacePackages.has(packageName)
      ) {
        references.add(packageName)
      }
    }
  }
  return [...references]
}

function findManifestFiles(directory, relative = "") {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", "dist", "coverage", ".turbo"].includes(entry.name)) continue
    const nextRelative = join(relative, entry.name)
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...findManifestFiles(path, nextRelative))
    else if (/^(?:voyant|graph-manifest)\.ts$/.test(entry.name)) files.push(nextRelative)
  }
  return files
}

function findSourceFiles(directory, relative = "") {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", "dist", "coverage", ".turbo"].includes(entry.name)) continue
    const nextRelative = join(relative, entry.name)
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...findSourceFiles(path, nextRelative))
    else if (/\.(?:css|js|jsx|ts|tsx)$/.test(entry.name)) files.push(nextRelative)
  }
  return files
}
