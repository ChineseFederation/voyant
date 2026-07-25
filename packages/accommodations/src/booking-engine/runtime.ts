import { createAccommodationBookingHandler } from "@voyant-travel/accommodations/booking-engine"
import { getAccommodationContent } from "@voyant-travel/accommodations/service-content"
import type {
  OwnedBookingHandlerRegistry,
  SourceAdapterRegistry,
} from "@voyant-travel/catalog/booking-engine"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

export interface AccommodationBookingRuntimeHost {
  withDatabase<T>(operation: (db: PostgresJsDatabase) => Promise<T>): Promise<T>
  getSourceRegistry(): SourceAdapterRegistry
}

export function registerAccommodationBookingHandler(
  registry: OwnedBookingHandlerRegistry,
  host: AccommodationBookingRuntimeHost,
): void {
  registry.register(
    createAccommodationBookingHandler({
      async loadContent(ctx, entityId) {
        const db = ctx.db as PostgresJsDatabase
        const sourceRegistry = host.getSourceRegistry()
        const resolved = await getAccommodationContent(
          db,
          entityId,
          { preferredLocales: ["en-GB"] },
          { registry: sourceRegistry },
        )
        return resolved?.content ?? null
      },
    }),
  )
}
