// agent-quality: file-size exception -- owner: framework-migrations; deployment runner tests keep existing, baseline, adoption, and PostgreSQL conformance cases in one migration-contract harness.
import { Client } from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { MigrationClient, MigrationSource } from "./collector.js"
import { detectExisting, expectedSchema, runDeploymentMigrations } from "./deployment-runner.js"

const src = (name: string, sqls: string[]): MigrationSource => ({
  name,
  priority: name === "deployment" ? 1 : 0,
  migrations: sqls.map((sql, i) => ({ tag: `000${i}_${name}`, sql })),
})

describe("expectedSchema", () => {
  it("collects CREATE TABLE columns and ALTER ADD COLUMN", () => {
    const e = expectedSchema([
      src("pkg", [
        `CREATE TABLE "people" (\n\t"id" text PRIMARY KEY NOT NULL,\n\t"name" text\n);`,
        `ALTER TABLE "people" ADD COLUMN "email" text;`,
      ]),
    ])
    expect(e.tables.has("people")).toBe(true)
    expect([...e.columns].sort()).toEqual(["people.email", "people.id", "people.name"])
  })

  it("does NOT expect a column added then later DROPPED (net add/drop wins)", () => {
    const e = expectedSchema([
      src("pkg", [
        `CREATE TABLE "proposals" (\n\t"id" text PRIMARY KEY NOT NULL,\n\t"currency" text NOT NULL\n);`,
      ]),
      // a later deployment migration reverts the experiment
      src("deployment", [`ALTER TABLE "proposals" DROP COLUMN "currency";`]),
    ])
    expect(e.columns.has("proposals.id")).toBe(true)
    expect(e.columns.has("proposals.currency")).toBe(false)
  })

  it("honors DROP COLUMN IF EXISTS", () => {
    const e = expectedSchema([
      src("pkg", [`CREATE TABLE "t" (\n\t"id" text PRIMARY KEY NOT NULL,\n\t"x" text\n);`]),
      src("deployment", [`ALTER TABLE "t" DROP COLUMN IF EXISTS "x";`]),
    ])
    expect(e.columns.has("t.x")).toBe(false)
  })

  it("expects a RENAMED column under its NEW name, not the original", () => {
    const e = expectedSchema([
      src("pkg", [
        `CREATE TABLE "people" (\n\t"id" text PRIMARY KEY NOT NULL,\n\t"birthday" date\n);`,
      ]),
      src("deployment", [`ALTER TABLE "people" RENAME COLUMN "birthday" TO "date_of_birth";`]),
    ])
    expect(e.columns.has("people.birthday")).toBe(false)
    expect(e.columns.has("people.date_of_birth")).toBe(true)
  })

  it("drops a table's columns when the table itself is dropped", () => {
    const e = expectedSchema([
      src("pkg", [`CREATE TABLE "tmp" (\n\t"id" text PRIMARY KEY NOT NULL,\n\t"v" text\n);`]),
      src("deployment", [`DROP TABLE "tmp";`]),
    ])
    expect(e.tables.has("tmp")).toBe(false)
    expect(e.dropped.has("tmp")).toBe(true)
    expect([...e.columns].some((c) => c.startsWith("tmp."))).toBe(false)
  })
})

describe("runDeploymentMigrations on a partially adopted database", () => {
  it("does not re-assert cutline schema for already-recorded entries", async () => {
    // Ledger state: adoption already recorded action-ledger's covered baseline,
    // and an applied post-cutline increment legitimately DROPPED its outbox
    // table. A rerun must not demand the cutline-era outbox schema again.
    const ledgerRows = [
      { source: "framework", tag: "0000_framework_baseline", content_hash: "h-framework" },
      { source: "action-ledger", tag: "0000_action_ledger_baseline", content_hash: "h-covered" },
      {
        source: "action-ledger",
        tag: "0001_remove_outbox",
        content_hash: "b48b95e2b1ec55da472472782e63f89a5f6f8e0f5f26c8f24825ffe7dad5d33c",
      },
    ]
    const client: MigrationClient = {
      async query(sql: string, params: unknown[] = []) {
        if (sql.startsWith("SELECT to_regclass")) return { rows: [{ reg: String(params[0]) }] }
        if (sql.includes("count(*)")) return { rows: [{ n: "1" }] }
        if (sql.includes('SELECT "source", "tag" FROM')) {
          return { rows: ledgerRows.map(({ source, tag }) => ({ source, tag })) }
        }
        if (sql.includes('SELECT "content_hash", "source" FROM')) {
          // applyMigrations per-migration lookup: report both recorded rows.
          return { rows: [] }
        }
        if (sql.includes("information_schema.tables")) {
          return { rows: [] } // outbox (and everything else) absent
        }
        if (sql.includes("information_schema.columns")) return { rows: [] }
        if (sql.includes("pg_constraint")) return { rows: [] }
        return { rows: [] }
      },
    }

    const sources = [
      {
        name: "action-ledger",
        priority: 1,
        migrations: [
          {
            tag: "0000_action_ledger_baseline",
            sql: 'CREATE TABLE "action_ledger_outbox" ("id" text PRIMARY KEY);',
          },
        ],
      },
    ]
    const cutline = { "action-ledger": ["0000_action_ledger_baseline"] }

    // Without the recorded-entry filter this throws "NOT at the cutline schema"
    // (the outbox table is gone). With it, the covered entry is already
    // recorded, nothing is left to parity-gate, and the run proceeds.
    const result = await runDeploymentMigrations(client, sources, cutline)
    expect(result.existing).toBe(true)
  })

  it("records a superseding baseline instead of parity-gating it against the retired source's objects", async () => {
    // A deployment provisioned before the quotes → proposals rename: the retired
    // `quotes` source is fully recorded and its objects are live under their
    // legacy names, so `proposals/0000_proposals_baseline` must be RECORDED
    // rather than parity-gated (its tables do not yet exist under the new names)
    // or executed (that would collide with the legacy objects).
    const retiredQuotesTags = [
      "0000_quotes_baseline",
      "0001_proposal_delivery_requests",
      "0002_durable_quote_delivery",
      "20260716000301_namespace_custom_field_values",
      "20260727200000_default_quote_pipeline",
    ]
    const executed: string[] = []
    const inserted: Array<{ source: string; tag: string }> = []
    const client: MigrationClient = {
      async query(sql: string, params: unknown[] = []) {
        if (sql.startsWith("SELECT to_regclass")) return { rows: [{ reg: String(params[0]) }] }
        if (sql.includes("count(*)")) {
          return { rows: [{ n: sql.includes(`"source" = 'framework'`) ? "1" : "0" }] }
        }
        if (sql.includes('SELECT "source", "tag" FROM') && sql.includes("unnest")) {
          return { rows: retiredQuotesTags.map((tag) => ({ source: "quotes", tag })) }
        }
        if (sql.includes('SELECT "source", "tag" FROM')) {
          return { rows: retiredQuotesTags.map((tag) => ({ source: "quotes", tag })) }
        }
        if (sql.includes('SELECT "content_hash", "source" FROM')) return { rows: [] }
        if (sql.includes('SELECT DISTINCT "source"')) return { rows: [{ source: "quotes" }] }
        if (sql.includes("information_schema")) return { rows: [] } // no proposal_* objects yet
        if (sql.includes("pg_constraint")) return { rows: [] }
        if (sql.startsWith('CREATE TABLE "')) executed.push(sql)
        if (sql.startsWith("INSERT INTO") && params.length === 3) {
          inserted.push({ source: String(params[0]), tag: String(params[1]) })
        }
        return { rows: [] }
      },
    }

    const result = await runDeploymentMigrations(
      client,
      [
        {
          name: "proposals",
          priority: 1,
          migrations: [
            {
              tag: "0000_proposals_baseline",
              sql: 'CREATE TABLE "proposals" ("id" text PRIMARY KEY);',
            },
          ],
        },
      ],
      { proposals: ["0000_proposals_baseline"] },
    )

    expect(result.existing).toBe(true)
    expect(result.executed).toEqual([])
    expect(result.baselined).toEqual(["proposals/0000_proposals_baseline"])
    expect(executed).toEqual([])
    expect(inserted).toEqual([{ source: "proposals", tag: "0000_proposals_baseline" }])
  })

  function expansionClient(
    options: {
      existing?: boolean
      tables?: string[]
      columns?: Array<[string, string]>
      recordedSources?: string[]
    } = {},
  ) {
    const queries: string[] = []
    const executedCreates: string[] = []
    const inserted: Array<{ source: string; tag: string; contentHash: string }> = []
    const existing = options.existing ?? true
    const recordedSources = options.recordedSources ?? []
    const client: MigrationClient = {
      async query(sql: string, params: unknown[] = []) {
        queries.push(sql)
        if (sql.startsWith("SELECT to_regclass")) {
          return { rows: [{ reg: String(params[0]) }] }
        }
        if (sql.includes("count(*)")) {
          if (sql.includes('"drizzle"."__drizzle_migrations"')) {
            return { rows: [{ n: existing ? "45" : "0" }] }
          }
          return { rows: [{ n: "0" }] }
        }
        if (sql.includes('SELECT DISTINCT "source"')) {
          return { rows: recordedSources.map((source) => ({ source })) }
        }
        if (sql.includes('SELECT "source", "tag" FROM')) return { rows: [] }
        if (sql.includes('SELECT "content_hash", "source" FROM')) return { rows: [] }
        if (sql.includes("information_schema.tables")) {
          return { rows: (options.tables ?? []).map((table_name) => ({ table_name })) }
        }
        if (sql.includes("information_schema.columns")) {
          return {
            rows: (options.columns ?? []).map(([table_name, column_name]) => ({
              table_name,
              column_name,
            })),
          }
        }
        if (sql.includes("pg_constraint")) return { rows: [] }
        if (sql.startsWith('CREATE TABLE "')) executedCreates.push(sql)
        if (sql.startsWith("INSERT INTO") && params.length === 3) {
          inserted.push({
            source: String(params[0]),
            tag: String(params[1]),
            contentHash: String(params[2]),
          })
        }
        return { rows: [] }
      },
    }
    return { client, executedCreates, inserted, queries }
  }

  function profileExpansionSource(name: string, tableCount: number): MigrationSource {
    return {
      name,
      priority: 1,
      migrations: [
        {
          tag: `0000_${name}_baseline`,
          sql: Array.from(
            { length: tableCount },
            (_, index) =>
              `CREATE TABLE "${name.replaceAll("-", "_")}_${index}" (\n\t"id" text PRIMARY KEY NOT NULL\n);`,
          ).join("\n--> statement-breakpoint\n"),
        },
      ],
    }
  }

  it("executes wholly-absent unledgered sources when an existing profile expands", async () => {
    // Mirrors ProTravel's managed-profile delta exactly: accommodations adds
    // eight cutline tables, charters seven, and cruises nineteen. None of the
    // three sources or tables existed in the tenant before the profile grew.
    const sources = [
      profileExpansionSource("accommodations", 8),
      profileExpansionSource("charters", 7),
      profileExpansionSource("cruises", 19),
    ]
    const cutline = Object.fromEntries(
      sources.map((source) => [source.name, [source.migrations[0]?.tag as string]]),
    )
    const { client, executedCreates, inserted } = expansionClient()

    const result = await runDeploymentMigrations(client, sources, cutline)

    expect(result.existing).toBe(true)
    expect(result.baselined).toEqual([])
    expect(result.executed).toEqual([
      "accommodations/0000_accommodations_baseline",
      "charters/0000_charters_baseline",
      "cruises/0000_cruises_baseline",
    ])
    expect(executedCreates).toHaveLength(8 + 7 + 19)
    expect(inserted.map(({ source, tag }) => `${source}/${tag}`)).toEqual(result.executed)
  })

  it("import-baselines a fully-present unledgered source when an existing profile expands", async () => {
    const source = profileExpansionSource("accommodations", 2)
    const { client, executedCreates, inserted } = expansionClient({
      tables: ["accommodations_0", "accommodations_1"],
      columns: [
        ["accommodations_0", "id"],
        ["accommodations_1", "id"],
      ],
    })

    const result = await runDeploymentMigrations(client, [source], {
      accommodations: ["0000_accommodations_baseline"],
    })

    expect(result.existing).toBe(true)
    expect(result.executed).toEqual([])
    expect(result.baselined).toEqual(["accommodations/0000_accommodations_baseline"])
    expect(executedCreates).toEqual([])
    expect(inserted.map(({ source, tag }) => `${source}/${tag}`)).toEqual(result.baselined)
  })

  it("refuses a partially-present unledgered source instead of executing or baselining it", async () => {
    const source = profileExpansionSource("accommodations", 8)
    const firstTable = "accommodations_0"
    const { client, executedCreates, queries } = expansionClient({
      tables: [firstTable],
      columns: [[firstTable, "id"]],
    })

    await expect(
      runDeploymentMigrations(client, [source], {
        accommodations: ["0000_accommodations_baseline"],
      }),
    ).rejects.toThrow("7 expected table(s) missing")
    expect(executedCreates).toEqual([])
    expect(queries[0]).toContain("pg_advisory_lock")
    expect(queries.some((sql) => sql.startsWith("CREATE SCHEMA"))).toBe(false)
    expect(queries.some((sql) => sql.startsWith("INSERT INTO"))).toBe(false)
    expect(queries.some((sql) => sql === "BEGIN")).toBe(false)
    expect(queries.at(-1)).toContain("pg_advisory_unlock")
  })

  it.each([
    ["stable", undefined, "accommodations"],
    [
      "legacy",
      ["schema:@voyant-travel/accommodations#migrations"],
      "schema:@voyant-travel/accommodations#migrations",
    ],
  ] as const)("refuses an absent source with existing %s ledger lineage", async (_kind, legacyNames, recordedSource) => {
    const source = {
      ...profileExpansionSource("accommodations", 8),
      ...(legacyNames ? { legacyNames } : {}),
    }
    const { client, executedCreates } = expansionClient({
      recordedSources: [recordedSource],
    })

    await expect(
      runDeploymentMigrations(client, [source], {
        accommodations: ["0000_accommodations_baseline"],
      }),
    ).rejects.toThrow("8 expected table(s) missing")
    expect(executedCreates).toEqual([])
  })

  it("keeps fresh databases on the normal execute-from-scratch path", async () => {
    const source = profileExpansionSource("accommodations", 2)
    const { client, executedCreates } = expansionClient({ existing: false })

    const result = await runDeploymentMigrations(client, [source], {
      accommodations: ["0000_accommodations_baseline"],
    })

    expect(result.existing).toBe(false)
    expect(result.baselined).toEqual([])
    expect(result.executed).toEqual(["accommodations/0000_accommodations_baseline"])
    expect(executedCreates).toHaveLength(2)
  })

  it("still import-baselines cutline rows and executes post-cutline increments", async () => {
    const source: MigrationSource = {
      ...profileExpansionSource("accommodations", 1),
      migrations: [
        {
          tag: "0000_accommodations_baseline",
          sql: 'CREATE TABLE "accommodations_0" (\n\t"id" text PRIMARY KEY NOT NULL\n);',
        },
        {
          tag: "0001_accommodations_increment",
          sql: 'CREATE TABLE "accommodations_increment" (\n\t"id" text PRIMARY KEY NOT NULL\n);',
        },
      ],
    }
    const { client, executedCreates } = expansionClient({
      tables: ["accommodations_0"],
      columns: [["accommodations_0", "id"]],
    })

    const result = await runDeploymentMigrations(client, [source], {
      accommodations: ["0000_accommodations_baseline"],
    })

    expect(result.baselined).toEqual(["accommodations/0000_accommodations_baseline"])
    expect(result.executed).toEqual(["accommodations/0001_accommodations_increment"])
    expect(executedCreates).toEqual([
      'CREATE TABLE "accommodations_increment" (\n\t"id" text PRIMARY KEY NOT NULL\n);',
    ])
  })
})

describe("explicit materialized-migration adoption", () => {
  const materializedSource: MigrationSource = {
    name: "inventory",
    priority: 1,
    migrations: [
      {
        tag: "0001_inventory_baseline",
        sql: `CREATE TABLE "product_day_service_translations" (
  "id" text PRIMARY KEY NOT NULL,
  "service_id" text NOT NULL,
  "language_tag" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_itinerary_translations" (
  "id" text PRIMARY KEY NOT NULL,
  "itinerary_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_day_service_translations" ADD CONSTRAINT "product_day_service_translations_service_id_product_day_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."product_day_services"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_product_day_service_translations_service_language" ON "product_day_service_translations" USING btree ("service_id","language_tag");
--> statement-breakpoint
CREATE INDEX "idx_product_itinerary_translations_itinerary" ON "product_itinerary_translations" USING btree ("itinerary_id");`,
      },
    ],
  }
  const adoption = [{ source: "inventory", tag: "0001_inventory_baseline" }] as const

  const exactColumns = [
    {
      table_name: "product_day_service_translations",
      column_name: "id",
      ordinal_position: "1",
      data_type: "text",
      not_null: true,
      column_default: null,
      identity_kind: "",
      generated_kind: "",
    },
    {
      table_name: "product_day_service_translations",
      column_name: "service_id",
      ordinal_position: "2",
      data_type: "text",
      not_null: true,
      column_default: null,
      identity_kind: "",
      generated_kind: "",
    },
    {
      table_name: "product_day_service_translations",
      column_name: "language_tag",
      ordinal_position: "3",
      data_type: "text",
      not_null: true,
      column_default: null,
      identity_kind: "",
      generated_kind: "",
    },
    {
      table_name: "product_day_service_translations",
      column_name: "created_at",
      ordinal_position: "4",
      data_type: "timestamp with time zone",
      not_null: true,
      column_default: "now()",
      identity_kind: "",
      generated_kind: "",
    },
    {
      table_name: "product_itinerary_translations",
      column_name: "id",
      ordinal_position: "1",
      data_type: "text",
      not_null: true,
      column_default: null,
      identity_kind: "",
      generated_kind: "",
    },
    {
      table_name: "product_itinerary_translations",
      column_name: "itinerary_id",
      ordinal_position: "2",
      data_type: "text",
      not_null: true,
      column_default: null,
      identity_kind: "",
      generated_kind: "",
    },
  ]
  const exactConstraints = [
    {
      table_name: "product_day_service_translations",
      constraint_name: "product_day_service_translations_pkey",
      constraint_type: "p",
      column_names: ["id"],
      referenced_schema: null,
      referenced_table: null,
      referenced_column_names: [],
      update_action: " ",
      delete_action: " ",
      match_type: " ",
      is_deferrable: false,
      initially_deferred: false,
    },
    {
      table_name: "product_day_service_translations",
      // PostgreSQL truncates identifiers to NAMEDATALEN - 1 (63) bytes.
      constraint_name: "product_day_service_translations_service_id_product_day_service",
      constraint_type: "f",
      column_names: ["service_id"],
      referenced_schema: "public",
      referenced_table: "product_day_services",
      referenced_column_names: ["id"],
      update_action: "a",
      delete_action: "c",
      match_type: "s",
      is_deferrable: false,
      initially_deferred: false,
    },
    {
      table_name: "product_itinerary_translations",
      constraint_name: "product_itinerary_translations_pkey",
      constraint_type: "p",
      column_names: ["id"],
      referenced_schema: null,
      referenced_table: null,
      referenced_column_names: [],
      update_action: " ",
      delete_action: " ",
      match_type: " ",
      is_deferrable: false,
      initially_deferred: false,
    },
  ]
  const exactIndexes = [
    {
      table_name: "product_day_service_translations",
      index_name: "uidx_product_day_service_translations_service_language",
      index_definition:
        "CREATE UNIQUE INDEX uidx_product_day_service_translations_service_language ON public.product_day_service_translations USING btree (service_id, language_tag)",
      is_valid: true,
      is_ready: true,
      is_live: true,
    },
    {
      table_name: "product_itinerary_translations",
      index_name: "idx_product_itinerary_translations_itinerary",
      index_definition:
        "CREATE INDEX idx_product_itinerary_translations_itinerary ON public.product_itinerary_translations USING btree (itinerary_id)",
      is_valid: true,
      is_ready: true,
      is_live: true,
    },
  ]

  function adoptionClient(options: {
    existing?: boolean
    tables?: string[]
    tableRows?: ReadonlyArray<{
      table_name: string
      relation_kind: string
      relation_persistence: string
    }>
    columns?: typeof exactColumns
    constraints?: typeof exactConstraints
    indexes?: typeof exactIndexes
    serializeLocks?: boolean
  }) {
    const ledgerRows: Array<{ source: string; tag: string; content_hash: string }> = []
    const statements: string[] = []
    const events: string[] = []
    let locked = false
    const lockWaiters: Array<() => void> = []
    const client: MigrationClient = {
      async query(sql, params = []) {
        statements.push(sql)
        if (sql.includes("pg_advisory_lock")) {
          if (options.serializeLocks && locked) {
            await new Promise<void>((resolve) => lockWaiters.push(resolve))
          }
          locked = true
          events.push("lock")
          return { rows: [] }
        }
        if (sql.includes("pg_advisory_unlock")) {
          events.push("unlock")
          locked = false
          lockWaiters.shift()?.()
          return { rows: [] }
        }
        if (sql.startsWith("SELECT to_regclass")) return { rows: [{ reg: String(params[0]) }] }
        if (sql.includes("count(*)")) {
          if (sql.includes(`"source" = 'framework'`)) {
            return { rows: [{ n: options.existing === false ? "0" : "1" }] }
          }
          return { rows: [{ n: "0" }] }
        }
        if (sql.includes('SELECT "source", "content_hash" FROM')) {
          const sources = params[0] as string[]
          const tag = String(params[1])
          return {
            rows: ledgerRows.filter((row) => sources.includes(row.source) && row.tag === tag),
          }
        }
        if (sql.includes('SELECT "content_hash", "source" FROM')) {
          const sources = params[0] as string[]
          const tag = String(params[1])
          return {
            rows: ledgerRows.filter((row) => sources.includes(row.source) && row.tag === tag),
          }
        }
        if (sql.includes("FROM pg_class c") && sql.includes("c.relkind")) {
          return {
            rows: (
              options.tableRows ??
              (options.tables ?? []).map((table_name) => ({
                table_name,
                relation_kind: "r",
                relation_persistence: "p",
              }))
            ).map((row) => ({ ...row })),
          }
        }
        if (sql.includes("FROM pg_attribute a")) return { rows: options.columns ?? [] }
        if (sql.includes("FROM pg_constraint con")) return { rows: options.constraints ?? [] }
        if (sql.includes("FROM pg_index i")) return { rows: options.indexes ?? [] }
        if (sql.startsWith("INSERT INTO") && params.length === 3) {
          ledgerRows.push({
            source: String(params[0]),
            tag: String(params[1]),
            content_hash: String(params[2]),
          })
        }
        return { rows: [] }
      },
    }
    return { client, events, ledgerRows, statements }
  }

  function exactClient(options: { existing?: boolean; serializeLocks?: boolean } = {}) {
    return adoptionClient({
      ...options,
      tables: ["product_day_service_translations", "product_itinerary_translations"],
      columns: exactColumns,
      constraints: exactConstraints,
      indexes: exactIndexes,
    })
  }

  it("adopts a fully present exact footprint with the current hash", async () => {
    const { client, ledgerRows, statements } = exactClient()
    const result = await runDeploymentMigrations(
      client,
      [materializedSource],
      {},
      {
        materializedMigrationAdoptions: adoption,
      },
    )

    expect(result.executed).toEqual([])
    expect(result.adopted).toEqual(["inventory/0001_inventory_baseline"])
    expect(result.baselined).toEqual(result.adopted)
    expect(ledgerRows).toHaveLength(1)
    expect(ledgerRows[0]?.content_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(statements.some((sql) => sql.startsWith('CREATE TABLE "product_'))).toBe(false)
  })

  it("adopts selected exact table DDL and executes the migration remainder", async () => {
    const selectedTable = "product_day_service_translations"
    const { client, ledgerRows, statements } = adoptionClient({
      tables: [selectedTable],
      columns: exactColumns.filter((row) => row.table_name === selectedTable),
      constraints: exactConstraints.filter((row) => row.table_name === selectedTable),
      indexes: exactIndexes.filter((row) => row.table_name === selectedTable),
    })

    const result = await runDeploymentMigrations(
      client,
      [materializedSource],
      {},
      {
        materializedMigrationAdoptions: [
          {
            source: "inventory",
            tag: "0001_inventory_baseline",
            tables: [selectedTable],
          },
        ],
      },
    )

    expect(result.adopted).toEqual(["inventory/0001_inventory_baseline"])
    expect(result.baselined).toEqual([])
    expect(result.executed).toEqual(["inventory/0001_inventory_baseline"])
    expect(ledgerRows).toHaveLength(1)
    expect(ledgerRows[0]?.content_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(
      statements.some((sql) => sql.startsWith('CREATE TABLE "product_day_service_translations"')),
    ).toBe(false)
    expect(
      statements.some((sql) => sql.startsWith('CREATE TABLE "product_itinerary_translations"')),
    ).toBe(true)
    expect(statements.some((sql) => sql.includes("uidx_product_day_service_translations"))).toBe(
      false,
    )
    expect(
      statements.some((sql) => sql.includes("idx_product_itinerary_translations_itinerary")),
    ).toBe(true)
  })

  it("leaves a wholly absent candidate on the normal execute path for an existing database", async () => {
    const { client, statements } = adoptionClient({ existing: true, tables: [] })
    const result = await runDeploymentMigrations(
      client,
      [materializedSource],
      {},
      {
        materializedMigrationAdoptions: adoption,
      },
    )

    expect(result.adopted).toEqual([])
    expect(result.baselined).toEqual([])
    expect(result.executed).toEqual(["inventory/0001_inventory_baseline"])
    expect(statements.some((sql) => sql.startsWith('CREATE TABLE "product_'))).toBe(true)
  })

  it("does not require adoption parser support when an existing database has no footprint", async () => {
    const source = src("custom", [
      'CREATE TABLE "custom_table" ("id" text PRIMARY KEY);\n--> statement-breakpoint\nCOMMENT ON TABLE "custom_table" IS \'normal execution only\';',
    ])
    const { client } = adoptionClient({ existing: true, tables: [] })
    const result = await runDeploymentMigrations(
      client,
      [source],
      {},
      {
        materializedMigrationAdoptions: [{ source: "custom", tag: "0000_custom" }],
      },
    )

    expect(result.adopted).toEqual([])
    expect(result.executed).toEqual(["custom/0000_custom"])
  })

  it("keeps a fresh database on the normal execute path even if adoption is allowlisted", async () => {
    const { client, statements } = adoptionClient({ existing: false, tables: [] })
    const result = await runDeploymentMigrations(
      client,
      [materializedSource],
      {},
      {
        materializedMigrationAdoptions: adoption,
      },
    )

    expect(result.existing).toBe(false)
    expect(result.adopted).toEqual([])
    expect(result.executed).toEqual(["inventory/0001_inventory_baseline"])
    expect(statements.some((sql) => sql.includes("FROM pg_attribute a"))).toBe(false)
  })

  it("fails a partial footprint before an earlier normal migration mutates anything", async () => {
    const earlier = src("earlier", ['CREATE TABLE "earlier" ("id" text PRIMARY KEY);'])
    const { client, ledgerRows, statements } = adoptionClient({
      tables: ["product_day_service_translations"],
    })

    await expect(
      runDeploymentMigrations(
        client,
        [earlier, materializedSource],
        {},
        {
          materializedMigrationAdoptions: adoption,
        },
      ),
    ).rejects.toThrow("does not exactly match")
    expect(ledgerRows).toEqual([])
    expect(statements).not.toContain("BEGIN")
    expect(statements.some((sql) => sql.startsWith('CREATE TABLE "earlier"'))).toBe(false)
    expect(statements.at(0)).toContain("pg_advisory_lock")
    expect(statements.at(-1)).toContain("pg_advisory_unlock")
  })

  it.each([
    [
      "column",
      {
        columns: exactColumns.map((row, index) =>
          index === 0 ? { ...row, data_type: "integer" } : row,
        ),
      },
    ],
    [
      "constraint",
      {
        constraints: exactConstraints.map((row, index) =>
          index === 1 ? { ...row, delete_action: "a" } : row,
        ),
      },
    ],
    [
      "index",
      {
        indexes: exactIndexes.map((row, index) =>
          index === 0
            ? { ...row, index_definition: row.index_definition.replace("CREATE UNIQUE", "CREATE") }
            : row,
        ),
      },
    ],
    [
      "relation kind",
      {
        tableRows: [
          {
            table_name: "product_day_service_translations",
            relation_kind: "p",
            relation_persistence: "p",
          },
          {
            table_name: "product_itinerary_translations",
            relation_kind: "r",
            relation_persistence: "p",
          },
        ],
      },
    ],
    [
      "relation persistence",
      {
        tableRows: [
          {
            table_name: "product_day_service_translations",
            relation_kind: "r",
            relation_persistence: "u",
          },
          {
            table_name: "product_itinerary_translations",
            relation_kind: "r",
            relation_persistence: "p",
          },
        ],
      },
    ],
    [
      "index validity",
      {
        indexes: exactIndexes.map((row, index) =>
          index === 0 ? { ...row, is_valid: false } : row,
        ),
      },
    ],
  ] as const)("rejects an exact-footprint %s mismatch", async (_kind, override) => {
    const { client, ledgerRows } = adoptionClient({
      tables: ["product_day_service_translations", "product_itinerary_translations"],
      columns: exactColumns,
      constraints: exactConstraints,
      indexes: exactIndexes,
      ...override,
    })
    await expect(
      runDeploymentMigrations(
        client,
        [materializedSource],
        {},
        {
          materializedMigrationAdoptions: adoption,
        },
      ),
    ).rejects.toThrow("does not exactly match")
    expect(ledgerRows).toEqual([])
  })

  it("rejects default expressions that differ only inside a string literal", async () => {
    const source = src("literal-defaults", [
      `CREATE TABLE "literal_defaults" (
  "id" text PRIMARY KEY NOT NULL,
  "label" text DEFAULT 'a, b'::text NOT NULL
);`,
    ])
    const { client, ledgerRows } = adoptionClient({
      tables: ["literal_defaults"],
      columns: [
        {
          table_name: "literal_defaults",
          column_name: "id",
          ordinal_position: "1",
          data_type: "text",
          not_null: true,
          column_default: null,
          identity_kind: "",
          generated_kind: "",
        },
        {
          table_name: "literal_defaults",
          column_name: "label",
          ordinal_position: "2",
          data_type: "text",
          not_null: true,
          column_default: "'a,b'::text",
          identity_kind: "",
          generated_kind: "",
        },
      ],
      constraints: [
        {
          table_name: "literal_defaults",
          constraint_name: "literal_defaults_pkey",
          constraint_type: "p",
          column_names: ["id"],
          referenced_schema: null,
          referenced_table: null,
          referenced_column_names: [],
          update_action: " ",
          delete_action: " ",
          match_type: " ",
          is_deferrable: false,
          initially_deferred: false,
        },
      ],
      indexes: [],
    })

    await expect(
      runDeploymentMigrations(
        client,
        [source],
        {},
        {
          materializedMigrationAdoptions: [
            { source: "literal-defaults", tag: "0000_literal-defaults" },
          ],
        },
      ),
    ).rejects.toThrow("does not exactly match")
    expect(ledgerRows).toEqual([])
  })

  it("fails closed for E-string defaults with backslash-escaped quotes", async () => {
    const source = src("escaped-literal-defaults", [
      `CREATE TABLE "escaped_literal_defaults" (
  "id" text PRIMARY KEY NOT NULL,
  "label" text DEFAULT E'a\\'B, C'::text NOT NULL
);`,
    ])
    const { client, ledgerRows } = adoptionClient({
      tables: ["escaped_literal_defaults"],
      columns: [
        {
          table_name: "escaped_literal_defaults",
          column_name: "id",
          ordinal_position: "1",
          data_type: "text",
          not_null: true,
          column_default: null,
          identity_kind: "",
          generated_kind: "",
        },
        {
          table_name: "escaped_literal_defaults",
          column_name: "label",
          ordinal_position: "2",
          data_type: "text",
          not_null: true,
          column_default: "E'a\\'b,c'::text",
          identity_kind: "",
          generated_kind: "",
        },
      ],
      constraints: [
        {
          table_name: "escaped_literal_defaults",
          constraint_name: "escaped_literal_defaults_pkey",
          constraint_type: "p",
          column_names: ["id"],
          referenced_schema: null,
          referenced_table: null,
          referenced_column_names: [],
          update_action: " ",
          delete_action: " ",
          match_type: " ",
          is_deferrable: false,
          initially_deferred: false,
        },
      ],
      indexes: [],
    })

    await expect(
      runDeploymentMigrations(
        client,
        [source],
        {},
        {
          materializedMigrationAdoptions: [
            {
              source: "escaped-literal-defaults",
              tag: "0000_escaped-literal-defaults",
            },
          ],
        },
      ),
    ).rejects.toThrow("E-string default expressions are not supported")
    expect(ledgerRows).toEqual([])
  })

  it("fails closed for parenthesized E-string defaults", async () => {
    const source = src("parenthesized-escaped-literal-defaults", [
      `CREATE TABLE "parenthesized_escaped_literal_defaults" (
  "id" text PRIMARY KEY NOT NULL,
  "label" text DEFAULT (( E'a\\'B, C'::text )) NOT NULL
);`,
    ])
    const { client, ledgerRows } = adoptionClient({
      tables: ["parenthesized_escaped_literal_defaults"],
      columns: [],
      constraints: [],
      indexes: [],
    })

    await expect(
      runDeploymentMigrations(
        client,
        [source],
        {},
        {
          materializedMigrationAdoptions: [
            {
              source: "parenthesized-escaped-literal-defaults",
              tag: "0000_parenthesized-escaped-literal-defaults",
            },
          ],
        },
      ),
    ).rejects.toThrow("E-string default expressions are not supported")
    expect(ledgerRows).toEqual([])
  })

  it("is idempotent and serializes concurrent adopters under the session lock", async () => {
    const { client, events, ledgerRows } = exactClient({ serializeLocks: true })
    const [first, second] = await Promise.all([
      runDeploymentMigrations(
        client,
        [materializedSource],
        {},
        {
          materializedMigrationAdoptions: adoption,
        },
      ),
      runDeploymentMigrations(
        client,
        [materializedSource],
        {},
        {
          materializedMigrationAdoptions: adoption,
        },
      ),
    ])

    expect([first.adopted, second.adopted]).toContainEqual(["inventory/0001_inventory_baseline"])
    expect([first.adopted, second.adopted]).toContainEqual([])
    expect(ledgerRows).toHaveLength(1)
    expect(events).toEqual(["lock", "unlock", "lock", "unlock"])
  })

  it("never adopts a materialized migration unless its exact identity is allowlisted", async () => {
    const { client, statements } = exactClient()
    const result = await runDeploymentMigrations(client, [materializedSource], {}, {})
    expect(result.adopted).toEqual([])
    expect(result.baselined).toEqual([])
    expect(result.executed).toEqual(["inventory/0001_inventory_baseline"])
    expect(statements.some((sql) => sql.startsWith('CREATE TABLE "product_'))).toBe(true)
  })
})

const DB_URL = process.env.TEST_DATABASE_URL

describe.skipIf(!DB_URL)("materialized-migration adoption (PostgreSQL conformance)", () => {
  let client: Client
  const parentTable = "materialized_adoption_parent"
  const childTable = "materialized_adoption_child"
  const source: MigrationSource = {
    name: "materialized-adoption-test",
    priority: 1,
    migrations: [
      {
        tag: "0001_materialized_baseline",
        sql: `CREATE TABLE "${parentTable}" (
  "id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "${childTable}" (
  "id" text PRIMARY KEY NOT NULL,
  "parent_id" text NOT NULL,
  "state" text DEFAULT 'READY'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "${childTable}" ADD CONSTRAINT "materialized_adoption_child_parent_id_materialized_adoption_parent_id_fk_long_suffix" FOREIGN KEY ("parent_id") REFERENCES "public"."${parentTable}"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_materialized_adoption_child_parent" ON "${childTable}" USING btree ("parent_id");`,
      },
    ],
  }

  async function reset(): Promise<void> {
    await client.query(`DROP TABLE IF EXISTS "${childTable}" CASCADE`)
    await client.query(`DROP TABLE IF EXISTS "${parentTable}" CASCADE`)
    await client.query(`CREATE SCHEMA IF NOT EXISTS "drizzle"`)
    await client.query(
      `CREATE TABLE IF NOT EXISTS "drizzle"."_voyant_migrations" (
         "source" text NOT NULL,
         "tag" text NOT NULL,
         "content_hash" text NOT NULL,
         "applied_at" timestamptz NOT NULL DEFAULT now(),
         PRIMARY KEY ("source", "tag")
       )`,
    )
    await client.query(
      `DELETE FROM "drizzle"."_voyant_migrations"
        WHERE "source" IN ('framework', 'materialized-adoption-test')
          AND "tag" LIKE 'materialized-adoption-test-%' OR
              ("source" = 'materialized-adoption-test' AND "tag" = '0001_materialized_baseline')`,
    )
    await client.query(
      `INSERT INTO "drizzle"."_voyant_migrations" ("source", "tag", "content_hash")
       VALUES ('framework', 'materialized-adoption-test-existing', 'test-seed')
       ON CONFLICT ("source", "tag") DO UPDATE SET "content_hash" = EXCLUDED."content_hash"`,
    )
  }

  beforeAll(async () => {
    client = new Client({ connectionString: DB_URL })
    await client.connect()
  })

  beforeEach(reset)

  afterAll(async () => {
    if (!client) return
    await reset()
    await client.query(
      `DELETE FROM "drizzle"."_voyant_migrations"
        WHERE "source" = 'framework' AND "tag" = 'materialized-adoption-test-existing'`,
    )
    await client.end()
  })

  it("adopts the PostgreSQL-canonical footprint, including truncated constraint names", async () => {
    for (const statement of source.migrations[0]!.sql.split("--> statement-breakpoint")) {
      await client.query(statement)
    }

    const result = await runDeploymentMigrations(
      client,
      [source],
      {},
      {
        materializedMigrationAdoptions: [
          { source: "materialized-adoption-test", tag: "0001_materialized_baseline" },
        ],
      },
    )

    expect(result.executed).toEqual([])
    expect(result.adopted).toEqual(["materialized-adoption-test/0001_materialized_baseline"])
    const ledger = await client.query(
      `SELECT "content_hash" FROM "drizzle"."_voyant_migrations"
        WHERE "source" = 'materialized-adoption-test'
          AND "tag" = '0001_materialized_baseline'`,
    )
    expect(ledger.rows[0]?.content_hash).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe("detectExisting", () => {
  it("recognizes graph-era package ledger source names", async () => {
    const client: MigrationClient = {
      async query(sql, params = []) {
        if (sql.startsWith("SELECT to_regclass")) {
          return { rows: [{ reg: String(params[0]) }] }
        }
        if (sql.includes(`"source" LIKE 'schema:%#migrations'`)) {
          return { rows: [{ n: "1" }] }
        }
        return { rows: [{ n: "0" }] }
      },
    }

    await expect(detectExisting(client)).resolves.toBe(true)
  })
})
