import { OpenAPIHono } from "@hono/zod-openapi"
import type { EventBus } from "@voyant-travel/core"
import { openApiValidationHook } from "@voyant-travel/hono"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { ProposalsRouteRuntime } from "../route-runtime.js"
import { pipelineRoutes } from "./pipelines.js"
import { proposalVersionRoutes } from "./proposal-versions.js"
import { createProposalRoutes } from "./proposals.js"

type Env = {
  Variables: {
    db: PostgresJsDatabase
    userId?: string
    eventBus?: EventBus
  }
}

export function createProposalsRoutes(runtime: ProposalsRouteRuntime = {}) {
  return new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .route("/", pipelineRoutes)
    .route("/", createProposalRoutes(runtime))
    .route("/", proposalVersionRoutes)
}

export const proposalsRoutes = createProposalsRoutes()

export type ProposalsRoutes = typeof proposalsRoutes
