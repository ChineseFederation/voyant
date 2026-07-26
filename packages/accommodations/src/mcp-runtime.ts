import { executeAdmittedCreatedTargetCommand } from "@voyant-travel/action-ledger/created-command"
import {
  type ActionLedgerRequestContextValues,
  mapActionLedgerRequestContext,
} from "@voyant-travel/action-ledger/request-context"
import {
  type CatalogContentRuntime,
  catalogContentRuntimePort,
} from "@voyant-travel/catalog/runtime-port"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import {
  defineToolContextContribution,
  ToolError,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"

import { getAccommodationContent } from "./service-content.js"
import { eachStayNight, quoteOwnedStay, searchOwnedStays } from "./service-owned-stays.js"
import {
  createRoomBlock,
  getRoomBlock,
  pickupRoomBlock,
  RoomBlockRoomTypeNotFoundError,
  reverseRoomBlockPickup,
  setRoomBlockNights,
  summarizeRoomBlock,
} from "./service-room-blocks.js"
import type { AccommodationsToolServices } from "./tools.js"

export * from "./tools.js"

type LedgerHttpContext = Pick<Context, "req"> & { var: object }

export const voyantToolContextContribution = defineToolContextContribution({
  context: ["accommodations"],
  async contribute({ request, context, resources }) {
    const db = context.db as AnyDrizzleDb
    const transactionalDb = context.db as PostgresJsDatabase
    const contentRuntime = await optionalContentRuntime(resources[catalogContentRuntimePort.id])
    return {
      accommodations: {
        async searchOwned(input: Parameters<AccommodationsToolServices["searchOwned"]>[0]) {
          const { currency, limit, cursor, ...criteria } = input
          const nights = eachStayNight(input.checkIn, input.checkOut)
          if (nights.length === 0) {
            throw new ToolError("checkOut must be after checkIn.", "INVALID_INPUT")
          }
          const result = await searchOwnedStays(db, {
            criteria,
            nights: nights.length,
            scope: {
              locale: context.resolverScope.locale,
              audience: context.audience,
              market: context.resolverScope.market,
              currency,
            },
            limit,
            cursor,
          })
          return {
            ...result,
            matches: result.matches.map(({ providerData: _providerData, ...match }) => match),
          }
        },
        async quoteOwned(input: Parameters<typeof quoteOwnedStay>[1]) {
          const result = await quoteOwnedStay(db, input)
          if (result.status !== "ok") return result
          return {
            ...result,
            nightlyRates: result.nightlyRates.map(
              ({ costCurrency: _costCurrency, costAmountCents: _costAmountCents, ...rate }) => rate,
            ),
          }
        },
        async getContent(input: {
          id: string
          preferredLocales?: string[]
          market?: string
          currency?: string
          acceptMachineTranslated: boolean
        }) {
          if (!contentRuntime) {
            throw new ToolError(
              "Accommodation content requires the selected catalog.content-runtime port.",
              "MISSING_SERVICE",
              { service: catalogContentRuntimePort.id },
            )
          }
          const registry = contentRuntime.resolveRegistry(request as Context)
          const result = await getAccommodationContent(
            db,
            input.id,
            {
              preferredLocales: input.preferredLocales ?? [context.resolverScope.locale],
              market: input.market ?? context.resolverScope.market,
              currency: input.currency,
              acceptMachineTranslated: input.acceptMachineTranslated,
            },
            { registry },
          )
          if (!result) return null
          return {
            content: result.content,
            provenance: result.provenance,
            servedLocale: result.resolution.served_locale,
            matchKind: result.resolution.match_kind,
            source: result.source,
            servedStale: result.served_stale,
            synthesized: result.synthesized,
            machineTranslated: result.machine_translated,
          }
        },
        async getRoomBlock(blockId: string) {
          const block = await getRoomBlock(transactionalDb, blockId)
          if (!block) return null
          return { block, summary: await summarizeRoomBlock(transactionalDb, blockId) }
        },
        async createRoomBlock(
          requestInput: Parameters<AccommodationsToolServices["createRoomBlock"]>[0],
          admitted: Parameters<AccommodationsToolServices["createRoomBlock"]>[1],
        ) {
          const { idempotencyKey: legacyIdempotencyKey, ...input } = requestInput
          admittedCreatedCommandIdempotencyKey(admitted, legacyIdempotencyKey)
          const requestContext = actionLedgerContext(request as Context)
          const result = await executeAdmittedCreatedTargetCommand(
            {
              db,
              context: requestContext,
              admitted,
              idempotencyKey: legacyIdempotencyKey,
              commandTargetType: "room-block-create-command",
              canonicalTargetType: "room-block",
              resultReferenceType: "room-block",
              commandInput: input,
              evaluatedRisk: "medium",
            },
            {
              async create(tx) {
                try {
                  const block = await createRoomBlock(tx as PostgresJsDatabase, input)
                  return { value: { roomBlockId: block.id }, targetId: block.id }
                } catch (error) {
                  if (error instanceof RoomBlockRoomTypeNotFoundError) {
                    throw new ToolError(error.message, "NOT_FOUND", {
                      roomTypeId: error.roomTypeId,
                    })
                  }
                  throw error
                }
              },
              async replay(_tx, completed) {
                return { roomBlockId: completed.reference.id }
              },
            },
          )
          return result.value
        },
        async setRoomBlockNights(input: {
          blockId: string
          nights: Parameters<typeof setRoomBlockNights>[2]
        }) {
          if (!(await getRoomBlock(transactionalDb, input.blockId))) return null
          await setRoomBlockNights(transactionalDb, input.blockId, input.nights)
          return summarizeRoomBlock(transactionalDb, input.blockId)
        },
        pickupRoomBlock: (input: Parameters<typeof pickupRoomBlock>[1]) =>
          pickupRoomBlock(transactionalDb, input),
        reverseRoomBlockPickup: (input: Parameters<typeof reverseRoomBlockPickup>[1]) =>
          reverseRoomBlockPickup(transactionalDb, input),
      },
    }
  },
})

function admittedCreatedCommandIdempotencyKey(
  admitted: ToolHandlerActionPolicyContext,
  legacyIdempotencyKey: string | undefined,
): string {
  const idempotencyKey = admitted.invocation.idempotencyKey?.trim()
  if (!idempotencyKey) {
    throw new ToolError(
      "Created-target command idempotency must come from the admitted Tool invocation.",
      "ACTION_POLICY_REQUIRED",
    )
  }
  if (legacyIdempotencyKey !== undefined && legacyIdempotencyKey !== idempotencyKey) {
    throw new ToolError(
      "The legacy top-level idempotency key does not match the admitted Tool invocation.",
      "INVALID_INPUT",
    )
  }
  return idempotencyKey
}

function actionLedgerContext(c: LedgerHttpContext): ActionLedgerRequestContextValues {
  const vars = c.var as Record<string, unknown>
  return {
    userId: (vars.userId as string | undefined) ?? null,
    agentId: (vars.agentId as string | undefined) ?? null,
    workflowPrincipalId: (vars.workflowPrincipalId as string | undefined) ?? null,
    principalSubtype: (vars.principalSubtype as string | undefined) ?? null,
    sessionId: (vars.sessionId as string | undefined) ?? null,
    apiTokenId: ((vars.apiTokenId ?? vars.apiKeyId) as string | undefined) ?? null,
    callerType: (vars.callerType as ActionLedgerRequestContextValues["callerType"]) ?? null,
    actor: (vars.actor as ActionLedgerRequestContextValues["actor"]) ?? null,
    isInternalRequest: (vars.isInternalRequest as boolean | undefined) ?? false,
    organizationId: (vars.organizationId as string | undefined) ?? null,
    workflowRunId: (vars.workflowRunId as string | undefined) ?? null,
    workflowStepId: (vars.workflowStepId as string | undefined) ?? null,
    correlationId: c.req.header("x-correlation-id") ?? c.req.header("x-request-id") ?? null,
  }
}

export function createdTargetPrincipalId(context: ActionLedgerRequestContextValues): string {
  return mapActionLedgerRequestContext(context).principalId
}

async function optionalContentRuntime(value: unknown): Promise<CatalogContentRuntime | undefined> {
  const resolved = await Promise.resolve(value)
  if (resolved === undefined) return undefined
  await catalogContentRuntimePort.test(resolved as CatalogContentRuntime)
  return resolved as CatalogContentRuntime
}
