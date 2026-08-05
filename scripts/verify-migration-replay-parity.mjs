/**
 * Replay-parity oracle for retiring the Operator deployment migration source.
 * Proves that every upgrade path reconstitutes exactly the same schema as a
 * fresh replay of the selected packages:
 *
 *   (1) frozen framework bundle + retired deployment migrations
 *       + package post-cutline increments
 *   (2) the package history AS IT SHIPPED BEFORE the quotes → proposals rename
 *       + package post-cutline increments
 *   === all current package-owned migrations
 *
 * Lane 2 is what a deployment provisioned before #4004 actually holds: the
 * retired `quotes` source plus the pre-rename bytes of the migrations that
 * rename touched in place (voyant#4143). It fails if the adoption increments
 * miss an object, which is the whole point — the rename is only safe if the
 * legacy shape converges on the current one exactly.
 *
 * The D.2 cutline and framework bundle remain frozen transition fixtures. The
 * retired deployment history is retained only under scripts/fixtures so this
 * check can prove upgrades without keeping database authority in the application.
 *
 * Run: TEST_DATABASE_URL=<postgres url, user with CREATEDB> node scripts/verify-migration-replay-parity.mjs
 *   (skips cleanly when no DB is configured).
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"

const require = createRequire(new URL("../apps/operator/package.json", import.meta.url))
const { Client } = require("pg")

const ROOT = new URL("..", import.meta.url).pathname
const DB_URL = process.env.TEST_DATABASE_URL
if (!DB_URL) {
  console.log(
    "verify-migration-replay-parity: SKIP (set TEST_DATABASE_URL to a CREATEDB-capable Postgres)",
  )
  process.exit(0)
}

const FRAMEWORK_BUNDLE = join(ROOT, "packages/framework-migrations/migrations")
const LEGACY_DEPLOYMENT_MIGRATIONS = join(
  ROOT,
  "scripts/fixtures/legacy-operator-deployment-migrations",
)
const OPERATOR_DIR = join(ROOT, "apps/operator")
const OPERATOR_ARTIFACTS = join(OPERATOR_DIR, ".voyant")

// The package history as it shipped BEFORE the quotes → proposals rename.
const PRE_RENAME_FIXTURES = join(ROOT, "scripts/fixtures/pre-proposal-rename")
// `proposals/0000_proposals_baseline` stands in for the whole retired `quotes`
// source: a pre-rename deployment ran these five tags instead of it.
const RETIRED_QUOTES_SOURCE = { source: "proposals", tag: "0000_proposals_baseline" }
// `{source}/{tag}` whose shipped bytes the rename edited in place. A pre-rename
// deployment holds the fixture bytes, not the ones in the package today.
const PRE_RENAME_EDITED_TAGS = new Set([
  "bookings/0000_bookings_baseline",
  "legal/0000_legal_baseline",
  "mice/20260713000300_standard_links",
  "relationships/0000_relationships_baseline",
  "relationships/0003_add_booking_custom_field_target",
])

execFileSync("pnpm", ["exec", "voyant", "build", "--json"], {
  cwd: OPERATOR_DIR,
  stdio: "pipe",
  encoding: "utf8",
})

// Extensions required by package-owned indexes on a fresh package replay.
const SEED_EXTENSIONS = [
  'CREATE EXTENSION IF NOT EXISTS "pg_trgm"',
  'CREATE EXTENSION IF NOT EXISTS "unaccent"',
]

const splitStatements = (sql) =>
  sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean)

/** Load a drizzle folder's SQL statements in journal order. */
function loadFolder(folder) {
  const journal = JSON.parse(readFileSync(join(folder, "meta", "_journal.json"), "utf8"))
  return [...journal.entries]
    .sort((a, b) => a.when - b.when)
    .flatMap((e) => splitStatements(readFileSync(join(folder, `${e.tag}.sql`), "utf8")))
}

function loadCutline() {
  const p = join(ROOT, "packages/framework-migrations/cutline.generated.json")
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")).cutline ?? {}) : {}
}

function loadFolderAfterCutline(folder, sourceName, cutline) {
  const covered = new Set(cutline[sourceName] ?? [])
  const journal = JSON.parse(readFileSync(join(folder, "meta", "_journal.json"), "utf8"))
  return [...journal.entries]
    .sort((a, b) => a.when - b.when)
    .filter((e) => !covered.has(e.tag))
    .flatMap((e) => splitStatements(readFileSync(join(folder, `${e.tag}.sql`), "utf8")))
}

function discoverPackageSources() {
  const plan = JSON.parse(
    readFileSync(join(OPERATOR_ARTIFACTS, "migration-plan.generated.json"), "utf8"),
  )
  const sources = []
  const seen = new Set()
  for (const migration of plan.migrations) {
    if (migration.migrationKind !== "schema" || migration.source.kind !== "package") continue
    const name = migration.source.packageName.replace(/^@[^/]+\//, "")
    if (seen.has(name)) continue
    seen.add(name)
    const migrationsDir = join(ROOT, "packages", name, "migrations")
    sources.push({
      name,
      migrationsDir,
      hasMigrations: existsSync(join(migrationsDir, "meta", "_journal.json")),
    })
  }
  return sources
}

/**
 * A SECOND VALID topological order over the same sources, tie-broken the other way.
 *
 * The migration plan orders sources deps-first over `voyant.requiresSchemas`, and
 * breaks ties between independent sources by plan order (effectively alphabetical).
 * That tie-break is arbitrary, so a migration may depend on it WITHOUT declaring
 * anything — and it keeps working until someone moves a package and the tie-break
 * lands differently.
 *
 * That is not hypothetical: `catalog`'s booking-v1 draft cutover reads
 * `availability_holds.converted_at`, a column an `availability` increment adds, and
 * was correct only because "availability" sorts before "catalog" (voyant#4279).
 * Absorbing availability into operations moved it after and broke the upgrade path.
 *
 * Replaying against a different valid order turns "we find out when we move a
 * package" into "we find out now", for every source at once.
 */
function alternateSourceOrder(sources) {
  const byName = new Map(sources.map((s) => [s.name, s]))
  const deps = new Map()
  for (const source of sources) {
    const manifestPath = join(ROOT, "packages", source.name, "package.json")
    const declared = existsSync(manifestPath)
      ? (JSON.parse(readFileSync(manifestPath, "utf8")).voyant?.requiresSchemas ?? [])
      : []
    deps.set(
      source.name,
      new Set(declared.map((n) => n.replace(/^@[^/]+\//, "")).filter((n) => byName.has(n))),
    )
  }

  // Kahn, taking the LAST ready source each round — the reverse of the plan's
  // tie-break. Declared edges are still honoured, so this order is just as valid.
  const remaining = new Set(sources.map((s) => s.name))
  const ordered = []
  while (remaining.size > 0) {
    const ready = [...remaining].filter((name) =>
      [...deps.get(name)].every((dep) => !remaining.has(dep)),
    )
    if (ready.length === 0) break // cycle: leave the rest in plan order
    const pick = ready[ready.length - 1]
    remaining.delete(pick)
    ordered.push(byName.get(pick))
  }
  for (const name of remaining) ordered.push(byName.get(name))
  return ordered
}

async function applyFolders(client, folders) {
  for (const folder of folders) {
    for (const stmt of loadFolder(folder)) {
      await client.query(stmt)
    }
  }
}

/**
 * A source's journal replayed as a PRE-RENAME deployment holds it: the retired
 * `quotes` tags in place of the proposals baseline, the fixture bytes for the
 * tags the rename edited, and the current bytes for everything else (including
 * the adoption increments, which is what this lane exercises).
 */
function loadFolderPreRename(folder, sourceName) {
  const journal = JSON.parse(readFileSync(join(folder, "meta", "_journal.json"), "utf8"))
  return [...journal.entries]
    .sort((a, b) => a.when - b.when)
    .flatMap((entry) => {
      const id = `${sourceName}/${entry.tag}`
      if (sourceName === RETIRED_QUOTES_SOURCE.source && entry.tag === RETIRED_QUOTES_SOURCE.tag) {
        const retired = join(PRE_RENAME_FIXTURES, "quotes")
        const retiredJournal = JSON.parse(readFileSync(join(retired, "_journal.json"), "utf8"))
        return [...retiredJournal.entries]
          .sort((a, b) => a.when - b.when)
          .flatMap((e) => splitStatements(readFileSync(join(retired, `${e.tag}.sql`), "utf8")))
      }
      if (PRE_RENAME_EDITED_TAGS.has(id)) {
        return splitStatements(
          readFileSync(join(PRE_RENAME_FIXTURES, "edited", sourceName, `${entry.tag}.sql`), "utf8"),
        )
      }
      return splitStatements(readFileSync(join(folder, `${entry.tag}.sql`), "utf8"))
    })
}

/** Canonical, order-independent fingerprint of the public schema. */
async function fingerprint(client) {
  const q = async (sql) => (await client.query(sql)).rows
  const columns = await q(`
    SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns WHERE table_schema='public'
    ORDER BY table_name, column_name`)
  const enums = await q(`
    SELECT t.typname, e.enumlabel, e.enumsortorder
    FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
    JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'
    ORDER BY t.typname, e.enumsortorder`)
  const indexes = await q(`
    SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public'
    ORDER BY tablename, indexname`)
  // Read from pg_constraint, not information_schema.table_constraints: the
  // catalogue carries the constraint NAME, and on PostgreSQL 18+ it carries the
  // NOT NULL constraints too. A rename that moves tables and columns but leaves
  // constraint names on the old vocabulary is exactly the drift this oracle has
  // to see (voyant#4148) — `ALTER TABLE ... RENAME` does not rename them.
  const constraints = await q(`
    SELECT rel.relname AS table_name, c.conname, c.contype, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    LEFT JOIN pg_class rel ON rel.oid = c.conrelid
    WHERE n.nspname='public'
    ORDER BY 1, 2, 3`)
  return { columns, enums, indexes, constraints }
}

const hashOf = (obj) => createHash("sha256").update(JSON.stringify(obj)).digest("hex")

function urlFor(name) {
  const url = new URL(DB_URL)
  url.pathname = `/${name}`
  return url.toString()
}

async function withFreshDb(admin, name, fn) {
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${name}"`)
  try {
    return await fn()
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
  }
}

async function onDb(name, fn) {
  const client = new Client({ connectionString: urlFor(name) })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

async function main() {
  const admin = new Client({ connectionString: urlFor("postgres") })
  await admin.connect()
  try {
    // NOT NULL constraints only reach `pg_constraint` from PostgreSQL 18 on, so
    // on anything older this run cannot see that class of name drift at all
    // (voyant#4148). Say so rather than let a green run read as full coverage.
    const serverVersion = Number(
      (await admin.query("SHOW server_version_num")).rows[0].server_version_num,
    )
    console.log(
      `  server: PostgreSQL ${Math.floor(serverVersion / 10000)}` +
        (serverVersion < 180000
          ? " — NOT NULL constraint names are not catalogued here and go unchecked"
          : " — NOT NULL constraint names included"),
    )

    const packageSources = discoverPackageSources()

    // Canonical current schema: every selected package migration from an empty DB.
    const packageFp = await withFreshDb(admin, "voyant_replay_packages", async () =>
      onDb("voyant_replay_packages", async (c) => {
        for (const ext of SEED_EXTENSIONS) await c.query(ext)
        for (const source of packageSources) {
          if (!source.hasMigrations) {
            throw new Error(`schema source ${source.name} has no migrations folder`)
          }
          await applyFolders(c, [source.migrationsDir])
        }
        return fingerprint(c)
      }),
    )

    // Upgrade path: frozen cutline + retired deployment history + package increments.
    const newFp = await withFreshDb(admin, "voyant_replay_new", async () => {
      const cutline = loadCutline()
      const sourceNames = packageSources.map((s) => s.name).join(", ")
      console.log(`  sources: framework, legacy-deployment, ${sourceNames}`)
      return onDb("voyant_replay_new", async (c) => {
        await applyFolders(c, [FRAMEWORK_BUNDLE])
        await applyFolders(c, [LEGACY_DEPLOYMENT_MIGRATIONS])
        for (const source of packageSources) {
          if (!source.hasMigrations) {
            throw new Error(`schema source ${source.name} has no migrations folder`)
          }
          for (const stmt of loadFolderAfterCutline(source.migrationsDir, source.name, cutline)) {
            await c.query(stmt)
          }
        }
        return fingerprint(c)
      })
    })

    // Pre-rename package history: what a deployment provisioned before #4004
    // holds, brought forward by the quotes → proposals adoption increments.
    const preRenameFp = await withFreshDb(admin, "voyant_replay_pre_rename", async () => {
      console.log("  sources: pre-rename package history (retired quotes source)")
      return onDb("voyant_replay_pre_rename", async (c) => {
        for (const ext of SEED_EXTENSIONS) await c.query(ext)
        for (const source of packageSources) {
          if (!source.hasMigrations) {
            throw new Error(`schema source ${source.name} has no migrations folder`)
          }
          for (const stmt of loadFolderPreRename(source.migrationsDir, source.name)) {
            await c.query(stmt)
          }
        }
        return fingerprint(c)
      })
    })

    // Order robustness: the same upgrade path, replayed against a DIFFERENT valid
    // topological order. Any migration that depends on the plan's arbitrary
    // tie-break between independent sources fails here rather than the next time
    // a package moves.
    const alternate = alternateSourceOrder(packageSources)
    const reordered = alternate.map((s) => s.name).join(", ")
    const alternateFp = await withFreshDb(admin, "voyant_replay_alt_order", async () => {
      const cutline = loadCutline()
      console.log(`  sources: alternate valid order — ${reordered}`)
      return onDb("voyant_replay_alt_order", async (c) => {
        await applyFolders(c, [FRAMEWORK_BUNDLE])
        await applyFolders(c, [LEGACY_DEPLOYMENT_MIGRATIONS])
        for (const source of alternate) {
          if (!source.hasMigrations) {
            throw new Error(`schema source ${source.name} has no migrations folder`)
          }
          for (const stmt of loadFolderAfterCutline(source.migrationsDir, source.name, cutline)) {
            await c.query(stmt)
          }
        }
        return fingerprint(c)
      })
    })

    const sections = ["columns", "enums", "indexes", "constraints"]
    const lanes = [
      { label: "upgrade path", fingerprint: newFp },
      { label: "pre-rename history", fingerprint: preRenameFp },
      { label: "alternate source order", fingerprint: alternateFp },
    ]
    let ok = true
    for (const lane of lanes) {
      for (const s of sections) {
        const a = hashOf(lane.fingerprint[s])
        const b = hashOf(packageFp[s])
        if (a !== b) {
          ok = false
          console.error(
            `  MISMATCH  ${lane.label} ${s}: lane=${a.slice(0, 12)} packages=${b.slice(0, 12)}`,
          )
          const aSet = new Set(lane.fingerprint[s].map((r) => JSON.stringify(r)))
          const bSet = new Set(packageFp[s].map((r) => JSON.stringify(r)))
          const onlyLane = [...aSet].filter((r) => !bSet.has(r)).slice(0, 5)
          const onlyPackages = [...bSet].filter((r) => !aSet.has(r)).slice(0, 5)
          for (const r of onlyLane) console.error(`    only in ${lane.label}: ${r}`)
          for (const r of onlyPackages) console.error(`    only in package replay: ${r}`)
        } else {
          console.log(`  OK  ${lane.label} ${s} (${lane.fingerprint[s].length} rows)`)
        }
      }
    }

    if (!ok) {
      console.error("\nreplay-parity FAIL — an upgrade path and the package-owned replay differ.")
      process.exit(1)
    }
    console.log("\nverify-migration-replay-parity: OK — every upgrade path == package-owned replay")
  } finally {
    await admin.end()
  }
}

main().catch((err) => {
  console.error("verify-migration-replay-parity ERROR:", err)
  process.exit(2)
})
