#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"

import { trackedFilesIn } from "./lib/tracked-files.mjs"

const repoRoot = process.cwd()

const retailSpineRoots = [
  {
    area: "Catalog",
    packages: ["@voyant-travel/catalog", "@voyant-travel/catalog-react"],
  },
  {
    area: "Commerce",
    packages: ["@voyant-travel/commerce", "@voyant-travel/commerce-react"],
  },
  {
    area: "Bookings",
    packages: ["@voyant-travel/bookings", "@voyant-travel/bookings-react"],
  },
  {
    area: "Finance",
    packages: ["@voyant-travel/finance", "@voyant-travel/finance-react"],
  },
  {
    area: "Distribution",
    packages: ["@voyant-travel/distribution", "@voyant-travel/distribution-react"],
  },
  {
    area: "Storefront",
    packages: [
      "@voyant-travel/public-api",
      "@voyant-travel/public-api-react",
      "@voyant-travel/public-api-client",
    ],
  },
  {
    area: "Admin surfaces",
    packages: ["@voyant-travel/admin", "@voyant-travel/admin-app", "@voyant-travel/admin-react"],
  },
]

const forbiddenPackages = new Map([
  ["@voyant-travel/inventory", "operated Inventory authoring runtime"],
  ["@voyant-travel/inventory-react", "operated Inventory authoring UI"],
  ["@voyant-travel/products", "operated Inventory authoring runtime"],
  ["@voyant-travel/products-react", "operated Inventory authoring UI"],
  ["@voyant-travel/availability-react", "operated Availability/Operations UI"],
  ["@voyant-travel/resources", "operated Operations runtime"],
  ["@voyant-travel/resources-react", "operated Operations UI"],
  ["@voyant-travel/ground", "operated Operations runtime"],
  ["@voyant-travel/ground-react", "operated Operations UI"],
  ["@voyant-travel/facilities", "operated Operations place/facility schema"],
  ["@voyant-travel/facilities-react", "operated Operations place/facility UI"],
  ["@voyant-travel/operations", "operated Operations runtime"],
  ["@voyant-travel/operations-react", "operated Operations UI"],
  ["@voyant-travel/allocation-ui", "operated Availability allocation UI"],
  ["@voyant-travel/relationships", "mode-optional Relationships runtime"],
  ["@voyant-travel/relationships-react", "mode-optional Relationships UI"],
  ["@voyant-travel/proposals", "mode-optional Proposals runtime"],
  ["@voyant-travel/proposals-react", "mode-optional Proposals UI"],
  ["@voyant-travel/crm", "retired CRM runtime package"],
  ["@voyant-travel/crm-react", "retired CRM UI package"],
  ["@voyant-travel/transactions", "retired runtime Transactions package"],
  ["@voyant-travel/transactions-react", "retired runtime Transactions UI"],
])

const optionalEdgeAllowlist = [
  {
    from: "@voyant-travel/catalog-react",
    type: "peerDependencies",
    to: "@voyant-travel/inventory-react",
    reason: "catalog admin components can attach operated Inventory UI when a host installs it",
  },
  {
    from: "@voyant-travel/commerce-react",
    type: "peerDependencies",
    to: "@voyant-travel/inventory-react",
    reason:
      "Commerce React owner-path components can attach operated Inventory pickers when a host installs them",
  },
  {
    from: "@voyant-travel/distribution-react",
    type: "peerDependencies",
    to: "@voyant-travel/inventory-react",
    reason:
      "Distribution React external-reference owner-path components can attach operated Inventory pickers when a host installs them",
  },
  {
    from: "@voyant-travel/distribution-react",
    type: "peerDependencies",
    to: "@voyant-travel/relationships-react",
    reason:
      "Distribution React admin components can attach Relationships context when a host installs it",
  },
  {
    from: "@voyant-travel/public-api",
    type: "peerDependencies",
    to: "@voyant-travel/relationships",
    reason:
      "Storefront customer-portal subpath can attach Relationships account context when a host installs it",
  },
  {
    from: "@voyant-travel/bookings-react",
    type: "peerDependencies",
    to: "@voyant-travel/operations-react",
    reason:
      "booking admin components can attach operated Operations controls when a host installs them",
  },
  {
    from: "@voyant-travel/bookings-react",
    type: "peerDependencies",
    to: "@voyant-travel/inventory",
    reason:
      "booking admin components can attach operated Inventory runtime capabilities when a host installs them",
  },
  {
    from: "@voyant-travel/bookings-react",
    type: "peerDependencies",
    to: "@voyant-travel/inventory-react",
    reason:
      "booking admin components can attach operated Inventory summaries when a host installs them",
  },
  {
    from: "@voyant-travel/bookings-react",
    type: "peerDependencies",
    to: "@voyant-travel/relationships-react",
    reason: "booking admin components can attach Relationships context when a host installs it",
  },
  {
    from: "@voyant-travel/finance-react",
    type: "peerDependencies",
    to: "@voyant-travel/operations-react",
    reason:
      "finance admin components can attach operated Operations context when a host installs it",
  },
  {
    from: "@voyant-travel/finance-react",
    type: "peerDependencies",
    to: "@voyant-travel/inventory-react",
    reason:
      "finance admin components can attach operated Inventory context when a host installs it",
  },
  {
    from: "@voyant-travel/admin-app",
    type: "peerDependencies",
    to: "@voyant-travel/inventory-react",
    reason:
      "the packaged admin shell can mount operated Inventory owner-path extensions when a host installs them",
  },
]

const dependencyGroups = [
  { type: "dependencies", runtime: true },
  { type: "peerDependencies", runtime: true },
  { type: "optionalDependencies", runtime: true, optional: true },
  { type: "devDependencies", runtime: false },
]

const skipDirs = new Set([".git", ".turbo", ".vite", "coverage", "dist", "node_modules"])

function findPackageJsonFiles(dir) {
  const files = []

  // Enumerate the repository from git: this walked the filesystem, so a git
  // worktree parked in the root put ANOTHER checkout's packages into the
  // closure and the gate reported success while this tree was broken
  // (voyant#4281). See scripts/lib/tracked-files.mjs.
  const tracked = path.resolve(dir) === path.resolve(repoRoot) ? trackedFilesIn(dir) : null
  if (tracked !== null) {
    return tracked
      .filter((file) => file === "package.json" || file.endsWith("/package.json"))
      .map((file) => path.join(repoRoot, file))
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue

    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...findPackageJsonFiles(fullPath))
      continue
    }

    if (entry.name === "package.json") {
      files.push(fullPath)
    }
  }

  return files
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function edgeKey(edge) {
  return `${edge.from}\n${edge.type}\n${edge.to}`
}

function formatEdge(edge) {
  const relativePath = path.relative(repoRoot, edge.packageJsonPath)
  const optional = edge.optional ? " optional" : ""
  return `${relativePath}: ${edge.from} --${edge.type}${optional}--> ${edge.to}`
}

function formatPath(packagePath) {
  return packagePath.join(" -> ")
}

function packageEdges(pkgRecord) {
  const { pkg } = pkgRecord
  const edges = []

  for (const group of dependencyGroups) {
    const deps = pkg[group.type]
    if (!deps || typeof deps !== "object") continue

    for (const depName of Object.keys(deps).sort()) {
      const peerMeta = pkg.peerDependenciesMeta?.[depName]
      const optional =
        group.optional === true ||
        (group.type === "peerDependencies" && peerMeta?.optional === true)

      edges.push({
        from: pkg.name,
        to: depName,
        type: group.type,
        runtime: group.runtime,
        optional,
        packageJsonPath: pkgRecord.packageJsonPath,
      })
    }
  }

  const requiredSchemas = pkg.voyant?.requiresSchemas
  if (Array.isArray(requiredSchemas)) {
    for (const depName of [...requiredSchemas].sort()) {
      edges.push({
        from: pkg.name,
        to: depName,
        type: "voyant.requiresSchemas",
        runtime: true,
        optional: false,
        packageJsonPath: pkgRecord.packageJsonPath,
      })
    }
  }

  return edges
}

const packageJsonFiles = findPackageJsonFiles(repoRoot)
const workspacePackages = new Map()

for (const packageJsonPath of packageJsonFiles) {
  const pkg = readJson(packageJsonPath)
  if (typeof pkg.name !== "string") continue
  if (!pkg.name.startsWith("@voyant-travel/")) continue

  workspacePackages.set(pkg.name, {
    pkg,
    packageJsonPath,
  })
}

const rootPackages = retailSpineRoots.flatMap((root) => root.packages)
const missingRoots = rootPackages.filter((pkgName) => !workspacePackages.has(pkgName))
const allowlistByKey = new Map(optionalEdgeAllowlist.map((entry) => [edgeKey(entry), entry]))
const matchedAllowlistKeys = new Set()

const closure = new Set()
const packagePaths = new Map()
const queue = []
const hardBlockers = []
const unallowlistedOptionalEdges = []
const allowedOptionalEdges = []
const ignoredForbiddenDevEdges = []

for (const pkgName of rootPackages) {
  if (!workspacePackages.has(pkgName)) continue
  if (closure.has(pkgName)) continue

  closure.add(pkgName)
  packagePaths.set(pkgName, [pkgName])
  queue.push(pkgName)
}

for (let index = 0; index < queue.length; index += 1) {
  const pkgName = queue[index]
  const pkgRecord = workspacePackages.get(pkgName)
  const currentPath = packagePaths.get(pkgName) ?? [pkgName]

  for (const edge of packageEdges(pkgRecord)) {
    if (!edge.to.startsWith("@voyant-travel/")) continue

    const isForbidden = forbiddenPackages.has(edge.to)
    const isWorkspacePackage = workspacePackages.has(edge.to)
    const isAllowedOptionalEdge =
      edge.runtime && edge.optional && isForbidden && allowlistByKey.has(edgeKey(edge))

    if (isAllowedOptionalEdge) {
      matchedAllowlistKeys.add(edgeKey(edge))
      allowedOptionalEdges.push({
        edge,
        reason: allowlistByKey.get(edgeKey(edge)).reason,
        packagePath: currentPath,
      })
      continue
    }

    if (edge.runtime && edge.optional && isForbidden) {
      unallowlistedOptionalEdges.push({
        edge,
        reason: forbiddenPackages.get(edge.to),
        packagePath: currentPath,
      })
      continue
    }

    if (edge.runtime && edge.optional) continue

    if (!edge.runtime) {
      if (isForbidden) {
        ignoredForbiddenDevEdges.push({
          edge,
          reason: forbiddenPackages.get(edge.to),
          packagePath: currentPath,
        })
      }
      continue
    }

    if (isForbidden) {
      hardBlockers.push({
        edge,
        reason: forbiddenPackages.get(edge.to),
        packagePath: currentPath,
      })
      continue
    }

    if (!isWorkspacePackage) continue
    if (closure.has(edge.to)) continue

    closure.add(edge.to)
    packagePaths.set(edge.to, [...currentPath, edge.to])
    queue.push(edge.to)
  }
}

const staleAllowlistEntries = optionalEdgeAllowlist.filter(
  (entry) => !matchedAllowlistKeys.has(edgeKey(entry)),
)

const hasFailures =
  missingRoots.length > 0 ||
  hardBlockers.length > 0 ||
  unallowlistedOptionalEdges.length > 0 ||
  staleAllowlistEntries.length > 0

const report = [
  "Retail spine package closure gate",
  "",
  `Roots: ${rootPackages.length} packages across ${retailSpineRoots.length} areas`,
  `Hard runtime closure: ${closure.size} workspace packages`,
  "",
]

function appendSection(title, lines) {
  if (lines.length === 0) {
    return
  }
  report.push(title, ...lines, "")
}

appendSection(
  "Missing configured root packages:",
  missingRoots.map((pkgName) => `  - ${pkgName}`),
)

appendSection(
  "Forbidden hard runtime edges:",
  hardBlockers.flatMap((blocker) => [
    `  - ${formatEdge(blocker.edge)}`,
    `    closure path: ${formatPath(blocker.packagePath)}`,
    `    reason: ${blocker.reason}`,
  ]),
)

appendSection(
  "Forbidden optional runtime edges missing an edge allowlist entry:",
  unallowlistedOptionalEdges.flatMap((blocker) => [
    `  - ${formatEdge(blocker.edge)}`,
    `    closure path: ${formatPath(blocker.packagePath)}`,
    `    reason: ${blocker.reason}`,
  ]),
)

appendSection(
  "Stale optional edge allowlist entries:",
  staleAllowlistEntries.flatMap((entry) => [
    `  - ${entry.from} --${entry.type} optional--> ${entry.to}`,
    `    reason: ${entry.reason}`,
  ]),
)

appendSection(
  "Allowlisted optional edges:",
  allowedOptionalEdges.flatMap((allowed) => [
    `  - ${formatEdge(allowed.edge)}`,
    `    closure path: ${formatPath(allowed.packagePath)}`,
    `    allowlist: ${allowed.reason}`,
  ]),
)

appendSection(
  "Ignored dev/test/type-only edges to forbidden packages:",
  ignoredForbiddenDevEdges.flatMap((ignored) => [
    `  - ${formatEdge(ignored.edge)}`,
    `    closure path: ${formatPath(ignored.packagePath)}`,
    `    reason: ${ignored.reason}`,
  ]),
)

if (hasFailures) {
  report.push(
    "Retail spine closure is not satisfied. Remove hard runtime blockers or convert deliberate adapter/shim links to explicit optional edges.",
  )
  console.error(report.join("\n"))
  process.exit(1)
}

report.push("Verified retail spine package closure.")
console.log(report.join("\n"))
