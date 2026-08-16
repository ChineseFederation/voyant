/**
 * Integration smoke test: mount the REAL operator composition through
 * `createApp` and confirm the migrated route families actually resolve.
 *
 * A mounted route returns something other than 404 (it may 4xx/5xx on the stub
 * db — we only assert it is reached). An unmounted path returns 404. This
 * exercises all three lazy mechanisms (lazyAdminRoutes, lazyPublicRoutes,
 * multi-prefix lazyRoutes) end-to-end through the composed registry, including
 * the context bridge (handlers read c.var.db without throwing "undefined db").
 */

import type { Actor } from "@voyant-travel/core"
import { composeVoyantGraphRuntime } from "@voyant-travel/framework"
import { mountApp } from "@voyant-travel/hono"
import { describe, expect, it, vi } from "vitest"

import { accessCatalog } from "../../.voyant/access/selected-access-catalog.generated"
import {
  createGeneratedGraphRuntime,
  createGeneratedTestDeploymentResources,
} from "./generated-project-runtime.js"

const TEST_ENV = { DATABASE_URL: "postgres://test" } as never
const TEST_CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as never

function testAuthContext(actor: Actor) {
  return {
    userId: "u1",
    actor,
    realm: actor === "staff" ? ("admin" as const) : ("customer" as const),
    ...(actor === "customer"
      ? {
          publicChannel: {
            channelId: "chan_test",
            channelStatus: "active",
          },
        }
      : {}),
  }
}

async function build() {
  const composition = await buildGraphComposition()
  return mountApp({
    // Stub db — enough to be leased + bridged; handlers may 5xx using it, which
    // still proves the route is mounted and the context reached the sub-app.
    // biome-ignore lint/suspicious/noExplicitAny: stub db for mount smoke test -- owner: operator API tests.
    db: () => ({}) as any,
    modules: composition.modules,
    extensions: composition.extensions,
    ...mountRoutePosture(composition),
    auth: {
      resolve: ({ request }) => {
        const actor: Actor = new URL(request.url).pathname.startsWith("/v1/public/")
          ? "customer"
          : "staff"
        return testAuthContext(actor)
      },
    },
  })
}

async function buildWithSessionActor(actor: Actor) {
  const composition = await buildGraphComposition()
  return mountApp({
    // biome-ignore lint/suspicious/noExplicitAny: stub db for auth-surface regression -- owner: operator API tests.
    db: () => ({}) as any,
    modules: composition.modules,
    extensions: composition.extensions,
    ...mountRoutePosture(composition),
    auth: {
      resolve: () => testAuthContext(actor),
    },
  })
}

async function buildWithLiveFrontDoor(
  actor: Actor = "staff",
  // biome-ignore lint/suspicious/noExplicitAny: owner: Operator route smoke test; configurable DB boundary.
  db: () => any = () => ({}),
) {
  const composition = await buildGraphComposition()
  return mountApp({
    modules: composition.modules,
    extensions: composition.extensions,
    ...mountRoutePosture(composition),
    db,
    auth: {
      resolve: () => testAuthContext(actor),
    },
  })
}

async function status(path: string, method = "GET"): Promise<number> {
  const app = await build()
  const res = await app.request(path, { method }, TEST_ENV, TEST_CTX)
  return res.status
}

async function liveFrontDoorStatus(path: string, init: RequestInit = {}): Promise<number> {
  const app = await buildWithLiveFrontDoor()
  const res = await app.request(path, init, TEST_ENV, TEST_CTX)
  return res.status
}

async function responseWithSessionActor(
  actor: Actor,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const app = await buildWithSessionActor(actor)
  return app.request(path, init, TEST_ENV, TEST_CTX)
}

async function buildGraphComposition() {
  const selected = await createGeneratedTestDeploymentResources(createGeneratedGraphRuntime())
  return composeVoyantGraphRuntime({
    runtime: selected.runtime,
    capabilities: selected.capabilities,
    ports: selected.ports,
  })
}

function mountRoutePosture(composition: Awaited<ReturnType<typeof buildGraphComposition>>) {
  return {
    publicPaths: [...composition.routePosture.publicPaths],
    dbTransactionalPaths: [...composition.routePosture.transactionalPaths],
    // The PK/SK capability line is part of the mounted posture (voyant#4625).
    // Omitting these would leave the harness holding every public route to an
    // empty allow-list — secret-key-only — which is a posture no deployment
    // ever has, so the smoke tests would assert against a surface that does
    // not exist.
    publishablePaths: [...composition.routePosture.publishablePaths],
    guardedIntakePaths: [...composition.routePosture.guardedIntakePaths],
    accessResources: composition.accessResources,
    accessCatalog,
  }
}

describe("operator composed route mounting (smoke)", () => {
  it("returns 404 for an unmounted admin path (control)", async () => {
    expect(await status("/v1/admin/definitely-not-mounted/x")).toBe(404)
  })

  it("mounts MICE booking details routes through the live application front door", async () => {
    const bookingPath = "/v1/admin/bookings/book_123/mice-details"

    expect(await liveFrontDoorStatus(bookingPath)).not.toBe(404)
    expect(
      await liveFrontDoorStatus(bookingPath, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ programId: "mice_program_123", delegateId: "mice_delegate_123" }),
      }),
    ).not.toBe(404)
    expect(await liveFrontDoorStatus(bookingPath, { method: "DELETE" })).not.toBe(404)
  })

  it("mounts the package-owned Flights admin routes", async () => {
    expect(await status("/v1/admin/flights/reference/airports")).not.toBe(404)
  })

  it("mounts the lazy MCP admin routes", async () => {
    // MCP is now a real MCP server: JSON-RPC at the mount root + a discovery manifest.
    const app = await build()
    const manifestResponse = await app.request("/v1/admin/mcp/manifest", {}, TEST_ENV, TEST_CTX)
    expect(manifestResponse.status).toBe(200)
    const manifest = (await manifestResponse.json()) as {
      version?: unknown
      tools?: unknown
    }
    const mcpResponse = await app.request(
      "/v1/admin/mcp",
      {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "operator-mcp-health", version: "1.0.0" },
          },
        }),
      },
      TEST_ENV,
      TEST_CTX,
    )

    expect(manifest.version).toBeTypeOf("string")
    expect(manifest.tools).toBeInstanceOf(Array)
    expect(mcpResponse.status).not.toBe(500)
  })

  it("mounts package-owned invitations admin + public surfaces", async () => {
    expect(await status("/v1/admin/invitations")).not.toBe(404)
    expect(await status("/v1/public/invitations/tok_123")).not.toBe(404)
  })

  it("mounts lazy extensions (action-ledger health, proposals, catalog offers)", async () => {
    expect(await status("/v1/admin/action-ledger/health")).not.toBe(404)
    expect(await status("/v1/public/proposals/prvr_123")).not.toBe(404)
    expect(await status("/v1/admin/catalog/package-offers", "POST")).not.toBe(404)
  })

  it("mounts charters lazy admin + public surfaces (operator-local, voyant#2191)", async () => {
    // The public charter browse list is served (local-only when no adapter is
    // registered) — proves the operator actually mounts charters at runtime, not
    // just that it surfaces in the spec.
    expect(await status("/v1/public/charters")).not.toBe(404)
    expect(await status("/v1/admin/charters/products")).not.toBe(404)
  })

  it("mounts multi-prefix lazyRoutes families (catalog-booking, media, settings, payment-link)", async () => {
    expect(await status("/v1/admin/catalog/orders")).not.toBe(404)
    expect(await status("/v1/admin/media/anything")).not.toBe(404)
    expect(await liveFrontDoorStatus("/v1/admin/finance/tax-settings")).not.toBe(404)
    expect(await status("/v1/public/operator-profile")).not.toBe(404)
    expect(await status("/v1/public/settings/operator")).not.toBe(404)
    expect(await status("/v1/public/payment-link-config")).not.toBe(404)
  })

  it("mounts distribution channel-push admin routes used by channel sync", async () => {
    expect(await status("/v1/admin/distribution/links?limit=100")).not.toBe(404)
    expect(await status("/v1/admin/distribution/throttling")).not.toBe(404)
    expect(await status("/v1/admin/distribution/retry/booking_123", "POST")).not.toBe(404)
    expect(await status("/v1/admin/distribution/reconcile/bookings", "POST")).not.toBe(404)
  })

  it("does not mount SmartBill routes unless the project selects the plugin", async () => {
    expect(await status("/v1/admin/smartbill/invoices/inv_123/sync", "POST")).toBe(404)
  })

  // Travel-credit validation takes a bare code, is not rate-limited, and answers
  // with the credit's remaining balance — an enumeration oracle over a bearer
  // instrument worth real money. It is deliberately NOT publishable
  // (voyant#4625): a storefront that wants browser-side validation proxies it
  // with a secret key. Both halves are asserted, because "mounted" and
  // "reachable with a publishable key" are now different questions.
  it("mounts Travel Credit validation but refuses it without a secret key", async () => {
    const body = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "TEST-CREDIT" }),
    }

    const denied = await responseWithSessionActor(
      "staff",
      "/v1/public/finance/travel-credits/validate",
      body,
    )
    expect(denied.status).toBe(403)
    expect(((await denied.json()) as { code?: string }).code).toBe("secret_key_required")

    const withSecretKey = await responseWithSessionActor(
      "staff",
      "/v1/public/finance/travel-credits/validate",
      { ...body, headers: { ...body.headers, "x-api-key": "vsk_operator_route_mounting" } },
    )
    expect(withSecretKey.status).not.toBe(401)
    expect(withSecretKey.status).not.toBe(403)
    expect(withSecretKey.status).not.toBe(404)
  })

  it("mounts storefront offer routes selected by the deployment graph", async () => {
    const offerPayload = {
      productId: "prod_123",
      pax: 2,
      basePriceCents: 100_00,
      currency: "EUR",
    }

    const app = await buildWithLiveFrontDoor("customer", () => ({
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [] }),
        }),
      }),
    }))
    const detail = await app.request("/v1/public/offers/summer-sale", {}, TEST_ENV, TEST_CTX)
    const apply = await app.request(
      "/v1/public/offers/summer-sale/apply",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(offerPayload),
      },
      TEST_ENV,
      TEST_CTX,
    )
    const redeem = await app.request(
      "/v1/public/offers/redeem",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...offerPayload, code: "SAVE10" }),
      },
      TEST_ENV,
      TEST_CTX,
    )

    expect(detail.status, await detail.clone().text()).toBe(404)
    expect(apply.status).not.toBe(404)
    expect(redeem.status).not.toBe(404)
  })

  it("lets public operator settings pass the application public actor gate", async () => {
    const settings = await liveFrontDoorStatus("/v1/public/settings/operator")

    expect(settings).not.toBe(401)
    expect(settings).not.toBe(403)
    expect(settings).not.toBe(404)
  })

  it("resolves storefront context only for anonymous routes that declare optional customer auth", async () => {
    const composition = await buildGraphComposition()
    const resolve = vi.fn(() => ({
      userId: "u1",
      actor: "staff" as const,
      realm: "admin" as const,
    }))
    const anonymousApp = mountApp({
      modules: composition.modules,
      extensions: composition.extensions,
      ...mountRoutePosture(composition),
      // biome-ignore lint/suspicious/noExplicitAny: stub db for auth posture regression -- owner: operator API tests.
      db: () => ({}) as any,
      auth: { resolve },
    })

    const settings = await anonymousApp.request(
      "/v1/public/settings/operator",
      {},
      TEST_ENV,
      TEST_CTX,
    )
    expect(settings.status).not.toBe(401)
    expect(settings.status).not.toBe(403)
    expect(settings.status).not.toBe(404)
    expect(resolve).toHaveBeenCalledTimes(1)

    resolve.mockClear()
    const paymentLink = await anonymousApp.request(
      "/v1/public/payment-link-config",
      {},
      TEST_ENV,
      TEST_CTX,
    )
    expect(paymentLink.status).not.toBe(401)
    expect(paymentLink.status).not.toBe(403)
    expect(paymentLink.status).not.toBe(404)
    expect(resolve).not.toHaveBeenCalled()
  })

  it("routes graph-declared transactional prefixes to the transactional db", async () => {
    const composition = await buildGraphComposition()
    const defaultDb = vi.fn(() => ({}))
    const transactionalDb = vi.fn(() => ({}))
    const dbRoutingApp = mountApp({
      modules: composition.modules,
      extensions: composition.extensions,
      ...mountRoutePosture(composition),
      // biome-ignore lint/suspicious/noExplicitAny: stub db factories for route selection regression -- owner: operator API tests.
      db: defaultDb as any,
      // biome-ignore lint/suspicious/noExplicitAny: stub db factories for route selection regression -- owner: operator API tests.
      dbTransactional: transactionalDb as any,
      auth: { resolve: () => ({ userId: "u1", actor: "staff", realm: "admin" }) },
    })

    await dbRoutingApp.request("/v1/admin/bookings/book_123/mice-details", {}, TEST_ENV, TEST_CTX)

    expect(transactionalDb).toHaveBeenCalled()
    expect(defaultDb).not.toHaveBeenCalled()

    transactionalDb.mockClear()
    await dbRoutingApp.request("/v1/admin/flights/reference/airports", {}, TEST_ENV, TEST_CTX)

    expect(defaultDb).toHaveBeenCalled()
    expect(transactionalDb).not.toHaveBeenCalled()
  })
})
