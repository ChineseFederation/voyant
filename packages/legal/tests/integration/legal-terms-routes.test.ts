import { handleApiError } from "@voyant-travel/hono"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { Hono } from "hono"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { legalTermsAdminRoutes } from "../../src/terms/routes.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

const json = (body: Record<string, unknown>) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

describe.skipIf(!DB_AVAILABLE)("Legal terms routes", () => {
  let app: Hono
  let db: PostgresJsDatabase

  beforeAll(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    await cleanupTestDb(db)

    app = new Hono()
    app.use("*", async (c, next) => {
      c.set("db" as never, db)
      await next()
    })
    app.route("/", legalTermsAdminRoutes)
    // The OpenAPI default hook throws `RequestValidationError`; without the
    // shared boundary a rejected body would surface as a 500 and hide the
    // contract these routes actually enforce.
    app.onError(handleApiError)
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  it("creates and lists target-linked terms", async () => {
    const created = await app.request("/", {
      method: "POST",
      ...json({
        targetKind: "proposal_version",
        targetId: "prvr_123",
        termType: "terms_and_conditions",
        title: "Proposal terms",
        body: "Customer accepts the proposal-version terms.",
      }),
    })

    expect(created.status).toBe(201)
    const createdBody = await created.json()
    expect(createdBody.data.id).toMatch(/^ortm_/)
    expect(createdBody.data.targetKind).toBe("proposal_version")
    expect(createdBody.data.targetId).toBe("prvr_123")
    expect(createdBody.data.legacyTransactionOrderId).toBeNull()

    const listed = await app.request("/?targetKind=proposal_version&targetId=prvr_123")
    expect(listed.status).toBe(200)
    const listedBody = await listed.json()
    expect(listedBody.total).toBe(1)
    expect(listedBody.data[0].title).toBe("Proposal terms")
  })

  it("refuses an insurer disclosure that archives nothing", async () => {
    const created = await app.request("/", {
      method: "POST",
      ...json({
        targetKind: "booking",
        targetId: "bkg_route_disclosure",
        termType: "insurer_terms",
        title: "Insurer terms",
        body: "The insurer's terms of cover.",
      }),
    })

    expect(created.status).toBe(400)
  })

  it("keeps migrated transaction ids under explicit compatibility fields", async () => {
    const created = await app.request("/", {
      method: "POST",
      ...json({
        legacyTransactionOrderId: "ord_legacy",
        title: "Migrated order terms",
        body: "Imported from order_terms.",
      }),
    })

    expect(created.status).toBe(201)
    const createdBody = await created.json()
    expect(createdBody.data.legacyTransactionOrderId).toBe("ord_legacy")

    const listed = await app.request("/?legacyTransactionOrderId=ord_legacy")
    expect(listed.status).toBe(200)
    const listedBody = await listed.json()
    expect(listedBody.total).toBe(1)
    expect(listedBody.data[0].id).toBe(createdBody.data.id)
  })
})
