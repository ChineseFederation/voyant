/**
 * Anonymous customer-portal routes.
 *
 * The `contact-exists` pair was removed: it answered, without any proof of
 * control, whether an address had an auth account, a customer record, and
 * whether that record was already claimed by someone else. That is an account
 * enumeration oracle, and rate limiting only slows it down.
 *
 * The storefront now starts a verification challenge instead. The API response
 * is identical whether or not an account exists; the delivered message differs,
 * and the client branches on what the user does next rather than on an answer
 * the server should not give an anonymous caller.
 */
import { OpenAPIHono } from "@hono/zod-openapi"
import { openApiValidationHook } from "@voyant-travel/hono"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

type Env = {
  Variables: {
    db: PostgresJsDatabase
  }
}

export const customerPortalRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })

export type CustomerPortalRoutes = typeof customerPortalRoutes
