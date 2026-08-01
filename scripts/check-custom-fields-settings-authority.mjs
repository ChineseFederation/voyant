import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const rootFlag = process.argv.indexOf("--root")
const root = resolve(rootFlag === -1 ? process.cwd() : process.argv[rootFlag + 1])
const read = (path) => readFileSync(resolve(root, path), "utf8")
const readIfPresent = (path) => (existsSync(resolve(root, path)) ? read(path) : "")
const failures = []
const genericManifest = read("packages/custom-fields/src/voyant.ts")
const relationshipsManifest = read("packages/relationships/src/voyant.ts")
const relationshipsAdmin = read("packages/relationships-react/src/admin/index.tsx")
const settingsReactPackage = read("packages/custom-fields-react/package.json")
const settingsReactI18n = read("packages/custom-fields-react/src/i18n/index.ts")
const settingsReactAdmin = read("packages/custom-fields-react/src/admin.tsx")
const settingsQueryOptions = read("packages/custom-fields-react/src/query-options.ts")
const settingsSheet = read(
  "packages/custom-fields-react/src/components/custom-field-definition-sheet.tsx",
)
const settingsPage = read(
  "packages/custom-fields-react/src/components/custom-field-definitions-page.tsx",
)
const definitionService = read("packages/custom-fields/src/service.ts")
const namespaceOwnershipMigration = read(
  "packages/custom-fields/migrations/20260716000100_custom_field_namespace_ownership.sql",
)
const relationshipsPackage = read("packages/relationships/package.json")
const coreCustomFields = read("packages/core/src/custom-fields.ts")
const coreIndex = read("packages/core/src/index.ts")
const operatorMetadata = read("scripts/generate-operator-starter-metadata.mjs")
const relationshipsRouteIndex = read("packages/relationships/src/routes/index.ts")
const relationshipsServiceIndex = read("packages/relationships/src/service/index.ts")
const relationshipsValidation = read("packages/relationships/src/validation.ts")
const relationshipsIndex = read("packages/relationships/src/index.ts")
const relationshipsContractsValidation = read("packages/relationships-contracts/src/validation.ts")
const relationshipsContractsIndex = read("packages/relationships-contracts/src/index.ts")
const coreRuntimePort = read("packages/core/src/runtime-port.ts")
const genericApiRuntime = read("packages/custom-fields/src/api-runtime.ts")
const genericRoutes = read("packages/custom-fields/src/routes.ts")
const genericOpenApi = read("packages/custom-fields/openapi/admin/custom-fields.json")
const relationshipsOpenApi = read("packages/relationships/openapi/admin/relationships.json")
const bookingsRuntimeContributor = read("packages/bookings/src/runtime-contributor.ts")
const proposalsRuntimeContributor = read("packages/proposals/src/runtime-contributor.ts")
const relationshipsRuntimeContributor = read("packages/relationships/src/runtime-contributor.ts")
const genericValueIntegration = read(
  "packages/relationships/tests/integration/generic-custom-field-values.test.ts",
)
const ciWorkflow = read(".github/workflows/ci.yml")

if (!genericManifest.includes('mount: "custom-fields"'))
  failures.push("generic custom-fields package must own the canonical API mount")
if (!genericManifest.includes('resource: "custom-fields"'))
  failures.push("generic custom-fields package must own a unique custom-fields access resource")
if (genericManifest.includes('resource: "settings"'))
  failures.push("generic custom-fields package must not duplicate the settings access resource")
if (!genericManifest.includes('requiredScopes: ["custom-fields:read"]'))
  failures.push("custom-fields Settings route must require the custom-fields read scope")
if (!genericManifest.includes('path: "/settings/custom-fields"'))
  failures.push("generic custom-fields package must own the Settings route")
if (!genericManifest.includes("@voyant-travel/custom-fields-react/admin"))
  failures.push("generic custom-fields manifest must select custom-fields-react")
if (
  !genericManifest.includes("customFieldValueOperationsRuntimePort") ||
  !genericManifest.includes('cardinality: "many"')
)
  failures.push("generic custom-fields must resolve additive package-owned value providers")
if (
  !genericApiRuntime.includes("customFieldValueOperationsRuntimePort") ||
  !genericApiRuntime.includes("valueOperations")
)
  failures.push("generic custom-fields API runtime must inject package-owned value operations")
for (const route of ['path: "/values"', 'path: "/{id}/value"', 'path: "/values/{id}"']) {
  if (!genericRoutes.includes(route))
    failures.push(`generic custom-fields routes must own canonical value route ${route}`)
}
for (const path of [
  "/v1/admin/custom-fields/values",
  "/v1/admin/custom-fields/{id}/value",
  "/v1/admin/custom-fields/values/{id}",
]) {
  if (!genericOpenApi.includes(`"${path}"`))
    failures.push(`generic custom-fields OpenAPI must own ${path}`)
}
for (const path of [
  "/v1/admin/relationships/custom-field-values",
  "/v1/admin/relationships/custom-fields/{id}/value",
  "/v1/admin/relationships/custom-field-values/{id}",
]) {
  if (relationshipsOpenApi.includes(`"${path}"`))
    failures.push(`Relationships OpenAPI must not retain ${path}`)
}
if (
  !coreRuntimePort.includes("customFieldValueOperationsRuntimePort") ||
  !coreRuntimePort.includes('id: "custom-fields.value-operations"')
)
  failures.push("core must define the generic custom-field value operations port")
for (const [owner, contents] of [
  ["Bookings", bookingsRuntimeContributor],
  ["Proposals", proposalsRuntimeContributor],
  ["Relationships", relationshipsRuntimeContributor],
]) {
  if (!contents.includes("[customFieldValueOperationsRuntimePort.id]"))
    failures.push(`${owner} must provide package-owned custom-field value operations`)
}
if (!settingsReactPackage.includes('"name": "@voyant-travel/custom-fields-react"'))
  failures.push("custom-fields-react package must exist")
if (!settingsReactPackage.includes('"@voyant-travel/i18n": "workspace:^"'))
  failures.push("custom-fields-react must own its package i18n dependency")
if (!settingsReactPackage.includes('"./i18n": "./src/i18n/index.ts"'))
  failures.push("custom-fields-react must expose its package i18n API")
if (!settingsReactI18n.includes("CustomFieldsUiMessagesProvider"))
  failures.push("custom-fields-react must own English and Romanian route/page messages")
if (!settingsReactAdmin.includes("routeMessagesProvider: customFieldsRouteMessagesProvider"))
  failures.push("custom-fields-react Settings must load its route-local message provider")
if (settingsReactPackage.includes("@voyant-travel/relationships-react"))
  failures.push("custom-fields-react must not depend on relationships-react")
if (!settingsQueryOptions.includes("/v1/admin/custom-fields/targets"))
  failures.push("custom-fields Settings must load selected targets from the generic API")
if (!settingsSheet.includes("target.id === values.entityType"))
  failures.push("custom-fields Settings must constrain field types to the selected target")
if (!settingsSheet.includes("normalizeCustomFieldDefinitionFormValues"))
  failures.push("custom-fields Settings must clear unsupported target capabilities")
if (
  !settingsPage.includes('definition.ownerKind === "operator" && definition.namespace === "custom"')
)
  failures.push(
    "custom-fields Settings must expose app/platform definitions as structurally read-only",
  )
if (!settingsPage.includes("messages.page.namespace"))
  failures.push("custom-fields Settings must display physical namespace provenance")
if (!definitionService.includes('namespace: "custom"'))
  failures.push("operator-created definitions must use the server-assigned custom namespace")
if (!definitionService.includes("createForOwner") || !definitionService.includes("updateForOwner"))
  failures.push("app/platform definition operations must be owner-constrained domain operations")
if (!namespaceOwnershipMigration.includes('DELETE FROM "custom_field_definitions"'))
  failures.push(
    "namespace ownership migration must explicitly discard unused pre-cutline definitions",
  )
if (
  namespaceOwnershipMigration.includes("ADD COLUMN IF NOT EXISTS") ||
  namespaceOwnershipMigration.includes("CREATE INDEX IF NOT EXISTS") ||
  /\bUPDATE\s+"custom_field_definitions"/.test(namespaceOwnershipMigration) ||
  /\bDEFAULT\b/.test(namespaceOwnershipMigration)
)
  failures.push("namespace ownership migration must not contain compatibility defaults or backfill")
if (relationshipsManifest.includes('path: "/settings/custom-fields"'))
  failures.push("Relationships must not own the custom-fields Settings route")
if (relationshipsAdmin.includes('id: "custom-fields"'))
  failures.push("Relationships admin must not expose custom-fields Settings")
if (relationshipsPackage.includes("./custom-fields-registry"))
  failures.push("Relationships must not export a definition registry")
for (const path of [
  "packages/relationships/src/routes/custom-fields.ts",
  "packages/relationships/src/service/custom-fields.ts",
  "packages/relationships/src/service/custom-fields-registry.ts",
  "packages/relationships/src/service/custom-fields-value-mapping.ts",
  "packages/relationships-contracts/src/validation/custom-fields.ts",
  "packages/relationships/tests/integration/custom-fields.test.ts",
  "packages/relationships/tests/integration/custom-fields-values.test.ts",
  "packages/relationships/tests/unit/custom-fields-value-mapping.test.ts",
]) {
  if (existsSync(resolve(root, path))) failures.push(`${path} must stay deleted`)
}
if (
  !genericValueIntegration.includes("/v1/admin/custom-fields/values") ||
  !genericValueIntegration.includes("/v1/admin/relationships/custom-field-values")
)
  failures.push("database integration coverage must exercise generic routes and removed old routes")
if (
  !ciWorkflow.includes("tests/integration/generic-custom-field-values.test.ts") ||
  ciWorkflow.includes("tests/integration/custom-fields-values.test.ts")
)
  failures.push("CI database integration must run only the generic custom-field value test")
for (const [path, contents] of [
  ["packages/relationships/src/routes/index.ts", relationshipsRouteIndex],
  ["packages/relationships/src/service/index.ts", relationshipsServiceIndex],
  ["packages/relationships/src/validation.ts", relationshipsValidation],
  ["packages/relationships/src/index.ts", relationshipsIndex],
  ["packages/relationships-contracts/src/validation.ts", relationshipsContractsValidation],
  ["packages/relationships-contracts/src/index.ts", relationshipsContractsIndex],
]) {
  if (
    contents.includes("customFieldValueListQuerySchema") ||
    contents.includes("upsertCustomFieldValueSchema") ||
    contents.includes("./custom-fields.js") ||
    contents.includes("customFieldsService") ||
    contents.includes("customFieldRoutes")
  ) {
    failures.push(`${path} must not retain Relationships custom-field value API ownership`)
  }
}
for (const token of ["defineCustomField", "customFieldsFromGlob", "mergeCustomFieldDefinitions"]) {
  if (coreCustomFields.includes(token) || coreIndex.includes(token))
    failures.push(`packages/core must not retain local-authoring export ${token}`)
}
if (operatorMetadata.includes("src/custom-fields"))
  failures.push("operator metadata must not discover project-local custom-field files")
for (const starter of readdirSync(resolve(root, "starters"), { withFileTypes: true })) {
  if (
    starter.isDirectory() &&
    existsSync(join(root, "starters", starter.name, "src", "custom-fields"))
  ) {
    failures.push(`starters/${starter.name}/src/custom-fields must stay absent`)
  }
}
const forbiddenHostTokens = [
  'config.read(db, "customFields")',
  "FrameworkProviders.customFields",
  "customFieldsFromGlob",
  "operatorCustomFields",
]
for (const sourceRoot of [
  "starters",
  "apps",
  "packages/framework",
  "packages/runtime",
  "packages/operator-standard",
]) {
  for (const path of sourceFiles(resolve(root, sourceRoot))) {
    const contents = readIfPresent(path.slice(root.length + 1))
    for (const token of forbiddenHostTokens) {
      if (contents.includes(token))
        failures.push(
          `${path.slice(root.length + 1)} must not restore host injection token ${token}`,
        )
    }
  }
}
if (!read("packages/bookings/src/voyant.ts").includes('namespace: "bookings"'))
  failures.push("Bookings must declare a stable custom-field namespace")
if (!read("packages/relationships/src/voyant.ts").includes('namespace: "relationships"'))
  failures.push("Relationships must declare a stable custom-field namespace")
if (!read("packages/proposals/src/voyant.ts").includes('namespace: "proposals"'))
  failures.push("Proposals must declare a stable custom-field namespace")
if (!read("packages/bookings/src/voyant.ts").includes("customFieldTargets"))
  failures.push("Bookings must declare its custom-field target")
if (!read("packages/relationships/src/voyant.ts").includes("customFieldTargets"))
  failures.push("Relationships must declare its custom-field targets")
if (!read("packages/proposals/src/voyant.ts").includes("customFieldTargets"))
  failures.push("Proposals must declare its custom-field target")

if (failures.length)
  throw new Error(`check-custom-fields-settings-authority:\n- ${failures.join("\n- ")}`)
console.log("check-custom-fields-settings-authority: OK")

function sourceFiles(directory) {
  if (!existsSync(directory)) return []
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".voyant") continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(path))
    else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) files.push(path)
  }
  return files
}
