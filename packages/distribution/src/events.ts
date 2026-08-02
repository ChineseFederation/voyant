/**
 * Distribution domain events.
 *
 * `product.publication.changed` is emitted by publication-rule writes. Catalog
 * integrations subscribe and reindex the affected product's customer-facing
 * slices after re-deriving effective publication from current DB state.
 *
 * `channel.product_mapping.changed` is emitted by product↔channel mapping
 * writes. Mapping is external identifier/push configuration, not publication
 * authority.
 */

import type { EventBus } from "@voyant-travel/core"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { channels } from "./schema.js"

/** Stable string identifier for the event. */
export const PRODUCT_PUBLICATION_CHANGED_EVENT = "product.publication.changed" as const
export const CHANNEL_PRODUCT_MAPPING_CHANGED_EVENT = "channel.product_mapping.changed" as const

export type ProductPublicationOperation = "created" | "updated" | "deleted"

export type ChannelProductMappingOperation =
  | "created"
  | "updated"
  | "deleted"
  | "activated"
  | "deactivated"

export interface ProductPublicationChangedEvent {
  productId: string
  channelId: string
  publicationId: string | null
  operation: ProductPublicationOperation
  /** Channel kind at emit time (diagnostic; e.g. "direct", "ota"). `null` if unresolved. */
  channelKind: string | null
  /** Channel status at emit time (diagnostic; e.g. "active"). `null` if unresolved. */
  channelStatus: string | null
}

export interface ChannelProductMappingChangedEvent {
  productId: string
  channelId: string
  mappingId: string | null
  /** Mapping active state BEFORE the change. `null` when it did not exist (created). */
  previousActive: boolean | null
  /** Mapping active state AFTER the change. `null` when the mapping was removed (deleted). */
  nextActive: boolean | null
  operation: ChannelProductMappingOperation
  /** Channel kind at emit time (diagnostic; e.g. "direct", "ota"). `null` if unresolved. */
  channelKind: string | null
  /** Channel status at emit time (diagnostic; e.g. "active"). `null` if unresolved. */
  channelStatus: string | null
}

async function readChannelDiagnostics(db: PostgresJsDatabase, channelId: string) {
  let channelKind: string | null = null
  let channelStatus: string | null = null
  const [channel] = await db
    .select({ kind: channels.kind, status: channels.status })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1)
  if (channel) {
    channelKind = channel.kind
    channelStatus = channel.status
  }
  return { channelKind, channelStatus }
}

async function emitDistributionEvent<TPayload>(
  eventBus: EventBus | undefined,
  db: PostgresJsDatabase,
  eventType: string,
  channelId: string,
  payload: Omit<TPayload, "channelKind" | "channelStatus">,
): Promise<void> {
  if (!eventBus) return
  try {
    const channel = await readChannelDiagnostics(db, channelId)
    await eventBus.emit<TPayload>(eventType, { ...payload, ...channel } as TPayload, {
      category: "domain",
      source: "service",
    })
  } catch (error) {
    // Never let event emission break the mutation. Log and swallow.
    console.error(`[distribution] failed to emit ${eventType}`, error)
  }
}

/** Emit `product.publication.changed`. Fire-and-forget and never throws. */
export async function emitProductPublicationChanged(
  eventBus: EventBus | undefined,
  db: PostgresJsDatabase,
  input: Omit<ProductPublicationChangedEvent, "channelKind" | "channelStatus">,
): Promise<void> {
  await emitDistributionEvent<ProductPublicationChangedEvent>(
    eventBus,
    db,
    PRODUCT_PUBLICATION_CHANGED_EVENT,
    input.channelId,
    input,
  )
}

/** Emit `channel.product_mapping.changed`. Fire-and-forget and never throws. */
export async function emitChannelProductMappingChanged(
  eventBus: EventBus | undefined,
  db: PostgresJsDatabase,
  input: Omit<ChannelProductMappingChangedEvent, "channelKind" | "channelStatus">,
): Promise<void> {
  await emitDistributionEvent<ChannelProductMappingChangedEvent>(
    eventBus,
    db,
    CHANNEL_PRODUCT_MAPPING_CHANGED_EVENT,
    input.channelId,
    input,
  )
}

/**
 * Classify an update by comparing the mapping's `active` flag before and
 * after: a flip is `activated` / `deactivated`, anything else is `updated`.
 */
export function classifyMappingUpdate(
  previousActive: boolean,
  nextActive: boolean,
): ChannelProductMappingOperation {
  if (previousActive && !nextActive) return "deactivated"
  if (!previousActive && nextActive) return "activated"
  return "updated"
}
