import { describe, expect, it, vi } from "vitest"

import { drainPublicationReindexIntents } from "../../src/publication-intent-worker.js"

const productIntent = {
  id: "intent_product",
  channelId: "chan_web",
  kind: "product" as const,
  productId: "prod_1",
  supplierId: null,
  cursor: null,
  attempts: 0,
  leaseOwner: "worker_1",
}

const supplierIntent = {
  id: "intent_supplier",
  channelId: "chan_web",
  kind: "supplier" as const,
  productId: null,
  supplierId: "sup_1",
  cursor: null,
  attempts: 1,
  leaseOwner: "worker_1",
}

const catalogIntent = {
  id: "intent_catalog",
  channelId: null,
  kind: "catalog" as const,
  productId: null,
  supplierId: null,
  cursor: null,
  metadata: {
    snapshotVersion: "linear-v1",
    productSnapshotCount: 1,
    channelSnapshotCount: 3,
  },
  attempts: 0,
  leaseOwner: "worker_1",
}

describe("publication reindex intent worker", () => {
  it("claims a bounded product intent and completes it after reindex", async () => {
    const db = fakeDb({
      executeResults: [{ rows: [productIntent] }, { rows: [] }, { rows: [] }],
    })
    const projection = {
      reindexEntity: vi.fn(async () => {}),
      deleteEntity: vi.fn(async () => {}),
    }

    await expect(
      drainPublicationReindexIntents(
        { db: db as never, projection },
        { leaseOwner: "worker_1", maxIntents: 1 },
      ),
    ).resolves.toEqual({ processed: 1 })

    expect(projection.reindexEntity).toHaveBeenCalledWith({
      entityModule: "products",
      entityId: "prod_1",
    })
    expect(db.execute).toHaveBeenCalledTimes(2)
  })

  it("checkpoints supplier intents by cursor when a page reaches the batch limit", async () => {
    const db = fakeDb({
      executeResults: [{ rows: [supplierIntent] }, { rows: [] }, { rows: [] }],
      productPages: [[{ id: "prod_1" }, { id: "prod_2" }]],
    })
    const projection = {
      reindexEntity: vi.fn(async () => {}),
      deleteEntity: vi.fn(async () => {}),
    }

    await expect(
      drainPublicationReindexIntents(
        { db: db as never, projection },
        { leaseOwner: "worker_1", maxIntents: 1, productBatchSize: 2 },
      ),
    ).resolves.toEqual({ processed: 1 })

    expect(projection.reindexEntity.mock.calls.map(([input]) => input.entityId)).toEqual([
      "prod_1",
      "prod_2",
    ])
    expect(db.limitValues).toEqual([2])
    expect(db.execute).toHaveBeenCalledTimes(2)
  })

  it("keeps a checkpointed row leased and resumes it without returning to pending", async () => {
    const resumedIntent = { ...supplierIntent, cursor: "prod_2" }
    const db = fakeDb({
      executeResults: [
        { rows: [supplierIntent] },
        { rows: [] },
        { rows: [resumedIntent] },
        { rows: [] },
      ],
      productPages: [[{ id: "prod_1" }, { id: "prod_2" }], [{ id: "prod_3" }]],
    })
    const projection = {
      reindexEntity: vi.fn(async () => {}),
      deleteEntity: vi.fn(async () => {}),
    }

    await expect(
      drainPublicationReindexIntents(
        { db: db as never, projection },
        { leaseOwner: "worker_1", maxIntents: 2, productBatchSize: 2 },
      ),
    ).resolves.toEqual({ processed: 2 })

    expect(projection.reindexEntity.mock.calls.map(([input]) => input.entityId)).toEqual([
      "prod_1",
      "prod_2",
      "prod_3",
    ])
    expect(db.execute).toHaveBeenCalledTimes(4)
  })

  it("bounds catalog backfill writes when active channels exceed the channel page", async () => {
    const db = fakeDb({
      executeResults: [{ rows: [catalogIntent] }, { rows: [] }],
      productPages: [[{ id: "prod_1" }], [{ id: "chan_1" }, { id: "chan_2" }, { id: "chan_3" }]],
    })
    const projection = {
      reindexEntity: vi.fn(async () => {}),
      deleteEntity: vi.fn(async () => {}),
    }

    await expect(
      drainPublicationReindexIntents(
        { db: db as never, projection },
        { leaseOwner: "worker_1", maxIntents: 1, channelBatchSize: 2 },
      ),
    ).resolves.toEqual({ processed: 1 })

    expect(db.limitValues).toEqual([1, 2])
    expect(db.insertValues).toHaveLength(1)
    expect(db.insertValues[0]).toHaveLength(2)
    expect(projection.reindexEntity).not.toHaveBeenCalled()
    expect(db.execute).toHaveBeenCalledTimes(2)
  })

  it("resumes a catalog snapshot within the current product channel page", async () => {
    const resumedIntent = {
      ...catalogIntent,
      cursor: JSON.stringify({
        afterProductId: null,
        productId: "prod_1",
        afterChannelId: "chan_2",
      }),
    }
    const db = fakeDb({
      executeResults: [{ rows: [resumedIntent] }, { rows: [] }],
      productPages: [[{ id: "chan_3" }]],
    })
    const projection = {
      reindexEntity: vi.fn(async () => {}),
      deleteEntity: vi.fn(async () => {}),
    }

    await expect(
      drainPublicationReindexIntents(
        { db: db as never, projection },
        { leaseOwner: "worker_1", maxIntents: 1, channelBatchSize: 2 },
      ),
    ).resolves.toEqual({ processed: 1 })

    expect(db.limitValues).toEqual([2])
    expect(db.insertValues[0]).toEqual([
      expect.objectContaining({ productId: "prod_1", channelId: "chan_3" }),
    ])
    expect(projection.reindexEntity).toHaveBeenCalledWith({
      entityModule: "products",
      entityId: "prod_1",
    })
  })

  it("fails closed when a catalog backfill has no immutable snapshot marker", async () => {
    const db = fakeDb({
      executeResults: [{ rows: [{ ...catalogIntent, metadata: null }] }, { rows: [] }],
      productPages: [[{ id: "prod_created_later" }]],
    })
    const projection = {
      reindexEntity: vi.fn(async () => {}),
      deleteEntity: vi.fn(async () => {}),
    }

    await expect(
      drainPublicationReindexIntents(
        { db: db as never, projection },
        { leaseOwner: "worker_1", maxIntents: 1 },
      ),
    ).resolves.toEqual({ processed: 1 })

    expect(db.limitValues).toEqual([])
    expect(db.insertValues).toEqual([])
    expect(projection.reindexEntity).not.toHaveBeenCalled()
  })

  it("fails closed when the catalog snapshot version is unknown", async () => {
    const db = fakeDb({
      executeResults: [
        {
          rows: [
            {
              ...catalogIntent,
              metadata: { snapshotVersion: "future-v2" },
            },
          ],
        },
        { rows: [] },
      ],
    })
    const projection = {
      reindexEntity: vi.fn(async () => {}),
      deleteEntity: vi.fn(async () => {}),
    }

    await drainPublicationReindexIntents(
      { db: db as never, projection },
      { leaseOwner: "worker_1", maxIntents: 1 },
    )

    expect(db.limitValues).toEqual([])
    expect(db.insertValues).toEqual([])
  })

  it("fails closed when catalog snapshot counts are missing", async () => {
    const db = fakeDb({
      executeResults: [
        { rows: [{ ...catalogIntent, metadata: { snapshotVersion: "linear-v1" } }] },
        { rows: [] },
      ],
    })
    const projection = {
      reindexEntity: vi.fn(async () => {}),
      deleteEntity: vi.fn(async () => {}),
    }

    await drainPublicationReindexIntents(
      { db: db as never, projection },
      { leaseOwner: "worker_1", maxIntents: 1 },
    )

    expect(db.limitValues).toEqual([])
    expect(db.insertValues).toEqual([])
  })

  it("marks failures for retry and continues draining", async () => {
    const db = fakeDb({
      executeResults: [{ rows: [productIntent] }, { rows: [] }, { rows: [] }],
    })
    const report = vi.fn()
    const projection = {
      reindexEntity: vi.fn(async () => {
        throw new Error("index unavailable")
      }),
      deleteEntity: vi.fn(async () => {}),
    }

    await expect(
      drainPublicationReindexIntents(
        { db: db as never, projection, report },
        { leaseOwner: "worker_1", maxIntents: 2, retryDelayMs: 5 },
      ),
    ).resolves.toEqual({ processed: 1 })

    expect(report).toHaveBeenCalledWith(
      "[distribution-publication-intents] intent failed",
      expect.objectContaining({ intentId: "intent_product", error: "index unavailable" }),
    )
    expect(db.execute).toHaveBeenCalledTimes(3)
  })
})

function fakeDb(input: { executeResults: unknown[]; productPages?: Array<Array<{ id: string }>> }) {
  const executeResults = [...input.executeResults]
  const productPages = [...(input.productPages ?? [])]
  const limitValues: number[] = []
  const insertValues: unknown[][] = []
  return {
    limitValues,
    insertValues,
    execute: vi.fn(async () => executeResults.shift() ?? { rows: [] }),
    insert: () => ({
      values: (values: unknown[]) => {
        insertValues.push(values)
        return { onConflictDoNothing: async () => {} }
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async (limit: number) => {
              limitValues.push(limit)
              return (productPages.shift() ?? []).slice(0, limit)
            },
          }),
        }),
      }),
    }),
  }
}
