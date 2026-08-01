import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const rootFlag = process.argv.indexOf("--root")
const root = resolve(rootFlag === -1 ? process.cwd() : process.argv[rootFlag + 1])
const read = (path) => readFileSync(resolve(root, path), "utf8")
const failures = []
const registry = read("packages/custom-fields/src/registry.ts")
const definitionService = read("packages/custom-fields/src/service.ts")
const valueContracts = read("packages/custom-fields/src/value-contracts.ts")
const valueService = read("packages/custom-fields/src/value-service.ts")
const valueMapping = read("packages/custom-fields/src/value-mapping.ts")
const valueRoutes = read("packages/custom-fields/src/routes.ts")
const valueApiRuntime = read("packages/custom-fields/src/api-runtime.ts")
const coreRuntimePort = read("packages/core/src/runtime-port.ts")
const typeIdPrefixes = read("packages/schema-kit/src/typeid/typeid-prefixes.ts")
const typeIdSchemas = read("packages/schema-kit/src/typeid/typeid-schemas.ts")
const frameworkRetirementMigration = read(
  "packages/framework-migrations/migrations/0004_framework_baseline.sql",
)
const relationshipsMigrationJournal = read("packages/relationships/migrations/meta/_journal.json")
const peopleService = read("packages/relationships/src/service/accounts-people.ts")
const organizationService = read("packages/relationships/src/service/accounts-organizations.ts")
const bookingService = read("packages/bookings/src/service-core.ts")
const bookingRoutes = read("packages/bookings/src/routes-admin.ts")
const bookingRouteRuntime = read("packages/bookings/src/route-runtime.ts")
const relationshipRoutes = read("packages/relationships/src/routes/accounts.ts")
const reader = read("packages/relationships/src/runtime-contributor.ts")
const bookingLifecycle = read("packages/bookings/src/runtime-contributor.ts")
const proposalLifecycle = read("packages/proposals/src/runtime-contributor.ts")
const relationshipLifecycle = read("packages/relationships/src/runtime-contributor.ts")
const proposalsBaselineMigration = read("packages/proposals/migrations/0000_proposals_baseline.sql")
const migrations = [
  ["packages/bookings/migrations/20260716000300_namespace_custom_field_values.sql", ["bookings"]],
  [
    "packages/relationships/migrations/20260716000302_namespace_custom_field_values.sql",
    ["people", "organizations", "activities"],
  ],
]

if (!registry.includes("namespace: row.namespace"))
  failures.push("the runtime registry must retain persisted definition namespaces")
if (registry.includes('row.namespace !== "custom"'))
  failures.push("the runtime registry must not exclude non-operator namespaces")
if (!valueService.includes("ownerWhere(owner)"))
  failures.push("value APIs must resolve definitions through trusted owner context")
if (
  !valueService.includes("operationFor(operations") ||
  !valueService.includes("matches.length !== 1")
)
  failures.push("generic value APIs must fail closed unless exactly one package owns the target")
if (
  !definitionService.includes("valueLifecycles.filter") ||
  !definitionService.includes("matches.length !== 1")
)
  failures.push("definition lifecycle cleanup must require exactly one package owner")
if (
  !valueService.includes("customFieldDefinitionFromRow(definition)") ||
  !valueService.includes("validateCustomFields(")
)
  failures.push("generic value writes must validate against the locked persisted definition")
if (!valueContracts.includes("numberValue: z.number().finite()"))
  failures.push("generic double values must accept finite fractional numbers")
if (
  !bookingLifecycle.includes(
    `COALESCE(custom_fields -> \${input.definition.namespace}, '{}'::jsonb)`,
  ) ||
  !proposalLifecycle.includes(
    `COALESCE(custom_fields -> \${input.definition.namespace}, '{}'::jsonb)`,
  ) ||
  !relationshipLifecycle.includes(
    `COALESCE(custom_fields -> \${input.definition.namespace}, '{}'::jsonb)`,
  )
)
  failures.push("package-owned value upserts must merge into the trusted definition namespace")
for (const [owner, source] of [
  ["Bookings", bookingLifecycle],
  ["Proposals", proposalLifecycle],
  ["Relationships", relationshipLifecycle],
]) {
  if (!source.includes(`\${input.definition.key}::text`))
    failures.push(`${owner} value upserts must use the trusted definition key`)
  if (
    !source.includes(
      `custom_fields #- ARRAY[\${input.definition.namespace}, \${input.definition.key}]::text[]`,
    )
  )
    failures.push(`${owner} value deletes must remove only the trusted namespace/key path`)
  if (
    source.includes(
      `jsonb_set(custom_fields, ARRAY[\${input.definition.namespace}, \${input.definition.key}]`,
    )
  )
    failures.push(`${owner} must not use two-level jsonb_set against a missing namespace`)
  if (source.includes("custom_fields = custom_fields ||"))
    failures.push(`${owner} value writes must not use the legacy flat JSONB merge`)
  if (!source.includes("[customFieldValueOperationsRuntimePort.id]"))
    failures.push(`${owner} must register its custom-field value operations provider`)
}
if (!valueMapping.includes(`::\${namespace}::`))
  failures.push("synthetic value ids must include namespace identity")
if (
  !valueRoutes.includes('path: "/values"') ||
  !valueRoutes.includes('path: "/{id}/value"') ||
  !valueRoutes.includes('path: "/values/{id}"')
)
  failures.push("generic custom-fields must own all canonical value routes")
if (
  !valueApiRuntime.includes("customFieldValueOperationsRuntimePort") ||
  !coreRuntimePort.includes('id: "custom-fields.value-operations"')
)
  failures.push("generic value routes must resolve package providers through the runtime port")
if (!peopleService.includes(`-> \${field.namespace} ->> \${field.key}`))
  failures.push("custom-field search must address namespace and key")
if (!reader.includes("values[definition.namespace]?.[definition.key]"))
  failures.push("runtime readers must address namespace and key")
if (
  !bookingRoutes.includes('definition.namespace === "custom"') ||
  !relationshipRoutes.includes('definition.namespace === "custom"')
)
  failures.push("ordinary entity routes must accept only operator-owned values")
if (
  !bookingService.includes("...existing.custom_fields") ||
  !peopleService.includes("jsonb_set(") ||
  !organizationService.includes("jsonb_set(")
)
  failures.push("ordinary updates must preserve app/platform namespaces atomically")
if (
  !definitionService.includes("valueLifecycle.renameDefinitionKey") ||
  !definitionService.includes("valueLifecycle.deleteDefinitionValues")
)
  failures.push("definition rename/delete must delegate to package-owned value lifecycle providers")
if (!definitionService.includes("return db.transaction(async (tx) =>"))
  failures.push("definition mutation and value lifecycle cleanup must share a transaction")
if (!valueService.includes('.for("update")'))
  failures.push("value writes must coordinate with definition rename/delete locks")
if (
  !coreRuntimePort.includes("resolveRegistryForWrite") ||
  !registry.includes('.for("share")') ||
  !bookingRoutes.includes("customFieldsForWrite") ||
  !relationshipRoutes.includes("customFieldsForWrite") ||
  !bookingRoutes.includes("transaction(async (tx) =>") ||
  !relationshipRoutes.includes("transaction(async (tx) =>")
)
  failures.push(
    "ordinary entity validation and persistence must share definition locks and one transaction",
  )
if (/\bcustomFields\?:/.test(bookingRouteRuntime))
  failures.push("Bookings must not retain the unused customFields read-resolver option")
for (const path of [
  "packages/relationships/src/routes/custom-fields.ts",
  "packages/relationships/src/service/custom-fields.ts",
  "packages/relationships/src/service/custom-fields-value-mapping.ts",
  "packages/relationships/migrations/20260713000600_backfill_custom_field_values.sql",
  "packages/relationships/tests/unit/custom-fields-backfill-migration.test.ts",
]) {
  if (existsSync(resolve(root, path))) failures.push(`${path} must stay deleted`)
}
if (typeIdPrefixes.includes("custom_field_values") || typeIdSchemas.includes("customFieldValue"))
  failures.push("schema-kit must not retain a TypeID contract for the retired value table")
if (
  relationshipsMigrationJournal.includes("backfill_custom_field_values") ||
  frameworkRetirementMigration.includes("backfill-custom-fields") ||
  frameworkRetirementMigration.includes('IF EXISTS (SELECT 1 FROM "custom_field_values")')
)
  failures.push("migration history must not retain the unused custom-field EAV backfill path")
if (!frameworkRetirementMigration.includes('DROP TABLE IF EXISTS "custom_field_values" CASCADE'))
  failures.push("framework migration must directly retire the unused custom-field value table")
for (const [source, targets] of [
  [bookingLifecycle, ["booking"]],
  [proposalLifecycle, ["proposal"]],
  [relationshipLifecycle, ["person", "organization", "activity"]],
]) {
  for (const target of targets) {
    if (!source.includes(`entityType === "${target}"`) && !source.includes(`${target}: "`))
      failures.push(`target ${target} must have a package-owned value lifecycle provider`)
  }
}
if (
  existsSync(
    resolve(
      root,
      "packages/custom-fields/migrations/20260716000200_namespace_custom_field_values.sql",
    ),
  )
)
  failures.push("the generic definitions package must not migrate entity-owned tables")
if (
  !proposalsBaselineMigration.includes("\"custom_fields\" jsonb DEFAULT '{}'::jsonb NOT NULL") ||
  !proposalsBaselineMigration.includes('CREATE TABLE "proposals"')
)
  failures.push("proposals baseline must own namespaced custom_fields persistence")
for (const [path, tables] of migrations) {
  const migration = read(path)
  if (!migration.includes("jsonb_build_object('custom', \"custom_fields\")"))
    failures.push(`${path} must wrap flat values under custom`)
  if (!migration.includes("NOT (\"custom_fields\" ? 'custom')"))
    failures.push(`${path} must not double-wrap values during replay audits`)
  for (const table of tables) {
    if (!migration.includes(`UPDATE "${table}"`)) failures.push(`${path} must migrate ${table}`)
  }
}

if (failures.length)
  throw new Error(`check-custom-fields-namespaced-values:\n- ${failures.join("\n- ")}`)
console.log("check-custom-fields-namespaced-values: OK")
