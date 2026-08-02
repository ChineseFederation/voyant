import type { EventBus } from "@voyant-travel/core"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

export type DistributionRouteEnv = {
  Variables: {
    db: PostgresJsDatabase
    userId?: string
    /**
     * Request-scoped event bus set by the framework (`createApp`). Optional so
     * the routes still mount in tests / hosts that don't wire a bus.
     * Distribution mutations pass it through to the service so domain events
     * fire from the service layer (covering batch paths too).
     */
    eventBus?: EventBus
  }
}
