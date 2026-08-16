import { createRoute, type RouteConfig } from "@hono/zod-openapi"

export const INSURANCE_OPENAPI_API_IDS = {
  admin: "@voyant-travel/insurance#api.admin",
} as const

/**
 * Every route carries the owning API id so the operator's build-time OpenAPI
 * replay can attribute the operation to this module's document. Stamped here
 * rather than at each call site so a new route cannot be added without it.
 */
export function createInsuranceAdminRoute<
  P extends string,
  R extends Omit<RouteConfig, "path"> & { path: P },
>(route: R) {
  return createRoute({
    "x-voyant-api-id": INSURANCE_OPENAPI_API_IDS.admin,
    ...route,
  })
}
