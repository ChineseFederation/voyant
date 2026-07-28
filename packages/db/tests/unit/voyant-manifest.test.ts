import { describe, expect, it } from "vitest"

import { dbVoyantModule } from "../../src/voyant.js"

describe("database deployment manifest", () => {
  it("owns its Node Postgres provider, requirements, schema, and migrations", () => {
    expect(dbVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/db",
      packageName: "@voyant-travel/db",
      runtimePorts: [{ id: "infrastructure.event-outbox-delivery" }],
      provides: {
        ports: [{ id: "database.client" }, { id: "infrastructure.event-outbox-delivery" }],
      },
      schema: [{ id: "@voyant-travel/db#schema", source: "@voyant-travel/db/schema" }],
      migrations: [{ id: "@voyant-travel/db#migrations", source: "./migrations" }],
      config: [{ id: "@voyant-travel/db#config.adapter", key: "DB_ADAPTER" }],
      secrets: [
        {
          id: "@voyant-travel/db#secret.database-url",
          key: "DATABASE_URL",
          required: true,
        },
      ],
      resources: [{ id: "@voyant-travel/db#resource.database", kind: "database" }],
      providers: [
        {
          id: "@voyant-travel/db#provider.postgres-node",
          port: "database.client",
          selection: { role: "database", value: "postgres" },
          uses: { secrets: ["@voyant-travel/db#secret.database-url"] },
          runtime: { entry: "@voyant-travel/db/runtime", export: "createGraphDbProvider" },
          config: { adapter: "node" },
        },
      ],
      jobs: [
        expect.objectContaining({
          id: "infrastructure.event-outbox-drain",
          schedule: { cron: "*/2 * * * *", overlap: "skip" },
          scheduling: {
            required: true,
            profiles: {
              eager: { every: "1m", overlap: "skip" },
              economical: { every: "10m", overlap: "skip" },
              "scale-to-zero": { cron: "*/15 * * * *", overlap: "skip" },
            },
          },
          wakeup: true,
          runtime: {
            entry: "@voyant-travel/db/outbox-job",
            export: "runEventOutboxDrainJob",
          },
        }),
      ],
      lifecycle: { uninstall: { default: "retain-data", purge: "not-supported" } },
    })
  })
})
