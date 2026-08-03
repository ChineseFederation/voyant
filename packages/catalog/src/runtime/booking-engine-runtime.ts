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
    catalogRuntimeExtensions().sources?.registerFallback(
      registry,
      env as Record<string, string | undefined>,
    )
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
  const sources = catalogRuntimeExtensions().sources
  if (!sources) {
    _connectWarm = Promise.resolve()
    return _connectWarm
  }
  _connectWarm = sources
    .warm(registry, env as Record<string, string | undefined>)
    .then(() => {
      // Per-connection shims just landed — back-fill the vertical registry so
      // admin/public external cruise reads resolve them too.
      catalogRuntimeExtensions().cruises.syncRegistry(registry)
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(
        `[booking-engine] channel source warm failed; using un-scoped fallback: ${message}`,
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
 * Re-enumerate Connect connections and register the current set, discarding the
 * memoized warm first.
 *
 * `warmBookingEngineConnectSources` keeps its fulfilled promise for the life of
 * the isolate, which is right for request paths — but it means a resident Node
 * deployment that warmed once never sees a connection added later. Batch entry
 * points whose whole purpose is to pick up new connections (the discovery sync,
 * on its schedule or on a connection-add wakeup) must refresh instead of reusing
 * that warm. Registration is keyed by connection id and replaces in place, so a
 * refresh that overlaps an in-flight warm converges on the same registry.
 */
export async function refreshBookingEngineConnectSources(
  env: BookingEngineEnv,
): Promise<SourceAdapterRegistry> {
  _connectWarm = undefined
  return ensureBookingEngineRegistry(env)
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

/**
 * Deployment environment as the booking engine sees it: an opaque record it
 * passes to whichever inventory channel is bound. The spine reads none of these
 * keys — naming a vendor's variables here would make the catalog know one
 * channel, which is exactly what the sources port exists to avoid.
 */
export type BookingEngineEnv = Record<string, string | undefined>

/**
 * Convenience helper for route handlers — pulls env from the Hono context,
 * returns the cached source registry, and ties the per-connection channel warm
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
