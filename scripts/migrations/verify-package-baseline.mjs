/**
 * D.2 slice 1 — per-package baseline equivalence (ADR Required Slice 2).
 * Proves each package's OWN migration folder reproduces EXACTLY the tables the
 * frozen framework bundle creates for it (column-for-column). This is the
 * correctness gate that lets D.2 land package-by-package: if a package baseline
 * matches the bundle for its tables, an existing D.1 DB can import-baseline it
 * safely and a fresh DB can execute it to the same schema.
 *
 * CLOSURE-AWARE: a package may FK into its `voyant.requiresSchemas` dependencies
 * (including @voyant-travel/db), so it cannot apply in isolation. For each target
 * P we apply P's dependency closure first (deps-first topo order, from the
 * generated package folders) THEN P, and compare ONLY the tables P itself
 * creates against the bundle.
 *
 * Run: TEST_DATABASE_URL=<CREATEDB-capable Postgres> \
 *        node scripts/migrations/verify-package-baseline.mjs <pkg-dir>...
 *   (skips cleanly when no DB is configured)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"

import { cutlineTagsFor, loadCutlineManifest } from "./cutline-manifest.mjs"

const require = createRequire(new URL("../../apps/operator/package.json", import.meta.url))
const { Client } = require("pg")

const ROOT = new URL("../..", import.meta.url).pathname
const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const pkgs = process.argv.slice(2)
if (!DB_URL) {
  console.log("verify-package-baseline: SKIP (set TEST_DATABASE_URL)")
  process.exit(0)
}
if (pkgs.length === 0) {
  console.error("usage: node scripts/migrations/verify-package-baseline.mjs <pkg-dir>...")
  process.exit(2)
}

const FRAMEWORK_BUNDLE = join(ROOT, "packages/framework-migrations/migrations")
const FRAMEWORK_D2_CUTLINE_TAG = "0007_framework_baseline"
// These tables existed at the frozen D.2 cutline but their owning product has
// since been retired. Fresh package composition must not recreate them; the
// framework upgrade path removes them in 0010_retire_workflow_runs.sql.
const RETIRED_CUTLINE_TABLES = new Set(["workflow_run_steps", "workflow_runs"])
// NB: extensions are NOT seeded out-of-band — the sources must create them
// themselves (the framework bundle ships a pg_trgm/unaccent preamble; the db
// package owns them for the per-package sources). Seeding here would mask a
// source that fails to create an extension it needs.

const splitStatements = (sql) =>
  sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean)

function journalTags(folder) {
  const journal = JSON.parse(readFileSync(join(folder, "meta", "_journal.json"), "utf8"))
  return [...journal.entries].sort((a, b) => a.when - b.when).map((e) => e.tag)
}

function loadFolder(folder) {
  return journalTags(folder).flatMap((tag) =>
    splitStatements(readFileSync(join(folder, `${tag}.sql`), "utf8")),
  )
}

function loadFrameworkCutlineBundle() {
  const tags = journalTags(FRAMEWORK_BUNDLE)
  const cutlineIndex = tags.indexOf(FRAMEWORK_D2_CUTLINE_TAG)
  if (cutlineIndex === -1) {
    throw new Error(`framework D.2 cutline tag ${FRAMEWORK_D2_CUTLINE_TAG} is missing`)
  }
  return tags
    .slice(0, cutlineIndex + 1)
    .flatMap((tag) => splitStatements(readFileSync(join(FRAMEWORK_BUNDLE, `${tag}.sql`), "utf8")))
}

// The frozen cutline (bundle == the cutline union by construction). The bundle
// comparison is only valid over CUTLINE-COVERED migrations: a POST-cutline
// increment correctly diverges from the (frozen) bundle, so comparing it would
// be wrong. Apply-all still happens for the collision check; only the column
// comparison + ownership are scoped to the cutline.
const CUTLINE_MANIFEST = loadCutlineManifest(ROOT)
const CUTLINE = CUTLINE_MANIFEST.cutline

/** Statements for a folder restricted to its cutline tags (dir = source name). */
function loadFolderCutline(folder, dir) {
  const covered = new Set(cutlineTagsFor(CUTLINE_MANIFEST, dir))
  return journalTags(folder)
    .filter((tag) => covered.has(tag))
    .flatMap((tag) => splitStatements(readFileSync(join(folder, `${tag}.sql`), "utf8")))
}

/** name -> { dir, name, requires, migrationsDir, hasMigrations }. */
function buildManifests() {
  const byName = new Map()
  for (const dir of readdirSync(join(ROOT, "packages"))) {
    const pjPath = join(ROOT, "packages", dir, "package.json")
    if (!existsSync(pjPath)) continue
    // The framework bundle is NOT a D.2 package source — it is decommissioned
    // from the fresh-D.2 apply path (it would re-create everything). Exclude it.
    if (dir === "framework-migrations") continue
    const pj = JSON.parse(readFileSync(pjPath, "utf8"))
    const migrationsDir = join(ROOT, "packages", dir, "migrations")
    byName.set(pj.name, {
      dir,
      name: pj.name,
      requires: pj.voyant?.requiresSchemas ?? [],
      migrationsDir,
      hasMigrations: existsSync(join(migrationsDir, "meta", "_journal.json")),
    })
  }
  return byName
}

/** Deps-first topo closure for `name`, limited to packages that ship migrations. */
function closure(name, manifests, out = [], seen = new Set()) {
  if (seen.has(name)) return out
  seen.add(name)
  const m = manifests.get(name)
  if (!m) return out
  for (const dep of m.requires) closure(dep, manifests, out, seen)
  if (m.hasMigrations) out.push(m)
  return out
}

/** Deps-first topo order over ALL packages that ship migrations (the fresh-D.2 set). */
function globalOrder(manifests) {
  const out = []
  const seen = new Set()
  for (const m of manifests.values()) if (m.hasMigrations) closure(m.name, manifests, out, seen)
  return out
}

/** Tables a package CREATEs across the given statements. */
function tablesIn(statements) {
  const set = new Set()
  for (const stmt of statements) {
    const m = stmt.match(/^CREATE TABLE (?:IF NOT EXISTS )?"([a-z0-9_]+)"/i)
    if (m) set.add(m[1])
  }
  return set
}

/** Tables a package's CUTLINE-COVERED migrations CREATE (the bundle-comparable
 *  set; post-cutline tables are excluded — they aren't in the frozen bundle). */
function ownTables(migrationsDir, dir) {
  return tablesIn(loadFolderCutline(migrationsDir, dir))
}

const urlFor = (name) => {
  const u = new URL(DB_URL)
  u.pathname = `/${name}`
  return u.toString()
}

async function onDb(name, fn) {
  const c = new Client({ connectionString: urlFor(name) })
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.end()
  }
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

/** table_name -> sorted column descriptor list. */
async function columnsByTable(client) {
  const r = await client.query(`
    SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns WHERE table_schema='public'
    ORDER BY table_name, column_name`)
  const m = new Map()
  for (const row of r.rows) {
    if (!m.has(row.table_name)) m.set(row.table_name, [])
    m.get(row.table_name).push(row)
  }
  return m
}

async function main() {
  const manifests = buildManifests()
  const byDir = new Map([...manifests.values()].map((m) => [m.dir, m]))
  const admin = new Client({ connectionString: urlFor("postgres") })
  await admin.connect()
  let failed = 0
  try {
    const bundleCols = await withFreshDb(admin, "d2_verify_bundle", async () => {
      await onDb("d2_verify_bundle", async (c) => {
        for (const stmt of loadFrameworkCutlineBundle()) await c.query(stmt)
      })
      return onDb("d2_verify_bundle", columnsByTable)
    })

    // --union: the fresh-D.2 check. (1) apply ALL generated package sources
    // together (deps-first) onto one DB, proving they don't collide (e.g.
    // duplicate shared enums). (2) apply only the CUTLINE-COVERED migrations onto
    // a second DB and prove they reconstitute the (frozen) bundle for every owned
    // table — post-cutline increments correctly diverge from the bundle, so they
    // are excluded from the comparison but still exercised by the collision apply.
    if (pkgs[0] === "--union") {
      const order = globalOrder(manifests)
      try {
        await withFreshDb(admin, "d2_verify_union_all", async () => {
          await onDb("d2_verify_union_all", async (c) => {
            for (const m of order)
              for (const stmt of loadFolder(m.migrationsDir)) await c.query(stmt)
          })
        })
      } catch (e) {
        failed++
        console.log(`  FAIL  union apply (all sources) errored — ${e.message}`)
      }
      let cols = null
      try {
        cols = await withFreshDb(admin, "d2_verify_union_cutline", async () => {
          await onDb("d2_verify_union_cutline", async (c) => {
            for (const m of order)
              for (const stmt of loadFolderCutline(m.migrationsDir, m.dir)) await c.query(stmt)
          })
          return onDb("d2_verify_union_cutline", columnsByTable)
        })
      } catch (e) {
        failed++
        console.log(`  FAIL  union cutline apply errored — ${e.message}`)
      }
      if (cols) {
        const own = new Set()
        for (const m of order) for (const t of ownTables(m.migrationsDir, m.dir)) own.add(t)
        const problems = []
        // Forward: every owned table matches the bundle column-for-column.
        for (const table of own) {
          const got = cols.get(table)
          const want = bundleCols.get(table)
          if (!want) problems.push(`table ${table} not in framework bundle`)
          else if (JSON.stringify(got) !== JSON.stringify(want))
            problems.push(`table ${table} columns differ from the bundle`)
        }
        // Reverse coverage: every bundle table must be owned by SOME source —
        // otherwise a schema-owning package was never onboarded (e.g. flights),
        // and a fresh D.2 database would silently miss those tables. Explicitly
        // retired cutline tables are absent from fresh composition by design.
        for (const table of bundleCols.keys()) {
          if (!own.has(table) && !RETIRED_CUTLINE_TABLES.has(table)) {
            problems.push(
              `bundle table ${table} is owned by no package source (un-onboarded owner?)`,
            )
          }
        }
        if (problems.length === 0) {
          console.log(
            `  PASS  union — ${order.length} package source(s) apply together; ${own.size} owned table(s) reconstitute the bundle column-for-column`,
          )
        } else {
          failed++
          console.log(`  FAIL  union — ${problems.length} table problem(s)`)
          for (const p of problems.slice(0, 8)) console.log(`          • ${p}`)
        }
      }
      console.log(`\n${failed === 0 ? "UNION PASS" : "UNION FAIL"}`)
      process.exit(failed === 0 ? 0 : 1)
    }

    for (const dir of pkgs) {
      const target = byDir.get(dir)
      if (!target?.hasMigrations) {
        failed++
        console.log(`  FAIL  ${dir} — no generated migrations folder`)
        continue
      }
      const order = closure(target.name, manifests) // deps first, target last
      const dbName = `d2_verify_${dir.replace(/[^a-z0-9]/g, "_")}`
      // Cutline-covered apply: compares the bundle-comparable baseline, deps-first.
      const cols = await withFreshDb(admin, dbName, async () => {
        await onDb(dbName, async (c) => {
          for (const m of order)
            for (const stmt of loadFolderCutline(m.migrationsDir, m.dir)) await c.query(stmt)
        })
        return onDb(dbName, columnsByTable)
      })

      const own = ownTables(target.migrationsDir, target.dir)
      const problems = []
      for (const table of own) {
        const got = cols.get(table)
        const want = bundleCols.get(table)
        if (!want) problems.push(`table ${table} not in framework bundle (cutline gap)`)
        else if (JSON.stringify(got) !== JSON.stringify(want))
          problems.push(`table ${table} columns differ from the bundle`)
      }
      const deps = order.length - 1
      if (problems.length === 0) {
        console.log(
          `  PASS  ${dir} — ${own.size} table(s) match the bundle column-for-column` +
            (deps > 0 ? ` (closure: ${deps} dep folder(s))` : ""),
        )
      } else {
        failed++
        console.log(`  FAIL  ${dir}`)
        for (const p of problems.slice(0, 8)) console.log(`          • ${p}`)
      }
    }
  } finally {
    await admin.end()
  }
  console.log(
    `\n${failed === 0 ? "VERIFY PASS" : "VERIFY FAIL"} — ${pkgs.length - failed}/${pkgs.length} packages`,
  )
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error("verify-package-baseline ERROR:", e)
  process.exit(2)
})
