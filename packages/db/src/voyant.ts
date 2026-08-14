import { defineModule, providePort, requirePort } from "@voyant-travel/core/project"
import { eventDeadLetteredPayloadSchema } from "./outbox-events.js"
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
  events: [
    {
      // Emitted by the outbox drain below, which is why the database module
      // declares it: the loss is a fact about delivery, not about any domain.
      id: "@voyant-travel/db#event.dead-lettered",
      // Spelled out rather than referenced: the event authority reads this
      // manifest as source text, so an identifier here reads as "no eventType".
      // Drift is caught by the graph build, which rejects a subscriber whose
      // event type no module declares — that is what `EVENT_DEAD_LETTERED` in
      // ./outbox-events.ts is checked against.
      eventType: "event.dead_lettered",
      version: "1.0.0",
      payloadSchema: eventDeadLetteredPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "db", category: "internal" },
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
