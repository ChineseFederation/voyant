import { afterEach, describe, expect, it, vi } from "vitest"

import {
  publicationChannelDeletedIntentSubscriber,
  publicationChannelUpdatedIntentSubscriber,
  publicationSupplierDeletedIntentSubscriber,
  publicationSupplierReassignedIntentSubscriber,
} from "../../src/publication-intent-subscribers.js"
import { publicationServiceOperations } from "../../src/service/publications.js"

afterEach(() => vi.restoreAllMocks())

function eventHandler(descriptor: { register(context: never): void }) {
  let handler: ((event: { data: unknown }) => Promise<void>) | undefined
  descriptor.register({
    bindings: {},
    container: {
      resolve: () => ({
        withDeps: (_bindings: unknown, run: (deps: unknown) => unknown) => run({ db: {} }),
      }),
    },
    eventBus: {
      subscribe: (_eventType: string, subscriber: typeof handler) => {
        handler = subscriber
      },
    },
  } as never)
  if (!handler) throw new Error("subscriber did not register")
  return handler
}

describe("publication lifecycle intent subscribers", () => {
  it("re-evaluates all visible products when an existing channel becomes inactive", async () => {
    const enqueue = vi
      .spyOn(publicationServiceOperations, "enqueueChannelLifecycleReindex")
      .mockResolvedValue({ enqueued: 2 })
    await eventHandler(publicationChannelUpdatedIntentSubscriber)({ data: { id: "chan_inactive" } })
    expect(enqueue).toHaveBeenCalledWith(
      {},
      { channelId: "chan_inactive", requestedBy: "event:channel.updated" },
    )
  })

  it("uses product IDs captured before channel deletion", async () => {
    const enqueue = vi
      .spyOn(publicationServiceOperations, "enqueueCapturedProductLifecycleReindex")
      .mockResolvedValue({ enqueued: 2 })
    await eventHandler(publicationChannelDeletedIntentSubscriber)({
      data: { id: "chan_deleted", affectedProductIds: ["prod_1", "prod_2"] },
    })
    expect(enqueue).toHaveBeenCalledWith(
      {},
      { productIds: ["prod_1", "prod_2"], requestedBy: "event:channel.deleted" },
    )
  })

  it("uses product IDs captured before supplier deletion", async () => {
    const enqueue = vi
      .spyOn(publicationServiceOperations, "enqueueCapturedProductLifecycleReindex")
      .mockResolvedValue({ enqueued: 1 })
    await eventHandler(publicationSupplierDeletedIntentSubscriber)({
      data: { id: "supplier_deleted", affectedProductIds: ["prod_1"] },
    })
    expect(enqueue).toHaveBeenCalledWith(
      {},
      { productIds: ["prod_1"], requestedBy: "event:supplier.deleted" },
    )
  })

  it("reindexes the product and both sides of supplier reassignment", async () => {
    const enqueue = vi
      .spyOn(publicationServiceOperations, "enqueueSupplierReassignmentReindex")
      .mockResolvedValue({ enqueued: 1 })
    await eventHandler(publicationSupplierReassignedIntentSubscriber)({
      data: {
        productId: "prod_1",
        previousSupplierId: "supplier_old",
        nextSupplierId: "supplier_new",
      },
    })
    expect(enqueue).toHaveBeenCalledWith(
      {},
      {
        productId: "prod_1",
        previousSupplierId: "supplier_old",
        nextSupplierId: "supplier_new",
        requestedBy: "event:product.supplier.reassigned",
      },
    )
  })
})
