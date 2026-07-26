import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { EventBus } from "@voyant-travel/core"
import {
  ForbiddenApiError,
  openApiValidationHook,
  parseJsonBody,
  RequestValidationError,
  requireUserId,
  type VoyantDb,
} from "@voyant-travel/hono"
import { hasApiKeyPermission, permissionStringsToPermissions } from "@voyant-travel/types/api-keys"

import {
  dismissSetupResponseSchema,
  initializeSetupInputSchema,
  initializeSetupResponseSchema,
  setupStateResponseSchema,
  setupStepIdSchema,
  setupStepResponseSchema,
} from "./contracts.js"
import {
  completeSetupStep,
  createDrizzleSetupStore,
  dismissSetup,
  getSetupState,
  initializeSetup,
  SetupSelectionError,
  type SetupStore,
  skipSetupStep,
} from "./service.js"

const apiId = "@voyant-travel/setup#api.admin"
type Env = {
  Bindings: Record<string, unknown>
  Variables: { db: VoyantDb; eventBus?: EventBus; userId?: string; scopes?: string[] }
}

export interface CreateSetupRoutesOptions {
  prefill?: Readonly<Record<string, unknown>>
  steps?: readonly import("./contracts.js").SetupStepDefinition[]
  createStore?: (db: VoyantDb) => SetupStore
}

const jsonContent = <T extends z.ZodTypeAny>(schema: T, description: string) => ({
  description,
  content: { "application/json": { schema } },
})
const errorResponse = z.object({ error: z.unknown() })
const errors = {
  400: jsonContent(errorResponse, "Invalid request"),
  401: jsonContent(errorResponse, "Authentication required"),
  403: jsonContent(errorResponse, "Authorization required"),
} as const

const getStateRoute = createRoute({
  method: "get",
  path: "/v1/admin/setup",
  operationId: "getSetupState",
  "x-voyant-api-id": apiId,
  responses: {
    200: jsonContent(setupStateResponseSchema, "Setup state"),
    401: errors[401],
    403: errors[403],
  },
})
const initializeRoute = createRoute({
  method: "post",
  path: "/v1/admin/setup/initialize",
  operationId: "initializeSetup",
  "x-voyant-api-id": apiId,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: initializeSetupInputSchema } },
    },
  },
  responses: {
    200: jsonContent(initializeSetupResponseSchema, "Initialized setup state"),
    ...errors,
  },
})
const stepParams = z.object({
  stepId: setupStepIdSchema.openapi({ param: { name: "stepId", in: "path" } }),
})
const completeRoute = createRoute({
  method: "post",
  path: "/v1/admin/setup/steps/{stepId}/complete",
  operationId: "completeSetupStep",
  "x-voyant-api-id": apiId,
  request: { params: stepParams },
  responses: { 200: jsonContent(setupStepResponseSchema, "Completed setup step"), ...errors },
})
const skipRoute = createRoute({
  method: "post",
  path: "/v1/admin/setup/steps/{stepId}/skip",
  operationId: "skipSetupStep",
  "x-voyant-api-id": apiId,
  request: { params: stepParams },
  responses: { 200: jsonContent(setupStepResponseSchema, "Skipped setup step"), ...errors },
})
const dismissRoute = createRoute({
  method: "post",
  path: "/v1/admin/setup/dismiss",
  operationId: "dismissSetup",
  "x-voyant-api-id": apiId,
  responses: {
    200: jsonContent(dismissSetupResponseSchema, "Dismissed setup guidance"),
    ...errors,
  },
})

export function createSetupRoutes(options: CreateSetupRoutesOptions = {}) {
  const app = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  const store = (db: VoyantDb) => (options.createStore ?? createDrizzleSetupStore)(db)
  const prefill = options.prefill ?? {}
  const steps = options.steps ?? []

  const selectionRequest = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run()
    } catch (error) {
      if (error instanceof SetupSelectionError) throw new RequestValidationError(error.message)
      throw error
    }
  }

  app.openapi(getStateRoute, async (c) => {
    requireUserId(c)
    return c.json(
      {
        data: {
          state: await getSetupState(store(c.get("db")), steps, prefill),
          canManage: canManageSetup(c.get("scopes")),
        },
      },
      200,
    )
  })
  app.openapi(initializeRoute, async (c) => {
    requireUserId(c)
    requireSetupWrite(c.get("scopes"))
    const input = await parseJsonBody(c, initializeSetupInputSchema)
    return c.json(
      {
        data: await selectionRequest(() =>
          initializeSetup(store(c.get("db")), input, steps, prefill, {
            eventBus: c.get("eventBus"),
          }),
        ),
      },
      200,
    )
  })
  app.openapi(completeRoute, async (c) => {
    requireUserId(c)
    requireSetupWrite(c.get("scopes"))
    return c.json(
      {
        data: await selectionRequest(() =>
          completeSetupStep(store(c.get("db")), steps, c.req.valid("param").stepId, {
            eventBus: c.get("eventBus"),
          }),
        ),
      },
      200,
    )
  })
  app.openapi(skipRoute, async (c) => {
    requireUserId(c)
    requireSetupWrite(c.get("scopes"))
    return c.json(
      {
        data: await selectionRequest(() =>
          skipSetupStep(store(c.get("db")), steps, c.req.valid("param").stepId, {
            eventBus: c.get("eventBus"),
          }),
        ),
      },
      200,
    )
  })
  app.openapi(dismissRoute, async (c) => {
    requireUserId(c)
    requireSetupWrite(c.get("scopes"))
    return c.json(
      {
        data: await dismissSetup(store(c.get("db")), steps, prefill, {
          eventBus: c.get("eventBus"),
        }),
      },
      200,
    )
  })
  return app
}

function canManageSetup(scopes: string[] | undefined): boolean {
  return hasApiKeyPermission(permissionStringsToPermissions(scopes ?? []), "setup", "write")
}

function requireSetupWrite(scopes: string[] | undefined): void {
  if (!canManageSetup(scopes)) throw new ForbiddenApiError()
}
