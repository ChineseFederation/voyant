import { defineModule, providePort, requirePort } from "@voyant-travel/core/project"
import { eventOutboxJobRuntimePort } from "./outbox-job-runtime-port.js"

/** Import-cheap deployment declaration owned by the database package. */
export const dbVoyantModule = defineModule({
  id: "@voyant-travel/db",
  packageName: "@voyant-travel/db",
  localId: "db",
  runtimePorts: [requirePort(eventOutboxJobRuntimePort)],
  provides: {
    ports: [{ id: "database.client" }, providePort(eventOutboxJobRuntimePort)],
  },
  schema: [
    {
      id: "@voyant-travel/db#schema",
      source: "@voyant-travel/db/schema",
    },
  ],
  migrations: [
    {
      id: "@voyant-travel/db#migrations",
      source: "./migrations",
    },
  ],
  config: [
    {
      id: "@voyant-travel/db#config.adapter",
      key: "DB_ADAPTER",
    },
  ],
  secrets: [
    {
      id: "@voyant-travel/db#secret.database-url",
      key: "DATABASE_URL",
      required: true,
      description: "Primary Postgres connection URL for the Node application.",
      rotation: "replace-only",
    },
  ],
  resources: [
    {
      id: "@voyant-travel/db#resource.database",
      kind: "database",
      required: true,
      config: { engine: "postgres" },
    },
  ],
  providers: [
    {
      id: "@voyant-travel/db#provider.postgres-node",
      port: "database.client",
      selection: { role: "database", value: "postgres" },
      uses: { secrets: ["@voyant-travel/db#secret.database-url"] },
      runtime: {
        entry: "@voyant-travel/db/runtime",
        export: "createGraphDbProvider",
      },
      config: { adapter: "node" },
    },
  ],
  jobs: [
    {
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
    },
  ],
  lifecycle: {
    uninstall: { default: "retain-data", purge: "not-supported" },
  },
  meta: {
    ownership: "package",
    agentTools: {
      posture: "not-applicable",
      rationale:
        "The database module owns persistence plumbing; domain modules expose agent capabilities.",
    },
  },
})

export default dbVoyantModule
