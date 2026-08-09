import type { CatalogAccommodationsRuntimeExtension } from "@voyant-travel/catalog/runtime-contracts"

import { registerAccommodationBookingHandler } from "./booking-engine/runtime.js"
import { createAccommodationOwnedSearchHandler } from "./booking-engine/search-handler.js"
import { accommodationCatalogPolicy } from "./catalog-policy.js"
import {
  accommodationPropertyCatalogPolicy,
  accommodationPropertyReferenceCatalogPolicy,
} from "./catalog-policy-properties.js"
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
    const resolved = await getAccommodationContent(
      db,
      candidate.entity_id,
      { preferredLocales: [locale], market, currency },
      { registry },
    )
    if (!resolved) return undefined
    const selection = record(candidate.selection)
    const roomTypeId = string(selection?.roomTypeId)
    const ratePlanId = string(selection?.ratePlanId)
    const room = resolved.content.room_types.find(({ id }) => id === roomTypeId)
    const ratePlan = resolved.content.rate_plans.find(({ id }) => id === ratePlanId)
    const imageUrl = room?.images[0] ?? resolved.content.hotel.hero_image_url ?? undefined
    return {
      title: resolved.content.hotel.name,
      ...(room?.name ? { roomName: room.name } : {}),
      ...(ratePlan?.name ? { boardName: ratePlan.name } : {}),
      ...(imageUrl ? { image: { url: imageUrl, alt: resolved.content.hotel.name } } : {}),
    }
  },
} satisfies CatalogAccommodationsRuntimeExtension

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}
