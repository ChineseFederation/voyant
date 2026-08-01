import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { inspectExternalWebhookDeliveryConvergence } from "./lib/phase5-external-webhook-convergence.mjs"
import { inspectWebhookSubscriptionMutationBoundary } from "./lib/webhook-subscription-mutation-boundary.mjs"

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../..")
const read = (file) => readFile(path.join(repoRoot, file), "utf8")

const [
  contracts,
  subscriptions,
  postgres,
  selectedQueue,
  worker,
  distributionQueue,
  distributionWorker,
  deliverySchema,
  deliveryMigration,
  frameworkDeliveryMigration,
  composition,
  deploymentGraph,
  catalog,
  packageJson,
  lockfile,
  provider,
  runtime,
  deploymentTypes,
  operatorStandard,
] = await Promise.all([
  read("packages/webhook-delivery/src/contracts.ts"),
  read("packages/webhook-delivery/src/subscriptions.ts"),
  read("packages/webhook-delivery/src/postgres-store.ts"),
  read("packages/webhook-delivery/src/selected-queue.ts"),
  read("packages/webhook-delivery/src/worker.ts"),
  read("packages/distribution/src/outbound-webhooks.ts"),
  read("packages/distribution/src/webhook-worker.ts"),
  read("packages/db/src/schema/infra/webhook_deliveries.ts"),
  read("packages/db/migrations/0003_webhook_delivery_payload.sql"),
  read("packages/framework-migrations/migrations/0009_framework_baseline.sql"),
  read("packages/framework/src/runtime-composition.ts"),
  read("packages/framework/src/deployment-graph.ts"),
  read("packages/catalog/src/voyant-events.ts"),
  read("packages/distribution/package.json"),
  read("pnpm-lock.yaml"),
  read("packages/webhook-delivery/src/provider.ts"),
  read("packages/runtime/src/index.ts"),
  read("packages/framework/src/deployment-types.ts"),
  read("packages/operator-standard/src/index.ts"),
])

const failures = []
const requireSource = (source, pattern, message) => {
  if (!pattern.test(source)) failures.push(message)
}

requireSource(
  subscriptions,
  /assertWebhookSubscriptionCreateEvents\(input,[\s\S]*store\.create\(input\)/,
  "the production mutation service must validate creates before calling its store",
)
requireSource(
  subscriptions,
  /assertWebhookSubscriptionUpdateEvents\(input,[\s\S]*store\.update\(id, input\)/,
  "the production mutation service must validate updates before calling its store",
)
requireSource(
  postgres,
  /createPostgresWebhookSubscriptionService[\s\S]*createWebhookSubscriptionService\([\s\S]*insert\(infraWebhookSubscriptionsTable\)[\s\S]*update\(infraWebhookSubscriptionsTable\)/,
  "Postgres subscription writes must be routed through the validated package service",
)
requireSource(
  contracts,
  /isExternalWebhookPayloadSchema[\s\S]*x-voyant-redact[\s\S]*projectObject/,
  "external payloads must apply schema-owned field redaction and projection",
)
failures.push(
  ...inspectExternalWebhookDeliveryConvergence({
    distributionQueue,
    distributionWorker,
    selectedQueue,
    store: postgres,
    worker,
    schema: deliverySchema,
    migration: deliveryMigration,
  }),
)
if (deliveryMigration.trim() !== frameworkDeliveryMigration.trim()) {
  failures.push("package and framework webhook payload migrations must remain identical")
}
requireSource(
  composition,
  /graphEventPayloadSchema: declaration\.payloadSchema/,
  "runtime composition must carry the selected package payload schema",
)
requireSource(
  deploymentGraph,
  /isExternalWebhookPayloadSchema\(event\.payloadSchema\)/,
  "deployment admission must reject external webhook schemas without explicit properties",
)
if ((catalog.match(/additionalProperties: false/g) ?? []).length < 2) {
  failures.push("Catalog's external payload schemas must use explicit field allowlists")
}

const IGNORED_SOURCE_DIRECTORIES = new Set([
  ".next",
  ".open-next",
  "build",
  "dist",
  "fixtures",
  "node_modules",
  "test",
  "tests",
])
const productionRoots = ["apps", "dev", "examples", "packages", "templates"]
const productionFiles = (
  await Promise.all(
    productionRoots.map((root) => productionTypeScriptFiles(path.join(repoRoot, root))),
  )
).flat()
failures.push(
  ...inspectWebhookSubscriptionMutationBoundary(
    await Promise.all(
      productionFiles.map(async (file) => ({
        path: path.relative(repoRoot, file),
        source: await readFile(file, "utf8"),
      })),
    ),
  ),
)
requireSource(
  packageJson,
  /"@voyant-travel\/webhook-delivery": "workspace:\^"/,
  "Distribution must declare the shared webhook-delivery dependency",
)
requireSource(
  lockfile,
  /packages\/distribution:[\s\S]*?'@voyant-travel\/webhook-delivery':[\s\S]*?link:\.\.\/webhook-delivery/,
  "The lockfile must place webhook-delivery in the Distribution importer",
)
requireSource(
  provider,
  /resolveOutboundWebhookDeliveryEnqueuer[\s\S]*provider === "none"[\s\S]*provider === "host"[\s\S]*provider === "postgres"/,
  "Webhook Delivery must own explicit none, host, and Postgres enqueue selection",
)
requireSource(
  runtime,
  /resolveOutboundWebhookDeliveryEnqueuer[\s\S]*createPostgresWebhookDeliveryEnqueuer/,
  "Runtime must delegate concrete outbound webhook selection to Webhook Delivery",
)
if (/enqueuePostgresWebhookEvent/.test(runtime)) {
  failures.push("Runtime must not import or invoke the concrete Postgres enqueue function")
}
requireSource(
  deploymentTypes,
  /outboundWebhooks: "postgres" \| "host" \| "none"/,
  "Framework deployment providers must type the outbound webhook enqueue role",
)
requireSource(
  operatorStandard,
  /outboundWebhooks: "postgres"/,
  "The standard Operator deployment must select durable Postgres webhook enqueueing explicitly",
)

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"))
  process.exitCode = 1
} else {
  console.log("Phase 5 external webhook contract: OK")
}

async function productionTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return []
    throw error
  })
  const files = []
  for (const entry of entries) {
    const location = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (!IGNORED_SOURCE_DIRECTORIES.has(entry.name)) {
        files.push(...(await productionTypeScriptFiles(location)))
      }
    } else if (
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.includes(".test.") &&
      !entry.name.includes(".spec.")
    ) {
      files.push(location)
    }
  }
  return files
}
