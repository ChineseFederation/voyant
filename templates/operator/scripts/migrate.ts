import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { config } from "dotenv"
import { Client } from "pg"

config({ path: ".env" })
config({ path: "../../.env" })
config({ path: "../../.env.local" })
config({ path: ".dev.vars", override: true })

const databaseUrl = process.env.DATABASE_URL
const tuyuRuntime = process.env.TUYU_BOOKING_RUNTIME === "1"
const migrationSchema = tuyuRuntime ? "module_voyant" : "drizzle"

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set")
}

const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
const migrationsFolder = process.env.TUYU_VOYANT_MIGRATIONS_DIR
  ? path.resolve(process.env.TUYU_VOYANT_MIGRATIONS_DIR)
  : path.resolve(scriptsDir, "../migrations")
const journalPath = path.join(migrationsFolder, "meta", "_journal.json")

type JournalEntry = {
  tag: string
  when: number
}

type Journal = {
  entries: JournalEntry[]
}

const client = new Client({
  connectionString: databaseUrl,
})

function assertTuyuDatabaseBoundary() {
  if (!tuyuRuntime) return
  const parsed = new URL(databaseUrl!)
  if (parsed.pathname !== "/tuyubooking") {
    throw new Error("TuyuBooking Voyant must use the tuyubooking database")
  }
}

function qualifyTuyuMigration(sql: string): string {
  if (!tuyuRuntime) return sql
  return sql
    .replaceAll('"public".', '"module_voyant".')
    .replaceAll("n.nspname = 'public'", "n.nspname = 'module_voyant'")
    .replaceAll("table_schema = 'public'", "table_schema = 'module_voyant'")
}

async function readJournal(): Promise<Journal> {
  const raw = await fs.readFile(journalPath, "utf8")
  return JSON.parse(raw) as Journal
}

async function ensureMigrationsTable() {
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${migrationSchema}"`)
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${migrationSchema}"."__drizzle_migrations" (
      "id" serial PRIMARY KEY,
      "hash" text NOT NULL,
      "created_at" bigint
    )
  `)
}

async function ensureTuyuRoleAndSchema() {
  if (!tuyuRuntime) return
  const password = process.env.TUYU_VOYANT_APP_PASSWORD
  if (!password) throw new Error("TUYU_VOYANT_APP_PASSWORD is required")
  const exists = await client.query<{ exists: boolean }>(
    "SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'tuyu_voyant_app') AS exists",
  )
  if (!exists.rows[0]?.exists) await client.query('CREATE ROLE "tuyu_voyant_app" LOGIN')
  const passwordStatement = await client.query<{ statement: string }>(
    `SELECT format('ALTER ROLE tuyu_voyant_app PASSWORD %L', $1::text) AS statement`,
    [password],
  )
  await client.query(passwordStatement.rows[0]!.statement)
  await client.query('CREATE SCHEMA IF NOT EXISTS "module_voyant" AUTHORIZATION "tuyu_voyant_app"')
}

async function grantTuyuRuntimeAccess() {
  if (!tuyuRuntime) return
  // Migrations run with the local PostgreSQL administrator so they can create
  // the isolated runtime role and schema. Hand every schema object back to the
  // module role afterwards; this keeps later idempotent ALTER migrations and
  // upstream integration tests inside the same least-privilege boundary.
  await client.query(`
    DO $$
    DECLARE
      object_record record;
    BEGIN
      FOR object_record IN
        SELECT c.relkind, n.nspname, c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'module_voyant'
          AND c.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
          AND (
            c.relkind <> 'S'
            OR NOT EXISTS (
              SELECT 1
              FROM pg_depend d
              WHERE d.classid = 'pg_class'::regclass
                AND d.objid = c.oid
                AND d.deptype IN ('a', 'i')
            )
          )
      LOOP
        EXECUTE CASE object_record.relkind
          WHEN 'S' THEN format(
            'ALTER SEQUENCE %I.%I OWNER TO tuyu_voyant_app',
            object_record.nspname,
            object_record.relname
          )
          WHEN 'v' THEN format(
            'ALTER VIEW %I.%I OWNER TO tuyu_voyant_app',
            object_record.nspname,
            object_record.relname
          )
          WHEN 'm' THEN format(
            'ALTER MATERIALIZED VIEW %I.%I OWNER TO tuyu_voyant_app',
            object_record.nspname,
            object_record.relname
          )
          WHEN 'f' THEN format(
            'ALTER FOREIGN TABLE %I.%I OWNER TO tuyu_voyant_app',
            object_record.nspname,
            object_record.relname
          )
          ELSE format(
            'ALTER TABLE %I.%I OWNER TO tuyu_voyant_app',
            object_record.nspname,
            object_record.relname
          )
        END;
      END LOOP;
    END
    $$;
  `)
  await client.query('GRANT USAGE, CREATE ON SCHEMA "module_voyant" TO "tuyu_voyant_app"')
  await client.query(
    'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "module_voyant" TO "tuyu_voyant_app"',
  )
  await client.query(
    'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "module_voyant" TO "tuyu_voyant_app"',
  )
  await client.query(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA "module_voyant" GRANT ALL ON TABLES TO "tuyu_voyant_app"',
  )
  await client.query(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA "module_voyant" GRANT ALL ON SEQUENCES TO "tuyu_voyant_app"',
  )
}

async function getLastMigrationMillis(): Promise<number> {
  const result = await client.query<{
    created_at: string | number
  }>(`
    SELECT "created_at"
    FROM "${migrationSchema}"."__drizzle_migrations"
    ORDER BY "created_at" DESC
    LIMIT 1
  `)

  if (result.rowCount === 0) {
    return 0
  }

  return Number(result.rows[0]?.created_at ?? 0)
}

async function applyMigration(entry: JournalEntry) {
  const migrationPath = path.join(migrationsFolder, `${entry.tag}.sql`)
  const rawSql = await fs.readFile(migrationPath, "utf8")
  const migrationSql = qualifyTuyuMigration(rawSql)
  const statements = migrationSql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean)
  const hash = crypto.createHash("sha256").update(migrationSql).digest("hex")

  await client.query("BEGIN")

  try {
    if (tuyuRuntime) {
      await client.query('SET LOCAL search_path TO "module_voyant", pg_catalog')
    }
    for (const statement of statements) {
      await client.query(statement)
    }

    await client.query(
      `
        INSERT INTO "${migrationSchema}"."__drizzle_migrations" ("hash", "created_at")
        VALUES ($1, $2)
      `,
      [hash, entry.when],
    )

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  }
}

try {
  assertTuyuDatabaseBoundary()
  await client.connect()
  await ensureTuyuRoleAndSchema()
  await ensureMigrationsTable()

  const journal = await readJournal()
  const lastMigrationMillis = await getLastMigrationMillis()
  const applied: string[] = []

  for (const entry of journal.entries) {
    if (entry.when > lastMigrationMillis) {
      await applyMigration(entry)
      applied.push(entry.tag)
      console.log(`✓ applied ${entry.tag}`)
    }
  }
  await grantTuyuRuntimeAccess()

  if (applied.length === 0) {
    console.log("No pending migrations.")
  } else {
    // Postgres-js (and most drivers) cache prepared-statement plans per
    // connection. Long-lived workers / dev servers that started before this
    // run will have stale plans referencing the old schema and will fail on
    // the first query that touches a changed column. Tell the caller so
    // their deploy pipeline (or the dev) can restart the right thing.
    console.log("")
    console.log(`Applied ${applied.length} migration(s).`)
    console.log("⚠️  Restart any long-lived workers / dev servers now —")
    console.log("    drizzle's prepared-statement cache is keyed to the old schema.")
  }
} finally {
  await client.end()
}
