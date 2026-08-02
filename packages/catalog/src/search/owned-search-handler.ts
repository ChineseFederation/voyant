/**
 * Owned availability-search handlers.
 *
 * Owned inventory participates in availability search as a first-class source,
 * mirroring the owned-booking-handler vs source-adapter split in the booking
 * engine (`booking-engine/owned-handler.ts`). The fan-out
 * (`availability-fan-out.ts`) treats a registered owned handler exactly like a
 * sourced adapter, so owned and sourced supply land in one ranked candidate
 * list — not modeled as a fake external provider.
 *
 * See `docs/architecture/dynamic-packaging-rfc.md` §2 (Gap 1).
 */

import type {
  AvailabilitySearchRequest,
  AvailabilitySearchResult,
  SourceAdapterContext,
} from "@voyant-travel/catalog-contracts/adapter/contract"
import type { AnyDrizzleDb } from "@voyant-travel/db"

/** Context passed to an owned search handler. Mirrors `OwnedHandlerContext`. */
export interface OwnedSearchContext {
  db: AnyDrizzleDb
  /** Echoed through from the deployment — handlers may use it for scope/audit. */
  adapterContext: SourceAdapterContext
}

/**
 * Searches an owned vertical's inventory. One handler per `entityModule`.
 * Unlike a sourced adapter, an owned handler is always search-capable — being
 * registered is the capability declaration.
 */
export interface OwnedAvailabilitySearchHandler {
  /** Vertical this handler claims. One handler per `entity_module`. */
  readonly entityModule: string

  searchAvailability(
    ctx: OwnedSearchContext,
    request: AvailabilitySearchRequest,
  ): Promise<AvailabilitySearchResult>
}

export class NoOwnedSearchHandlerRegisteredError extends Error {
  constructor(public readonly entityModule: string) {
    super(`no owned availability-search handler registered for module "${entityModule}"`)
    this.name = "NoOwnedSearchHandlerRegisteredError"
  }
}

export interface OwnedAvailabilitySearchHandlerRegistry {
  /** Register a handler. Re-registering the same `entityModule` replaces it. */
  register(handler: OwnedAvailabilitySearchHandler): void
  resolve(entityModule: string): OwnedAvailabilitySearchHandler | undefined
  resolveOrThrow(entityModule: string): OwnedAvailabilitySearchHandler
  has(entityModule: string): boolean
  modules(): ReadonlyArray<string>
}

export function createOwnedAvailabilitySearchHandlerRegistry(): OwnedAvailabilitySearchHandlerRegistry {
  const byModule = new Map<string, OwnedAvailabilitySearchHandler>()

  return {
    register(handler) {
      byModule.set(handler.entityModule, handler)
    },
    resolve(entityModule) {
      return byModule.get(entityModule)
    },
    resolveOrThrow(entityModule) {
      const handler = byModule.get(entityModule)
      if (!handler) throw new NoOwnedSearchHandlerRegisteredError(entityModule)
      return handler
    },
    has(entityModule) {
      return byModule.has(entityModule)
    },
    modules() {
      return [...byModule.keys()]
    },
  }
}
