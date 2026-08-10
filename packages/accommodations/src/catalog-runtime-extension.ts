import type { SourceAdapterRegistry } from "@voyant-travel/catalog/booking-engine"
import type { CatalogAccommodationsRuntimeExtension } from "@voyant-travel/catalog/runtime-contracts"
import { readSourcedEntryBySource } from "@voyant-travel/catalog/services/sourced-entry"
import type { AvailabilityCandidate } from "@voyant-travel/catalog-contracts/adapter/contract"
import type { AnyDrizzleDb } from "@voyant-travel/db"

import { registerAccommodationBookingHandler } from "./booking-engine/runtime.js"
import { createAccommodationOwnedSearchHandler } from "./booking-engine/search-handler.js"
import { accommodationCatalogPolicy } from "./catalog-policy.js"
import {
  accommodationPropertyCatalogPolicy,
  accommodationPropertyReferenceCatalogPolicy,
} from "./catalog-policy-properties.js"
import { type AccommodationContent, accommodationContentSchema } from "./content-shape.js"
import { createRoomTypeDocumentBuilder } from "./service-catalog-plane.js"
import { getAccommodationContent } from "./service-content.js"
import {
  createAccommodationPropertyDocumentBuilder,
  listAccommodationOffersReferencingProperty,
} from "./service-presentation-subjects.js"

export const catalogAccommodationsRuntimeExtension = {
  fieldPolicy: [...accommodationCatalogPolicy, ...accommodationPropertyReferenceCatalogPolicy],
  propertyFieldPolicy: accommodationPropertyCatalogPolicy,
  createDocumentBuilder: ({ db, sellerOperatorId }) =>
    createRoomTypeDocumentBuilder(db, { sellerOperatorId }),
  listAccommodationOffersReferencingProperty,
  createPropertyDocumentBuilder: createAccommodationPropertyDocumentBuilder,
  registerOwnedBookingHandler: registerAccommodationBookingHandler,
  registerOwnedAvailabilitySearchHandler(registry) {
    registry.register(createAccommodationOwnedSearchHandler({}))
  },
  async presentAvailabilityCandidate({ db, registry, candidate, locale, market, currency }) {
    const bookingTarget = await resolveAvailabilityPresentationTarget({
      db,
      registry,
      candidate,
    })
    const resolved = await getAccommodationContent(
      db,
      bookingTarget.entityId,
      { preferredLocales: [locale], market, currency },
      { registry },
    )
    const content =
      resolved?.content ??
      (await fetchUnindexedAvailabilityContent({
        registry,
        candidate,
        locale,
        market,
        currency,
      }))
    if (!content) return undefined
    return { ...availabilityPresentation(content, candidate), bookingTarget }
  },
} satisfies CatalogAccommodationsRuntimeExtension

function availabilityPresentation(content: AccommodationContent, candidate: AvailabilityCandidate) {
  const selection = record(candidate.selection)
  const roomTypeId = string(selection?.roomTypeId)
  const ratePlanId = string(selection?.ratePlanId)
  const rooms = Array.isArray(selection?.rooms) ? selection.rooms : []
  const firstRoom = record(rooms[0])
  const selectedRoomTypeId = roomTypeId ?? string(firstRoom?.roomTypeId)
  const selectedRatePlanId = ratePlanId ?? string(firstRoom?.ratePlanId)
  const room = content.room_types.find(({ id }) => id === selectedRoomTypeId)
  const ratePlan = content.rate_plans.find(({ id }) => id === selectedRatePlanId)
  const imageUrl = room?.images[0] ?? content.hotel.hero_image_url ?? undefined
  return {
    title: content.hotel.name,
    ...(room?.name ? { roomName: room.name } : {}),
    ...(ratePlan?.name ? { boardName: ratePlan.name } : {}),
    ...(imageUrl ? { image: { url: imageUrl, alt: content.hotel.name } } : {}),
  }
}

async function fetchUnindexedAvailabilityContent(input: {
  registry: SourceAdapterRegistry
  candidate: AvailabilityCandidate
  locale: string
  market: string
  currency: string
}): Promise<AccommodationContent | undefined> {
  if (input.candidate.source?.kind !== "sourced") return undefined
  const connectionId = input.candidate.source.connectionId
  const adapter = input.registry.resolveByConnection(connectionId)
  if (!adapter?.getContent) return undefined
  const fresh = await adapter.getContent(
    { connection_id: connectionId },
    {
      entity_module: "accommodations",
      entity_id: input.candidate.entity_id,
      locale: input.locale,
      market: input.market,
      currency: input.currency,
    },
  )
  const parsed = accommodationContentSchema.safeParse(fresh.content)
  return parsed.success ? parsed.data : undefined
}

export async function resolveAvailabilityPresentationTarget(input: {
  db: AnyDrizzleDb
  registry: SourceAdapterRegistry
  candidate: AvailabilityCandidate
  readBySource?: typeof readSourcedEntryBySource
}): Promise<{
  entityModule: "accommodations"
  entityId: string
  sourceKind: string
  sourceConnectionId?: string
  sourceRef?: string
}> {
  if (input.candidate.source?.kind !== "sourced") {
    return {
      entityModule: "accommodations",
      entityId: input.candidate.entity_id,
      sourceKind: "owned",
    }
  }
  const connectionId = input.candidate.source.connectionId
  const adapter = input.registry.resolveByConnection(connectionId)
  if (!adapter) {
    return {
      entityModule: "accommodations",
      entityId: input.candidate.entity_id,
      sourceKind: "unknown",
      sourceConnectionId: connectionId,
      sourceRef: input.candidate.entity_id,
    }
  }

  // Live Connect search returns the source accommodation reference. Catalog
  // content is keyed by its canonical sourced-entry id. Resolve that identity
  // boundary before presentation; never expose or accept it from the browser.
  const sourced = await (input.readBySource ?? readSourcedEntryBySource)(input.db, {
    entityModule: "accommodations",
    sourceKind: adapter.kind,
    sourceConnectionId: connectionId,
    sourceRef: input.candidate.entity_id,
  })
  return {
    entityModule: "accommodations",
    entityId: sourced?.entity_id ?? input.candidate.entity_id,
    sourceKind: sourced?.source_kind ?? adapter.kind,
    sourceConnectionId: sourced?.source_connection_id ?? connectionId,
    sourceRef: sourced?.source_ref ?? input.candidate.entity_id,
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}
