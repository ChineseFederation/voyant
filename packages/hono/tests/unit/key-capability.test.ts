import { Hono } from "hono"
import { describe, expect, it } from "vitest"

import { assembleGuardedIntakePaths, assemblePublishablePaths } from "../../src/anonymous-paths.js"
import { requireKeyCapability } from "../../src/middleware/key-capability.js"
import type { ApiExtension, ApiModule } from "../../src/module.js"
import type { VoyantBindings, VoyantVariables } from "../../src/types.js"

const PUBLISHABLE = "vpk_abcdefghijklmnop"
const SECRET = "vsk_abcdefghijklmnop"

const mod = (name: string, extra: Partial<ApiModule> = {}): ApiModule => ({
  module: { name },
  ...extra,
})
const ext = (module: string, extra: Partial<ApiExtension> = {}): ApiExtension => ({
  extension: { name: module, module },
  ...extra,
})

interface CallOptions {
  path?: string
  method?: string
  key?: string
  bearer?: string
  callerType?: VoyantVariables["callerType"]
  publishablePaths?: string[]
  guardedIntakePaths?: string[]
  publicIntakeGuarded?: boolean
}

/**
 * Drive the real middleware over a real Hono app. `callerType` is set by an
 * upstream stub because the middleware runs after `requireAuth` and reads what
 * that resolved — asserting against a hand-built context instead would prove
 * the assertion, not the middleware.
 */
async function call(options: CallOptions = {}) {
  const app = new Hono<{ Bindings: VoyantBindings; Variables: VoyantVariables }>()
  if (options.callerType) {
    app.use("*", async (c, next) => {
      c.set("callerType", options.callerType)
      return next()
    })
  }
  app.use(
    "*",
    requireKeyCapability({
      publishablePaths: options.publishablePaths ?? [],
      guardedIntakePaths: options.guardedIntakePaths ?? [],
      ...(options.publicIntakeGuarded === undefined
        ? {}
        : { publicIntakeGuarded: options.publicIntakeGuarded }),
    }),
  )
  app.all("*", (c) => c.json({ ok: true, keyKind: c.get("storefrontKeyKind") ?? null }))

  const headers = new Headers()
  if (options.key) headers.set("x-api-key", options.key)
  if (options.bearer) headers.set("authorization", `Bearer ${options.bearer}`)
  const response = await app.request(
    `http://local${options.path ?? "/v1/public/catalog/search"}`,
    { method: options.method ?? "GET", headers },
    {} as VoyantBindings,
  )
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

describe("requireKeyCapability", () => {
  it("classifies the presented key by prefix and exposes it downstream", async () => {
    const publishable = await call({
      key: PUBLISHABLE,
      publishablePaths: ["/v1/public/catalog"],
    })
    expect(publishable.body.keyKind).toBe("publishable")

    const secret = await call({ key: SECRET })
    expect(secret.body.keyKind).toBe("secret")

    const none = await call({ publishablePaths: ["/v1/public/catalog"] })
    expect(none.body.keyKind).toBeNull()
  })

  it("lets a secret key reach the whole public surface", async () => {
    const response = await call({ key: SECRET, path: "/v1/public/finance/travel-credits/validate" })
    expect(response.status).toBe(200)
  })

  it("holds a publishable key to the declared allow-list", async () => {
    const allowed = await call({ key: PUBLISHABLE, publishablePaths: ["/v1/public/catalog"] })
    expect(allowed.status).toBe(200)

    const denied = await call({
      key: PUBLISHABLE,
      path: "/v1/public/finance/travel-credits/validate",
      publishablePaths: ["/v1/public/catalog"],
    })
    expect(denied.status).toBe(403)
    expect(denied.body.code).toBe("secret_key_required")
  })

  it("holds a KEYLESS request to the same allow-list", async () => {
    // The storefront behind a public request is resolved by key OR by origin,
    // so a caller who simply omits the `vpk_` still gets a storefront channel.
    // Checking only `vpk_`-bearing requests would make the line removable by
    // deleting a header.
    const denied = await call({
      path: "/v1/public/finance/travel-credits/validate",
      publishablePaths: ["/v1/public/catalog"],
    })
    expect(denied.status).toBe(403)
    expect(denied.body.code).toBe("secret_key_required")
  })

  it("denies everything on the public surface when nothing is declared publishable", async () => {
    const denied = await call({ key: PUBLISHABLE })
    expect(denied.status).toBe(403)
  })

  it("matches on path segments, never on a shared string prefix", async () => {
    const denied = await call({
      key: PUBLISHABLE,
      path: "/v1/public/catalogue/search",
      publishablePaths: ["/v1/public/catalog"],
    })
    expect(denied.status).toBe(403)
  })

  it("lets the deployment's own server credentials through untouched", async () => {
    for (const callerType of ["internal", "api_key"] as const) {
      const response = await call({
        callerType,
        path: "/v1/public/finance/travel-credits/validate",
      })
      expect(response.status).toBe(200)
    }
  })

  it("does not let a bearer token talk the line out of reading x-api-key", async () => {
    const denied = await call({
      key: PUBLISHABLE,
      bearer: "some-other-credential",
      publishablePaths: ["/v1/public/catalog"],
      path: "/v1/public/finance/travel-credits/validate",
    })
    expect(denied.status).toBe(403)
  })

  it("reads a secret key presented as a bearer token", async () => {
    const response = await call({
      bearer: SECRET,
      path: "/v1/public/finance/travel-credits/validate",
    })
    expect(response.status).toBe(200)
    expect(response.body.keyKind).toBe("secret")
  })

  it("refuses unchallenged intake to a publishable key when no guard is configured", async () => {
    const denied = await call({
      key: PUBLISHABLE,
      path: "/v1/public/leads",
      publishablePaths: ["/v1/public"],
      guardedIntakePaths: ["/v1/public/leads"],
    })
    expect(denied.status).toBe(403)
    expect(denied.body.code).toBe("intake_guard_required")
  })

  it("admits unchallenged intake once the deployment configures a guard", async () => {
    const response = await call({
      key: PUBLISHABLE,
      path: "/v1/public/leads",
      publishablePaths: ["/v1/public"],
      guardedIntakePaths: ["/v1/public/leads"],
      publicIntakeGuarded: true,
    })
    expect(response.status).toBe(200)
  })

  it("still lets a secret key reach unchallenged intake with no guard", async () => {
    const response = await call({
      key: SECRET,
      path: "/v1/public/leads",
      guardedIntakePaths: ["/v1/public/leads"],
    })
    expect(response.status).toBe(200)
  })

  it("leaves the admin surface and every non-published path alone", async () => {
    for (const path of ["/v1/admin/bookings", "/auth/customer/sign-in", "/health", "/v1/netopia"]) {
      const response = await call({ key: PUBLISHABLE, path })
      expect(response.status, path).toBe(200)
    }
  })

  it("never blocks a CORS preflight", async () => {
    const response = await call({ method: "OPTIONS", path: "/v1/public/finance" })
    expect(response.status).toBe(200)
  })
})

describe("assemblePublishablePaths / assembleGuardedIntakePaths", () => {
  it("returns an empty list when nothing declares a posture — which denies", () => {
    expect(assemblePublishablePaths([mod("catalog"), mod("finance")], [])).toEqual([])
  })

  it("opens the whole public mount for `publishable: true`", () => {
    expect(assemblePublishablePaths([mod("catalog", { publishable: true })], [])).toEqual([
      "/v1/public/catalog",
    ])
  })

  it("resolves sub-paths against a publicPath override, including the root mount", () => {
    expect(
      assemblePublishablePaths(
        [mod("storefront", { publicPath: "/", publishable: ["/departures", "offers"] })],
        [],
      ),
    ).toEqual(["/v1/public/departures", "/v1/public/offers"])
  })

  it("reads extensions and explicit deployment entries too", () => {
    expect(
      assemblePublishablePaths(
        [],
        [ext("payment-policy", { publishable: true })],
        ["/v1/public/unowned"],
      ),
    ).toEqual(["/v1/public/payment-policy", "/v1/public/unowned"])
  })

  it("treats a module that reports a wired guard as the deployment saying so", () => {
    // Wiring the guard IS the unlock — there is no second flag to forget, and no
    // way to claim the deployment guards intake while nothing does.
    const guarded = mod("storefront", {
      publicPath: "/",
      guardedIntake: ["/leads"],
      publicIntakeGuarded: true,
    })
    expect(guarded.publicIntakeGuarded).toBe(true)
    expect(assembleGuardedIntakePaths([guarded], [])).toEqual(["/v1/public/leads"])
  })

  it("keeps guarded intake out of the publishable list", () => {
    const module = mod("storefront", {
      publicPath: "/",
      publishable: ["/departures"],
      guardedIntake: ["/leads"],
    })
    expect(assemblePublishablePaths([module], [])).toEqual(["/v1/public/departures"])
    expect(assembleGuardedIntakePaths([module], [])).toEqual(["/v1/public/leads"])
  })
})
