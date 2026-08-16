/**
 * Guards the OpenAPI naming of a contracts-owned schema against import order.
 *
 * `bookingAmendmentSchema` is built by `@voyant-travel/bookings-contracts`,
 * which depends on `zod` alone (ADR-0002). `.openapi()` is not part of zod — it
 * is grafted onto `ZodType.prototype` by `extendZodWithOpenApi` when
 * `@hono/zod-openapi` is first imported. Zod v4 copies its methods onto each
 * instance at construction time, so that graft only reaches schemas built after
 * the import, and calling `.openapi()` on a contracts schema throws
 * `bookingAmendmentSchema.openapi is not a function` whenever an importer
 * reaches the contracts package first.
 *
 * That is exactly what happened: every Bookings entrypoint kept working while
 * `@voyant-travel/public-api`'s unit suite failed to collect at all, because
 * its import graph happened to evaluate the contracts package first.
 *
 * This test pins the behaviour rather than the mechanism — a schema constructed
 * before Hono is imported must still yield a named `#/components/schemas/...`
 * reference. It deliberately imports plain `zod` first to reproduce the hostile
 * order.
 */

import { describe, expect, it } from "vitest"
import { z as plainZod } from "zod"

// Constructed BEFORE @hono/zod-openapi is imported, mirroring how a contracts
// package's schemas are built. Do not move this below the import.
const foreignSchema = plainZod.object({ id: plainZod.string() })

describe("OpenAPI naming for contracts-owned schemas", () => {
  it("names a schema built before @hono/zod-openapi loads", async () => {
    const { OpenAPIHono, createRoute, z } = await import("@hono/zod-openapi")

    // `.meta({ id })` is native zod v4 and writes to the same `z.globalRegistry`
    // the generator reads, so it needs no prototype graft.
    const named = foreignSchema.meta({ id: "ForeignNamedSchema" })

    const app = new OpenAPIHono()
    app.openapi(
      createRoute({
        method: "get",
        path: "/thing",
        responses: {
          200: {
            description: "ok",
            content: { "application/json": { schema: z.object({ data: named }) } },
          },
        },
      }),
      (c) => c.json({ data: { id: "x" } }),
    )
    app.doc("/doc", { openapi: "3.0.0", info: { title: "t", version: "1" } })

    const doc = await (await app.request("/doc")).json()

    expect(Object.keys(doc.components?.schemas ?? {})).toContain("ForeignNamedSchema")
    expect(
      doc.paths["/thing"].get.responses["200"].content["application/json"].schema.properties.data
        .$ref,
    ).toBe("#/components/schemas/ForeignNamedSchema")
  })

  it("confirms the prototype graft does not reach a pre-built instance", async () => {
    // The failure mode itself. If a future zod/zod-to-openapi pairing ever makes
    // this false, `.openapi()` on a contracts schema becomes safe again and this
    // whole workaround can be revisited.
    await import("@hono/zod-openapi")
    expect(
      (foreignSchema as unknown as { openapi?: unknown }).openapi,
      "a schema built before the import should still lack .openapi()",
    ).toBeUndefined()
  })
})
