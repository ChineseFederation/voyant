/**
 * Fail when an operator can write something through the admin API that no agent
 * Tool exposes.
 *
 * `check-agent-tool-coverage` asks whether a module has Tools at all. That is
 * not the same question: `@voyant-travel/proposals` shipped seven Tools and still
 * had no way to create a Proposal, so an agent could send and accept a Proposal
 * Version it could never build. Read Tools passing for write coverage is how the
 * same gap reached production three times.
 *
 * Run with `--report` for the full matrix.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

import {
  adminWriteOperationsFromDocuments,
  checkAgentWriteCoverageRatchet,
  formatAgentWriteCoverageMarkdown,
  inspectAgentWriteCoverage,
} from "./lib/agent-write-coverage.mjs"

const BASELINE_PATH = "scripts/agent-write-coverage-baseline.json"

/**
 * Admin write resources that deliberately have no Tool. Each entry is keyed
 * `<module unit id>:<resource key>` and must say why. Prefer lowering a
 * module's baseline over adding entries here; this is for resources that will
 * never be an agent surface, not for a backlog.
 */
const ALLOWLIST = new Map<string, { rationale: string }>([
  [
    "@voyant-travel/auth:storefront/channel-binding",
    {
      rationale:
        "Storefront channel binding is a deployment-owned cutover control; keep it human-admin only until a reviewed agent Tool workflow exists.",
    },
  ],
  [
    "@voyant-travel/distribution:distribution/product-publication",
    {
      rationale:
        "Publication policy changes are high-impact merchandising controls; they remain human-admin only while durable reindexing owns propagation.",
    },
  ],
  [
    "@voyant-travel/distribution:distribution/supplier-publication",
    {
      rationale:
        "Supplier publication policy changes are high-impact merchandising controls; they remain human-admin only while durable reindexing owns propagation.",
    },
  ],
  [
    "@voyant-travel/distribution:distribution/publication/effective",
    {
      rationale:
        "Effective publication preview is an admin validation surface for publication policy and is intentionally not a write Tool.",
    },
  ],
])

void main()

async function main() {
  const rootArg = process.argv.indexOf("--root")
  const repoRoot = rootArg >= 0 ? path.resolve(process.argv[rootArg + 1] ?? "") : process.cwd()
  const report = process.argv.includes("--report")
  const writeBaseline = process.argv.includes("--update-baseline")
  const modules = await loadWorkspaceModules(repoRoot)
  const { diagnostics, rows } = inspectAgentWriteCoverage(modules, { allowlist: ALLOWLIST })

  if (writeBaseline) {
    const counts: Record<string, number> = {}
    for (const row of rows) {
      if (row.posture !== "uncovered") continue
      counts[row.unitId] = (counts[row.unitId] ?? 0) + 1
    }
    const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
    writeFileSync(path.join(repoRoot, BASELINE_PATH), `${JSON.stringify(sorted, null, 2)}\n`)
    console.log(`Wrote ${BASELINE_PATH} (${Object.keys(sorted).length} modules)`)
    return
  }

  if (report) {
    process.stdout.write(formatAgentWriteCoverageMarkdown(rows))
  }

  const baseline = JSON.parse(readFileSync(path.join(repoRoot, BASELINE_PATH), "utf8")) as Record<
    string,
    number
  >
  const all = [...diagnostics, ...checkAgentWriteCoverageRatchet(rows, baseline)]

  if (all.length > 0) {
    console.error(`\nAgent write coverage check failed (${all.length}):\n`)
    for (const diagnostic of all) console.error(`- ${diagnostic}`)
    process.exitCode = 1
    return
  }

  if (!report) {
    const covered = rows.filter((row) => row.posture === "covered").length
    const uncovered = rows.filter((row) => row.posture === "uncovered").length
    console.log(
      `Agent write coverage: OK (${covered} covered, ${uncovered} uncovered at baseline). Run with --report for the matrix.`,
    )
  }
}

async function loadWorkspaceModules(root: string) {
  const packagesRoot = path.join(root, "packages")
  const modules = []

  for (const packageDirectory of findPackageDirectories(packagesRoot)) {
    const packageJson = JSON.parse(
      readFileSync(path.join(packageDirectory, "package.json"), "utf8"),
    ) as {
      name?: string
      exports?: Record<string, unknown>
      voyant?: { kind?: string; manifest?: string }
    }
    if (!packageJson.name?.startsWith("@voyant-travel/") || !packageJson.voyant?.manifest) continue

    const adminWriteOperations = adminWriteOperationsFromDocuments(
      readAdminDocuments(packageDirectory),
    )
    if (adminWriteOperations.length === 0) continue

    const target = packageExportTarget(packageJson.exports?.[packageJson.voyant.manifest])
    if (!target) continue
    const loaded = (await import(
      pathToFileURL(path.resolve(packageDirectory, target)).href
    )) as Record<string, unknown>

    const tools = []
    for (const value of Object.values(loaded)) {
      if (!isRecord(value) || !Array.isArray(value.tools)) continue
      for (const tool of value.tools) {
        if (isRecord(tool) && typeof tool.name === "string") {
          tools.push({
            id: String(tool.id ?? tool.name),
            name: tool.name,
            requiredScopes: Array.isArray(tool.requiredScopes)
              ? tool.requiredScopes.map(String)
              : [],
          })
        }
      }
    }

    modules.push({
      packageName: packageJson.name,
      unitId: packageJson.name,
      tools,
      adminWriteOperations,
    })
  }

  return modules
}

function readAdminDocuments(packageDirectory: string) {
  const adminDirectory = path.join(packageDirectory, "openapi", "admin")
  if (!existsSync(adminDirectory)) return []
  return readdirSync(adminDirectory)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => JSON.parse(readFileSync(path.join(adminDirectory, entry), "utf8")))
}

function findPackageDirectories(root: string): string[] {
  const directories = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "node_modules" || entry.name === "dist") continue
    const directory = path.join(root, entry.name)
    if (existsSync(path.join(directory, "package.json"))) directories.push(directory)
    else directories.push(...findPackageDirectories(directory))
  }
  return directories.sort()
}

function packageExportTarget(value: unknown): string | undefined {
  if (typeof value === "string") return value
  if (!isRecord(value)) return undefined
  for (const condition of ["development", "import", "default", "types", "require"]) {
    const target = packageExportTarget(value[condition])
    if (target) return target
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
