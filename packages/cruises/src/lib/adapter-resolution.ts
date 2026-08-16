/**
 * Registry lookup for the adapter that owns a sourced cruise.
 *
 * Internal to the package — `src/lib/*` is deliberately outside the exports map,
 * so this stays testable without becoming supported API.
 */

import type { SourceAdapter } from "@voyant-travel/catalog"
import type { SourceAdapterRegistry } from "@voyant-travel/catalog/booking-engine"

/**
 * Resolve the catalog `SourceAdapter` that owns a sourced cruise.
 *
 * Connection id alone is not enough. A channel registers several adapters for
 * one connection and can only key them apart by suffixing the registry key —
 * Voyant Connect registers its generic adapter under `<connectionId>` and its
 * cruise shim under `<connectionId>:cruises`. A bare
 * `resolveByConnection(connectionId)` therefore returns the *generic* adapter
 * for a cruise, which cannot reach through to `cruiseAdapter` for sailing
 * pricing and silently sent every connection-scoped cruise down the synthesizer
 * fallback instead of fetching real content.
 *
 * The sourced entry's own `source_kind` (`cruise:<provider>`) is what the cruise
 * shim registers under, so match on that first and keep only adapters bound to
 * this connection. Fall back to the bare connection lookup — deployment-owned
 * connectors register under it, and a generic adapter that implements
 * `getContent` can still serve cruise content — then to any adapter of the kind.
 */
export function resolveCruiseSourceAdapter(
  registry: SourceAdapterRegistry,
  sourceKind: string,
  connectionId: string | null | undefined,
): SourceAdapter | undefined {
  const ofKind = registry.byKind(sourceKind)
  if (!connectionId) return ofKind[0]?.adapter
  const scoped = ofKind.find(
    (entry) =>
      entry.connectionId === connectionId || entry.connectionId.startsWith(`${connectionId}:`),
  )
  if (scoped) return scoped.adapter
  return registry.resolveByConnection(connectionId) ?? ofKind[0]?.adapter
}
