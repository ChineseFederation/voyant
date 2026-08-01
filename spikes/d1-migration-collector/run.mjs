/**
 * SPIKE — D.1 framework-owned migration bundle + multi-source collector.
 * RFC: docs/architecture/consolidated-deployments-rfc.md (Workstream D.1).
 *
 * Question this retires: can a deployment apply a FRAMEWORK-SHIPPED migration
 * bundle (not locally regenerated), then layer its OWN migrations after, on
 * plain Postgres — with idempotency, framework-first ordering, a
 * version-independent ledger, and tamper (content-hash) immutability?
 *
 * This is a throwaway harness. It models two migration SOURCES — `framework`
 * (what `@voyant-travel/framework` would ship) and `deployment` (the host's
 * `src/migrations`) — and a collector that today lives split between
 * `apps/operator/scripts/migrate.ts` (single-folder journal) and the
 * CLI's `voyant db migrate`. It runs against a throwaway schema in the docker
 * test DB and prints PASS/FAIL per scenario.
 *
 * Run:  TEST_DATABASE_URL=<docker test DB url> node spikes/d1-migration-collector/run.mjs
 *   (any throwaway Postgres works — the harness isolates itself in its own schema)
 */
import { createHash } from "node:crypto"
import { createRequire } from "node:module"

// `pg` resolves from the operator starter's node_modules (it's the migrate
// runner's dep); the spike lives at repo root.
const require = createRequire(new URL("../../apps/operator/package.json", import.meta.url))
const { Client } = require("pg")

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL
if (!DATABASE_URL) {
  console.error(
    "Set DATABASE_URL or TEST_DATABASE_URL to a throwaway Postgres (e.g. the docker test DB).",
  )
  process.exit(2)
}
const SCHEMA = "voyant_d1_spike"
const LEDGER = `${SCHEMA}._voyant_migrations`

const hash = (sql) => createHash("sha256").update(sql).digest("hex").slice(0, 16)

/**
 * Migration sources. `priority` orders sources within a single run
 * (framework before deployment); production would refine this to release-epoch
 * + dependency-topological order, but framework-before-deployment is the
 * load-bearing invariant (deployment links reference framework tables).
 */
function buildSources() {
  return {
    framework: {
      priority: 0,
      migrations: [
        { tag: "0001_init", sql: `CREATE TABLE ${SCHEMA}.bookings (id text PRIMARY KEY);` },
        { tag: "0002_add_status", sql: `ALTER TABLE ${SCHEMA}.bookings ADD COLUMN status text;` },
      ],
    },
    deployment: {
      priority: 1,
      migrations: [
        // FK into a framework table — fails outright if applied before framework.
        {
          tag: "0001_acme_notes",
          sql: `CREATE TABLE ${SCHEMA}.acme_notes (id text PRIMARY KEY, booking_id text REFERENCES ${SCHEMA}.bookings(id));`,
        },
      ],
    },
  }
}

/** Deterministic apply order across sources: (source.priority, in-source index). */
function plan(sources) {
  const out = []
  for (const [name, s] of Object.entries(sources)) {
    s.migrations.forEach((m, i) => {
      out.push({
        source: name,
        priority: s.priority,
        seq: i,
        tag: m.tag,
        sql: m.sql,
        hash: hash(m.sql),
      })
    })
  }
  return out.sort((a, b) => a.priority - b.priority || a.seq - b.seq)
}

/**
 * The multi-source collector. Applies each pending migration in plan order,
 * recording (source, tag, content_hash) in one ledger. Skips already-applied
 * (idempotent); throws on a content-hash change for an applied (source, tag)
 * — a shipped migration must be immutable. Returns the list applied this run.
 */
async function migrate(client, sources) {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${LEDGER} (
       source text NOT NULL, tag text NOT NULL, content_hash text NOT NULL,
       applied_at timestamptz NOT NULL DEFAULT now(),
       PRIMARY KEY (source, tag)
     )`,
  )
  const applied = []
  for (const m of plan(sources)) {
    const seen = await client.query(
      `SELECT content_hash FROM ${LEDGER} WHERE source = $1 AND tag = $2`,
      [m.source, m.tag],
    )
    if (seen.rows.length > 0) {
      if (seen.rows[0].content_hash !== m.hash) {
        throw new Error(
          `IMMUTABILITY VIOLATION: ${m.source}/${m.tag} changed after it was applied ` +
            `(ledger ${seen.rows[0].content_hash} != current ${m.hash})`,
        )
      }
      continue // already applied, identical → no-op
    }
    await client.query(m.sql)
    await client.query(`INSERT INTO ${LEDGER} (source, tag, content_hash) VALUES ($1, $2, $3)`, [
      m.source,
      m.tag,
      m.hash,
    ])
    applied.push(`${m.source}/${m.tag}`)
  }
  return applied
}

// ---- scenarios ------------------------------------------------------------

let passed = 0
let failed = 0
function check(name, cond, detail = "") {
  if (cond) {
    passed++
    console.log(`  PASS  ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`)
  }
}

async function tableExists(client, name) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
    [SCHEMA, name],
  )
  return r.rows.length > 0
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()
  try {
    await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
    await client.query(`CREATE SCHEMA ${SCHEMA}`)

    console.log("Scenario 1 — fresh apply (framework bundle then deployment):")
    const s1 = await migrate(client, buildSources())
    check(
      "applies framework-first, then deployment, in order",
      JSON.stringify(s1) ===
        JSON.stringify([
          "framework/0001_init",
          "framework/0002_add_status",
          "deployment/0001_acme_notes",
        ]),
      `got ${JSON.stringify(s1)}`,
    )
    check("framework table exists", await tableExists(client, "bookings"))
    check("deployment table (FK into framework) exists", await tableExists(client, "acme_notes"))

    console.log("Scenario 2 — idempotent re-run:")
    const s2 = await migrate(client, buildSources())
    check("re-run applies nothing", s2.length === 0, `got ${JSON.stringify(s2)}`)

    console.log("Scenario 3 — framework upgrade ships a new migration:")
    const upgraded = buildSources()
    upgraded.framework.migrations.push({
      tag: "0003_add_index",
      sql: `CREATE INDEX bookings_status_idx ON ${SCHEMA}.bookings (status);`,
    })
    const s3 = await migrate(client, upgraded)
    check(
      "upgrade applies ONLY the new framework migration",
      JSON.stringify(s3) === JSON.stringify(["framework/0003_add_index"]),
      `got ${JSON.stringify(s3)}`,
    )

    console.log("Scenario 4 — tamper: an already-applied framework migration is edited:")
    const tampered = buildSources()
    tampered.framework.migrations[0].sql = `CREATE TABLE ${SCHEMA}.bookings (id text PRIMARY KEY, tampered boolean);`
    let threw = false
    try {
      await migrate(client, tampered)
    } catch (err) {
      threw = /IMMUTABILITY VIOLATION/.test(err.message)
    }
    check("editing a shipped migration is a hard error (content-hash immutability)", threw)

    console.log("Scenario 5 — ordering is load-bearing (proven by S1):")
    check(
      "deployment FK resolved because framework applied first",
      await tableExists(client, "acme_notes"),
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

main().catch((err) => {
  console.error("SPIKE ERROR:", err)
  process.exit(2)
})
