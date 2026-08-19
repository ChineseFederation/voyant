import type {
  LegacyBookingInquiryReadRuntime,
  LegacyBookingInquiryRecord,
} from "@voyant-travel/bookings/legacy-inquiry-read-runtime-port"
import { generateLinkTableSql } from "@voyant-travel/core"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { runLegacyInquiryCutoverBatch } from "../../src/legacy-inquiry-cutover.js"
import {
  customerSignals,
  inquiries,
  inquiryConversions,
  inquiryLegacySources,
  inquiryTargetSnapshots,
} from "../../src/schema.js"
import { inquiryOptionUnitLink, inquiryProductLink } from "../../src/standard-links.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)
const row: LegacyBookingInquiryRecord = {
  id: "binq_legacy_1",
  idempotencyKey: "legacy-key",
  requestFingerprint: "fingerprint",
  channelId: "channel_1",
  productId: "prod_legacy_1",
  departureId: null,
  contactFirstName: "Ana",
  contactLastName: "Ionescu",
  contactEmail: "ana@example.com",
  contactPhone: null,
  locale: "ro",
  message: "As dori detalii",
  status: "open",
  createdAt: new Date("2026-01-01T10:00:00.000Z"),
  updatedAt: new Date("2026-01-01T11:00:00.000Z"),
}

function readerFor(rows: LegacyBookingInquiryRecord[]): LegacyBookingInquiryReadRuntime {
  return {
    async listBatch(_database, input) {
      return rows
        .filter((candidate) => !input.afterId || candidate.id > input.afterId)
        .sort((left, right) => left.id.localeCompare(right.id))
        .slice(0, input.limit)
    },
    async getByIds(_database, ids) {
      return rows.filter((candidate) => ids.includes(candidate.id))
    },
    async findByIdentity(_database, input) {
      return (
        rows.find(
          (candidate) =>
            candidate.channelId === input.channelId &&
            candidate.idempotencyKey === input.idempotencyKey,
        ) ?? null
      )
    },
  }
}

describe.skipIf(!DB_AVAILABLE)("legacy Inquiry cutover", () => {
  // biome-ignore lint/suspicious/noExplicitAny: shared integration database fixture.
  let db: any
  const reader = readerFor([row])

  beforeAll(async () => {
    const { createTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    for (const definition of [inquiryProductLink, inquiryOptionUnitLink]) {
      const ddl = generateLinkTableSql(definition)
      await db.execute(sql.raw(ddl.createTable))
      for (const index of ddl.indexes) await db.execute(sql.raw(index))
    }
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
    for (const definition of [inquiryProductLink, inquiryOptionUnitLink]) {
      await db.execute(sql.raw(`DELETE FROM "${definition.tableName}"`))
    }
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  it("keeps unresolved provenance pending and completes it when the owner appears", async () => {
    const first = await runLegacyInquiryCutoverBatch({ db, reader, authorities: [] })
    expect(first).toMatchObject({ migrated: 1, unresolvedTargets: 1, remaining: 1 })
    expect(await db.select().from(inquiries)).toHaveLength(1)
    expect(await db.select().from(inquiryTargetSnapshots)).toHaveLength(0)

    const second = await runLegacyInquiryCutoverBatch({
      db,
      reader,
      authorities: [
        {
          kind: "product",
          targetExists: async () => true,
          resolveSnapshot: async () => ({ title: "Danube Escape" }),
        },
      ],
    })
    expect(second).toMatchObject({ migrated: 0, targetsMaterialized: 1, remaining: 0 })
    expect(await db.select().from(inquiries)).toHaveLength(1)
    expect(await db.select().from(inquiryTargetSnapshots)).toHaveLength(1)
    const [provenance] = await db
      .select()
      .from(inquiryLegacySources)
      .where(eq(inquiryLegacySources.sourceId, row.id))
    expect(provenance?.reconciliationStatus).toBe("complete")
    expect(provenance?.reconciliationIssues).toEqual([])
  })

  it("advances a bounded high-water mark without skipping pending target retries", async () => {
    const secondRow = { ...row, id: "binq_legacy_2", idempotencyKey: "legacy-key-2" }
    const batchedReader = readerFor([row, secondRow])
    const first = await runLegacyInquiryCutoverBatch({
      db,
      reader: batchedReader,
      authorities: [],
      limit: 1,
    })
    const second = await runLegacyInquiryCutoverBatch({
      db,
      reader: batchedReader,
      authorities: [],
      limit: 1,
    })
    expect(first).toMatchObject({ migrated: 1, remaining: 1 })
    expect(second).toMatchObject({ migrated: 1, remaining: 2 })
    expect(await db.select().from(inquiries)).toHaveLength(2)

    await runLegacyInquiryCutoverBatch({
      db,
      reader: batchedReader,
      authorities: [
        {
          kind: "product",
          targetExists: async () => true,
          resolveSnapshot: async () => ({ title: "Danube Escape" }),
        },
      ],
      limit: 1,
    })
    const completed = await runLegacyInquiryCutoverBatch({
      db,
      reader: batchedReader,
      authorities: [
        {
          kind: "product",
          targetExists: async () => true,
          resolveSnapshot: async () => ({ title: "Danube Escape" }),
        },
      ],
      limit: 1,
    })
    expect(completed.remaining).toBe(0)
    expect(await db.select().from(inquiries)).toHaveLength(2)
  })

  it("rolls back a partially adopted source row and safely replays it", async () => {
    await expect(
      runLegacyInquiryCutoverBatch({
        db,
        reader,
        authorities: [
          {
            kind: "product",
            targetExists: async () => true,
            resolveSnapshot: async () => {
              throw new Error("owner unavailable")
            },
          },
        ],
      }),
    ).rejects.toThrow("owner unavailable")
    expect(await db.select().from(inquiries)).toHaveLength(0)
    expect(await db.select().from(inquiryLegacySources)).toHaveLength(0)

    const replay = await runLegacyInquiryCutoverBatch({
      db,
      reader,
      authorities: [
        {
          kind: "product",
          targetExists: async () => true,
          resolveSnapshot: async () => ({ title: "Danube Escape" }),
        },
      ],
    })
    expect(replay).toMatchObject({ migrated: 1, remaining: 0 })
  })

  it("adopts bounded Customer Signal batches with lifecycle, provenance, targets, and conversion", async () => {
    await db.execute(sql`INSERT INTO people (id, first_name, last_name)
      VALUES
        ('pers_legacy_signal_1', 'Legacy', 'Lost'),
        ('pers_legacy_signal_2', 'Legacy', 'Converted')`)
    const [lostSignal] = await db
      .insert(customerSignals)
      .values({
        personId: "pers_legacy_signal_1",
        kind: "inquiry",
        source: "phone",
        status: "lost",
        notes: "No longer travelling",
        sourceSubmissionId: "phone-legacy-1",
      })
      .returning()
    const [convertedSignal] = await db
      .insert(customerSignals)
      .values({
        personId: "pers_legacy_signal_2",
        productId: "prod_signal",
        kind: "request_offer",
        source: "form",
        status: "converted",
        resolvedBookingId: "book_signal",
        metadata: {
          consent: {
            gdpr: true,
            scope: "legacy-offer-follow-up",
            acceptedAt: "2026-01-01T09:00:00.000Z",
          },
        },
      })
      .returning()

    const first = await runLegacyInquiryCutoverBatch({ db, authorities: [], limit: 1 })
    expect(first).toMatchObject({ scanned: 1, migrated: 1 })
    expect(await db.select().from(inquiries)).toHaveLength(1)
    const second = await runLegacyInquiryCutoverBatch({
      db,
      authorities: [
        {
          kind: "product",
          targetExists: async () => true,
          resolveSnapshot: async () => ({ title: "Signal product" }),
        },
      ],
      limit: 1,
    })
    expect(second).toMatchObject({ migrated: 1, conversionsMaterialized: 1, remaining: 0 })
    const exhausted = await runLegacyInquiryCutoverBatch({ db, authorities: [], limit: 1 })
    expect(exhausted).toMatchObject({ scanned: 0, migrated: 0, replayed: 0, remaining: 0 })
    const adopted = await db.select().from(inquiries)
    expect(adopted).toHaveLength(2)
    expect(
      adopted.find((inquiry) => inquiry.sourceRef === `legacy:customer_signals:${lostSignal.id}`),
    ).toMatchObject({
      personId: "pers_legacy_signal_1",
      kind: "general",
      status: "closed",
      closeOutcome: "lost",
      customerMessage: "No longer travelling",
    })
    const convertedInquiry = adopted.find(
      (inquiry) => inquiry.sourceRef === `legacy:customer_signals:${convertedSignal.id}`,
    )
    expect(convertedInquiry).toMatchObject({
      personId: "pers_legacy_signal_2",
      kind: "product",
      status: "converted",
      consentSnapshot: {
        gdpr: true,
        scope: "legacy-offer-follow-up",
        acceptedAt: "2026-01-01T09:00:00.000Z",
      },
    })
    expect(convertedInquiry?.firstRespondedAt).toEqual(convertedSignal.updatedAt)
    expect(convertedInquiry?.qualifiedAt).toEqual(convertedSignal.updatedAt)
    expect(convertedInquiry?.convertedAt).toEqual(convertedSignal.updatedAt)
    const provenance = await db.select().from(inquiryLegacySources)
    expect(provenance).toHaveLength(2)
    expect(provenance.map((source) => source.sourceId).sort()).toEqual(
      [lostSignal.id, convertedSignal.id].sort(),
    )
    expect(await db.select().from(inquiryTargetSnapshots)).toHaveLength(1)
    const conversions = await db.select().from(inquiryConversions)
    expect(conversions).toHaveLength(1)
    expect(conversions[0]).toMatchObject({
      inquiryId: convertedInquiry?.id,
      kind: "booking",
      targetId: "book_signal",
      mode: "attached_existing",
    })
  })
})
