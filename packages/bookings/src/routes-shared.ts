import type { ActionLedgerRequestContextValues } from "@voyant-travel/action-ledger"
import type { EventBus, ModuleContainer } from "@voyant-travel/core"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"

export type KmsBindings = Partial<{
  VOYANT_BOOKINGS_MONTHLY_LIMIT: string
  KMS_PROVIDER: string
  KMS_ENV_KEY: string
  KMS_LOCAL_KEY: string
  GCP_PROJECT_ID: string
  GCP_SERVICE_ACCOUNT_EMAIL: string
  GCP_PRIVATE_KEY: string
  GCP_KMS_KEYRING: string
  GCP_KMS_LOCATION: string
  GCP_KMS_PEOPLE_KEY_NAME: string
  GCP_KMS_INTEGRATIONS_KEY_NAME: string
  AWS_REGION: string
  AWS_ACCESS_KEY_ID: string
  AWS_SECRET_ACCESS_KEY: string
  AWS_SESSION_TOKEN: string
  AWS_KMS_ENDPOINT: string
  AWS_KMS_PEOPLE_KEY_ID: string
  AWS_KMS_INTEGRATIONS_KEY_ID: string
}>

export type Env = {
  Bindings: KmsBindings
  Variables: {
    container?: ModuleContainer
    db: PostgresJsDatabase
    eventBus?: EventBus
    userId?: string
    agentId?: string
    workflowPrincipalId?: string
    principalSubtype?: string
    sessionId?: string
    realm?: "admin" | "customer"
    isAnonymousRequest?: boolean
    organizationId?: string | null
    buyerAccountId?: string | null
    buyerAccountKind?: "personal" | "business"
    authOrganizationId?: string | null
    relationshipOrganizationId?: string | null
    relationshipPersonId?: string | null
    buyerMembershipId?: string | null
    buyerMembershipRole?: string | null
    workflowRunId?: string | null
    workflowStepId?: string | null
    actor?: "staff" | "customer" | "partner" | "supplier" | "agent" | "system"
    callerType?: "session" | "api_key" | "internal" | "agent" | "workflow"
    apiTokenId?: string
    apiKeyId?: string
    scopes?: string[] | null
    isInternalRequest?: boolean
    publicChannel?: {
      channelId: string
      channelStatus?: string | null
    }
    authorizeBookingPii?: (args: {
      db: PostgresJsDatabase
      userId?: string
      actor?: "staff" | "customer" | "partner" | "supplier" | "agent" | "system"
      callerType?: "session" | "api_key" | "internal" | "agent" | "workflow"
      scopes?: string[] | null
      isInternalRequest?: boolean
      bookingId: string
      travelerId: string
      action: "read" | "update" | "delete"
    }) => boolean | Promise<boolean>
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

/**
 * The caller identity an action-ledger entry is attributed to. Shared by the
 * admin routes and the Tool runtime so a mutation records the same principal
 * whichever surface performed it.
 */
export function getActionLedgerRequestContext(c: Context<Env>): ActionLedgerRequestContextValues {
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
