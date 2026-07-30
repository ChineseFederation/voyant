import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

const rootIndex = process.argv.indexOf("--root")
const root = path.resolve(rootIndex >= 0 ? process.argv[rootIndex + 1] : ".")
const read = (file) => readFileSync(path.join(root, file), "utf8")
const json = (file) => JSON.parse(read(file))
const violations = []
const ownerContributors = [
  [
    "accommodations",
    "createAccommodationsRuntimePortContribution",
    "catalogAccommodationsRuntimeExtensionPort",
  ],
  ["charters", "createChartersRuntimePortContribution", "catalogChartersRuntimeExtensionPort"],
  ["commerce", "createCommerceRuntimePortContribution", "catalogCommerceRuntimeExtensionPort"],
  ["cruises", "createCruisesRuntimePortContribution", "catalogCruisesRuntimeExtensionPort"],
  [
    "distribution",
    "createDistributionRuntimePortContribution",
    "catalogDistributionRuntimeExtensionPort",
  ],
  ["inventory", "createInventoryRuntimePortContribution", "catalogInventoryRuntimeExtensionPort"],
  [
    "operations",
    "createOperationsRuntimePortContribution",
    "catalogOperationsRuntimeExtensionPort",
  ],
]

const catalog = json("packages/catalog/package.json")
const cyclicPackages = [
  "@voyant-travel/accommodations",
  "@voyant-travel/charters",
  "@voyant-travel/commerce",
  "@voyant-travel/cruises",
  "@voyant-travel/distribution",
  "@voyant-travel/inventory",
  "@voyant-travel/operations",
]

if (
  catalog.voyant?.runtime?.entry !== "./runtime-contributor" ||
  catalog.voyant?.runtime?.export !== "createCatalogRuntimePortContribution"
) {
  violations.push("Catalog must own the manifest-selected runtime contributor")
}
if (!catalog.exports?.["./runtime-contracts"] || !catalog.exports?.["./runtime-contributor"]) {
  violations.push("Catalog must publish its neutral contracts and manifest contributor")
}
if (Object.keys(catalog.exports ?? {}).some((entry) => entry.includes("standard-node"))) {
  violations.push("Catalog must not publish a target-labelled runtime namespace")
}
for (const packageName of cyclicPackages) {
  if (catalog.dependencies?.[packageName] || catalog.optionalDependencies?.[packageName]) {
    violations.push(`Catalog must invert the ${packageName} runtime edge`)
  }
}

const catalogProduction = sourceFiles("packages/catalog/src")
  .filter((file) => !file.endsWith(".test.ts"))
  .map((file) => read(file))
  .join("\n")
for (const packageName of cyclicPackages) {
  const escaped = packageName.replaceAll("/", "\\/").replaceAll("-", "\\-")
  if (
    new RegExp(`(?:from\\s+|import\\s*\\()\\s*["']${escaped}(?:/[^"']*)?["']`).test(
      catalogProduction,
    )
  ) {
    violations.push(`Catalog has a static production import of ${packageName}`)
  }
}

const contracts = read("packages/catalog/src/runtime-contracts.ts")
const contributor = read("packages/catalog/src/runtime-contributor.ts")
const runtime = read("packages/catalog/src/runtime.ts")
for (const token of [
  "CatalogRuntimeExtensions",
  "CatalogRuntimeServices",
  "catalogRuntimeServicesPort",
  "requireCatalogRuntimeServices",
  ...ownerContributors.map(([, , port]) => port),
]) {
  if (!contracts.includes(token)) violations.push(`Catalog runtime contracts are missing ${token}`)
}
for (const token of ["createCatalogRuntimePortContribution", "catalogRuntimeServicesPort.id"]) {
  if (!contributor.includes(token)) violations.push(`Catalog contributor is missing ${token}`)
}
for (const token of ["installCatalogRuntimeServices"]) {
  if (!runtime.includes(token)) violations.push(`Catalog private runtime is missing ${token}`)
}
for (const [, , port] of ownerContributors) {
  const escapedPort = port.replaceAll("$", "\\$")
  const staticPortResolution = new RegExp(
    `host\\.getRuntimePort(?:<[^>]+>)?\\(\\s*${escapedPort}\\s*,?\\s*\\)`,
  )
  if (!staticPortResolution.test(contributor)) {
    violations.push(`Catalog contributor must resolve ${port} through the static host`)
  }
}

const runtimeComposition = [
  "packages/catalog/src/runtime.ts",
  "packages/catalog/src/runtime-contributor.ts",
  ...sourceFiles("packages/catalog/src/runtime").filter((file) => !file.endsWith(".test.ts")),
]
  .map((file) => read(file))
  .join("\n")
  // This integration is resolved while executing a package hold, not while
  // composing the selected graph. Keep arbitrary composition imports forbidden.
  .replace('await import("@voyant-travel/plugin-voyant-connect")', "")
for (const [pattern, label] of [
  [/\bimport\s*\(/, "dynamic import"],
  [/\brequire\s*\(/, "runtime require"],
  [/modules\.import/, "modules.import"],
  [/primitives\.modules/, "primitives.modules"],
]) {
  if (pattern.test(runtimeComposition)) {
    violations.push(`Catalog production runtime composition must not use ${label}`)
  }
}

for (const [directory, exportName] of [
  ["accommodations", "catalogAccommodationsRuntimeExtension"],
  ["charters", "catalogChartersRuntimeExtension"],
  ["commerce", "catalogCommerceRuntimeExtension"],
  ["cruises", "catalogCruisesRuntimeExtension"],
  ["distribution", "catalogDistributionRuntimeExtension"],
  ["inventory", "catalogInventoryRuntimeExtension"],
  ["operations", "catalogOperationsRuntimeExtension"],
]) {
  const manifest = json(`packages/${directory}/package.json`)
  if (!manifest.exports?.["./catalog-runtime-extension"]) {
    violations.push(`${manifest.name} must export its Catalog runtime extension`)
  }
  if (!read(`packages/${directory}/src/catalog-runtime-extension.ts`).includes(exportName)) {
    violations.push(`${manifest.name} must implement ${exportName}`)
  }
}
for (const [directory, factory, port] of ownerContributors) {
  const manifest = json(`packages/${directory}/package.json`)
  const runtimeMetadata = manifest.voyant?.runtime
  if (runtimeMetadata?.entry !== "./runtime-contributor" || runtimeMetadata?.export !== factory) {
    violations.push(`${manifest.name} must declare ${factory} as its runtime contributor`)
  }
  if (!manifest.exports?.["./runtime-contributor"]) {
    violations.push(`${manifest.name} must export ./runtime-contributor`)
  }
  const source = read(`packages/${directory}/src/runtime-contributor.ts`)
  if (!source.includes(`[${port}.id]`)) {
    violations.push(`${manifest.name} contributor must provide ${port}`)
  }
}

const operatorResources = [
  read("packages/runtime/src/index.ts"),
  read("packages/runtime/src/deployment-resources.ts"),
].join("\n")
const runtimeHost = read("packages/core/src/runtime-host.ts")
if (
  /\bmodules\s*:|modules\.import|primitives\.modules/.test(`${runtimeHost}\n${operatorResources}`)
) {
  violations.push("generic host resources must not expose a runtime module loader")
}
if (/loadCatalogRuntime|catalogRuntimeRegistry|catalogCapabilities/.test(operatorResources)) {
  violations.push("the starter must not own Catalog runtime capabilities")
}

const generator = read("packages/framework/src/deployment-artifacts.ts")
for (const token of [
  "GeneratedGraphRuntimeContributorHost",
  "asserts value is VoyantGraphRuntimeContributorHost",
  '"getRuntimePort"',
  "const ports: Record<string, unknown> = { ...(initialRuntimePorts ?? {}) }",
  "const contributorHost = {",
  "contributor(contributorHost)",
  "has multiple static contributors",
]) {
  if (!generator.includes(token)) {
    violations.push(`generated static port composition is missing ${token}`)
  }
}

for (const file of ["packages/typescript-config/dep-paths.json", "pnpm-lock.yaml"]) {
  if (read(file).includes("catalog-node")) violations.push(`${file} retains the retired package`)
}
for (const retired of [
  "release.runtime-packages.generated.json",
  "packages/framework/src/runtime-packages.generated.ts",
  "packages/framework/src/runtime-contributors.generated.ts",
]) {
  if (existsSync(path.join(root, retired))) {
    violations.push(`${retired} is a retired generated resolver input`)
  }
}

if (violations.length) {
  throw new Error(`check-catalog-runtime-authority:\n- ${violations.join("\n- ")}`)
}
console.log(
  "check-catalog-runtime-authority: OK (acyclic Catalog-owned runtime; neutral contracts)",
)

function sourceFiles(relativeDirectory) {
  const directory = path.join(root, relativeDirectory)
  return readdirSync(directory).flatMap((entry) => {
    const relative = path.join(relativeDirectory, entry)
    const absolute = path.join(root, relative)
    return statSync(absolute).isDirectory()
      ? sourceFiles(relative)
      : entry.endsWith(".ts")
        ? [relative]
        : []
  })
}
