import { OpenAPIHono } from "@hono/zod-openapi"
import { openApiValidationHook } from "@voyant-travel/hono"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { accountRoutes } from "./accounts.js"
import { activityRoutes } from "./activities.js"
import { customerSignalRoutes } from "./customer-signals.js"
import { inquiryRoutes } from "./inquiries.js"
import { personDocumentRoutes } from "./person-documents.js"
import { personRelationshipRoutes } from "./person-relationships.js"

type Env = {
  Variables: {
    db: PostgresJsDatabase
    userId?: string
  }
}

// An `OpenAPIHono` parent serves the still-plain-Hono children (activities,
// customer-signals, person-documents, person-relationships)
// unchanged AND surfaces the OpenAPI definitions of the converted children
// (accounts.ts — voyant#2276 step 3.5, stage A). The remaining files convert in
// a later stage; they stay undocumented but fully served until then.
export const relationshipsRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .route("/", accountRoutes)
  .route("/", personDocumentRoutes)
  .route("/", personRelationshipRoutes)
  .route("/", customerSignalRoutes)
  .route("/", inquiryRoutes)
  .route("/", activityRoutes)

export type RelationshipsRoutes = typeof relationshipsRoutes
