import { readFileSync } from "node:fs"

import { Client } from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  applyMigrations,
  compatibilityPreflightStatementsForMigration,
  type MigrationClient,
  MigrationImmutabilityError,
  MigrationRenameCompanionMissingError,
  type MigrationSource,
  planMigrations,
} from "./collector.js"

const DB_URL = process.env.TEST_DATABASE_URL
const SCHEMA = "voyant_fwmig_test"

// ---- planMigrations: pure, no DB --------------------------------------------

describe("planMigrations", () => {
  it("orders by (source priority, in-source sequence)", () => {
    const plan = planMigrations([
      { name: "deployment", priority: 1, migrations: [{ tag: "d0", sql: "select 1" }] },
      {
        name: "db",
        priority: 0,
        migrations: [
          { tag: "f0", sql: "select 1" },
          { tag: "f1", sql: "select 2" },
        ],
      },
    ])
    expect(plan.map((p) => `${p.source}/${p.tag}`)).toEqual(["db/f0", "db/f1", "deployment/d0"])
  })

  it("hashes by SQL content (different SQL → different hash)", () => {
    const [a] = planMigrations([{ name: "x", priority: 0, migrations: [{ tag: "t", sql: "A" }] }])
    const [b] = planMigrations([{ name: "x", priority: 0, migrations: [{ tag: "t", sql: "B" }] }])
    expect(a?.contentHash).toBeTypeOf("string")
    expect(a?.contentHash).not.toBe(b?.contentHash)
  })
})

describe("compatibility preflight migrations", () => {
  it("only targets the inventory product-days uniqueness migration", () => {
    expect(
      compatibilityPreflightStatementsForMigration({
        source: "inventory",
        tag: "0002_inventory_baseline",
        sql: `CREATE UNIQUE INDEX "uidx_product_days_itinerary_day_number" ON "product_days" USING btree ("itinerary_id","day_number");`,
      }),
    ).toHaveLength(1)

    expect(
      compatibilityPreflightStatementsForMigration({
        source: "inventory",
        tag: "0001_inventory_baseline",
        sql: `SELECT 1`,
      }),
    ).toEqual([])
    expect(
      compatibilityPreflightStatementsForMigration({
        source: "catalog",
        tag: "0002_inventory_baseline",
        sql: `CREATE UNIQUE INDEX "uidx_product_days_itinerary_day_number" ON "product_days" USING btree ("itinerary_id","day_number");`,
      }),
    ).toEqual([])
  })

  it("runs the product-days duplicate cleanup before the unchanged unique index SQL", async () => {
    const queries: string[] = []
    const client: MigrationClient = {
      async query(sql: string) {
        queries.push(sql)
        if (sql.includes(`SELECT "content_hash"`)) return { rows: [] }
        return { rows: [] }
      },
    }
    const uniqueIndexSql = `CREATE UNIQUE INDEX "uidx_product_days_itinerary_day_number" ON "product_days" USING btree ("itinerary_id","day_number");`

    const result = await applyMigrations(
      client,
      [
        {
          name: "inventory",
          priority: 0,
          migrations: [{ tag: "0002_inventory_baseline", sql: uniqueIndexSql }],
        },
      ],
      ledgerOpts,
    )

    expect(result.executed).toEqual(["inventory/0002_inventory_baseline"])
    const cleanupIndex = queries.findIndex((sql) => sql.includes("WITH ranked_days AS"))
    const uniqueIndex = queries.findIndex((sql) =>
      sql.includes(`CREATE UNIQUE INDEX "uidx_product_days_itinerary_day_number"`),
    )
    expect(cleanupIndex).toBeGreaterThan(-1)
    expect(uniqueIndex).toBeGreaterThan(cleanupIndex)
    expect(queries[uniqueIndex]).toBe(uniqueIndexSql)
  })
})

describe("migration hash compatibility", () => {
  it("accepts the catalog draft-cutover guard widening as equivalent (#4279)", async () => {
    // The real migration file, so the registered hash cannot drift from the bytes
    // it claims to describe — the failure mode an inline fixture would hide.
    const sql = readFileSync(
      new URL(
        "../../catalog/migrations/20260802190000_booking_v1_beta_draft_cutover.sql",
        import.meta.url,
      ),
      "utf8",
    )
    const client: MigrationClient = {
      async query(query: string) {
        if (query.includes(`SELECT "content_hash"`)) {
          // A database that applied the ORIGINAL, table-only guard.
          return {
            rows: [
              { content_hash: "fb264e967dd9b6c2220e65c71c05fe83b0c1be3b64ca642d82999bf65bbe51f5" },
            ],
          }
        }
        return { rows: [] }
      },
    }

    const result = await applyMigrations(
      client,
      [
        {
          name: "catalog",
          priority: 0,
          migrations: [{ tag: "20260802190000_booking_v1_beta_draft_cutover", sql }],
        },
      ],
      ledgerOpts,
    )
    expect(result).toEqual({ executed: [], baselined: [] })
  })

  it("still rejects genuinely changed SQL under the same tag", async () => {
    // Equivalence is registered per (source, tag, contentHash). Registering one
    // must not turn the tag into a hole the immutability gate ignores.
    const client: MigrationClient = {
      async query(query: string) {
        if (query.includes(`SELECT "content_hash"`)) {
          return {
            rows: [
              { content_hash: "fb264e967dd9b6c2220e65c71c05fe83b0c1be3b64ca642d82999bf65bbe51f5" },
            ],
          }
        }
        return { rows: [] }
      },
    }

    await expect(
      applyMigrations(
        client,
        [
          {
            name: "catalog",
            priority: 0,
            migrations: [{ tag: "20260802190000_booking_v1_beta_draft_cutover", sql: "SELECT 1;" }],
          },
        ],
        ledgerOpts,
      ),
    ).rejects.toBeInstanceOf(MigrationImmutabilityError)
  })

  it("accepts the db cloud-auth scopes idempotency rewrite as equivalent", async () => {
    const queries: string[] = []
    const client: MigrationClient = {
      async query(sql: string) {
        queries.push(sql)
        if (sql.includes(`SELECT "content_hash"`)) {
          return {
            rows: [
              {
                content_hash: "a152b612c5f41e6dd6ad1271faf9e51d3926526de7995df68e28046dc518ad0f",
              },
            ],
          }
        }
        return { rows: [] }
      },
    }

    const result = await applyMigrations(
      client,
      [
        {
          name: "db",
          priority: 0,
          migrations: [
            {
              tag: "0001_db_baseline",
              sql:
                'ALTER TABLE "cloud_auth_user_links" ADD COLUMN IF NOT EXISTS "scopes" jsonb;--> statement-breakpoint\n' +
                'ALTER TABLE "user_profiles" ADD COLUMN "permissions" jsonb;\n',
            },
          ],
        },
      ],
      ledgerOpts,
    )

    expect(result).toEqual({ executed: [], baselined: [] })
    expect(queries.some((sql) => sql === "BEGIN")).toBe(false)
  })

  const currentActionLedgerBaseline = readFileSync(
    new URL("../../action-ledger/migrations/0000_action_ledger_baseline.sql", import.meta.url),
    "utf8",
  )
  const formattedActionLedgerBaseline = `${currentActionLedgerBaseline.replace(
    "WHERE \n",
    "WHERE\n",
  )}\n`
  const actionLedgerHashes = {
    formatted: "d63e6a73b58f985888e258b318255eba5181db307438b25f3d262350f837b2ce",
    current: "2c1f05738aedd395ffdecc7d5000144a41e6af7e7a85b85563302e89bb1f4f6c",
  } as const

  it.each([
    {
      direction: "formatted ledger to current migration",
      sql: currentActionLedgerBaseline,
      expectedCurrentHash: actionLedgerHashes.current,
      ledgerHash: actionLedgerHashes.formatted,
    },
    {
      direction: "current ledger to formatted migration",
      sql: formattedActionLedgerBaseline,
      expectedCurrentHash: actionLedgerHashes.formatted,
      ledgerHash: actionLedgerHashes.current,
    },
  ])("accepts the action-ledger baseline rewrite from $direction", async (testCase) => {
    const queries: string[] = []
    const client: MigrationClient = {
      async query(sql: string) {
        queries.push(sql)
        if (sql.includes(`SELECT "content_hash"`)) {
          return { rows: [{ content_hash: testCase.ledgerHash }] }
        }
        return { rows: [] }
      },
    }
    const source: MigrationSource = {
      name: "action-ledger",
      priority: 0,
      migrations: [{ tag: "0000_action_ledger_baseline", sql: testCase.sql }],
    }

    expect(planMigrations([source])[0]?.contentHash).toBe(testCase.expectedCurrentHash)
    await expect(applyMigrations(client, [source], ledgerOpts)).resolves.toEqual({
      executed: [],
      baselined: [],
    })
    expect(queries).not.toContain("BEGIN")
  })

  it("still rejects an unrelated hash for the action-ledger baseline", async () => {
    const client: MigrationClient = {
      async query(sql: string) {
        if (sql.includes(`SELECT "content_hash"`)) {
          return { rows: [{ content_hash: "unrelated-hash" }] }
        }
        return { rows: [] }
      },
    }

    await expect(
      applyMigrations(
        client,
        [
          {
            name: "action-ledger",
            priority: 0,
            migrations: [{ tag: "0000_action_ledger_baseline", sql: currentActionLedgerBaseline }],
          },
        ],
        ledgerOpts,
      ),
    ).rejects.toBeInstanceOf(MigrationImmutabilityError)
  })

  // The v1 status cutover's payment-effect guard was narrowed in place (#4199),
  // stranding every deployment that had already applied the original. The
  // original bytes are reconstructed from the shipped file by undoing that edit,
  // so the pinned hashes below fail loudly if either generation drifts again.
  const currentBookingCutover = readFileSync(
    new URL(
      "../../bookings/migrations/20260802200000_booking_v1_status_cutover.sql",
      import.meta.url,
    ),
    "utf8",
  )
  const narrowedGuard = `          -- A recorded authorization, capture, or payment is money that moved.
          -- Only these are effects an operator can actually reconcile.
          payment_session."payment_authorization_id" IS NOT NULL
          OR payment_session."payment_capture_id" IS NOT NULL
          OR payment_session."payment_id" IS NOT NULL
          -- A checkout still inside its provider window may yet settle, so the
          -- migration must not delete the Booking underneath it. Past that
          -- window an unsettled session is an abandoned attempt by definition,
          -- which is exactly how the classifier already labelled the Booking.
          OR (
            payment_session."status" IN ('requires_redirect', 'processing')
            AND coalesce(
              payment_session."expires_at",
              payment_session."updated_at" + interval '24 hours'
            ) > now()
          )
`
  const originalGuard = `          payment_session."status" IN ('requires_redirect', 'processing')
          OR payment_session."provider_session_id" IS NOT NULL
          OR payment_session."provider_payment_id" IS NOT NULL
          OR payment_session."payment_authorization_id" IS NOT NULL
          OR payment_session."payment_capture_id" IS NOT NULL
          OR payment_session."payment_id" IS NOT NULL
`
  const narrowedCleanupNote = `-- Settled payment evidence was preserved as a commitment, and unreconciled
-- payment effects were rejected above. A session that only carries provider
-- identifiers is deliberately left in place: it is the sole record that this
-- deployment opened a checkout with the provider, so it keeps its \`booking_id\`
-- and survives the Booking it names rather than being erased or blanked.
`
  const originalCleanupNote = `-- External or settled payment evidence was preserved or rejected above.
`
  const originalBookingCutover = currentBookingCutover
    .replace(narrowedGuard, originalGuard)
    .replace(narrowedCleanupNote, originalCleanupNote)

  const bookingCutoverHashes = {
    original: "f1d9f275271c117792ddb0a9f13a41b48f65b4fc60a4a752d06f42bd132437da",
    narrowed: "1651c727ee4d02c269c4f104695a3c871999ab49cbefc9b7af3ec676a3211be4",
  } as const

  it("reconstructs the pre-#4199 cutover bytes from the shipped migration", () => {
    expect(currentBookingCutover).toContain(narrowedGuard)
    expect(currentBookingCutover).toContain(narrowedCleanupNote)
    expect(originalBookingCutover).not.toBe(currentBookingCutover)
  })

  it.each([
    {
      direction: "original ledger to narrowed migration",
      sql: currentBookingCutover,
      expectedCurrentHash: bookingCutoverHashes.narrowed,
      ledgerHash: bookingCutoverHashes.original,
    },
    {
      direction: "narrowed ledger to original migration",
      sql: originalBookingCutover,
      expectedCurrentHash: bookingCutoverHashes.original,
      ledgerHash: bookingCutoverHashes.narrowed,
    },
  ])("accepts the booking v1 status cutover guard narrowing from $direction", async (testCase) => {
    const queries: string[] = []
    const client: MigrationClient = {
      async query(sql: string) {
        queries.push(sql)
        if (sql.includes(`SELECT "content_hash"`)) {
          return { rows: [{ content_hash: testCase.ledgerHash, source: "bookings" }] }
        }
        return { rows: [] }
      },
    }
    const source: MigrationSource = {
      name: "bookings",
      priority: 0,
      migrations: [{ tag: "20260802200000_booking_v1_status_cutover", sql: testCase.sql }],
    }

    expect(planMigrations([source])[0]?.contentHash).toBe(testCase.expectedCurrentHash)
    await expect(applyMigrations(client, [source], ledgerOpts)).resolves.toEqual({
      executed: [],
      baselined: [],
    })
    expect(queries).not.toContain("BEGIN")
  })

  it("still rejects an unrelated hash for the booking v1 status cutover", async () => {
    const client: MigrationClient = {
      async query(sql: string) {
        if (sql.includes(`SELECT "content_hash"`)) {
          return { rows: [{ content_hash: "unrelated-hash", source: "bookings" }] }
        }
        return { rows: [] }
      },
    }

    await expect(
      applyMigrations(
        client,
        [
          {
            name: "bookings",
            priority: 0,
            migrations: [
              { tag: "20260802200000_booking_v1_status_cutover", sql: currentBookingCutover },
            ],
          },
        ],
        ledgerOpts,
      ),
    ).rejects.toBeInstanceOf(MigrationImmutabilityError)
  })

  const relationshipsBaseline = readFileSync(
    new URL("../../relationships/migrations/0000_relationships_baseline.sql", import.meta.url),
    "utf8",
  )

  /** A client whose ledger holds the pre-#4004 bytes of the relationships baseline. */
  function preRenameRelationshipsClient(): MigrationClient {
    return {
      async query(sql: string, params: unknown[] = []) {
        // Only the baseline is in the ledger — the rename increment, if this
        // deployment ships one, is still pending.
        if (sql.includes(`SELECT "content_hash"`) && params[1] === "0000_relationships_baseline") {
          return {
            rows: [
              // the bytes this file shipped with before #4004 renamed
              // `entity_type.quote` to `entity_type.proposal` in place.
              {
                content_hash: "2660a70a27fed3157299303cf022af08d5bc2f1628acc27d74f0465e1f82e198",
              },
            ],
          }
        }
        return { rows: [] }
      },
    }
  }

  const RELATIONSHIPS_RENAME_COMPANION = {
    tag: "20260804000100_proposal_entity_labels",
    sql: "ALTER TYPE entity_type RENAME VALUE 'quote' TO 'proposal';",
  }

  it("accepts the pre-rename relationships baseline when the rename increment ships with it", async () => {
    await expect(
      applyMigrations(
        preRenameRelationshipsClient(),
        [
          {
            name: "relationships",
            priority: 0,
            migrations: [
              { tag: "0000_relationships_baseline", sql: relationshipsBaseline },
              RELATIONSHIPS_RENAME_COMPANION,
            ],
          },
        ],
        ledgerOpts,
      ),
    ).resolves.toEqual({
      executed: ["relationships/20260804000100_proposal_entity_labels"],
      baselined: [],
    })
  })

  it("refuses the equivalence when the module predates the rename increment (voyant#4172)", async () => {
    // A deployment that upgraded the framework alone: the equivalence table is
    // present, but `@voyant-travel/relationships` still ships only the baseline.
    // Accepting here would record it applied and never rename `quote_*`.
    const error = await applyMigrations(
      preRenameRelationshipsClient(),
      [
        {
          name: "relationships",
          priority: 0,
          migrations: [{ tag: "0000_relationships_baseline", sql: relationshipsBaseline }],
        },
      ],
      ledgerOpts,
    ).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(MigrationRenameCompanionMissingError)
    expect(error).toMatchObject({
      acceptance: "equivalence",
      companion: { source: "relationships", tag: "20260804000100_proposal_entity_labels" },
    })
  })

  it("leaves the other equivalence families ungated — only the rename needs a companion", async () => {
    // `action-ledger/0000` is a formatting-only rewrite: both generations describe
    // the same schema, so there is no companion increment to require.
    const client: MigrationClient = {
      async query(sql: string) {
        if (sql.includes(`SELECT "content_hash"`)) {
          return {
            rows: [
              { content_hash: "d63e6a73b58f985888e258b318255eba5181db307438b25f3d262350f837b2ce" },
            ],
          }
        }
        return { rows: [] }
      },
    }

    await expect(
      applyMigrations(
        client,
        [
          {
            name: "action-ledger",
            priority: 0,
            migrations: [{ tag: "0000_action_ledger_baseline", sql: currentActionLedgerBaseline }],
          },
        ],
        ledgerOpts,
      ),
    ).resolves.toEqual({ executed: [], baselined: [] })
  })

  it("still rejects an unrelated hash for the relationships baseline", async () => {
    const client: MigrationClient = {
      async query(sql: string) {
        if (sql.includes(`SELECT "content_hash"`)) {
          return { rows: [{ content_hash: "unrelated-hash" }] }
        }
        return { rows: [] }
      },
    }

    await expect(
      applyMigrations(
        client,
        [
          {
            name: "relationships",
            priority: 0,
            migrations: [{ tag: "0000_relationships_baseline", sql: relationshipsBaseline }],
          },
        ],
        ledgerOpts,
      ),
    ).rejects.toBeInstanceOf(MigrationImmutabilityError)
  })
})

/** The retired `quotes` ledger identities `proposals/0000_proposals_baseline` replaces. */
const RETIRED_QUOTES_TAGS = [
  "0000_quotes_baseline",
  "0001_proposal_delivery_requests",
  "0002_durable_quote_delivery",
  "20260716000301_namespace_custom_field_values",
  "20260727200000_default_quote_pipeline",
] as const

function supersessionClient(recordedQuotesTags: readonly string[]) {
  const queries: string[] = []
  const inserted: Array<{ source: string; tag: string }> = []
  const client: MigrationClient = {
    async query(sql, params = []) {
      queries.push(sql)
      if (sql.includes(`SELECT "content_hash", "source"`)) return { rows: [] }
      if (sql.includes("unnest($1::text[], $2::text[])")) {
        const tags = params[1] as string[]
        return {
          rows: tags
            .filter((tag) => recordedQuotesTags.includes(tag))
            .map((tag) => ({ source: "quotes", tag })),
        }
      }
      if (sql.startsWith("INSERT INTO")) {
        inserted.push({ source: params[0] as string, tag: params[1] as string })
      }
      return { rows: [] }
    },
  }
  return { client, queries, inserted }
}

const proposalsBaselineSource: MigrationSource = {
  name: "proposals",
  priority: 0,
  migrations: [
    { tag: "0000_proposals_baseline", sql: `CREATE TABLE "proposals" (\n\t"id" text\n);` },
  ],
}

/** The increment that renames the adopted `quote_*` objects into the proposals shape. */
const PROPOSALS_RENAME_COMPANION = {
  tag: "20260804000000_adopt_legacy_quote_objects",
  sql: `ALTER TABLE "quotes" RENAME TO "proposals";`,
}

const proposalsWithCompanionSource: MigrationSource = {
  ...proposalsBaselineSource,
  migrations: [...proposalsBaselineSource.migrations, PROPOSALS_RENAME_COMPANION],
}

describe("retired-source supersession", () => {
  it("records the proposals baseline without executing when the whole quotes ledger is present", async () => {
    const { client, queries, inserted } = supersessionClient(RETIRED_QUOTES_TAGS)

    await expect(
      applyMigrations(client, [proposalsWithCompanionSource], ledgerOpts),
    ).resolves.toEqual({
      executed: ["proposals/20260804000000_adopt_legacy_quote_objects"],
      baselined: ["proposals/0000_proposals_baseline"],
    })
    expect(inserted).toEqual([
      { source: "proposals", tag: "0000_proposals_baseline" },
      { source: "proposals", tag: "20260804000000_adopt_legacy_quote_objects" },
    ])
    expect(queries.some((sql) => sql.startsWith(`CREATE TABLE "proposals"`))).toBe(false)
  })

  it("refuses to adopt the quotes ledger when the rename increment is absent (voyant#4172)", async () => {
    // `@voyant-travel/proposals` at a version that predates the rename increment:
    // recording the baseline would leave `quote_*` objects behind for good.
    const { client, inserted } = supersessionClient(RETIRED_QUOTES_TAGS)

    const error = await applyMigrations(client, [proposalsBaselineSource], ledgerOpts).catch(
      (thrown: unknown) => thrown,
    )

    expect(error).toBeInstanceOf(MigrationRenameCompanionMissingError)
    expect(error).toMatchObject({
      acceptance: "superseded-source",
      companion: { source: "proposals", tag: "20260804000000_adopt_legacy_quote_objects" },
    })
    expect(inserted).toEqual([])
  })

  it("executes normally on a fresh database with no quotes ledger at all", async () => {
    const { client, queries } = supersessionClient([])

    await expect(applyMigrations(client, [proposalsBaselineSource], ledgerOpts)).resolves.toEqual({
      executed: ["proposals/0000_proposals_baseline"],
      baselined: [],
    })
    expect(queries).toContain("BEGIN")
  })

  it("does NOT adopt a partially-migrated quotes ledger — the legacy objects are not at the superseding shape", async () => {
    const { client, queries } = supersessionClient(RETIRED_QUOTES_TAGS.slice(0, 3))

    await expect(applyMigrations(client, [proposalsBaselineSource], ledgerOpts)).resolves.toEqual({
      executed: ["proposals/0000_proposals_baseline"],
      baselined: [],
    })
    // On a real database the CREATE TABLE then fails loudly, which is the point:
    // a half-migrated legacy source must never be recorded as adopted.
    expect(queries).toContain("BEGIN")
  })

  it("leaves an unrelated source's baseline on the ordinary execute path", async () => {
    const { client, queries } = supersessionClient(RETIRED_QUOTES_TAGS)

    await expect(
      applyMigrations(client, [{ ...proposalsBaselineSource, name: "trips" }], ledgerOpts),
    ).resolves.toEqual({ executed: ["trips/0000_proposals_baseline"], baselined: [] })
    expect(queries.some((sql) => sql.includes("unnest($1::text[], $2::text[])"))).toBe(false)
  })
})

describe("migration source aliases", () => {
  it("adopts a matching legacy ledger row under the stable source without replaying SQL", async () => {
    const migrationSource: MigrationSource = {
      name: "finance",
      legacyNames: ["schema:@voyant-travel/finance#migrations"],
      priority: 0,
      migrations: [{ tag: "0000_finance", sql: "CREATE TABLE finance_records (id text);" }],
    }
    const [migration] = planMigrations([migrationSource])
    const ledger = new Map([
      ["schema:@voyant-travel/finance#migrations/0000_finance", migration?.contentHash ?? ""],
    ])
    const queries: string[] = []
    const client: MigrationClient = {
      async query(sql, params = []) {
        queries.push(sql)
        if (sql.includes('SELECT "content_hash", "source"')) {
          const sources = params[0] as string[]
          const tag = String(params[1])
          return {
            rows: sources.flatMap((source) => {
              const hash = ledger.get(`${source}/${tag}`)
              return hash ? [{ source, content_hash: hash }] : []
            }),
          }
        }
        if (sql.startsWith("INSERT INTO") && sql.includes("ON CONFLICT")) {
          ledger.set(`${String(params[0])}/${String(params[1])}`, String(params[2]))
        }
        return { rows: [] }
      },
    }

    const result = await applyMigrations(client, [migrationSource], ledgerOpts)

    expect(result).toEqual({ executed: [], baselined: [] })
    expect(ledger.get("finance/0000_finance")).toBe(migration?.contentHash)
    expect(ledger.has("schema:@voyant-travel/finance#migrations/0000_finance")).toBe(true)
    expect(queries).not.toContain("BEGIN")
  })

  it("rejects changed SQL recorded under a legacy source name", async () => {
    const client: MigrationClient = {
      async query(sql) {
        if (sql.includes('SELECT "content_hash", "source"')) {
          return {
            rows: [
              {
                source: "schema:@voyant-travel/finance#migrations",
                content_hash: "stale-hash",
              },
            ],
          }
        }
        return { rows: [] }
      },
    }

    await expect(
      applyMigrations(
        client,
        [
          {
            name: "finance",
            legacyNames: ["schema:@voyant-travel/finance#migrations"],
            priority: 0,
            migrations: [{ tag: "0000_finance", sql: "SELECT 1" }],
          },
        ],
        ledgerOpts,
      ),
    ).rejects.toBeInstanceOf(MigrationImmutabilityError)
  })
})

// ---- applyMigrations: execute path (integration) ----------------------------

function sources(): { db: MigrationSource; deployment: MigrationSource } {
  return {
    db: {
      name: "db",
      priority: 0,
      migrations: [
        { tag: "0001_init", sql: `CREATE TABLE ${SCHEMA}.bookings (id text PRIMARY KEY);` },
        { tag: "0002_add_status", sql: `ALTER TABLE ${SCHEMA}.bookings ADD COLUMN status text;` },
      ],
    },
    deployment: {
      name: "deployment",
      priority: 1,
      // FK into a db-source table — fails outright if applied before it.
      migrations: [
        {
          tag: "0001_acme_notes",
          sql: `CREATE TABLE ${SCHEMA}.acme_notes (id text PRIMARY KEY, booking_id text REFERENCES ${SCHEMA}.bookings(id));`,
        },
      ],
    },
  }
}

const ledgerOpts = { ledgerSchema: SCHEMA, ledgerTable: "_voyant_migrations" }
/** Cutline covering every tag in `sources()` — used to exercise import-baseline. */
const fullCutline = {
  db: ["0001_init", "0002_add_status"],
  deployment: ["0001_acme_notes"],
}

describe.skipIf(!DB_URL)("applyMigrations (integration)", () => {
  let client: Client

  beforeAll(async () => {
    client = new Client({ connectionString: DB_URL })
    await client.connect()
  })

  afterAll(async () => {
    if (client) {
      await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
      await client.end()
    }
  })

  beforeEach(async () => {
    await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
    await client.query(`CREATE SCHEMA ${SCHEMA}`)
  })

  async function tableExists(name: string): Promise<boolean> {
    const r = await client.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2",
      [SCHEMA, name],
    )
    return r.rows.length > 0
  }

  it("fresh apply is deps-first; the FK-bearing deployment table resolves", async () => {
    const s = sources()
    const r = await applyMigrations(client, [s.db, s.deployment], ledgerOpts)
    expect(r.executed).toEqual(["db/0001_init", "db/0002_add_status", "deployment/0001_acme_notes"])
    expect(r.baselined).toEqual([])
    expect(await tableExists("bookings")).toBe(true)
    // The deployment table FKs into the db-source table — exists only because the
    // db source applied first (ordering is load-bearing).
    expect(await tableExists("acme_notes")).toBe(true)
  })

  it("re-run is idempotent (applies nothing)", async () => {
    const s = sources()
    await applyMigrations(client, [s.db, s.deployment], ledgerOpts)
    const second = await applyMigrations(client, [s.db, s.deployment], ledgerOpts)
    expect(second.executed).toEqual([])
  })

  it("an upgrade applies only the new migration", async () => {
    const s = sources()
    await applyMigrations(client, [s.db, s.deployment], ledgerOpts)

    const upgraded = sources()
    upgraded.db.migrations.push({
      tag: "0003_add_index",
      sql: `CREATE INDEX bookings_status_idx ON ${SCHEMA}.bookings (status);`,
    })
    const r = await applyMigrations(client, [upgraded.db, upgraded.deployment], ledgerOpts)
    expect(r.executed).toEqual(["db/0003_add_index"])
  })

  it("editing an applied migration is a hard error", async () => {
    const s = sources()
    await applyMigrations(client, [s.db, s.deployment], ledgerOpts)

    const tampered = sources()
    tampered.db.migrations[0]!.sql =
      `CREATE TABLE ${SCHEMA}.bookings (id text PRIMARY KEY, tampered boolean);`
    await expect(
      applyMigrations(client, [tampered.db, tampered.deployment], ledgerOpts),
    ).rejects.toBeInstanceOf(MigrationImmutabilityError)
  })

  it("splits drizzle statement-breakpoints within one migration", async () => {
    const multi: MigrationSource = {
      name: "db",
      priority: 0,
      migrations: [
        {
          tag: "0001_multi",
          sql: `CREATE TABLE ${SCHEMA}.a (id text);\n--> statement-breakpoint\nCREATE TABLE ${SCHEMA}.b (id text);`,
        },
      ],
    }
    await applyMigrations(client, [multi], ledgerOpts)
    expect(await tableExists("a")).toBe(true)
    expect(await tableExists("b")).toBe(true)
  })

  // ---- import-baseline: adopt an already-materialised schema ------------------

  it("import-baselines the cutline on an existing DB WITHOUT executing any SQL", async () => {
    const s = sources()
    const r = await applyMigrations(client, [s.db, s.deployment], {
      ...ledgerOpts,
      cutline: fullCutline,
      existing: true,
    })
    // Every cutline migration is recorded …
    expect(r.baselined).toEqual([
      "db/0001_init",
      "db/0002_add_status",
      "deployment/0001_acme_notes",
    ])
    expect(r.executed).toEqual([])
    // … but none of their SQL ran (the schema is assumed already present).
    expect(await tableExists("bookings")).toBe(false)
    expect(await tableExists("acme_notes")).toBe(false)
  })

  it("a baselined ledger then applies nothing, but a post-cutline increment still runs", async () => {
    const s = sources()
    await applyMigrations(client, [s.db, s.deployment], {
      ...ledgerOpts,
      cutline: fullCutline,
      existing: true,
    })
    // The baselined (source, tag) rows are skipped — no attempt to re-create.
    const again = await applyMigrations(client, [s.db, s.deployment], {
      ...ledgerOpts,
      cutline: fullCutline,
      existing: true,
    })
    expect(again.executed).toEqual([])
    expect(again.baselined).toEqual([])
  })

  it("import-baseline is idempotent (re-run records nothing new)", async () => {
    const s = sources()
    await applyMigrations(client, [s.db, s.deployment], {
      ...ledgerOpts,
      cutline: fullCutline,
      existing: true,
    })
    const second = await applyMigrations(client, [s.db, s.deployment], {
      ...ledgerOpts,
      cutline: fullCutline,
      existing: true,
    })
    expect(second.baselined).toEqual([])
    expect(second.executed).toEqual([])
  })
})

// ---- applyMigrations dual-path: fresh executes, existing import-baselines ----

const DP_SCHEMA = "voyant_fwmig_dp_test"
const dpLedger = { ledgerSchema: DP_SCHEMA, ledgerTable: "_voyant_migrations" }

/** Two package sources (db → catalog) with a post-cutline catalog increment. */
function dpSources(): { db: MigrationSource; catalog: MigrationSource } {
  return {
    db: {
      name: "db",
      priority: 0,
      migrations: [
        { tag: "0000_db_baseline", sql: `CREATE TABLE ${DP_SCHEMA}.org (id text PRIMARY KEY);` },
      ],
    },
    catalog: {
      name: "catalog",
      priority: 1,
      migrations: [
        {
          tag: "0000_catalog_baseline",
          sql: `CREATE TABLE ${DP_SCHEMA}.product (id text PRIMARY KEY, org_id text REFERENCES ${DP_SCHEMA}.org(id));`,
        },
        // post-cutline increment (NOT in the cutline) — executes even on existing DBs
        { tag: "0001_add_sku", sql: `ALTER TABLE ${DP_SCHEMA}.product ADD COLUMN sku text;` },
      ],
    },
  }
}

// the prior runner materialised the baselines, not the post-cutline increment
const dpCutline = { db: ["0000_db_baseline"], catalog: ["0000_catalog_baseline"] }

describe.skipIf(!DB_URL)("applyMigrations (dual-path)", () => {
  let client: Client

  beforeAll(async () => {
    client = new Client({ connectionString: DB_URL })
    await client.connect()
  })
  afterAll(async () => {
    if (client) {
      await client.query(`DROP SCHEMA IF EXISTS ${DP_SCHEMA} CASCADE`)
      await client.end()
    }
  })
  beforeEach(async () => {
    await client.query(`DROP SCHEMA IF EXISTS ${DP_SCHEMA} CASCADE`)
    await client.query(`CREATE SCHEMA ${DP_SCHEMA}`)
  })

  const has = async (table: string, column?: string): Promise<boolean> => {
    const r = column
      ? await client.query(
          "SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=$3",
          [DP_SCHEMA, table, column],
        )
      : await client.query(
          "SELECT 1 FROM information_schema.tables WHERE table_schema=$1 AND table_name=$2",
          [DP_SCHEMA, table],
        )
    return r.rows.length > 0
  }
  const ledgerIds = async (): Promise<string[]> => {
    const r = await client.query(
      `SELECT source, tag FROM ${DP_SCHEMA}._voyant_migrations ORDER BY source, tag`,
    )
    return r.rows.map((row) => `${row.source}/${row.tag}`)
  }

  it("fresh — executes every package source, baselines nothing", async () => {
    const s = dpSources()
    const r = await applyMigrations(client, [s.db, s.catalog], {
      ...dpLedger,
      cutline: dpCutline,
      existing: false,
    })
    expect(r.executed).toEqual([
      "db/0000_db_baseline",
      "catalog/0000_catalog_baseline",
      "catalog/0001_add_sku",
    ])
    expect(r.baselined).toEqual([])
    expect(await has("org")).toBe(true)
    expect(await has("product", "sku")).toBe(true)
  })

  it("existing — import-baselines the cutline, executes the post-cutline increment, keeps prior rows", async () => {
    const s = dpSources()
    // Simulate a previously-materialised database: the baseline tables already
    // exist (no sku) and an inert prior-runner ledger row is present.
    await client.query(`CREATE TABLE ${DP_SCHEMA}.org (id text PRIMARY KEY)`)
    await client.query(
      `CREATE TABLE ${DP_SCHEMA}.product (id text PRIMARY KEY, org_id text REFERENCES ${DP_SCHEMA}.org(id))`,
    )
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${DP_SCHEMA}._voyant_migrations
         (source text NOT NULL, tag text NOT NULL, content_hash text NOT NULL,
          applied_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (source, tag))`,
    )
    await client.query(
      `INSERT INTO ${DP_SCHEMA}._voyant_migrations (source, tag, content_hash) VALUES ('framework','0000_baseline','deadbeef')`,
    )

    const r = await applyMigrations(client, [s.db, s.catalog], {
      ...dpLedger,
      cutline: dpCutline,
      existing: true,
    })
    // baselines recorded without executing (tables already existed — no double-create)
    expect(r.baselined.sort()).toEqual(["catalog/0000_catalog_baseline", "db/0000_db_baseline"])
    // the post-cutline increment executes
    expect(r.executed).toEqual(["catalog/0001_add_sku"])
    expect(await has("product", "sku")).toBe(true)
    // prior-runner history preserved + package rows recorded
    const ids = await ledgerIds()
    expect(ids).toContain("framework/0000_baseline")
    expect(ids).toContain("db/0000_db_baseline")
    expect(ids).toContain("catalog/0001_add_sku")
  })

  it("existing re-run is idempotent (nothing executed or baselined)", async () => {
    const s = dpSources()
    await applyMigrations(client, [s.db, s.catalog], {
      ...dpLedger,
      cutline: dpCutline,
      existing: false,
    })
    const again = await applyMigrations(client, [s.db, s.catalog], {
      ...dpLedger,
      cutline: dpCutline,
      existing: true,
    })
    expect(again.executed).toEqual([])
    expect(again.baselined).toEqual([])
  })
})
