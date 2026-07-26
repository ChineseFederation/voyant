import {
  buildCreatedTargetCommandFingerprint,
  executeAdmittedCreatedTargetCommand,
} from "@voyant-travel/action-ledger/created-command"
import {
  type ActionLedgerRequestContextValues,
  mapActionLedgerRequestContext,
} from "@voyant-travel/action-ledger/request-context"
import {
  type CatalogContentRuntime,
  catalogContentRuntimePort,
} from "@voyant-travel/catalog/runtime-port"
import type { EventBus } from "@voyant-travel/core"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { insertOutboxEvents } from "@voyant-travel/db/outbox"
import {
  defineToolContextContribution,
  ToolError,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { and, asc, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import type { z } from "zod"
import { AuthoringValidationError } from "./authoring/errors.js"
import { composeProductInTransaction } from "./authoring/service.js"
import { validateProductGraph } from "./authoring/validate.js"
import { emitProductContentChanged } from "./events.js"
import { productExtras } from "./extras/schema.js"
import { inventoryExtrasService } from "./extras/service.js"
import type { InventoryExtrasToolServices } from "./extras-tools.js"
import { productOptions, products, productTranslations } from "./schema.js"
import { productsService } from "./service.js"
import { getProductContent } from "./service-content.js"
import type {
  InventoryAuthoringToolServices,
  InventoryContentToolServices,
  InventoryToolServices,
} from "./tools.js"
import { insertProductSchema } from "./validation.js"

export * from "./tools.js"

type InventoryMcpEnv = { Variables: { eventBus?: EventBus; userId?: string } }
type LedgerHttpContext = Pick<Context, "req"> & { var: object }

/** Narrow the request DB into the action-ledger AnyDrizzleDb surface. */
function asLedgerDb(db: PostgresJsDatabase): AnyDrizzleDb {
  return db as AnyDrizzleDb
}

/** Narrow an action-ledger transaction back to the inventory Postgres client. */
function asPostgresDb(tx: AnyDrizzleDb): PostgresJsDatabase {
  return tx as PostgresJsDatabase
}

export const voyantToolContextContribution = defineToolContextContribution({
  context: ["inventory", "inventoryContent", "inventoryExtras", "inventoryAuthoring"],
  contribute: ({ request, context, resources }) => {
    const c = request as Context<InventoryMcpEnv>
    const db = context.db as Parameters<typeof productsService.listProducts>[0]
    const eventBus = c.get("eventBus")
    const inventoryContent: InventoryContentToolServices = {
      async getProductContent(input) {
        const runtime = await optionalContentRuntime(resources[catalogContentRuntimePort.id])
        if (!runtime) {
          throw new ToolError(
            "Product content requires the selected catalog.content-runtime port.",
            "MISSING_SERVICE",
            { service: catalogContentRuntimePort.id },
          )
        }
        const result = await getProductContent(
          db,
          input.id,
          {
            preferredLocales: input.preferredLocales ?? [context.resolverScope.locale],
            audience: "staff",
            ...(input.market ? { market: input.market } : {}),
            ...(input.currency ? { currency: input.currency } : {}),
            acceptMachineTranslated: input.acceptMachineTranslated,
          },
          {
            registry: runtime.resolveRegistry(request),
            ...(input.forceFresh ? { forceFresh: true } : {}),
          },
        )
        return result
          ? {
              content: result.content,
              provenance: result.provenance,
              served_locale: result.resolution.served_locale,
              match_kind: result.resolution.match_kind,
              source: result.source,
              served_stale: result.served_stale,
              synthesized: result.synthesized,
              machine_translated: result.machine_translated,
            }
          : null
      },
    }
    const inventory: InventoryToolServices = {
      listProducts: (query) => productsService.listProducts(db, query),
      async getProductById(id) {
        const row = await productsService.getProductById(db, id)
        if (!row) return null
        const slug = await primaryProductSlug(db, id)
        return { ...row, slug }
      },
      getProductAggregates: (query) => productsService.getProductAggregates(db, query),
      async createProduct({ idempotencyKey: legacyIdempotencyKey, ...input }, admitted) {
        const draft = insertProductSchema.parse({
          ...input,
          status: "draft",
          visibility: "private",
          activated: false,
        })
        const result = await executeProductCreateCommand({
          c,
          db: asLedgerDb(db),
          idempotencyKey: legacyIdempotencyKey,
          input: draft,
          admitted,
        })
        const productId =
          result.value &&
          typeof result.value === "object" &&
          "productId" in result.value &&
          typeof result.value.productId === "string"
            ? result.value.productId
            : null
        const slug = productId ? await primaryProductSlug(db, productId) : null
        return productId ? { ...result.value, slug } : result.value
      },
      async updateProduct(id, input) {
        const row = await productsService.updateProduct(db, id, input)
        if (row) {
          await eventBus?.emit("product.updated", { id: row.id })
          await emitProductContentChanged(eventBus, { id: row.id, axis: "product" })
          const slug = await primaryProductSlug(db, id)
          return { ...row, slug }
        }
        return row
      },
      listProductDays: (productId) => productsService.listDays(db, productId),
      async resolveProductIdForDay(dayId) {
        const day = await productsService.getDayForProductMutation(db, dayId)
        return day?.productId ?? null
      },
      async updateProductDay(input) {
        const patch = {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.location !== undefined ? { location: input.location } : {}),
        }
        // Prefer dayId: resolve the owning product from the day row so Max can
        // omit product id (and never call listDays("unknown") which would try
        // to create a default itinerary for a fake product).
        if (input.dayId != null) {
          const existing = await productsService.getDayForProductMutation(db, input.dayId)
          if (!existing) return null
          if (input.id != null && input.id !== existing.productId) return null
          const row = await productsService.updateDay(db, existing.id, patch)
          if (row) {
            await emitProductContentChanged(eventBus, {
              id: existing.productId,
              axis: "day",
            })
          }
          return row
        }
        if (input.id == null) return null
        const days = await productsService.listDays(db, input.id)
        const day = days.find((row) => row.dayNumber === input.dayNumber)
        if (!day) return null
        const row = await productsService.updateDay(db, day.id, patch)
        if (row) {
          await emitProductContentChanged(eventBus, { id: input.id, axis: "day" })
        }
        return row
      },
    }
    const inventoryAuthoring: InventoryAuthoringToolServices = {
      async composeProduct(input, admitted) {
        const issues = validateProductGraph(input.spec)
        if (issues.length) return { status: "invalid" as const, issues }
        let result: Awaited<ReturnType<typeof executeProductComposeCommand>>
        try {
          result = await executeProductComposeCommand({
            c,
            db: asLedgerDb(db),
            idempotencyKey: input.idempotencyKey,
            spec: input.spec,
            admitted,
          })
        } catch (error) {
          if (error instanceof AuthoringValidationError) {
            return { status: "invalid" as const, issues: error.issues }
          }
          throw error
        }
        const productId = result.value.productId
        return {
          status: "created" as const,
          productId,
          reused: result.replayed,
          slug: await primaryProductSlug(db, productId),
        }
      },
    }
    return {
      inventory,
      inventoryContent,
      inventoryAuthoring,
      inventoryExtras: {
        listProductExtras: (
          input: Parameters<typeof inventoryExtrasService.listProductExtras>[1],
        ) => inventoryExtrasService.listProductExtras(db, input),
        getProductExtraById: (id: string) => inventoryExtrasService.getProductExtraById(db, id),
        createProductExtra: (
          input: Parameters<InventoryExtrasToolServices["createProductExtra"]>[0],
          admitted: ToolHandlerActionPolicyContext,
        ) => {
          const { idempotencyKey, ...data } = input
          return executeInventoryGeneratedChild({
            c,
            db: asLedgerDb(db),
            admitted,
            idempotencyKey,
            commandTargetType: "product-extra-create-command",
            canonicalTargetType: "product_extra",
            resultReferenceType: "product_extra",
            commandInput: data,
            async create(tx) {
              const [parent] = await asPostgresDb(tx)
                .select({ id: products.id })
                .from(products)
                .where(eq(products.id, data.productId))
                .limit(1)
              if (!parent) {
                throw new ToolError(
                  "Product extra parent product was not found.",
                  "INVALID_INPUT",
                  {
                    productId: data.productId,
                  },
                )
              }
              const row = await inventoryExtrasService.createProductExtra(asPostgresDb(tx), data)
              if (!row) throw new Error("Product extra insert did not return a row")
              return { value: { id: row.id, replayed: false }, targetId: row.id }
            },
          })
        },
        updateProductExtra: ({ id, ...input }: { id: string; [key: string]: unknown }) =>
          inventoryExtrasService.updateProductExtra(
            db,
            id,
            input as Parameters<typeof inventoryExtrasService.updateProductExtra>[2],
          ),
        listOptionExtraConfigs: (
          input: Parameters<typeof inventoryExtrasService.listOptionExtraConfigs>[1],
        ) => inventoryExtrasService.listOptionExtraConfigs(db, input),
        getOptionExtraConfigById: (id: string) =>
          inventoryExtrasService.getOptionExtraConfigById(db, id),
        createOptionExtraConfig: (
          input: Parameters<InventoryExtrasToolServices["createOptionExtraConfig"]>[0],
          admitted: ToolHandlerActionPolicyContext,
        ) => {
          const { idempotencyKey, ...data } = input
          return executeInventoryGeneratedChild({
            c,
            db: asLedgerDb(db),
            admitted,
            idempotencyKey,
            commandTargetType: "option-extra-config-create-command",
            canonicalTargetType: "option_extra_config",
            resultReferenceType: "option_extra_config",
            commandInput: data,
            async create(tx) {
              const [anchor] = await asPostgresDb(tx)
                .select({ productId: productExtras.productId })
                .from(productExtras)
                .innerJoin(
                  productOptions,
                  and(
                    eq(productOptions.id, data.optionId),
                    eq(productOptions.productId, productExtras.productId),
                  ),
                )
                .where(eq(productExtras.id, data.productExtraId))
                .limit(1)
              if (!anchor) {
                throw new ToolError(
                  "Option must belong to the product owning the anchored product extra.",
                  "INVALID_INPUT",
                  { productExtraId: data.productExtraId, optionId: data.optionId },
                )
              }
              const row = await inventoryExtrasService.createOptionExtraConfig(
                asPostgresDb(tx),
                data,
              )
              if (!row) throw new Error("Option extra config insert did not return a row")
              return { value: { id: row.id, replayed: false }, targetId: row.id }
            },
          })
        },
        updateOptionExtraConfig: ({ id, ...input }: { id: string; [key: string]: unknown }) =>
          inventoryExtrasService.updateOptionExtraConfig(
            db,
            id,
            input as Parameters<typeof inventoryExtrasService.updateOptionExtraConfig>[2],
          ),
      },
    }
  },
})

async function executeInventoryGeneratedChild<TReferenceType extends string>(input: {
  c: LedgerHttpContext
  db: AnyDrizzleDb
  admitted: ToolHandlerActionPolicyContext
  idempotencyKey?: string
  commandTargetType: string
  canonicalTargetType: string
  resultReferenceType: TReferenceType
  commandInput: unknown
  create: Parameters<
    typeof executeAdmittedCreatedTargetCommand<{ id: string; replayed: boolean }, TReferenceType>
  >[1]["create"]
}) {
  return (
    await executeAdmittedCreatedTargetCommand(
      {
        db: input.db,
        context: actionLedgerContext(input.c),
        admitted: input.admitted,
        idempotencyKey: input.idempotencyKey,
        commandTargetType: input.commandTargetType,
        canonicalTargetType: input.canonicalTargetType,
        resultReferenceType: input.resultReferenceType,
        commandInput: input.commandInput,
        evaluatedRisk: "high",
      },
      {
        create: input.create,
        async replay(_tx, completed) {
          return { id: completed.reference.id, replayed: true }
        },
      },
    )
  ).value
}

export async function executeProductCreateCommand(input: {
  c: LedgerHttpContext
  db: AnyDrizzleDb
  idempotencyKey?: string
  input: z.output<typeof insertProductSchema>
  admitted: ToolHandlerActionPolicyContext
  /** Test-only failure seam after the domain insert and before outbox/result append. */
  testHooks?: { afterDomainCreate?: (tx: AnyDrizzleDb, productId: string) => Promise<void> }
}) {
  const idempotencyKey = admittedCreatedCommandIdempotencyKey(input.admitted, input.idempotencyKey)
  const context = actionLedgerContext(input.c)
  const command = {
    actionName: input.admitted.actionPolicy.capabilityId,
    actionVersion: input.admitted.actionPolicy.version,
    commandTarget: { type: "product-create-command", id: idempotencyKey },
    canonicalTargetType: "product",
    resultReferenceType: "product" as const,
    commandInput: input.input,
    capabilityId: input.admitted.actionPolicy.capabilityId,
    capabilityVersion: input.admitted.actionPolicy.version,
    evaluatedRisk: "medium" as const,
    approvalPolicy: "none" as const,
    approvalReasonCode: null,
  }
  const fingerprint = await buildCreatedTargetCommandFingerprint(command)
  return executeAdmittedCreatedTargetCommand(
    {
      db: input.db,
      context,
      admitted: input.admitted,
      idempotencyKey: input.idempotencyKey,
      commandTargetType: "product-create-command",
      canonicalTargetType: "product",
      resultReferenceType: "product",
      commandInput: input.input,
      evaluatedRisk: "medium",
    },
    {
      async create(tx) {
        const product = await productsService.createProduct(asPostgresDb(tx), input.input)
        await input.testHooks?.afterDomainCreate?.(tx, product.id)
        await insertOutboxEvents(tx, [
          {
            name: "product.created",
            data: { id: product.id },
            metadata: {
              eventId: productCreatedEventId(fingerprint),
            },
          },
        ])
        return { value: { productId: product.id }, targetId: product.id }
      },
      async replay(_tx, completed) {
        return { productId: completed.reference.id }
      },
    },
  )
}

async function executeProductComposeCommand(input: {
  c: LedgerHttpContext
  db: AnyDrizzleDb
  idempotencyKey?: string
  spec: Parameters<typeof composeProductInTransaction>[1]
  admitted: ToolHandlerActionPolicyContext
}) {
  const idempotencyKey = admittedCreatedCommandIdempotencyKey(input.admitted, input.idempotencyKey)
  const context = actionLedgerContext(input.c)
  const command = {
    actionName: input.admitted.actionPolicy.capabilityId,
    actionVersion: input.admitted.actionPolicy.version,
    commandTarget: { type: "product-compose-command", id: idempotencyKey },
    canonicalTargetType: "product",
    resultReferenceType: "product" as const,
    commandInput: input.spec,
    capabilityId: input.admitted.actionPolicy.capabilityId,
    capabilityVersion: input.admitted.actionPolicy.version,
    evaluatedRisk: "high" as const,
    approvalPolicy: "none" as const,
    approvalReasonCode: null,
  }
  const fingerprint = await buildCreatedTargetCommandFingerprint(command)
  return executeAdmittedCreatedTargetCommand(
    {
      db: input.db,
      context,
      admitted: input.admitted,
      idempotencyKey: input.idempotencyKey,
      commandTargetType: "product-compose-command",
      canonicalTargetType: "product",
      resultReferenceType: "product",
      commandInput: input.spec,
      evaluatedRisk: "high",
    },
    {
      async create(tx) {
        const result = await composeProductInTransaction(asPostgresDb(tx), input.spec, {
          userId: (input.c.var as { userId?: string }).userId,
        })
        await insertOutboxEvents(tx, [
          {
            name: "product.created",
            data: { id: result.productId },
            metadata: { eventId: productCreatedEventId(fingerprint) },
          },
          {
            name: "product.content.changed",
            data: { id: result.productId, axis: "product" },
            metadata: { eventId: productContentChangedEventId(fingerprint) },
          },
        ])
        return {
          value: { productId: result.productId },
          targetId: result.productId,
        }
      },
      async replay(_tx, completed) {
        return { productId: completed.reference.id }
      },
    },
  )
}

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

export function productCreatedEventId(commandFingerprint: string): string {
  return `evt_inventory_product_created_${commandFingerprint}`
}

export function productContentChangedEventId(commandFingerprint: string): string {
  return `evt_inventory_product_content_changed_${commandFingerprint}`
}

async function optionalContentRuntime(value: unknown): Promise<CatalogContentRuntime | undefined> {
  const resolved = await Promise.resolve(value)
  if (resolved === undefined) return undefined
  await catalogContentRuntimePort.test(resolved as CatalogContentRuntime)
  return resolved as CatalogContentRuntime
}

/** Prefer the first non-empty translation slug for Max/catalog reporting. */
async function primaryProductSlug(
  db: PostgresJsDatabase,
  productId: string,
): Promise<string | null> {
  const rows = await db
    .select({ slug: productTranslations.slug })
    .from(productTranslations)
    .where(eq(productTranslations.productId, productId))
    .orderBy(asc(productTranslations.updatedAt))
  for (const row of rows) {
    const slug = row.slug?.trim()
    if (slug) return slug
  }
  return null
}
