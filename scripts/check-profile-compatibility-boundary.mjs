import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const violations = []

const graphNativeFiles = [
  "packages/framework/src/index.ts",
  "packages/framework/src/deployment-artifacts.ts",
  "packages/framework/src/deployment-graph.ts",
  "packages/framework/src/node-deployment-artifacts.ts",
  "packages/framework/src/node-provider-plan.ts",
  "packages/framework/src/deployment-requirements.ts",
  "packages/framework/src/deployment-types.ts",
  "packages/framework/src/scheduled-jobs.ts",
  "packages/framework/src/self-host-export.ts",
  "packages/runtime/src/index.ts",
  "packages/admin-host/src/index.ts",
  "packages/admin-host/src/serve.ts",
  "packages/admin-host/src/ssr.ts",
  "packages/admin-app/src/runtime.ts",
  "packages/admin/src/app/auth-runtime.ts",
  "packages/admin/src/app/index.ts",
  "packages/admin/src/app/workspace.tsx",
  "packages/framework-migrations/src/index.ts",
  "packages/framework-migrations/src/module-source.ts",
  "packages/operator-standard/src/standard-frontend.tsx",
  "apps/operator/src/server.ts",
  "apps/operator/src/ssr-handler.ts",
]

const retiredTokens = [
  "ManagedProfile",
  "managedProfile",
  "managed-profile",
  "managed profile",
  "ManagedOperator",
  "managedOperator",
  "managed-operator",
  "managed operator",
  "profileSnapshot",
  "PROFILE_SNAPSHOT",
  "ProfileSnapshot",
]

for (const file of graphNativeFiles) {
  if (!existsSync(resolve(root, file))) continue
  const source = readFileSync(resolve(root, file), "utf8")
  for (const token of retiredTokens) {
    if (source.includes(token)) violations.push(`${file}: contains retired token ${token}`)
  }
}

const deploymentArtifacts = read("packages/framework/src/deployment-artifacts.ts")
requireText(deploymentArtifacts, 'VoyantDeploymentRuntimeEntryKind = "node"', "node entry kind")
requireAbsent(deploymentArtifacts, "profileSnapshot", "deployment artifact snapshot field")

const retiredFiles = [
  "packages/framework/src/profile.ts",
  "packages/framework/src/profile-types.ts",
  "packages/framework/src/profile-validation.ts",
  "packages/framework/src/managed-jobs.ts",
  "packages/framework/src/managed-profile-compatibility.ts",
  "packages/framework/src/managed-runtime.ts",
  "packages/framework/src/plugin-resolution.ts",
  "packages/framework/src/custom-source-resolution.ts",
  "packages/admin-host/src/managed-profile-compatibility.ts",
]
for (const file of retiredFiles) {
  if (existsSync(resolve(root, file))) violations.push(`${file}: retired compatibility file exists`)
}

const frameworkPackage = JSON.parse(read("packages/framework/package.json"))
for (const subpath of [
  "./profile",
  "./managed-jobs",
  "./managed-profile-compatibility",
  "./managed-runtime",
]) {
  if (frameworkPackage.exports?.[subpath] || frameworkPackage.publishConfig?.exports?.[subpath]) {
    violations.push(`packages/framework/package.json: retired export exists: ${subpath}`)
  }
}

const adminHostPackage = JSON.parse(read("packages/admin-host/package.json"))
if (
  adminHostPackage.exports?.["./managed-profile-compatibility"] ||
  adminHostPackage.publishConfig?.exports?.["./managed-profile-compatibility"]
) {
  violations.push(
    "packages/admin-host/package.json: retired export exists: ./managed-profile-compatibility",
  )
}

const adminRuntime = read("packages/admin-app/src/runtime.ts")
requireText(adminRuntime, "getAdminApiUrl", "generic admin API URL helper")
requireText(adminRuntime, "adminFetcher", "generic admin fetcher")

const adminAuthRuntime = read("packages/admin/src/app/auth-runtime.ts")
requireText(adminAuthRuntime, "AdminAuthRuntime", "generic admin auth port")

const migrationSources = read("packages/framework-migrations/src/module-source.ts")
requireText(
  migrationSources,
  "collectDeploymentMigrationSources",
  "generic deployment migration collector",
)
requireAbsent(
  migrationSources,
  "collectManagedMigrationSources",
  "managed migration collector alias",
)
requireAbsent(
  migrationSources,
  "CollectManagedMigrationSourcesOptions",
  "managed migration collector options alias",
)

const standardFrontend = read("packages/operator-standard/src/standard-frontend.tsx")
requireText(standardFrontend, "adminFetcher", "generic admin fetcher")
requireAbsent(standardFrontend, "operatorFetcher", "Operator application fetcher alias")

const nodeRuntime = read("packages/framework/src/node-runtime.ts")
for (const token of [
  "ManagedProfileRuntime",
  "loadManagedProfileRuntime",
  "startManagedProfileRuntime",
  "loadManagedProfileSnapshot",
  "createManagedProfileApp",
  "VoyantProjectManifest",
  "profileSnapshotPath",
]) {
  requireAbsent(nodeRuntime, token, "Node runtime profile compatibility token")
}

requireText(nodeRuntime, "VoyantDeploymentMode", "graph-native deployment mode")
requireText(nodeRuntime, "VoyantGraphDeploymentRequirements", "graph-native requirements")

if (violations.length > 0) {
  console.error("Profile compatibility boundary check failed:")
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log("check-profile-compatibility-boundary: OK")

function read(file) {
  return readFileSync(resolve(root, file), "utf8")
}

function requireText(source, expected, label) {
  if (!source.includes(expected)) violations.push(`missing ${label}: ${expected}`)
}

function requireAbsent(source, forbidden, label) {
  if (source.includes(forbidden)) violations.push(`found retired ${label}: ${forbidden}`)
}
