import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { ApiHttpError, openApiValidationHook } from "@voyant-travel/hono"
import type { Context } from "hono"

import {
  createPublicApiService,
  type PublicApiRequestContext,
  type PublicApiServiceOptions,
} from "./service.js"
import { publicApiSettingsPatchSchema, publicApiSettingsSchema } from "./validation.js"

type Env = {
  Variables: {
    db: unknown
  }
}

function getRequestContext(c: Context<Env>): PublicApiRequestContext {
  return {
    db: c.get("db" as never) as PublicApiRequestContext["db"],
    env: c.env,
    context: c,
  } satisfies PublicApiRequestContext
}

const errorResponseSchema = z.object({ error: z.string() })

const getSettingsRoute = createRoute({
  method: "get",
  path: "/settings",
  responses: {
    200: {
      description: "The deployment's storefront settings",
      content: { "application/json": { schema: z.object({ data: publicApiSettingsSchema }) } },
    },
  },
})

const updateSettingsRoute = createRoute({
  method: "patch",
  path: "/settings",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: publicApiSettingsPatchSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated storefront settings",
      content: { "application/json": { schema: z.object({ data: publicApiSettingsSchema }) } },
    },
    409: {
      description: "Storefront settings updates are not configured for this deployment",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

export function createPublicApiAdminRoutes(options?: PublicApiServiceOptions) {
  const publicApiService = createPublicApiService(options)

  return new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(getSettingsRoute, async (c) => {
      return c.json({ data: await publicApiService.resolveSettings(getRequestContext(c)) }, 200)
    })
    .openapi(updateSettingsRoute, async (c) => {
      const updated = await publicApiService.updateSettings(
        c.req.valid("json"),
        getRequestContext(c),
      )

      if (!updated) {
        throw new ApiHttpError("Storefront settings updates are not configured", {
          status: 409,
          code: "storefront_settings_update_not_configured",
        })
      }

      return c.json({ data: updated }, 200)
    })
}

export type PublicApiAdminRoutes = ReturnType<typeof createPublicApiAdminRoutes>
