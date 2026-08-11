import type { ActionLedgerRequestContextValues } from "@voyant-travel/action-ledger"
import type { EventBus } from "@voyant-travel/core"
import { defineToolContextContribution } from "@voyant-travel/tools"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import { executeCommerceCreate } from "./created-target-command.js"
import { COMMERCE_CREATED_TARGET_POLICIES } from "./created-target-policy.js"
import { pricingService } from "./pricing/service.js"
import { executePromotionCreateCommand } from "./promotion-created-command.js"
import { promotionsService } from "./promotions/service.js"
import { sellabilityService } from "./sellability/service.js"
import type { CommerceToolServices } from "./tools.js"

export { executeCommerceCreate } from "./created-target-command.js"
export * from "./tools.js"

export const voyantToolContextContribution = defineToolContextContribution({
  context: ["commerce"],
  contribute({ request, context }) {
    const db = context.db as PostgresJsDatabase
    const c = request as Context<{ Variables: ActionLedgerRequestContextValues }>
    const requestContext = commerceActionLedgerContext(c)
    const eventBus = (c.var as { eventBus?: EventBus }).eventBus
    const mutationRuntime = { eventBus }
    const json = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
    const commerce: CommerceToolServices = {
      async resolveSellability(input) {
        return json(await sellabilityService.resolve(db, input))
      },
      async listSellabilityPolicies(input) {
        return json(await sellabilityService.listPolicies(db, input))
      },
      async getSellabilityPolicy(id) {
        return json(await sellabilityService.getPolicyById(db, id))
      },
      async createSellabilityPolicy(input, admitted) {
        const result = await executeCommerceCreate(
          db,
          requestContext,
          COMMERCE_CREATED_TARGET_POLICIES.sellabilityPolicy,
          undefined,
          input,
          admitted,
          async (tx) => {
            const row = await sellabilityService.createPolicy(tx, input)
            if (!row) throw new Error("Sellability policy creation returned no row")
            return { id: row.id }
          },
        )
        return json({
          status: "created" as const,
          sellabilityPolicy: result.value,
          replayed: result.replayed,
        })
      },
      async updateSellabilityPolicy(id, input) {
        return json(await sellabilityService.updatePolicy(db, id, input))
      },
      async listCancellationPolicies(input) {
        return json(await pricingService.listCancellationPolicies(db, input))
      },
      async getCancellationPolicy(id) {
        return json(await pricingService.getCancellationPolicyById(db, id))
      },
      async createCancellationPolicy(input, admitted) {
        const { idempotencyKey: legacyIdempotencyKey, ...commandInput } = input
        const result = await executeCommerceCreate(
          db,
          requestContext,
          COMMERCE_CREATED_TARGET_POLICIES.cancellationPolicy,
          legacyIdempotencyKey,
          commandInput,
          admitted,
          async (tx) => {
            const row = await pricingService.createCancellationPolicy(tx, commandInput)
            if (!row) throw new Error("Cancellation policy creation returned no row")
            return { id: row.id }
          },
        )
        return json({
          status: "created" as const,
          cancellationPolicy: result.value,
          replayed: result.replayed,
        })
      },
      async updateCancellationPolicy(id, input) {
        return json(await pricingService.updateCancellationPolicy(db, id, input))
      },
      async listPriceCatalogs(input) {
        return json(await pricingService.listPriceCatalogs(db, input))
      },
      async getPriceCatalog(id) {
        return json(await pricingService.getPriceCatalogById(db, id))
      },
      async createPriceCatalog(input, admitted) {
        const { idempotencyKey: legacyIdempotencyKey, ...commandInput } = input
        const result = await executeCommerceCreate(
          db,
          requestContext,
          COMMERCE_CREATED_TARGET_POLICIES.priceCatalog,
          legacyIdempotencyKey,
          commandInput,
          admitted,
          async (tx) => {
            const row = await pricingService.createPriceCatalog(tx, commandInput)
            return { id: row.id }
          },
        )
        return json({
          status: "created" as const,
          priceCatalog: result.value,
          replayed: result.replayed,
        })
      },
      async updatePriceCatalog(id, input) {
        return json(await pricingService.updatePriceCatalog(db, id, input))
      },
      async listPromotions(input) {
        return json(await promotionsService.listOffers(db, input))
      },
      async getPromotion(id) {
        return json(await promotionsService.getOfferById(db, id))
      },
      async createPromotion(input, admitted) {
        const result = await executePromotionCreateCommand({
          db,
          context: requestContext,
          input,
          admitted,
        })
        return json({
          status: "created" as const,
          promotion: result.value,
          replayed: result.replayed,
        })
      },
      async updatePromotion(id, input) {
        return json(await promotionsService.updateOffer(db, id, input, mutationRuntime))
      },
      async archivePromotion(id) {
        return json(await promotionsService.archiveOffer(db, id, mutationRuntime))
      },
    }
    return { commerce }
  },
})

function commerceActionLedgerContext(
  c: Context<{ Variables: ActionLedgerRequestContextValues }>,
): ActionLedgerRequestContextValues {
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
