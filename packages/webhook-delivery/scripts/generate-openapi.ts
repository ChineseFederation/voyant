import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { OpenAPIHono } from "@hono/zod-openapi"

import { createOperatorWebhookAdminRoutes } from "../src/admin-routes.js"

const output = new URL("../openapi/admin/operator-webhooks.json", import.meta.url)
const app = new OpenAPIHono()
app.route(
  "/v1/admin/webhooks",
  createOperatorWebhookAdminRoutes({
    contracts: [],
  }),
)

// `getOpenAPI31Document`, not `getOpenAPIDocument`. The latter builds a 3.0
// document, and passing `openapi: "3.1.0"` only relabels it — the body still
// used 3.0's `nullable: true`, which 3.1 has no such keyword for and silently
// ignores. Every `z.string().nullable()` therefore published as a plain
// non-nullable string, and a client generated from this document would be typed
// to expect a value the API may not send.
const document = app.getOpenAPI31Document({
  openapi: "3.1.0",
  info: {
    title: "Voyant Operator Webhooks Admin API",
    version: "1.0.0",
  },
})

mkdirSync(new URL("../openapi/admin/", import.meta.url), { recursive: true })
writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`)
execFileSync("pnpm", ["exec", "biome", "format", "--write", fileURLToPath(output)], {
  stdio: "inherit",
})
