/**
 * Process-local SourceAdapterRegistry + OwnedBookingHandlerRegistry
 * for the catalog booking engine. Source adapter wiring stays here; owned
 * vertical booking handlers live in focused registration modules.
 */

import {
  createSourceAdapterRegistry,
  type OwnedBookingHandlerRegistry,
  type SourceAdapterRegistry,
} from "@voyant-travel/catalog/booking-engine"
import {
  createVoyantConnectSources,
  prepareVoyantConnectSources,
  registerVoyantConnectSources,
  resolveVoyantConnectEnv,
} from "@voyant-travel/plugin-voyant-connect"
import type { Context } from "hono"
import { catalogRuntimeExtensions } from "./host.js"
import { createOwnedBookingHandlersRegistry } from "./owned-booking-handlers.js"

let _registry: SourceAdapterRegistry | undefined
let _ownedHandlers: OwnedBookingHandlerRegistry | undefined
let _connectWarm: Promise<void> | undefined

/**
 * Build (once per isolate) the registry with everything resolvable
 * synchronously: the un-scoped Voyant Connect default adapter pair. The
 * default pair is the cold-window fallback for sourced reads and quoting.
 */
function ensureRegistry(env: BookingEngineEnv): SourceAdapterRegistry {
  if (!_registry) {
    const { cruises } = catalogRuntimeExtensions()
    const registry = createSourceAdapterRegistry()
    registerVoyantConnectFallback(registry, env)
    // Single activation point for cruise adapters: register deployment-owned
    // connectors into both planes and back-fill the vertical registry from the
    // un-scoped Connect cruise fallback registered just above. The per-connection
    // Connect cruise shims land later (async warm) and are back-filled again in
    // `warmBookingEngineConnectSources`.
    cruises.registerAdapters(registry, env as Record<string, string | undefined>)
    _registry = registry
  }
  return _registry
}

/**
 * Returns the (lazy-initialized) booking-engine registry and kicks the
 * per-connection Connect warm in the background. Route handlers should prefer
 * `getBookingEngineRegistryFromContext` (which ties the warm to the request via
 * `ctx.waitUntil`); async batch entry points should prefer
 * `ensureBookingEngineRegistry` (which awaits the warm).
 */
export function getBookingEngineRegistry(env: BookingEngineEnv): SourceAdapterRegistry {
  const registry = ensureRegistry(env)
  void warmBookingEngineConnectSources(env)
  return registry
}

/**
 * Enumerate the operator's active Connect connections and register one
 * connection-scoped adapter set per connection (keyed by `connection.id`) onto
 * the cached registry, so the live book path resolves by `source_connection_id`
 * exactly like the discovery-sync CLI does. Idempotent and memoized per isolate;
 * a failed warm is reset so a later request retries, and the un-scoped default
 * keeps sourced bookings dispatching in the meantime. Resolves to a no-op when
 * Connect is unconfigured (no network). See #2044.
 */
function warmBookingEngineConnectSources(env: BookingEngineEnv): Promise<void> {
  if (_connectWarm) return _connectWarm
  const registry = ensureRegistry(env)
  _connectWarm = prepareVoyantConnectSources(env, {
    enumerate: true,
    cruise: CONNECT_CRUISE_MEMOIZE,
    warn: (message) => console.warn(`[booking-engine] ${message}`),
  })
    .then((sources) => {
      registerVoyantConnectSources(registry, sources)
      // Per-connection Connect cruise shims just landed — back-fill the vertical
      // registry so admin/public external cruise reads resolve them too.
      catalogRuntimeExtensions().cruises.syncRegistry(registry)
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(
        `[booking-engine] Connect connection warm failed; using un-scoped fallback: ${message}`,
      )
      _connectWarm = undefined
    })
  return _connectWarm
}

/**
 * Returns the booking-engine registry after the per-connection Connect warm has
 * completed. Use from async batch entry points such as scheduled jobs
 * where the connection-enumeration latency is acceptable and per-connection
 * routing matters for the whole run.
 */
export async function ensureBookingEngineRegistry(
  env: BookingEngineEnv,
): Promise<SourceAdapterRegistry> {
  const registry = ensureRegistry(env)
  await warmBookingEngineConnectSources(env)
  return registry
}

/**
 * Returns the (lazy-initialized) owned-handler registry. Phase A registers
 * products plus retained resale verticals such as accommodations and cruises.
 */
export function getOwnedBookingHandlerRegistry(env: BookingEngineEnv): OwnedBookingHandlerRegistry {
  if (!_ownedHandlers) {
    _ownedHandlers = createOwnedBookingHandlersRegistry(env, () => getBookingEngineRegistry(env))
  }
  return _ownedHandlers
}

export interface BookingEngineEnv {
  VOYANT_API_KEY?: string
  VOYANT_CLOUD_API_KEY?: string
  VOYANT_CONNECT_API_KEY?: string
  VOYANT_CONNECT_API_URL?: string
  VOYANT_CONNECT_MARKET?: string
  VOYANT_CONNECT_OPERATOR_ID?: string
  VOYANT_CONNECT_SYNC_LIMIT?: string
}

/** Short-TTL read cache applied to Connect cruise reads on both the fallback and
 * per-connection warm paths (plugin >= 0.3.0). Shares the owned-adapter TTL. */
const CONNECT_CRUISE_MEMOIZE = { memoize: { ttlMs: 60_000 } } as const

/**
 * Register the un-scoped Voyant Connect default adapter pair synchronously — the
 * cold-window fallback used until `warmBookingEngineConnectSources` registers the
 * per-connection adapters. Connect env resolution (key fallback, operator id,
 * market, sync limit, the incomplete-config warning) is shared with the
 * discovery-sync CLI via `resolveVoyantConnectEnv` so the two paths can't drift.
 */
function registerVoyantConnectFallback(
  registry: SourceAdapterRegistry,
  env: BookingEngineEnv,
): void {
  const config = resolveVoyantConnectEnv(env, {
    warn: (message) => console.warn(`[booking-engine] ${message}`),
  })
  if (!config) return
  registerVoyantConnectSources(
    registry,
    createVoyantConnectSources({ ...config, cruise: CONNECT_CRUISE_MEMOIZE }),
  )
}

/**
 * Convenience helper for route handlers — pulls env from the Hono context,
 * returns the cached source registry, and ties the per-connection Connect warm
 * to the request via `ctx.waitUntil` so the enumeration isn't torn down when the
 * request ends. Non-blocking: the request proceeds on the un-scoped fallback
 * during the first per-isolate warm.
 */
export function getBookingEngineRegistryFromContext(c: Context): SourceAdapterRegistry {
  const env = c.env as BookingEngineEnv
  const registry = ensureRegistry(env)
  const warm = warmBookingEngineConnectSources(env)
  try {
    c.executionCtx.waitUntil(warm)
  } catch {
    // No ExecutionContext (e.g. unit tests) — the memoized warm still settles on
    // a subsequent request in a live isolate.
  }
  return registry
}

/**
 * Convenience helper for route handlers — pulls env from the Hono context and
 * returns the cached owned-handler registry.
 */
export function getOwnedBookingHandlerRegistryFromContext(c: Context): OwnedBookingHandlerRegistry {
  const env = c.env as BookingEngineEnv
  return getOwnedBookingHandlerRegistry(env)
}
