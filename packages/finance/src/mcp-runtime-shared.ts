/**
 * Request-context plumbing shared by the Finance MCP tool runtime and the
 * booking tool runtime: build the action-ledger request context from the Hono
 * context. (JSON coercion of service rows lives in the transport-free
 * `tool-json.ts`.)
 */
import type { ActionLedgerRequestContextValues } from "@voyant-travel/action-ledger"
import type { Context } from "hono"

import type { Env } from "./routes-shared.js"

export function financeToolActionLedgerContext(c: Context<Env>): ActionLedgerRequestContextValues {
  return {
    userId: c.get("userId") ?? null,
    agentId: c.get("agentId") ?? null,
    workflowPrincipalId: c.get("workflowPrincipalId") ?? null,
    principalSubtype: c.get("principalSubtype") ?? null,
    sessionId: c.get("sessionId") ?? null,
    apiTokenId: c.get("apiTokenId") ?? c.get("apiKeyId") ?? null,
    callerType: c.get("callerType") ?? null,
    actor: c.get("actor") ?? null,
    isInternalRequest: c.get("isInternalRequest") ?? false,
    organizationId: c.get("organizationId") ?? null,
    workflowRunId: c.get("workflowRunId") ?? null,
    workflowStepId: c.get("workflowStepId") ?? null,
    correlationId: c.req.header("x-correlation-id") ?? c.req.header("x-request-id") ?? null,
  }
}
