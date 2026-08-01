import { Hono } from "hono"
import { describe, expect, it } from "vitest"

import {
  assembleAnonymousPaths,
  assembleOptionalCustomerAuthPaths,
} from "../../src/anonymous-paths.js"
import type { ApiExtension, ApiModule } from "../../src/module.js"

const noop = (c: { json: (b: unknown) => unknown }) => c.json({})

const mod = (name: string, extra: Partial<ApiModule> = {}): ApiModule => ({
  module: { name },
  ...extra,
})
const ext = (module: string, extra: Partial<ApiExtension> = {}): ApiExtension => ({
  extension: { name: module, module },
  ...extra,
})

describe("assembleAnonymousPaths (ADR-0008)", () => {
  it("returns only explicit paths when nothing declares anonymous", () => {
    const paths = assembleAnonymousPaths(
      [mod("bookings"), mod("catalog")],
      [],
      ["/v1/finance/providers/netopia/callback"],
    )
    expect(paths).toEqual(["/v1/finance/providers/netopia/callback"])
  })

  it("opens the whole public mount for `anonymous: true`", () => {
    const paths = assembleAnonymousPaths([mod("catalog", { anonymous: true })], [])
    expect(paths).toEqual(["/v1/public/catalog"])
  })

  it("opens specific sub-paths for a string array, relative to the mount", () => {
    const paths = assembleAnonymousPaths(
      [mod("finance", { anonymous: ["/bookings", "collections", "/payment-sessions"] })],
      [],
    )
    expect(paths).toEqual([
      "/v1/public/finance/bookings",
      "/v1/public/finance/collections",
      "/v1/public/finance/payment-sessions",
    ])
  })

  it("honors a `publicPath` override when computing the mount", () => {
    const paths = assembleAnonymousPaths(
      [mod("proposal-versions", { publicPath: "proposals", anonymous: true })],
      [],
    )
    expect(paths).toEqual(["/v1/public/proposals"])
  })

  it("treats `publicPath: '/' ` as the public root", () => {
    const paths = assembleAnonymousPaths(
      [mod("storefront", { publicPath: "/", anonymous: ["/leads"] })],
      [],
    )
    expect(paths).toEqual(["/v1/public/leads"])
  })

  it("assembles from extensions too (mount = extension.module)", () => {
    const paths = assembleAnonymousPaths([], [ext("catalog", { anonymous: ["/checkout"] })])
    expect(paths).toEqual(["/v1/public/catalog/checkout"])
  })

  it("unions module declarations with the explicit escape-hatch list, sorted + deduped", () => {
    const paths = assembleAnonymousPaths(
      [mod("catalog", { anonymous: true }), mod("bookings", { anonymous: true })],
      [ext("proposal-versions", { publicPath: "proposals", anonymous: true })],
      ["/v1/finance/providers/netopia/callback", "/v1/public/catalog"], // dup of catalog
    )
    expect(paths).toEqual([
      "/v1/finance/providers/netopia/callback",
      "/v1/public/bookings",
      "/v1/public/catalog",
      "/v1/public/proposals",
    ])
  })

  it("ignores modules whose `anonymous` is unset or false", () => {
    const paths = assembleAnonymousPaths(
      [
        mod("catalog", { anonymous: true }),
        mod("admin-only"),
        mod("internal", { anonymous: false }),
      ],
      [],
    )
    expect(paths).toEqual(["/v1/public/catalog"])
  })

  it("auto-adds a module's concrete webhookRoutes paths at /v1/{name}{path}", () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub handler
    const webhookRoutes = new Hono().post("/inbound/callback", noop as any)
    const paths = assembleAnonymousPaths([mod("payments", { webhookRoutes })], [])
    expect(paths).toEqual(["/v1/payments/inbound/callback"])
  })

  it("auto-adds an extension's webhookRoutes at /v1/{extension.module}{path} (the Netopia shape)", () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub handler
    const webhookRoutes = new Hono().post("/providers/netopia/callback", noop as any)
    const paths = assembleAnonymousPaths([], [ext("finance", { webhookRoutes })])
    expect(paths).toContain("/v1/finance/providers/netopia/callback")
  })

  it("does NOT auto-add parameterized or wildcard webhook paths (literal matcher can't match them)", () => {
    const webhookRoutes = new Hono()
      // biome-ignore lint/suspicious/noExplicitAny: test stub handler
      .post("/hooks/:id/callback", noop as any)
      // biome-ignore lint/suspicious/noExplicitAny: test stub handler
      .post("/hooks/*", noop as any)
      // biome-ignore lint/suspicious/noExplicitAny: test stub handler
      .post("/hooks/fixed", noop as any)
    const paths = assembleAnonymousPaths([mod("svc", { webhookRoutes })], [])
    expect(paths).toEqual(["/v1/svc/hooks/fixed"])
  })
})

describe("assembleOptionalCustomerAuthPaths", () => {
  it("assembles mixed guest/customer paths relative to module and extension mounts", () => {
    expect(
      assembleOptionalCustomerAuthPaths(
        [mod("bookings", { optionalCustomerAuth: true })],
        [ext("storefront", { optionalCustomerAuth: ["/bookings"] })],
      ),
    ).toEqual(["/v1/public/bookings", "/v1/public/storefront/bookings"])
  })
})
