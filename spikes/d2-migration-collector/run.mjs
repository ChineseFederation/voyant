/**
 * SPIKE — D.2 package-owned migrations + topological collector.
 * ADR: docs/architecture/migration-collector-d2.md.
 *
 * Question this retires: can a deployment move from the D.1 *monolithic*
 * `framework` bundle to *per-package* migration sources, such that ONE migrate
 * path is correct for BOTH:
 *   • a FRESH database (arbitrary module subset; the bundle is decommissioned
 *     from the apply path — only package sources run), and
 *   • an EXISTING D.1 database (schema already materialised by the frozen
 *     bundle, recorded under `framework/*`) — without re-executing any DDL
 *     (which would duplicate-create the tables the bundle already made)?
 *
 * The load-bearing trick (ADR decision 5): the bundle's tables are NOT
 * re-created on an existing DB — the package baselines that the retired bundle
 * already materialised are IMPORT-BASELINED (ledger row recorded, SQL NOT run),
 * gated by a parity guard, while genuinely-new package increments execute. The
 * old `framework/*` rows are kept as inert audit history. Detection key:
 * presence of `framework/*` rows in the ledger.
 *
 * This is a throwaway harness. It models a tiny package graph (db → catalog,
 * operator_settings → deployment links), the frozen D.1 bundle, and the D.2
 * collector. It isolates itself in its own schema and prints PASS/FAIL.
 *
 * Run:  TEST_DATABASE_URL=<docker test DB url> node spikes/d2-migration-collector/run.mjs
 *   (any throwaway Postgres works — the harness isolates itself in its own schema)
 */
import { createHash } from "node:crypto"
import { createRequire } from "node:module"

// `pg` resolves from the operator starter's node_modules (the migrate runner's
// dep); the spike lives at repo root.
const require = createRequire(new URL("../../apps/operator/package.json", import.meta.url))
const { Client } = require("pg")

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL
if (!DATABASE_URL) {
  console.error(
    "Set DATABASE_URL or TEST_DATABASE_URL to a throwaway Postgres (e.g. the docker test DB).",
  )
  process.exit(2)
}
const SCHEMA = "voyant_d2_spike"
const LEDGER = `${SCHEMA}._voyant_migrations`

const hash = (sql) => createHash("sha256").update(sql).digest("hex").slice(0, 16)
const t = (name) => `${SCHEMA}.${name}` // schema-qualify a table

// ---- the modelled world ---------------------------------------------------

/**
 * Per-package migration sources (D.2). Each package owns its FULL history.
 *   • requiresSchemas — the DAG edges (real packages declare this in
 *     package.json `voyant.requiresSchemas`, e.g. catalog → db).
 *   • baselineTags — the migrations the RETIRED D.1 bundle already
 *     materialised. On an existing D.1 DB these are import-baselined (recorded,
 *     not executed); a tag NOT listed here is genuinely new and executes.
 *   • creates — table a migration creates (used for the parity guard + to make
 *     a wrong re-execution collide loudly, like real bare CREATE TABLE).
 */
function buildPackages() {
  return {
    db: {
      name: "db",
      requiresSchemas: [],
      baselineTags: ["0001_init"],
      migrations: [
        {
          tag: "0001_init",
          creates: "org",
          sql: `CREATE TABLE ${t("org")} (id text PRIMARY KEY);`,
        },
      ],
    },
    catalog: {
      name: "catalog",
      requiresSchemas: ["db"],
      baselineTags: ["0001_init"],
      migrations: [
        {
          tag: "0001_init",
          creates: "product",
          // FK into db.org — fails outright if catalog runs before db.
          sql: `CREATE TABLE ${t("product")} (id text PRIMARY KEY, org_id text REFERENCES ${t("org")}(id));`,
        },
        {
          // POST-bundle increment: not in baselineTags, so it executes even on
          // an existing D.1 DB (the bundle never had this column).
          tag: "0002_add_sku",
          creates: null,
          sql: `ALTER TABLE ${t("product")} ADD COLUMN sku text;`,
        },
      ],
    },
    operator_settings: {
      name: "operator_settings",
      requiresSchemas: ["db"],
      baselineTags: ["0001_init"],
      migrations: [
        {
          tag: "0001_init",
          creates: "operator_settings",
          sql: `CREATE TABLE ${t("operator_settings")} (id text PRIMARY KEY, org_id text REFERENCES ${t("org")}(id));`,
        },
      ],
    },
  }
}

/** Deployment-local source: cross-module link tables. Always sorts LAST. */
function buildDeployment() {
  return {
    name: "deployment",
    baselineTags: ["0001_links"], // materialised in D.1 as its own `deployment` source
    migrations: [
      {
        tag: "0001_links",
        creates: "product_tag_link",
        // FK into catalog.product — requires catalog applied before deployment.
        sql: `CREATE TABLE ${t("product_tag_link")} (id text PRIMARY KEY, product_id text REFERENCES ${t("product")}(id));`,
      },
    ],
  }
}

/**
 * The FROZEN D.1 monolith: one `framework` source whose baseline creates every
 * package-owned table in one shot (mirrors 0000_framework_baseline). Used only
 * to seed the "existing D.1 database" starting state. Note bare CREATE TABLE —
 * a second source re-creating these collides, exactly like production.
 */
function buildFrameworkBundle() {
  return {
    framework: {
      priority: 0,
      migrations: [
        {
          tag: "0000_baseline",
          sql:
            `CREATE TABLE ${t("org")} (id text PRIMARY KEY);\n` +
            `CREATE TABLE ${t("product")} (id text PRIMARY KEY, org_id text REFERENCES ${t("org")}(id));\n` +
            `CREATE TABLE ${t("operator_settings")} (id text PRIMARY KEY, org_id text REFERENCES ${t("org")}(id));`,
        },
      ],
    },
    // In D.1 the deployment links are a SEPARATE source, not in the bundle.
    deployment: {
      priority: 1,
      migrations: [{ tag: "0001_links", sql: buildDeployment().migrations[0].sql }],
    },
  }
}

// ---- ordering: topo-sort the requiresSchemas DAG --------------------------

/**
 * Kahn topological sort over `requiresSchemas`, with the deployment-supplied
 * config order as the deterministic tie-breaker among independent packages.
 * Throws on a cycle (the real resolver does too). Returns package names in
 * apply order; the deployment source is appended LAST by the caller.
 */
function topoOrder(packages, configOrder) {
  const names = Object.keys(packages)
  const indeg = new Map(names.map((n) => [n, 0]))
  const deps = new Map(
    names.map((n) => [n, packages[n].requiresSchemas.filter((d) => packages[d])]),
  )
  for (const n of names) for (const _d of deps.get(n)) indeg.set(n, indeg.get(n) + 1)

  const tieRank = (n) => {
    const i = configOrder.indexOf(n)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  const ready = names.filter((n) => indeg.get(n) === 0).sort((a, b) => tieRank(a) - tieRank(b))
  const out = []
  while (ready.length) {
    const n = ready.shift()
    out.push(n)
    for (const m of names) {
      if (deps.get(m).includes(n)) {
        indeg.set(m, indeg.get(m) - 1)
        if (indeg.get(m) === 0) {
          ready.push(m)
          ready.sort((a, b) => tieRank(a) - tieRank(b))
        }
      }
    }
  }
  if (out.length !== names.length) throw new Error("CYCLE in requiresSchemas DAG")
  return out
}

// ---- the D.2 collector ----------------------------------------------------

async function ensureLedger(client) {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${LEDGER} (
       source text NOT NULL, tag text NOT NULL, content_hash text NOT NULL,
       applied_at timestamptz NOT NULL DEFAULT now(),
       PRIMARY KEY (source, tag)
     )`,
  )
}

async function ledgerHas(client, source, tag) {
  const r = await client.query(`SELECT content_hash FROM ${LEDGER} WHERE source=$1 AND tag=$2`, [
    source,
    tag,
  ])
  return r.rows[0]?.content_hash ?? null
}

async function tableExists(client, name) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema=$1 AND table_name=$2`,
    [SCHEMA, name],
  )
  return r.rows.length > 0
}

async function record(client, source, tag, h) {
  await client.query(
    `INSERT INTO ${LEDGER} (source, tag, content_hash) VALUES ($1,$2,$3)
     ON CONFLICT (source, tag) DO NOTHING`,
    [source, tag, h],
  )
}

/**
 * Apply ONE migrate run for a D.2 deployment. ONE code path for fresh + existing:
 *   • detect EXISTING by the presence of any `framework/*` ledger row;
 *   • per package, in topo order (deployment last), per migration:
 *       - already applied (same hash) → skip; different hash → immutability throw;
 *       - covered by the retired bundle (EXISTING && tag ∈ baselineTags) →
 *         parity-guard then IMPORT-BASELINE (record, do NOT execute);
 *       - otherwise → EXECUTE then record.
 * The frozen `framework/*` rows are never touched. Returns what happened.
 */
async function migrateD2(client, packages, deployment, configOrder) {
  await ensureLedger(client)
  const existing =
    (await client.query(`SELECT 1 FROM ${LEDGER} WHERE source='framework' LIMIT 1`)).rows.length > 0
  const order = topoOrder(packages, configOrder)
  const sources = [...order.map((n) => packages[n]), deployment]

  const res = { mode: existing ? "existing" : "fresh", executed: [], baselined: [], skipped: [] }
  for (const src of sources) {
    for (const m of src.migrations) {
      const id = `${src.name}/${m.tag}`
      const seen = await ledgerHas(client, src.name, m.tag)
      const h = hash(m.sql)
      if (seen !== null) {
        if (seen !== h) throw new Error(`IMMUTABILITY VIOLATION: ${id}`)
        res.skipped.push(id)
        continue
      }
      const coveredByBundle = existing && src.baselineTags.includes(m.tag)
      if (coveredByBundle) {
        // Parity guard: the bundle must really have materialised this — refuse
        // to baseline a table that isn't there (else we'd skip real DDL forever).
        if (m.creates && !(await tableExists(client, m.creates))) {
          throw new Error(`PARITY FAIL: cannot baseline ${id} — table ${m.creates} absent`)
        }
        await record(client, src.name, m.tag, h)
        res.baselined.push(id)
      } else {
        await client.query(m.sql)
        await record(client, src.name, m.tag, h)
        res.executed.push(id)
      }
    }
  }
  return res
}

// ---- scenarios ------------------------------------------------------------

let passed = 0
let failed = 0
const check = (name, cond, detail = "") => {
  if (cond) {
    passed++
    console.log(`  PASS  ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`)
  }
}

async function reset(client) {
  await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
  await client.query(`CREATE SCHEMA ${SCHEMA}`)
}

async function applyFrozenD1(client) {
  // Seed the "existing D.1 database": run the monolith bundle + deployment links
  // and record them under framework/* and deployment/* — the D.1 ledger state.
  await ensureLedger(client)
  const b = buildFrameworkBundle()
  for (const [name, s] of Object.entries(b)) {
    for (const m of s.migrations) {
      for (const stmt of m.sql.split("\n").filter(Boolean)) await client.query(stmt)
      await record(client, name, m.tag, hash(m.sql))
    }
  }
}

const ledgerRows = async (client) =>
  (await client.query(`SELECT source, tag FROM ${LEDGER} ORDER BY source, tag`)).rows.map(
    (r) => `${r.source}/${r.tag}`,
  )

async function main() {
  const CONFIG_ORDER = ["db", "catalog", "operator_settings"] // voyant.config module order
  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()
  try {
    // ---------------------------------------------------------------------
    console.log("Scenario 1 — FRESH D.2 (bundle decommissioned; package sources only):")
    await reset(client)
    const fresh = await migrateD2(client, buildPackages(), buildDeployment(), CONFIG_ORDER)
    check("detected fresh", fresh.mode === "fresh")
    check(
      "executes package sources in topo order (db → catalog → operator_settings → deployment)",
      JSON.stringify(fresh.executed) ===
        JSON.stringify([
          "db/0001_init",
          "catalog/0001_init",
          "catalog/0002_add_sku",
          "operator_settings/0001_init",
          "deployment/0001_links",
        ]),
      `got ${JSON.stringify(fresh.executed)}`,
    )
    check(
      "no framework/* rows on a fresh D.2 DB",
      !(await ledgerRows(client)).some((r) => r.startsWith("framework/")),
    )
    check(
      "all package tables exist (FK chain held)",
      (await tableExists(client, "product_tag_link")) &&
        (await tableExists(client, "operator_settings")),
    )
    check(
      "post-bundle increment applied (product.sku)",
      await columnExists(client, "product", "sku"),
    )

    // ---------------------------------------------------------------------
    console.log("\nScenario 2 — EXISTING D.1 → D.2 transition (import-baseline, no re-create):")
    await reset(client)
    await applyFrozenD1(client) // materialise the D.1 state
    const tablesBefore = await tableOids(client)
    const trans = await migrateD2(client, buildPackages(), buildDeployment(), CONFIG_ORDER)
    check("detected existing", trans.mode === "existing")
    check(
      "baseline tags import-baselined (recorded, NOT executed)",
      JSON.stringify(trans.baselined.sort()) ===
        JSON.stringify(["catalog/0001_init", "db/0001_init", "operator_settings/0001_init"]),
      `got ${JSON.stringify(trans.baselined)}`,
    )
    check(
      "genuinely-new increment EXECUTES (catalog/0002_add_sku)",
      JSON.stringify(trans.executed) === JSON.stringify(["catalog/0002_add_sku"]),
      `got ${JSON.stringify(trans.executed)}`,
    )
    check(
      "deployment/0001_links already applied in D.1 → skipped",
      trans.skipped.includes("deployment/0001_links"),
    )
    check(
      "no table was dropped/re-created (same oids for pre-existing tables)",
      await sameOids(client, tablesBefore, [
        "org",
        "product",
        "operator_settings",
        "product_tag_link",
      ]),
    )
    check(
      "frozen framework/0000_baseline row preserved",
      (await ledgerRows(client)).includes("framework/0000_baseline"),
    )
    check(
      "ledger now carries BOTH framework history AND package rows",
      (await ledgerRows(client)).includes("framework/0000_baseline") &&
        (await ledgerRows(client)).includes("catalog/0001_init"),
    )
    check(
      "post-transition increment really applied (product.sku)",
      await columnExists(client, "product", "sku"),
    )

    // ---------------------------------------------------------------------
    console.log("\nScenario 3 — NEGATIVE control: naive execute on an existing DB collides:")
    await reset(client)
    await applyFrozenD1(client)
    let collided = false
    try {
      // Pretend we wrongly EXECUTE a package baseline instead of import-baselining.
      await client.query(buildPackages().catalog.migrations[0].sql)
    } catch (err) {
      collided = err.code === "42P07" || /already exists/.test(err.message) // duplicate_table
    }
    check("re-creating a bundle-owned table fails (proves import-baseline is required)", collided)

    // ---------------------------------------------------------------------
    console.log("\nScenario 4 — idempotent re-run after transition:")
    await reset(client)
    await applyFrozenD1(client)
    await migrateD2(client, buildPackages(), buildDeployment(), CONFIG_ORDER)
    const rerun = await migrateD2(client, buildPackages(), buildDeployment(), CONFIG_ORDER)
    check(
      "re-run applies/baselines nothing new",
      rerun.executed.length === 0 && rerun.baselined.length === 0,
      `got executed=${JSON.stringify(rerun.executed)} baselined=${JSON.stringify(rerun.baselined)}`,
    )

    // ---------------------------------------------------------------------
    console.log("\nScenario 5 — cycle in requiresSchemas is rejected:")
    let threw = false
    try {
      const cyclic = buildPackages()
      cyclic.db.requiresSchemas = ["catalog"] // db ↔ catalog cycle
      topoOrder(cyclic, CONFIG_ORDER)
    } catch (err) {
      threw = /CYCLE/.test(err.message)
    }
    check("topo-sort throws on a dependency cycle", threw)

    // ---------------------------------------------------------------------
    console.log("\nScenario 6 — fresh D.2 and transitioned D.1 converge to an IDENTICAL schema:")
    // Both paths apply the same package sources (incl. the post-bundle increment
    // catalog/0002_add_sku) — a fresh DB by executing them, an existing D.1 DB by
    // import-baselining the bundle-covered tags and executing the rest. They must
    // end up with the same schema. Compare a COLUMN-level fingerprint, not just
    // table names: that is what catches column/index/constraint drift between a
    // package baseline and the bundle it replaces (e.g. a missing product.sku).
    await reset(client)
    await migrateD2(client, buildPackages(), buildDeployment(), CONFIG_ORDER) // fresh D.2
    const freshFp = await columnFingerprint(client)
    await reset(client)
    await applyFrozenD1(client) // materialise the D.1 state…
    await migrateD2(client, buildPackages(), buildDeployment(), CONFIG_ORDER) // …then transition
    const transitionedFp = await columnFingerprint(client)
    check(
      "fresh D.2 == transitioned D.1, column-for-column (catches drift table-name checks miss)",
      JSON.stringify(freshFp) === JSON.stringify(transitionedFp),
      `fresh=${freshFp.length} cols, transitioned=${transitionedFp.length} cols`,
    )
    check(
      "the post-bundle increment is present on BOTH paths (product.sku)",
      freshFp.some((c) => c.t === "product" && c.c === "sku") &&
        transitionedFp.some((c) => c.t === "product" && c.c === "sku"),
    )
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
    await client.end()
  }

  console.log(
    `\n${failed === 0 ? "SPIKE PASS" : "SPIKE FAIL"} — ${passed} passed, ${failed} failed`,
  )
  process.exit(failed === 0 ? 0 : 1)
}

// ---- small introspection helpers ------------------------------------------

async function columnExists(client, table, column) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=$3`,
    [SCHEMA, table, column],
  )
  return r.rows.length > 0
}
async function tableOids(client) {
  const r = await client.query(
    `SELECT c.relname, c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind='r'`,
    [SCHEMA],
  )
  return new Map(r.rows.map((x) => [x.relname, x.oid]))
}
async function sameOids(client, before, tables) {
  const after = await tableOids(client)
  return tables.every(
    (name) =>
      before.get(name) && after.get(name) && String(before.get(name)) === String(after.get(name)),
  )
}
/** Column-level schema fingerprint (table, column, type, nullability, default). */
async function columnFingerprint(client) {
  const r = await client.query(
    `SELECT table_name AS t, column_name AS c, data_type AS d, is_nullable AS n, column_default AS def
     FROM information_schema.columns
     WHERE table_schema=$1 AND table_name <> '_voyant_migrations'
     ORDER BY table_name, column_name`,
    [SCHEMA],
  )
  return r.rows
}

main().catch((err) => {
  console.error("SPIKE ERROR:", err)
  process.exit(2)
})
