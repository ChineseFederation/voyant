import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

import type {
  MigrationClient,
  MigrationSource,
  RunResult,
} from "@voyant-travel/framework-migrations"

import type {
  VoyantProjectMigration,
  VoyantProjectMigrationPlan,
  VoyantProjectSchemaMigration,
} from "./project-resolver.js"

export interface NodeMigrationRunnerOptions {
  databaseUrl?: string
  dryRun?: boolean
}

export interface NodeMigrationStatus {
  id: string
  migrationKind: VoyantProjectMigration["migrationKind"]
  status: "applied" | "skipped" | "failed"
  detail?: string
}

export interface NodeMigrationExecutionReport {
  schemaVersion: "voyant.migration-result.v1"
  contentHash: string
  applied: readonly NodeMigrationStatus[]
  skipped: readonly NodeMigrationStatus[]
  failed: readonly NodeMigrationStatus[]
}

export interface SetupMigrationContext {
  client: MigrationClient
  dryRun: false
}

export type SetupMigrationHandler = (context: SetupMigrationContext) => unknown | Promise<unknown>

export interface NodeMigrationRuntime {
  setupLoaders: Readonly<Record<string, () => Promise<SetupMigrationHandler>>>
  resolveFrom: string | URL
}

interface ConnectedMigrationClient extends MigrationClient {
  end(): Promise<void>
}

interface PgClientConstructor {
  new (options: {
    connectionString: string
  }): ConnectedMigrationClient & {
    connect(): Promise<void>
  }
}

export interface NodeMigrationRunnerDependencies {
  connect(databaseUrl: string): Promise<ConnectedMigrationClient>
  loadSchemaSource(
    migration: VoyantProjectSchemaMigration,
    resolveFrom: string | URL,
  ): Promise<MigrationSource>
  runSchema(client: MigrationClient, source: MigrationSource): Promise<RunResult>
}

const SETUP_LEDGER = '"drizzle"."_voyant_setup_migrations"'

export async function executeNodeMigrationPlan(
  plan: VoyantProjectMigrationPlan,
  runtime: NodeMigrationRuntime,
  options: NodeMigrationRunnerOptions = {},
  dependencies: NodeMigrationRunnerDependencies = defaultDependencies,
): Promise<NodeMigrationExecutionReport> {
  assertOrderedPlan(plan)
  if (options.dryRun) {
    return report(
      plan,
      [],
      plan.migrations.map((migration) => status(migration, "skipped", "dry_run")),
      [],
    )
  }

  const databaseUrl =
    options.databaseUrl?.trim() ||
    process.env.DATABASE_URL_DIRECT?.trim() ||
    process.env.DATABASE_URL?.trim()
  if (!databaseUrl) throw new Error("DATABASE_URL or DATABASE_URL_DIRECT is required")

  const applied: NodeMigrationStatus[] = []
  const skipped: NodeMigrationStatus[] = []
  const failed: NodeMigrationStatus[] = []
  const client = await dependencies.connect(databaseUrl)
  try {
    for (const migration of plan.migrations) {
      try {
        if (migration.migrationKind === "schema") {
          const source = await dependencies.loadSchemaSource(migration, runtime.resolveFrom)
          const result = await dependencies.runSchema(client, source)
          if (result.executed.length + result.baselined.length === 0) {
            skipped.push(status(migration, "skipped", "already_applied"))
          } else {
            const detail = result.baselined.length > 0 ? "baselined" : "executed"
            applied.push(status(migration, "applied", detail))
          }
          continue
        }

        await ensureSetupLedger(client)
        if (await setupMigrationApplied(client, migration.idempotencyKey)) {
          skipped.push(status(migration, "skipped", "already_applied"))
          continue
        }
        const loader = runtime.setupLoaders[migration.id]
        if (!loader) throw new Error(`No admitted setup migration loader for ${migration.id}`)
        const handler = await loader()
        await client.query("BEGIN")
        try {
          await handler({ client, dryRun: false })
          await client.query(
            `INSERT INTO ${SETUP_LEDGER} ("idempotency_key", "migration_id", "graph_hash") VALUES ($1, $2, $3)`,
            [migration.idempotencyKey, migration.id, plan.contentHash],
          )
          await client.query("COMMIT")
        } catch (error) {
          await client.query("ROLLBACK")
          throw error
        }
        applied.push(status(migration, "applied", "executed"))
      } catch (error) {
        failed.push(status(migration, "failed", errorMessage(error)))
        break
      }
    }
  } finally {
    await client.end()
  }
  return report(plan, applied, skipped, failed)
}

const defaultDependencies: NodeMigrationRunnerDependencies = {
  async connect(databaseUrl) {
    const { Client } = createRequire(import.meta.url)("pg") as { Client: PgClientConstructor }
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    return client
  },
  loadSchemaSource: loadNodeSchemaMigrationSource,
  async runSchema(client, source) {
    const { loadCutline, runDeploymentMigrations } = await import(
      "@voyant-travel/framework-migrations"
    )
    return runDeploymentMigrations(client, [source], await loadCutline())
  },
}

export async function loadNodeSchemaMigrationSource(
  migration: VoyantProjectSchemaMigration,
  resolveFrom: string | URL,
): Promise<MigrationSource> {
  const { loadMigrationFolder, loadModuleBundleSource } = await import(
    "@voyant-travel/framework-migrations"
  )
  if (migration.source.kind === "deployment") {
    return {
      name: migration.owner,
      priority: migration.order,
      migrations: await loadMigrationFolder(
        path.resolve(deploymentPackageRoot(resolveFrom), migration.source.path),
      ),
    }
  }
  if (migration.source.path !== "./migrations") {
    throw new Error(
      `Unsupported schema migration source ${migration.source.packageName}:${migration.source.path}`,
    )
  }
  const source = await loadModuleBundleSource(migration.source.packageName, {
    priority: migration.order,
    resolveFrom,
  })
  if (!source) {
    throw new Error(
      `Package ${migration.source.packageName} does not publish migrations/meta/_journal.json`,
    )
  }
  return {
    ...source,
    // The idempotency key is this migration's own historical ledger identity.
    // The absorbed sources come from the package's own manifest (the loader
    // already read them) and from the plan, which resolves the same declaration
    // — both, so a plan generated by an older framework still adopts them.
    legacyNames: [
      ...new Set([
        migration.idempotencyKey,
        ...(source.legacyNames ?? []),
        ...(migration.legacySources ?? []),
      ]),
    ],
  }
}

function deploymentPackageRoot(resolveFrom: string | URL): string {
  const resolved =
    resolveFrom instanceof URL ||
    (typeof resolveFrom === "string" && resolveFrom.startsWith("file:"))
      ? fileURLToPath(resolveFrom)
      : path.resolve(resolveFrom)
  let directory = path.dirname(resolved)
  for (;;) {
    if (existsSync(path.join(directory, "package.json"))) return directory
    const parent = path.dirname(directory)
    if (parent === directory) {
      throw new Error(`Could not find deployment package root from ${String(resolveFrom)}`)
    }
    directory = parent
  }
}

function assertOrderedPlan(plan: VoyantProjectMigrationPlan): void {
  const completed = new Set<string>()
  for (const [index, migration] of plan.migrations.entries()) {
    if (migration.order !== index) {
      throw new Error(`Migration ${migration.id} has order ${migration.order}; expected ${index}`)
    }
    if (
      migration.migrationKind === "schema" &&
      plan.migrations.slice(0, index).some((entry) => entry.migrationKind === "setup")
    ) {
      throw new Error(`Schema migration ${migration.id} must precede every setup migration`)
    }
    if (
      migration.migrationKind === "setup" &&
      migration.dependsOn.some((dependency) => !completed.has(dependency))
    ) {
      throw new Error(`Setup migration ${migration.id} depends on an incomplete migration`)
    }
    completed.add(migration.id)
  }
}

async function ensureSetupLedger(client: MigrationClient): Promise<void> {
  await client.query('CREATE SCHEMA IF NOT EXISTS "drizzle"')
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${SETUP_LEDGER} (
       "idempotency_key" text PRIMARY KEY,
       "migration_id" text NOT NULL,
       "graph_hash" text NOT NULL,
       "applied_at" timestamptz NOT NULL DEFAULT now()
     )`,
  )
}

async function setupMigrationApplied(
  client: MigrationClient,
  idempotencyKey: string,
): Promise<boolean> {
  const result = await client.query(
    `SELECT "idempotency_key" FROM ${SETUP_LEDGER} WHERE "idempotency_key" = $1`,
    [idempotencyKey],
  )
  return result.rows.length > 0
}

function status(
  migration: VoyantProjectMigration,
  migrationStatus: NodeMigrationStatus["status"],
  detail: string,
): NodeMigrationStatus {
  return {
    id: migration.id,
    migrationKind: migration.migrationKind,
    status: migrationStatus,
    detail,
  }
}

function report(
  plan: VoyantProjectMigrationPlan,
  applied: readonly NodeMigrationStatus[],
  skipped: readonly NodeMigrationStatus[],
  failed: readonly NodeMigrationStatus[],
): NodeMigrationExecutionReport {
  return {
    schemaVersion: "voyant.migration-result.v1",
    contentHash: plan.contentHash,
    applied,
    skipped,
    failed,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
