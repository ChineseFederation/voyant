import type { EventBus, ModuleContainer } from "@voyant-travel/core"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"

export type Env = {
  Bindings: Partial<{
    VOYANT_CHECKOUT_CAPABILITY_SECRET: string
    VOYANT_CHECKOUT_CAPABILITY_TTL_SECONDS: string
  }>
  Variables: {
    db: PostgresJsDatabase
    userId?: string
    agentId?: string
    workflowPrincipalId?: string
    principalSubtype?: string
    sessionId?: string
    organizationId?: string | null
    callerType?: "session" | "api_key" | "internal" | "agent" | "workflow"
    actor?: string
    scopes?: string[] | null
    apiTokenId?: string
    apiKeyId?: string
    workflowRunId?: string
    workflowStepId?: string
    isInternalRequest?: boolean
    publicChannel?: {
      channelId: string
      channelStatus?: string | null
    }
    container?: ModuleContainer
    eventBus?: EventBus
  }
}

export function getRuntimeEnv(c: Context) {
  const processEnv =
    (
      globalThis as typeof globalThis & {
        process?: { env?: Record<string, string | undefined> }
      }
    ).process?.env ?? {}

  return {
    ...processEnv,
    ...(c.env ?? {}),
  }
}

export function notFound<T extends Env>(c: Context<T>, error: string) {
  return c.json({ error }, 404)
}
