import { createEventBus } from "@voyant-travel/core"
import { eventOutboxTable } from "@voyant-travel/db/schema"
import { cleanupTestDb } from "@voyant-travel/db/test-utils"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { contractSignatures, contracts } from "../../src/contracts/schema.js"
import {
  ContractSignatureOutboxError,
  contractRecordsService,
  contractSignatureLifecycleEventId,
} from "../../src/contracts/service-contracts.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

type ClosableTestDb = PostgresJsDatabase & {
  $client: { end(options?: { timeout?: number | null }): Promise<unknown> }
}

describe.skipIf(!DB_AVAILABLE)("contract signing transactional outbox", () => {
  let db: ClosableTestDb

  beforeAll(async () => {
    const { createDbClient } = await import("@voyant-travel/db")
    db = createDbClient(process.env.TEST_DATABASE_URL as string, {
      adapter: "node",
      nodeMaxConnections: 2,
      timeouts: { statementMs: false, queryMs: false, connectMs: false },
    }) as ClosableTestDb
  })

  beforeEach(() => cleanupTestDb(db))

  afterAll(async () => {
    await db.$client.end({ timeout: 0 })
  })

  it.each([
    ["ordinary", null],
    ["managed", managedBookingWorkflowMetadata()],
  ] as const)("commits the %s signature, signed state, and outbox row together", async (_kind, metadata) => {
    const contract = await insertContract({ metadata })
    const eventBus = createEventBus()
    const emitted = vi.fn()
    eventBus.subscribe("contract.signed", emitted)

    const result = await contractRecordsService.signContract(
      db,
      contract.id,
      { signerName: "Ada Lovelace", signerEmail: "ada@example.test", method: "electronic" },
      { eventBus },
    )

    expect(result.status).toBe("signed")
    expect(emitted).not.toHaveBeenCalled()
    const [signature] = await db
      .select()
      .from(contractSignatures)
      .where(eq(contractSignatures.contractId, contract.id))
    expect(signature).toMatchObject({
      contractId: contract.id,
      signerName: "Ada Lovelace",
      signerEmail: "ada@example.test",
      method: "electronic",
    })
    const [updated] = await db.select().from(contracts).where(eq(contracts.id, contract.id))
    expect(updated?.status).toBe("signed")

    const eventId = contractSignatureLifecycleEventId(signature!.id)
    expect(await db.select().from(eventOutboxTable)).toEqual([
      expect.objectContaining({
        eventId,
        name: "contract.signed",
        payload: expect.objectContaining({
          contractId: contract.id,
          previousStage: "sent",
          stage: "signed",
          transition: "signed",
        }),
        metadata: expect.objectContaining({ category: "domain", source: "service", eventId }),
        status: "pending",
      }),
    ])
  })

  it("rolls back the signature and signed state when outbox insertion fails", async () => {
    const contract = await insertContract()

    await expect(
      contractRecordsService.signContract(
        db,
        contract.id,
        { signerName: "Failing Signer", method: "manual" },
        undefined,
        {
          insertEvents: async () => {
            throw new Error("injected outbox insertion failure")
          },
        },
      ),
    ).rejects.toThrow("injected outbox insertion failure")

    expect(await db.select().from(contractSignatures)).toEqual([])
    expect(await db.select().from(eventOutboxTable)).toEqual([])
    const [unchanged] = await db.select().from(contracts).where(eq(contracts.id, contract.id))
    expect(unchanged?.status).toBe("sent")
  })

  it("rolls back partial state when outbox insertion dedups unexpectedly", async () => {
    const contract = await insertContract()

    await expect(
      contractRecordsService.signContract(
        db,
        contract.id,
        { signerName: "Collision Signer", method: "manual" },
        undefined,
        { insertEvents: async () => [] },
      ),
    ).rejects.toBeInstanceOf(ContractSignatureOutboxError)

    expect(await db.select().from(contractSignatures)).toEqual([])
    expect(await db.select().from(eventOutboxTable)).toEqual([])
    const [unchanged] = await db.select().from(contracts).where(eq(contracts.id, contract.id))
    expect(unchanged?.status).toBe("sent")
  })

  it("does not append duplicate signatures or outbox rows for non-signable repeats", async () => {
    const contract = await insertContract()
    const first = await contractRecordsService.signContract(db, contract.id, {
      signerName: "First Signer",
      method: "manual",
    })
    expect(first.status).toBe("signed")

    const insertEvents = vi.fn()
    const repeat = await contractRecordsService.signContract(
      db,
      contract.id,
      { signerName: "Repeat Signer", method: "manual" },
      undefined,
      { insertEvents },
    )

    expect(repeat).toEqual({ status: "not_signable" })
    expect(insertEvents).not.toHaveBeenCalled()
    expect(await db.select().from(contractSignatures)).toHaveLength(1)
    expect(await db.select().from(eventOutboxTable)).toHaveLength(1)
  })

  async function insertContract(options: { metadata?: Record<string, unknown> | null } = {}) {
    const [contract] = await db
      .insert(contracts)
      .values({
        scope: "customer",
        title: "Signable contract",
        status: "sent",
        stageHistory: [
          { stage: "draft", previousStage: null, transition: "created", enteredAt: nowIso() },
          { stage: "issued", previousStage: "draft", transition: "issued", enteredAt: nowIso() },
          { stage: "sent", previousStage: "issued", transition: "sent", enteredAt: nowIso() },
        ],
        metadata: options.metadata,
      })
      .returning()
    if (!contract) throw new Error("Test contract insert failed")
    return contract
  }
})

function nowIso() {
  return new Date().toISOString()
}

function managedBookingWorkflowMetadata() {
  return {
    bookingContractWorkflow: {
      revision: 1,
      previousRevisionId: null,
      reviewOnly: false,
      reviewSnapshot: {
        booking: {
          id: "booking_signing_1",
          reference: "BK-SIGN-1",
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
          id: "template_signing_1",
          name: "Customer review template",
          versionId: "template_version_signing_1",
          version: 1,
          language: "en",
        },
      },
    },
  }
}
