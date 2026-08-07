import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const root = argumentPath("--root") ?? scriptRoot
const suppliedStarterDir = argumentPath("--starter-dir")
const standardNodeStarter = readJson(
  join(scriptRoot, "packages", "framework", "src", "standard-node-starter.json"),
)
const generatedRoot = suppliedStarterDir
  ? undefined
  : mkdtempSync(join(tmpdir(), "voyant-starter-gate-"))
const starterDir = suppliedStarterDir ?? join(generatedRoot, "starter")
const violations = []

try {
  if (!suppliedStarterDir) generateStandardStarter(root, generatedRoot, starterDir)
  inspectGeneratedStarter(starterDir)
  inspectRepositoryAuthority(root)

  if (violations.length > 0) {
    console.error("Standard Node starter acceptance check failed:")
    for (const violation of violations) console.error(`- ${violation}`)
    process.exitCode = 1
  } else {
    console.log(
      `check-operator-application: OK (packaged: ${authoredFiles().length} authored files; checked-in: no copied metadata or database authority; CLI-owned lifecycle)`,
    )
  }
} finally {
  if (generatedRoot) rmSync(generatedRoot, { recursive: true, force: true })
}

function generateStandardStarter(repoRoot, outputRoot, destination) {
  const version = "0.0.0-starter-acceptance"
  execFileSync(
    process.execPath,
    [join(repoRoot, "scripts/package-starters.mjs"), "--version", version, "--out-dir", outputRoot],
    { cwd: repoRoot, stdio: "pipe" },
  )
  const archive = join(outputRoot, `voyant-starter-operator-${version}.tar.gz`)
  mkdirSync(destination, { recursive: true })
  execFileSync("tar", ["-xzf", archive, "-C", destination], { stdio: "pipe" })
}

function inspectGeneratedStarter(starterRoot) {
  const expectedDirectories = standardNodeStarter.optionalDirectories
  const expectedFiles = authoredFiles()
  const actualFiles = walkFiles(starterRoot)

  if (actualFiles.join("\n") !== expectedFiles.join("\n")) {
    violations.push(
      `generated authored tree must contain exactly ${expectedFiles.length} files: ${expectedFiles.join(", ")}; found ${actualFiles.join(", ") || "none"}`,
    )
  }
  for (const directory of expectedDirectories) {
    if (!existsSync(join(starterRoot, directory))) {
      violations.push(`generated starter must expose optional project directory ${directory}`)
    }
  }

  for (const forbidden of ["migrations", "openapi"]) {
    if (existsSync(join(starterRoot, forbidden))) {
      violations.push(`generated starter must not contain package-owned ${forbidden}`)
    }
  }
  for (const directory of expectedDirectories) {
    if (
      directory !== dirname(standardNodeStarter.seedEntry) &&
      existsSync(join(starterRoot, directory)) &&
      walkFiles(join(starterRoot, directory)).length > 0
    ) {
      violations.push(`generated project customization directory must start empty: ${directory}`)
    }
  }

  const configPath = join(starterRoot, "voyant.config.ts")
  if (!existsSync(configPath)) {
    violations.push("generated starter must contain voyant.config.ts")
  } else {
    inspectConfig(configPath)
  }

  const packageJsonPath = join(starterRoot, "package.json")
  if (!existsSync(packageJsonPath)) {
    violations.push("generated starter must contain package.json")
  } else {
    inspectPackageJson(packageJsonPath)
  }

  const envExamplePath = join(starterRoot, ".env.example")
  if (
    existsSync(envExamplePath) &&
    !/^DATABASE_URL=postgresql:\/\//m.test(readFileSync(envExamplePath, "utf8"))
  ) {
    violations.push("generated .env.example must declare DATABASE_URL")
  }

  const gitignorePath = join(starterRoot, ".gitignore")
  if (existsSync(gitignorePath)) {
    const entries = readFileSync(gitignorePath, "utf8").split(/\r?\n/).filter(Boolean)
    if (entries.join("\n") !== standardNodeStarter.gitignoreEntries.join("\n")) {
      violations.push(
        `generated .gitignore must match the standard Node starter contract: ${standardNodeStarter.gitignoreEntries.join(", ")}`,
      )
    }
  }

  const authoredSources = actualFiles
    .filter((path) => !["package.json", "voyant.config.ts"].includes(path))
    .map((path) => [path, readFileSync(join(starterRoot, path), "utf8")])
  for (const [path, source] of authoredSources) {
    if (/@voyant-travel\//.test(source)) {
      violations.push(`generated authored source must not name first-party packages: ${path}`)
    }
  }
}

function inspectConfig(configPath) {
  const configSource = readFileSync(configPath, "utf8")
  const expectedConfig = `import { defineConfig } from "@voyant-travel/framework/project"

export default defineConfig({
  deployment: {
    target: "${standardNodeStarter.deploymentTarget}",
    providers: { database: "${standardNodeStarter.databaseProvider}" },
  },
})
`
  if (configSource !== expectedConfig) {
    for (const property of [
      "modules",
      "extensions",
      "plugins",
      "adapters",
      "providers",
      "access",
      "meta",
    ]) {
      if (new RegExp(`\\b${property}\\s*:`).test(configSource)) {
        violations.push(`generated config must not declare ${property}`)
      }
    }
    if (/\b(migrations|mode)\s*:/.test(configSource)) {
      violations.push("generated deployment must not contain migrations or legacy mode policy")
    }
    if (/\bresolve\s*:/.test(configSource)) {
      violations.push("generated config must not repeat standard product selections")
    }
    violations.push(
      "generated voyant.config.ts must match the minimal standard Node config snapshot",
    )
  }
  if (/smartbill/i.test(configSource)) {
    violations.push("generated config must not select or configure SmartBill by default")
  }
}

function inspectPackageJson(packageJsonPath) {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"))
  const expectedScripts = standardNodeStarter.packageScripts
  for (const [name, command] of Object.entries(expectedScripts)) {
    if (packageJson.scripts?.[name] !== command) {
      violations.push(`generated starter script ${name} must be exactly ${JSON.stringify(command)}`)
    }
  }
  if (packageJson.scripts?.["graph:emit"] !== undefined) {
    violations.push("generated starter must not expose graph emission as a package script")
  }
  const firstPartyDependencies = Object.keys({
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  })
    .filter((name) => name.startsWith("@voyant-travel/"))
    .sort()
  const expectedDependencies = [
    ...standardNodeStarter.runtimeDependencies,
    ...standardNodeStarter.developmentDependencies,
  ]
    .filter((name) => name.startsWith("@voyant-travel/"))
    .sort()
  if (firstPartyDependencies.join("\n") !== expectedDependencies.join("\n")) {
    violations.push(
      `generated starter dependencies must expose only admin, CLI, framework, standard product distribution, and generic Node runtime; found ${firstPartyDependencies.join(", ")}`,
    )
  }
  if (packageJson.dependencies?.["@voyant-travel/plugin-smartbill"]) {
    violations.push("generated starter must not install SmartBill by default")
  }
}

function inspectRepositoryAuthority(repoRoot) {
  if (existsSync(join(repoRoot, "packages/cli"))) {
    violations.push(
      "packages/cli must not exist; CLI implementation belongs to the separate voyant-travel/cli repository",
    )
  }

  inspectOperatorApplicationDependencies(repoRoot)
  inspectOperatorApplicationDistribution(repoRoot)

  for (const relativePath of [
    "apps/operator/drizzle.config.ts",
    "apps/operator/drizzle.deployment-migrations.config.ts",
    "apps/operator/drizzle.framework-bundle.config.ts",
    "apps/operator/drizzle.links.generated.ts",
    "apps/operator/drizzle.schemas.generated.ts",
    "apps/operator/migrations",
  ]) {
    if (existsSync(join(repoRoot, relativePath))) {
      violations.push(`operator application must not own database artifact ${relativePath}`)
    }
  }

  for (const relativePath of [
    "apps/operator/scripts/seed-flights-reference.ts",
    "apps/operator/scripts/seed-flights-reference-aircraft.ts",
    "apps/operator/scripts/seed-flights-reference-airlines.ts",
    "apps/operator/scripts/seed-flights-reference-airports.ts",
    "apps/operator/scripts/seed-flights-reference-airports-europe.ts",
    "apps/operator/scripts/seed-flights-reference-airports-global.ts",
    "apps/operator/scripts/seed-flights-reference-types.ts",
  ]) {
    if (existsSync(join(repoRoot, relativePath))) {
      violations.push(`Flights reference fixture must remain package-owned: ${relativePath}`)
    }
  }

  for (const relativePath of [
    "apps/scripts/package.json",
    "apps/operator/scripts/seed.ts",
    "apps/operator/scripts/seed-catalog-verticals.ts",
    "apps/operator/scripts/seed-catalog-verticals.test.ts",
    "apps/operator/scripts/migrate.ts",
    "apps/operator/scripts/migrate.test.ts",
    "apps/operator/scripts/check-deployment-graph-env.ts",
    "apps/operator/scripts/emit-cloud-scheduler.ts",
    "apps/operator/scripts/env-preload.cjs",
  ]) {
    if (existsSync(join(repoRoot, relativePath))) {
      violations.push(`standard starter operational authority must stay deleted: ${relativePath}`)
    }
  }

  for (const relativePath of [
    "apps/operator/scripts/backfill-custom-fields.ts",
    "apps/operator/src/api/lib/catalog-context.ts",
    "apps/operator/src/api/lib/storage.ts",
    "apps/operator/src/api/runtime/payment-config.ts",
    "apps/operator/src/api/runtime/booking-payment-policy-runtime.ts",
    "apps/operator/src/api/runtime/media-runtime.ts",
    "apps/operator/src/api/runtime/operator-workflow-services.ts",
    "apps/operator/src/api/lib/db.ts",
    "apps/operator/src/api/lib/db.test.ts",
    "apps/operator/src/api/auth/cookie-domain.ts",
    "apps/operator/src/api/auth/cookie-domain.test.ts",
  ]) {
    if (existsSync(join(repoRoot, relativePath))) {
      violations.push(`operator application authority must stay deleted: ${relativePath}`)
    }
  }

  for (const relativePath of [
    "apps/operator/env.d.ts",
    "apps/operator/tsconfig.json",
    "apps/operator/tsconfig.client.json",
    "apps/operator/tsconfig.server.json",
    "apps/operator/turbo.json",
    "apps/operator/vite.config.ts",
    "apps/operator/vitest.config.ts",
  ]) {
    if (existsSync(join(repoRoot, relativePath))) {
      violations.push(
        `operator application metadata must stay generated under .voyant: ${relativePath}`,
      )
    }
  }

  const operatorGitignore = join(repoRoot, "apps/operator/.gitignore")
  if (
    !existsSync(operatorGitignore) ||
    !readFileSync(operatorGitignore, "utf8")
      .split(/\r?\n/)
      .some((line) => line === ".voyant" || line === ".voyant/")
  ) {
    violations.push("operator application must ignore disposable .voyant metadata")
  }

  for (const relativePath of [
    "apps/operator/scripts/reindex.ts",
    "apps/operator/scripts/sync-sources.ts",
    "apps/operator/scripts/lib/reindex-stale-documents.ts",
    "apps/operator/scripts/lib/typesense-sdk-client.ts",
    "apps/operator/scripts/lib/build-sync-source-registry.ts",
  ]) {
    if (existsSync(join(repoRoot, relativePath))) {
      violations.push(`Catalog operational authority must stay package-owned: ${relativePath}`)
    }
  }

  const operatorRuntimePath = join(repoRoot, "packages/runtime/src/index.ts")
  const deploymentResourcesPath = join(repoRoot, "packages/runtime/src/deployment-resources.ts")
  const deploymentArtifactsPath = join(repoRoot, "packages/framework/src/deployment-artifacts.ts")
  if (
    existsSync(operatorRuntimePath) &&
    existsSync(deploymentResourcesPath) &&
    existsSync(deploymentArtifactsPath)
  ) {
    const operatorRuntime = readFileSync(operatorRuntimePath, "utf8")
    const deploymentResources = readFileSync(deploymentResourcesPath, "utf8")
    const deploymentArtifacts = readFileSync(deploymentArtifactsPath, "utf8")
    const hasGenericContributorInputs =
      deploymentResources.includes("ports: options.createRuntimePorts({ primitives })") ||
      (deploymentResources.includes("providerPorts?: VoyantGraphRuntimePorts") &&
        deploymentResources.includes("runtimePorts: options.providerPorts"))
    if (
      !operatorRuntime.includes("createRuntimePorts: generated.createRuntimePorts") ||
      !hasGenericContributorInputs
    ) {
      violations.push("packaged starter must boot real statically selected runtime ports")
    }
    if (operatorRuntime.includes("createVoyantGraphRuntimePortStubs")) {
      violations.push("packaged starter must not use fail-on-use runtime port stubs")
    }
    if (!deploymentArtifacts.includes("createRuntimePorts: createGeneratedGraphRuntimePorts")) {
      violations.push("generated project runtime must expose selected contributor composition")
    }
  }

  const distributionPath = join(repoRoot, "packages/operator-standard/src/index.ts")
  const configPath = join(repoRoot, "apps/operator/voyant.config.ts")
  if (existsSync(distributionPath) && existsSync(configPath)) {
    const distributionSource = readFileSync(distributionPath, "utf8")
    const configSource = readFileSync(configPath, "utf8")
    const standardSelections = [...distributionSource.matchAll(/resolve:\s*"([^"]+)"/g)].map(
      (match) => match[1],
    )
    for (const selection of standardSelections) {
      if (configSource.includes(`"${selection}"`)) {
        violations.push(`authored Operator config repeats standard selection ${selection}`)
      }
    }
  }

  if (existsSync(join(repoRoot, "packages/framework/src/composition-lazy.ts"))) {
    violations.push("framework composition-lazy.ts compatibility catalog must stay deleted")
  }
  const retiredResourcesPath = join(
    repoRoot,
    "apps/operator/src/api/runtime/deployment-resources.ts",
  )
  if (existsSync(retiredResourcesPath)) {
    violations.push("application-owned deployment-resources.ts must stay deleted")
  }
  const adapterPath = join(repoRoot, "apps/operator/src/api/runtime/runtime-adapter.ts")
  if (existsSync(adapterPath)) {
    const resources = readFileSync(adapterPath, "utf8")
    for (const symbol of [
      "operatorGraphRuntimeBindings",
      "deploymentLocalExtensions",
      "bindingsFromExtensionFactories",
    ]) {
      if (resources.includes(symbol)) {
        violations.push(`Operator compatibility binding symbol remains: ${symbol}`)
      }
    }
  }
  const artifactPaths = join(repoRoot, "packages/framework/src/project-artifact-paths.ts")
  if (
    existsSync(artifactPaths) &&
    !readFileSync(artifactPaths, "utf8").includes("product-bom.generated.json")
  ) {
    violations.push("project resolver must emit an inspectable product BOM expansion")
  }
}

function inspectOperatorApplicationDependencies(repoRoot) {
  const applicationRoot = join(repoRoot, "apps/operator")
  const packageJsonPath = join(applicationRoot, "package.json")
  if (!existsSync(packageJsonPath)) return

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"))
  const expectedLifecycleScripts = {
    dev: "voyant develop",
    build: "voyant build && node ../../scripts/package-operator-admin-shell.mjs",
    start: "voyant start",
    "db:migrate": "voyant migrate",
  }
  for (const [name, command] of Object.entries(expectedLifecycleScripts)) {
    if (packageJson.scripts?.[name] !== command) {
      violations.push(
        `operator application script ${name} must be exactly ${JSON.stringify(command)}`,
      )
    }
  }
  const declared = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ])
  const importPattern =
    /\b(?:from\s+|import\s*\(\s*|import\s+)["'](@voyant-travel\/[^/"']+)(?:\/[^"']*)?["']/g

  for (const sourcePath of walkFiles(applicationRoot).filter((path) =>
    /\.[cm]?[jt]sx?$/.test(path),
  )) {
    const source = readFileSync(join(applicationRoot, sourcePath), "utf8")
    for (const match of source.matchAll(importPattern)) {
      const packageName = match[1]
      if (!declared.has(packageName)) {
        violations.push(
          `operator application imports undeclared direct dependency ${packageName}: ${sourcePath}`,
        )
      }
    }
  }
}

function inspectOperatorApplicationDistribution(repoRoot) {
  const distributionSourcePath = join(repoRoot, "packages/operator-standard/src/index.ts")
  const distributionPackagePath = join(repoRoot, "packages/operator-standard/package.json")
  const applicationPackagePath = join(repoRoot, "apps/operator/package.json")
  if (
    !existsSync(distributionSourcePath) ||
    !existsSync(distributionPackagePath) ||
    !existsSync(applicationPackagePath)
  ) {
    return
  }

  const distributionSource = readFileSync(distributionSourcePath, "utf8")
  const distributionPackage = JSON.parse(readFileSync(distributionPackagePath, "utf8"))
  const applicationPackage = JSON.parse(readFileSync(applicationPackagePath, "utf8"))
  const standardOwners = new Set(
    [...distributionSource.matchAll(/resolve:\s*"(@voyant-travel\/[^"/]+)/g)].map(
      (match) => match[1],
    ),
  )

  for (const packageName of standardOwners) {
    if (!distributionPackage.dependencies?.[packageName]) {
      violations.push(`standard product distribution must depend on ${packageName}`)
    }
  }
  if (!applicationPackage.dependencies?.["@voyant-travel/operator-standard"]) {
    violations.push("operator application must depend on @voyant-travel/operator-standard")
  }
}

function walkFiles(root) {
  if (!existsSync(root)) return []
  const files = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory).sort()) {
      if ([".voyant", "dist", "node_modules"].includes(entry)) continue
      const path = join(directory, entry)
      if (statSync(path).isDirectory()) visit(path)
      else files.push(relative(root, path))
    }
  }
  visit(root)
  return files.sort()
}

function authoredFiles() {
  return [...standardNodeStarter.rootFiles, standardNodeStarter.seedEntry].sort()
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

function argumentPath(flag) {
  const index = process.argv.indexOf(flag)
  return index >= 0 && process.argv[index + 1] ? resolve(process.argv[index + 1]) : undefined
}
