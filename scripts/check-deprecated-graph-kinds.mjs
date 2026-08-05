import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

// RFC #3395 retired "plugin" as a classification. Every workspace package has
// migrated to its actual deployment role, so this check is a denial rather than
// the warn-only nudge it was during the migration: a workspace package may not
// declare voyant.kind "plugin" again.
//
// The graph runtime still *recognizes* the kind — `VoyantGraphUnitKind` and the
// `voyant.plugin.v1` lowering path stay for external packages that have not
// migrated. This check governs what lives in this repository.
const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const workspaceRoots = ["packages", "apps", "examples"]

// `--root <dir>` scans somewhere other than this repository. Only the vacuity
// test uses it, so the checker can be proven to still go red without dropping
// probe files into a real workspace package.
const repoRoot = parseRootFlag(process.argv.slice(2)) ?? defaultRepoRoot

const deprecated = []
for (const root of workspaceRoots) {
  const absolute = path.join(repoRoot, root)
  if (existsSync(absolute)) collectDeprecatedPluginPackages(absolute, deprecated)
}

deprecated.sort((left, right) => left.name.localeCompare(right.name))

if (deprecated.length === 0) {
  console.log('[deprecated-kind] OK: no workspace packages declare voyant.kind "plugin".')
} else {
  for (const entry of deprecated) {
    console.error(
      `[deprecated-kind] ${entry.name} declares voyant.kind "plugin" in ${entry.relativePath}; ` +
        `declare its actual deployment role instead: ${inferTarget(entry.name)}.`,
    )
  }
  console.error(
    "[deprecated-kind] See docs/architecture/module-provider-plugin-taxonomy.md section 6.",
  )
  process.exitCode = 1
}

/** Returns the `--root` value, or undefined when the flag is absent or unpaired. */
function parseRootFlag(argv) {
  const index = argv.indexOf("--root")
  if (index === -1) return undefined
  const value = argv[index + 1]
  if (value === undefined || value.startsWith("--")) {
    console.error("[deprecated-kind] --root requires a directory argument.")
    process.exit(2)
  }
  return path.resolve(value)
}

function collectDeprecatedPluginPackages(directory, result) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || ["dist", "node_modules", "coverage"].includes(entry.name)) {
      continue
    }

    const child = path.join(directory, entry.name)
    const packageJsonPath = path.join(child, "package.json")
    if (existsSync(packageJsonPath)) {
      inspectPackage(packageJsonPath, result)
    } else {
      collectDeprecatedPluginPackages(child, result)
    }
  }
}

function inspectPackage(packageJsonPath, result) {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"))
  if (packageJson?.voyant?.kind !== "plugin") return
  result.push({
    name: packageJson.name ?? "(unnamed)",
    relativePath: path.relative(repoRoot, packageJsonPath).split(path.sep).join("/"),
  })
}

function inferTarget(packageName) {
  if (/(?:payment|payments|search|storage|cms)/i.test(packageName)) return "adapter or provider"
  if (/(?:crm|accounting|smartbill|remote-sync)/i.test(packageName)) return "remote app"
  return "adapter, provider, extension, module, or remote app"
}
