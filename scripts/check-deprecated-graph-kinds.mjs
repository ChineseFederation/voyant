import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const workspaceRoots = ["packages", "apps", "examples"]
const targetByPackage = new Map([["@voyant-travel/plugin-smartbill", "remote app"]])

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
    const target = targetByPackage.get(entry.name) ?? inferTarget(entry.name)
    console.log(
      `[deprecated-kind] ${entry.name} declares voyant.kind "plugin" in ${entry.relativePath}; RFC target: ${target}.`,
    )
  }
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
