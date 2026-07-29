// agent-quality: file-size exception -- owner: legal; existing coverage file stays co-located until a dedicated split preserves behavior and tests.
import { createEventBus } from "@voyant-travel/core"
import type { StorageProvider, StorageUploadBody } from "@voyant-travel/storage"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"

import { contractsPublicRoutes, createContractsAdminRoutes } from "../../src/contracts/routes.js"
import { contractSignatures, contracts, contractTemplates } from "../../src/contracts/schema.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

const json = (body: Record<string, unknown>) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})
const jsonWithIdempotency = (body: Record<string, unknown>, key: string) => ({
  headers: { "Content-Type": "application/json", "Idempotency-Key": key },
  body: JSON.stringify(body),
})

function managedBookingWorkflowMetadata(revision = 1, reviewOnly = true) {
  return {
    bookingContractWorkflow: {
      revision,
      previousRevisionId: null,
      reviewOnly,
      reviewSnapshot: {
        booking: {
          id: "booking_review_route_1",
          reference: "BK-ROUTE-1",
          customerName: "Ana Pop",
          customerEmail: "ana@example.test",
          language: "en",
          currency: "EUR",
          totalAmountCents: 100_00,
          startDate: "2026-09-01",
          endDate: "2026-09-07",
        },
        products: [
          {
            title: "Original tour",
            quantity: 1,
            amountCents: 100_00,
            currency: "EUR",
          },
        ],
        commercialTerms: { depositDueCents: 25_00 },
        template: {
          id: "template_review_route_1",
          name: "Customer review template",
          versionId: "template_version_review_route_1",
          version: 1,
          language: "en",
        },
      },
    },
  }
}

describe.skipIf(!DB_AVAILABLE)("Legal public routes", () => {
  let adminApp: Hono
  let publicApp: Hono
  let db: PostgresJsDatabase
  let uploadedObjects: Array<{ key: string; size: number; contentType: string | null }>
  let lifecycleEvents: Array<Record<string, unknown>>

  beforeAll(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    await cleanupTestDb(db)

    adminApp = new Hono()
    adminApp.use("*", async (c, next) => {
      c.set("db" as never, db)
      await next()
    })
    const eventBus = createEventBus()
    uploadedObjects = []
    const documentStorage: StorageProvider = {
      name: "legal-test-storage",
      async upload(body: StorageUploadBody, options = {}) {
        const key = options.key ?? `contracts/test/${uploadedObjects.length + 1}`
        const size =
          body instanceof Blob
            ? body.size
            : body instanceof Uint8Array
              ? body.byteLength
              : body.byteLength
        uploadedObjects.push({ key, size, contentType: options.contentType ?? null })
        return { key, url: `https://cdn.example.com/${key}` }
      },
      async delete() {},
      async signedUrl(key: string) {
        return `https://signed.example.com/${key}`
      },
      async get() {
        return null
      },
    }
    lifecycleEvents = []
    for (const eventName of [
      "contract.issued",
      "contract.sent",
      "contract.signed",
      "contract.executed",
      "contract.voided",
    ]) {
      eventBus.subscribe(eventName, (event) => {
        lifecycleEvents.push(event as Record<string, unknown>)
      })
    }
    adminApp.route(
      "/",
      createContractsAdminRoutes({
        eventBus,
        documentStorage,
        resolveDocumentDownloadUrl: (_bindings, storageKey) =>
          `https://signed.example.com/${storageKey}`,
      }),
    )

    publicApp = new Hono()
    publicApp.use("*", async (c, next) => {
      c.set("db" as never, db)
      await next()
    })
    publicApp.route("/", contractsPublicRoutes)
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
    uploadedObjects = []
    lifecycleEvents = []
  })

  it("selects the default active template using language fallback order", async () => {
    await db.insert(contractTemplates).values([
      {
        name: "Customer EN",
        slug: "customer-en",
        scope: "customer",
        language: "en",
        body: "Hello {{customer.firstName}}",
        active: true,
      },
      {
        name: "Customer RO",
        slug: "customer-ro",
        scope: "customer",
        language: "ro",
        body: "Salut {{customer.firstName}}",
        active: true,
      },
    ])

    const publicRes = await publicApp.request(
      "/templates/default?scope=customer&language=de&fallbackLanguages=ro,en",
    )
    expect(publicRes.status).toBe(200)
    expect((await publicRes.json()).data.slug).toBe("customer-ro")

    const adminRes = await adminApp.request(
      "/templates/default?scope=customer&language=de&fallbackLanguages=en",
    )
    expect(adminRes.status).toBe(200)
    expect((await adminRes.json()).data.slug).toBe("customer-en")
  })

  it("selects explicit channel defaults before global defaults", async () => {
    await db.insert(contractTemplates).values([
      {
        name: "Global Customer RO",
        slug: "global-customer-ro",
        scope: "customer",
        language: "ro",
        body: "Global RO",
        isDefault: true,
        active: true,
      },
      {
        name: "Web Customer RO",
        slug: "web-customer-ro",
        scope: "customer",
        language: "ro",
        channelId: "channel_web",
        body: "Web RO",
        isDefault: true,
        active: true,
      },
      {
        name: "Inactive Web Customer EN",
        slug: "inactive-web-customer-en",
        scope: "customer",
        language: "en",
        channelId: "channel_web",
        body: "Inactive Web EN",
        isDefault: true,
        active: false,
      },
      {
        name: "Global Customer EN",
        slug: "global-customer-en",
        scope: "customer",
        language: "en",
        body: "Global EN",
        isDefault: true,
        active: true,
      },
    ])

    const channelRes = await publicApp.request(
      "/templates/default?scope=customer&channelId=channel_web&language=ro&fallbackLanguages=en",
    )
    expect(channelRes.status).toBe(200)
    expect((await channelRes.json()).data.slug).toBe("web-customer-ro")

    const globalRes = await publicApp.request(
      "/templates/default?scope=customer&language=ro&fallbackLanguages=en",
    )
    expect(globalRes.status).toBe(200)
    expect((await globalRes.json()).data.slug).toBe("global-customer-ro")

    const fallbackRes = await publicApp.request(
      "/templates/default?scope=customer&channelId=channel_web&language=de&fallbackLanguages=en",
    )
    expect(fallbackRes.status).toBe(200)
    expect((await fallbackRes.json()).data.slug).toBe("global-customer-en")
  })

  it("enforces one default template per scope, channel, and language", async () => {
    await db.insert(contractTemplates).values({
      name: "Default Customer EN",
      slug: "default-customer-en",
      scope: "customer",
      language: "en",
      body: "Default EN",
      isDefault: true,
      active: true,
    })

    await expect(
      db.insert(contractTemplates).values({
        name: "Duplicate Default Customer EN",
        slug: "duplicate-default-customer-en",
        scope: "customer",
        language: "en",
        body: "Duplicate default EN",
        isDefault: true,
        active: true,
      }),
    ).rejects.toThrow()

    await db.insert(contractTemplates).values({
      name: "Channel Default Customer EN",
      slug: "channel-default-customer-en",
      scope: "customer",
      language: "en",
      channelId: "channel_partner",
      body: "Channel default EN",
      isDefault: true,
      active: true,
    })
  })

  it("renders a public preview from an active template", async () => {
    const [template] = await db
      .insert(contractTemplates)
      .values({
        name: "Customer RO",
        slug: "customer-ro",
        scope: "customer",
        language: "ro",
        body: "Salut {{customer.firstName}} {{customer.lastName}}",
        active: true,
      })
      .returning()

    const res = await publicApp.request(`/templates/${template.id}/preview`, {
      method: "POST",
      ...json({
        variables: {
          customer: { firstName: "Ana", lastName: "Popescu" },
        },
      }),
    })

    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({
      rendered: "Salut Ana Popescu",
    })

    const stableAliasRes = await publicApp.request(`/templates/${template.id}/render-preview`, {
      method: "POST",
      ...json({
        variables: {
          customer: { firstName: "Mara", lastName: "Ionescu" },
        },
      }),
    })

    expect(stableAliasRes.status).toBe(200)
    expect((await stableAliasRes.json()).data).toEqual({
      rendered: "Salut Mara Ionescu",
    })
  })

  it("attaches an uploaded stored document to a contract", async () => {
    const [contract] = await db
      .insert(contracts)
      .values({
        title: "Uploaded contract",
        scope: "customer",
        status: "issued",
      })
      .returning()

    const form = new FormData()
    form.set("name", "Signed contract.pdf")
    form.set("kind", "signed_contract")
    form.set("file", new File(["signed body"], "signed.pdf", { type: "application/pdf" }))

    const res = await adminApp.request(`/${contract.id}/attachments/upload`, {
      method: "POST",
      body: form,
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data).toMatchObject({
      contractId: contract.id,
      kind: "signed_contract",
      name: "Signed contract.pdf",
      mimeType: "application/pdf",
      fileSize: 11,
      checksum: expect.stringMatching(/^sha256:/),
    })
    expect(body.data.storageKey).toContain(`contracts/${contract.id}/attachments/`)
    expect(uploadedObjects).toEqual([
      expect.objectContaining({
        key: body.data.storageKey,
        size: 11,
        contentType: "application/pdf",
      }),
    ])

    const removedAliasRes = await adminApp.request(`/${contract.id}/attach-document`, {
      method: "POST",
    })
    expect(removedAliasRes.status).toBe(404)
  })

  it("rejects public contract read and sign by id alone", async () => {
    const [contract] = await db
      .insert(contracts)
      .values({
        title: "Token-only contract",
        scope: "customer",
        status: "sent",
        renderedBody: "<p>Hello traveler</p>",
        variables: {
          customer: { email: "traveler@example.com", passportNumber: "P123456" },
        },
        metadata: { internalNote: "Do not expose" },
      })
      .returning()

    const readRes = await publicApp.request(`/${contract.id}`)
    expect(readRes.status).toBe(404)
    expect(await readRes.json()).toEqual({ error: "Contract not found" })

    const signRes = await publicApp.request(`/${contract.id}/sign`, {
      method: "POST",
      ...json({
        signerName: "Ada Lovelace",
        method: "manual",
      }),
    })
    expect(signRes.status).toBe(404)
    expect(await signRes.json()).toEqual({ error: "Contract not found" })

    const signatures = await db
      .select()
      .from(contractSignatures)
      .where(eq(contractSignatures.contractId, contract.id))
    expect(signatures).toEqual([])
  })

  it("does not upload a stored document for a missing contract", async () => {
    const form = new FormData()
    form.set("name", "Missing contract.pdf")
    form.set("kind", "signed_contract")
    form.set("file", new File(["signed body"], "missing.pdf", { type: "application/pdf" }))

    const res = await adminApp.request("/00000000-0000-0000-0000-000000000000/attachments/upload", {
      method: "POST",
      body: form,
    })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Contract not found" })
    expect(uploadedObjects).toEqual([])
  })

  it("validates contract lifecycle transitions, records history, and emits safe events", async () => {
    const createRes = await adminApp.request("/", {
      method: "POST",
      ...json({
        title: "Lifecycle contract",
        scope: "customer",
      }),
    })
    expect(createRes.status).toBe(201)
    const created = (await createRes.json()).data
    expect(created.stageHistory).toEqual([
      expect.objectContaining({
        stage: "draft",
        previousStage: null,
        transition: "created",
      }),
    ])

    const prematureSign = await adminApp.request(`/${created.id}/sign`, {
      method: "POST",
      ...json({
        signerName: "Ada Lovelace",
        method: "manual",
      }),
    })
    expect(prematureSign.status).toBe(409)

    const issueRes = await adminApp.request(`/${created.id}/issue`, { method: "POST" })
    expect(issueRes.status).toBe(200)

    const sendRes = await adminApp.request(`/${created.id}/send`, { method: "POST" })
    expect(sendRes.status).toBe(200)

    const signRes = await adminApp.request(`/${created.id}/sign`, {
      method: "POST",
      ...json({
        signerName: "Ada Lovelace",
        method: "manual",
      }),
    })
    expect(signRes.status).toBe(200)

    const executeRes = await adminApp.request(`/${created.id}/execute`, { method: "POST" })
    expect(executeRes.status).toBe(200)

    const voidRes = await adminApp.request(`/${created.id}/void`, { method: "POST" })
    expect(voidRes.status).toBe(200)
    const finalContract = (await voidRes.json()).data

    expect(finalContract.status).toBe("void")
    expect(finalContract.stageHistory.map((entry: { stage: string }) => entry.stage)).toEqual([
      "draft",
      "issued",
      "sent",
      "signed",
      "executed",
      "void",
    ])
    expect(lifecycleEvents.map((event) => event.name)).toEqual([
      "contract.issued",
      "contract.sent",
      "contract.signed",
      "contract.executed",
      "contract.voided",
    ])
    expect(lifecycleEvents[0]?.metadata).toMatchObject({
      category: "domain",
      source: "service",
    })
    expect(lifecycleEvents[0]?.data).toEqual(
      expect.not.objectContaining({
        renderedBody: expect.anything(),
        variables: expect.anything(),
        metadata: expect.anything(),
      }),
    )
  })

  it("strips the reserved managed booking workflow marker from generic contract writes", async () => {
    const createRes = await adminApp.request("/", {
      method: "POST",
      ...json({
        title: "Generic contract with injected workflow",
        scope: "customer",
        metadata: {
          source: "admin",
          bookingContractWorkflow: {
            revision: 99,
            reviewOnly: false,
            reviewSnapshot: { booking: { customerEmail: "leak@example.test" } },
          },
        },
      }),
    })
    expect(createRes.status).toBe(201)
    const created = (await createRes.json()).data
    expect(created.metadata).toEqual({ source: "admin" })
    await expect(db.select().from(contracts).where(eq(contracts.id, created.id))).resolves.toEqual([
      expect.objectContaining({ metadata: { source: "admin" } }),
    ])

    const [draft] = await db
      .insert(contracts)
      .values({
        title: "Generic patch target",
        scope: "customer",
        metadata: { retained: true },
      })
      .returning()
    const patchRes = await adminApp.request(`/${draft!.id}`, {
      method: "PATCH",
      ...json({
        metadata: {
          retained: true,
          source: "patch",
          bookingContractWorkflow: { revision: 1, reviewOnly: true },
        },
      }),
    })
    expect(patchRes.status).toBe(200)
    const patched = (await patchRes.json()).data
    expect(patched.metadata).toEqual({ retained: true, source: "patch" })
    await expect(db.select().from(contracts).where(eq(contracts.id, draft!.id))).resolves.toEqual([
      expect.objectContaining({ metadata: { retained: true, source: "patch" } }),
    ])
  })

  it("refuses PATCH mutation of managed drafts and every non-draft revision", async () => {
    const [managedDraft] = await db
      .insert(contracts)
      .values({
        title: "Managed revision",
        scope: "customer",
        metadata: managedBookingWorkflowMetadata(),
      })
      .returning()
    const managedPatch = await adminApp.request(`/${managedDraft!.id}`, {
      method: "PATCH",
      ...json({ title: "Mutated revision" }),
    })
    expect(managedPatch.status).toBe(400)
    const managedDelete = await adminApp.request(`/${managedDraft!.id}`, { method: "DELETE" })
    expect(managedDelete.status).toBe(409)
    await expect(managedDelete.json()).resolves.toEqual({
      error: "Managed booking contract revisions cannot be deleted",
    })

    const [managedVoid] = await db
      .insert(contracts)
      .values({
        title: "Managed void revision",
        scope: "customer",
        status: "void",
        metadata: managedBookingWorkflowMetadata(1, false),
      })
      .returning()
    const managedVoidDelete = await adminApp.request(`/${managedVoid!.id}`, { method: "DELETE" })
    expect(managedVoidDelete.status).toBe(409)

    const [managedIssued] = await db
      .insert(contracts)
      .values({
        title: "Managed issued revision",
        scope: "customer",
        status: "issued",
        metadata: managedBookingWorkflowMetadata(2, false),
      })
      .returning()
    const managedSend = await adminApp.request(`/${managedIssued!.id}/send`, { method: "POST" })
    expect(managedSend.status).toBe(400)
    await expect(managedSend.json()).resolves.toEqual({
      error:
        "Managed booking contract revisions must be sent through the reviewed lifecycle command.",
    })

    const [managedSent] = await db
      .insert(contracts)
      .values({
        title: "Managed sent revision",
        scope: "customer",
        status: "sent",
        metadata: managedBookingWorkflowMetadata(3, false),
      })
      .returning()
    const managedVoidResponse = await adminApp.request(`/${managedSent!.id}/void`, {
      method: "POST",
    })
    expect(managedVoidResponse.status).toBe(400)
    await expect(managedVoidResponse.json()).resolves.toEqual({
      error:
        "Managed booking contract revisions must be voided through the reviewed lifecycle command.",
    })
    await expect(
      db.select().from(contracts).where(eq(contracts.id, managedSent!.id)),
    ).resolves.toEqual([expect.objectContaining({ status: "sent" })])

    const [unmanagedDraft] = await db
      .insert(contracts)
      .values({ title: "Legacy disposable draft", scope: "customer" })
      .returning()
    const unmanagedDelete = await adminApp.request(`/${unmanagedDraft!.id}`, { method: "DELETE" })
    expect(unmanagedDelete.status).toBe(200)

    const [sent] = await db
      .insert(contracts)
      .values({ title: "Sent revision", scope: "customer", status: "sent" })
      .returning()
    const sentPatch = await adminApp.request(`/${sent!.id}`, {
      method: "PATCH",
      ...json({ variables: { commercial: { totalAmountCents: 1 } } }),
    })
    expect(sentPatch.status).toBe(400)
    await expect(db.select().from(contracts).where(eq(contracts.id, sent!.id))).resolves.toEqual([
      expect.objectContaining({ title: "Sent revision", variables: null }),
    ])
  })

  it("replays contract creates with the same idempotency key", async () => {
    const input = {
      title: "Idempotent contract",
      scope: "customer",
    }
    const first = await adminApp.request("/", {
      method: "POST",
      ...jsonWithIdempotency(input, "legal-contract-create-1"),
    })
    const replay = await adminApp.request("/", {
      method: "POST",
      ...jsonWithIdempotency(input, "legal-contract-create-1"),
    })

    expect(first.status).toBe(201)
    expect(replay.status).toBe(201)
    expect(replay.headers.get("Idempotency-Replayed")).toBe("true")
    const firstBody = await first.json()
    const replayBody = await replay.json()
    expect(replayBody.data.id).toBe(firstBody.data.id)
  })
})
