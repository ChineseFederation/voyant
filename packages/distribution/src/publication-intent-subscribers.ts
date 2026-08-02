import type { BootstrapContext, SubscriberRuntimeDescriptor } from "@voyant-travel/core"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { z } from "zod"

import {
  type DistributionPublicationIntentWorkerRuntime,
  distributionPublicationIntentWorkerRuntimePort,
} from "./publication-intent-runtime-port.js"
import { publicationServiceOperations } from "./service/publications.js"

const entityIdPayloadSchema = z.object({ id: z.string().min(1) }).passthrough()
const deletionPayloadSchema = entityIdPayloadSchema.extend({
  affectedProductIds: z.array(z.string().min(1)),
})
const supplierReassignmentPayloadSchema = z
  .object({
    productId: z.string().min(1),
    previousSupplierId: z.string().min(1).nullable().optional(),
    nextSupplierId: z.string().min(1).nullable().optional(),
  })
  .passthrough()

interface PublicationIntentSubscriberOptions {
  id: string
  eventType: string
  enqueue(db: PostgresJsDatabase, payload: unknown): Promise<unknown>
}

function createPublicationIntentSubscriber(
  options: PublicationIntentSubscriberOptions,
): SubscriberRuntimeDescriptor {
  return {
    id: options.id,
    eventType: options.eventType,
    register(context: BootstrapContext) {
      const runtime = context.container.resolve<DistributionPublicationIntentWorkerRuntime>(
        distributionPublicationIntentWorkerRuntimePort.id,
      )
      context.eventBus.subscribe(
        options.eventType,
        async ({ data }) => {
          await runtime.withDeps(context.bindings, (deps) =>
            options.enqueue(deps.db as PostgresJsDatabase, data),
          )
        },
        { inline: false },
      )
    },
  }
}

function lifecycleEntityId(payload: unknown) {
  return entityIdPayloadSchema.parse(payload).id
}

export const publicationProductCreatedIntentSubscriber = createPublicationIntentSubscriber({
  id: "@voyant-travel/distribution#subscriber.publication-intent-product-created",
  eventType: "product.created",
  enqueue: (db, payload) =>
    publicationServiceOperations.enqueueProductLifecycleReindex(db, {
      productId: lifecycleEntityId(payload),
      requestedBy: "event:product.created",
    }),
})

export const publicationProductUpdatedIntentSubscriber = createPublicationIntentSubscriber({
  id: "@voyant-travel/distribution#subscriber.publication-intent-product-updated",
  eventType: "product.updated",
  enqueue: (db, payload) =>
    publicationServiceOperations.enqueueProductLifecycleReindex(db, {
      productId: lifecycleEntityId(payload),
      requestedBy: "event:product.updated",
    }),
})

export const publicationProductDeletedIntentSubscriber = createPublicationIntentSubscriber({
  id: "@voyant-travel/distribution#subscriber.publication-intent-product-deleted",
  eventType: "product.deleted",
  enqueue: (db, payload) =>
    publicationServiceOperations.enqueueProductLifecycleReindex(db, {
      productId: lifecycleEntityId(payload),
      requestedBy: "event:product.deleted",
    }),
})

export const publicationSupplierCreatedIntentSubscriber = createPublicationIntentSubscriber({
  id: "@voyant-travel/distribution#subscriber.publication-intent-supplier-created",
  eventType: "supplier.created",
  enqueue: (db, payload) =>
    publicationServiceOperations.enqueueSupplierLifecycleReindex(db, {
      supplierId: lifecycleEntityId(payload),
      requestedBy: "event:supplier.created",
    }),
})

export const publicationSupplierUpdatedIntentSubscriber = createPublicationIntentSubscriber({
  id: "@voyant-travel/distribution#subscriber.publication-intent-supplier-updated",
  eventType: "supplier.updated",
  enqueue: (db, payload) =>
    publicationServiceOperations.enqueueSupplierLifecycleReindex(db, {
      supplierId: lifecycleEntityId(payload),
      requestedBy: "event:supplier.updated",
    }),
})

export const publicationSupplierDeletedIntentSubscriber = createPublicationIntentSubscriber({
  id: "@voyant-travel/distribution#subscriber.publication-intent-supplier-deleted",
  eventType: "supplier.deleted",
  enqueue: (db, payload) => {
    const event = deletionPayloadSchema.parse(payload)
    return publicationServiceOperations.enqueueCapturedProductLifecycleReindex(db, {
      productIds: event.affectedProductIds,
      requestedBy: "event:supplier.deleted",
    })
  },
})

export const publicationChannelCreatedIntentSubscriber = createPublicationIntentSubscriber({
  id: "@voyant-travel/distribution#subscriber.publication-intent-channel-created",
  eventType: "channel.created",
  enqueue: (db, payload) =>
    publicationServiceOperations.enqueueChannelLifecycleReindex(db, {
      channelId: lifecycleEntityId(payload),
      requestedBy: "event:channel.created",
    }),
})

export const publicationChannelUpdatedIntentSubscriber = createPublicationIntentSubscriber({
  id: "@voyant-travel/distribution#subscriber.publication-intent-channel-updated",
  eventType: "channel.updated",
  enqueue: (db, payload) =>
    publicationServiceOperations.enqueueChannelLifecycleReindex(db, {
      channelId: lifecycleEntityId(payload),
      requestedBy: "event:channel.updated",
    }),
})

export const publicationChannelDeletedIntentSubscriber = createPublicationIntentSubscriber({
  id: "@voyant-travel/distribution#subscriber.publication-intent-channel-deleted",
  eventType: "channel.deleted",
  enqueue: (db, payload) => {
    const event = deletionPayloadSchema.parse(payload)
    return publicationServiceOperations.enqueueCapturedProductLifecycleReindex(db, {
      productIds: event.affectedProductIds,
      requestedBy: "event:channel.deleted",
    })
  },
})

export const publicationSupplierReassignedIntentSubscriber = createPublicationIntentSubscriber({
  id: "@voyant-travel/distribution#subscriber.publication-intent-product-supplier-reassigned",
  eventType: "product.supplier.reassigned",
  enqueue: (db, payload) => {
    const event = supplierReassignmentPayloadSchema.parse(payload)
    return publicationServiceOperations.enqueueSupplierReassignmentReindex(db, {
      productId: event.productId,
      previousSupplierId: event.previousSupplierId,
      nextSupplierId: event.nextSupplierId,
      requestedBy: "event:product.supplier.reassigned",
    })
  },
})

export const publicationIntentSubscriberDescriptors = [
  publicationProductCreatedIntentSubscriber,
  publicationProductUpdatedIntentSubscriber,
  publicationProductDeletedIntentSubscriber,
  publicationSupplierCreatedIntentSubscriber,
  publicationSupplierUpdatedIntentSubscriber,
  publicationSupplierDeletedIntentSubscriber,
  publicationChannelCreatedIntentSubscriber,
  publicationChannelUpdatedIntentSubscriber,
  publicationChannelDeletedIntentSubscriber,
  publicationSupplierReassignedIntentSubscriber,
] as const

function createPublicationIntentSubscriberGraphRuntime(descriptor: SubscriberRuntimeDescriptor) {
  return defineGraphRuntimeFactory(async ({ getPort }) => {
    const provider = await getPort(distributionPublicationIntentWorkerRuntimePort)
    return {
      ...descriptor,
      register(context: BootstrapContext) {
        context.container.register(distributionPublicationIntentWorkerRuntimePort.id, provider)
        return descriptor.register(context)
      },
    }
  })
}

export const createPublicationProductCreatedIntentSubscriberGraphRuntime =
  createPublicationIntentSubscriberGraphRuntime(publicationProductCreatedIntentSubscriber)
export const createPublicationProductUpdatedIntentSubscriberGraphRuntime =
  createPublicationIntentSubscriberGraphRuntime(publicationProductUpdatedIntentSubscriber)
export const createPublicationProductDeletedIntentSubscriberGraphRuntime =
  createPublicationIntentSubscriberGraphRuntime(publicationProductDeletedIntentSubscriber)
export const createPublicationSupplierCreatedIntentSubscriberGraphRuntime =
  createPublicationIntentSubscriberGraphRuntime(publicationSupplierCreatedIntentSubscriber)
export const createPublicationSupplierUpdatedIntentSubscriberGraphRuntime =
  createPublicationIntentSubscriberGraphRuntime(publicationSupplierUpdatedIntentSubscriber)
export const createPublicationSupplierDeletedIntentSubscriberGraphRuntime =
  createPublicationIntentSubscriberGraphRuntime(publicationSupplierDeletedIntentSubscriber)
export const createPublicationChannelCreatedIntentSubscriberGraphRuntime =
  createPublicationIntentSubscriberGraphRuntime(publicationChannelCreatedIntentSubscriber)
export const createPublicationChannelUpdatedIntentSubscriberGraphRuntime =
  createPublicationIntentSubscriberGraphRuntime(publicationChannelUpdatedIntentSubscriber)
export const createPublicationChannelDeletedIntentSubscriberGraphRuntime =
  createPublicationIntentSubscriberGraphRuntime(publicationChannelDeletedIntentSubscriber)
export const createPublicationSupplierReassignedIntentSubscriberGraphRuntime =
  createPublicationIntentSubscriberGraphRuntime(publicationSupplierReassignedIntentSubscriber)
