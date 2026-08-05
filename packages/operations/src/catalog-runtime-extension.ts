import type { CatalogOperationsRuntimeExtension } from "@voyant-travel/catalog/runtime-contracts"
import { and, asc, eq, gte } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { availabilitySlots } from "./availability/schema.js"

import { createProductDeparturesProjectionExtension } from "./availability/service-catalog-plane-departures.js"

export const catalogOperationsRuntimeExtension = {
  async listAvailabilitySlots(db, productId, todayIso, _scope) {
    return (db as PostgresJsDatabase)
      .select({
        id: availabilitySlots.id,
        dateLocal: availabilitySlots.dateLocal,
        startsAt: availabilitySlots.startsAt,
        endsAt: availabilitySlots.endsAt,
        timezone: availabilitySlots.timezone,
        status: availabilitySlots.status,
        unlimited: availabilitySlots.unlimited,
        remainingPax: availabilitySlots.remainingPax,
        initialPax: availabilitySlots.initialPax,
        nights: availabilitySlots.nights,
        days: availabilitySlots.days,
      })
      .from(availabilitySlots)
      .where(
        and(
          eq(availabilitySlots.productId, productId),
          eq(availabilitySlots.status, "open"),
          gte(availabilitySlots.dateLocal, todayIso),
        ),
      )
      .orderBy(asc(availabilitySlots.startsAt))
      .limit(60)
  },
  createDeparturesProjectionExtension: () => createProductDeparturesProjectionExtension(),
} satisfies CatalogOperationsRuntimeExtension
