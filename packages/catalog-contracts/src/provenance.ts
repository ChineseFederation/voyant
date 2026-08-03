/**
 * Provenance shape carried by every CatalogEntry.
 *
 * Every vertical's CatalogEntry rows include this tuple. It records where the
 * data came from (owned vs sourced), how to call the source back for live
 * resolution and post-book operations, and how the source freshens.
 *
 * See `docs/architecture/catalog-architecture.md` §5.1 for the full design.
 */

import { defineFieldPolicy, type FieldPolicy, type SourceFreshness } from "./contract.js"

/**
 * Identifies a source of CatalogEntry data. Open-ended at the type level —
 * deployments declare their source kinds at adapter registration time.
 *
 * Conventions:
 *   - `"owned"`                       — operator's own inventory
 *   - `"voyant-connect"`              — Voyant Connect peer (cloud or self-hosted)
 *   - `"gds:amadeus"` / `"gds:sabre"` / `"gds:travelport"` — GDS providers
 *   - `"direct:tui"` / `"direct:viking"` / `"direct:hilton"` — direct supplier APIs
 *   - `"bedbank:hotelbeds"` / `"bedbank:expedia"` — bedbanks
 *   - `"manual"`                      — manual / CSV import
 */
export type SourceKind = string

/**
 * Provenance tuple recorded on every CatalogEntry. Every field except
 * `source_kind` and `source_freshness` is optional because owned inventory
 * has no upstream connection or external reference.
 */
export interface Provenance {
  /** Source identifier — see {@link SourceKind} conventions. */
  source_kind: SourceKind
  /**
   * Optional sub-identifier for the source provider (e.g. specific Connect peer,
   * specific GDS office id).
   */
  source_provider?: string
  /**
   * FK to the connection / adapter instance that produced this row. For
   * `voyant-connect` sources this points to the connection record; for
   * direct-API sources it points to the local adapter config.
   */
  source_connection_id?: string
  /** Upstream identifier (e.g. Viking sailing code, Hotelbeds property id). */
  source_ref?: string
  /** How the source side of this row's fields refreshes. */
  source_freshness: SourceFreshness
  /** When this row was last refreshed from the source. */
  last_sourced_at?: Date
}

/**
 * Returns true if the provenance describes operator-owned inventory.
 */
export function isOwned(provenance: Provenance): boolean {
  return provenance.source_kind === "owned"
}

/**
 * Returns true if the provenance describes externally-sourced inventory
 * (anything that's not `owned`).
 */
export function isSourced(provenance: Provenance): boolean {
  return provenance.source_kind !== "owned"
}

/**
 * Returns a stable composite identifier for the source connection +
 * external ref, used for deduplication and reverse-lookup queries.
 *
 * Returns `undefined` if either piece is missing — useful for skipping
 * rows that have no upstream identity.
 */
export function sourceCompositeKey(provenance: Provenance): string | undefined {
  const { source_kind, source_connection_id, source_ref } = provenance
  if (!source_connection_id || !source_ref) return undefined
  return `${source_kind}:${source_connection_id}:${source_ref}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Provenance as an indexed facet
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ownership is a catalog-plane fact, not a vertical one: an entry in the
 * `products` collection may be an operator's own programme or a supplier's
 * package pulled through a supply connection, and the two need different
 * treatment on a storefront. Before these policies existed, nothing in an
 * indexed document recorded which it was — `catalog_sourced_entries` held the
 * answer and search could not see it, so consumers were reduced to inferring
 * ownership from `supplyModel` or an id prefix. Both correlate with ownership
 * today; neither states it (#4089).
 *
 * These policies are composed into every vertical registry rather than
 * declared per vertical, so the facet means the same thing in every collection
 * and no vertical can ship a registry that silently drops it.
 */

/** Value of `sourceKind` on a document built from a vertical's owned table. */
export const OWNED_SOURCE_KIND = "owned"

/**
 * Provenance of one indexed entry, as the document builders resolve it.
 * `sourceConnectionId` is null for owned entries and for connectionless
 * connectors.
 */
export interface CatalogDocumentProvenance {
  sourceKind: string
  sourceConnectionId: string | null
}

export const OWNED_DOCUMENT_PROVENANCE: CatalogDocumentProvenance = {
  sourceKind: OWNED_SOURCE_KIND,
  sourceConnectionId: null,
}

/**
 * Provenance fields every catalog collection carries.
 *
 * `isSourced` is redundant with `sourceKind` but is the field storefronts
 * actually want to filter on, and a boolean facet is cheaper to scope than a
 * negated string match against a growing set of connector kinds.
 *
 * `sourceConnectionId` is staff-only: which supplier account inventory came
 * from is commercially sensitive and not a customer-facing fact. `sourceKind`
 * and `isSourced` are customer-visible so a storefront can render and scope
 * mixed inventory deliberately.
 */
export const CATALOG_PROVENANCE_FIELD_POLICY: readonly FieldPolicy[] = defineFieldPolicy([
  {
    path: "isSourced",
    class: "structural",
    merge: "source-only",
    drift: "low",
    reindex: "facet-affecting",
    snapshot: "on-book",
    query: "indexed-column",
    localized: false,
    visibility: ["staff", "customer", "partner"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "sync",
  },
  {
    path: "sourceKind",
    class: "structural",
    merge: "source-only",
    drift: "low",
    reindex: "facet-affecting",
    snapshot: "on-book",
    query: "indexed-column",
    localized: false,
    visibility: ["staff", "customer", "partner"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "sync",
  },
  {
    path: "sourceConnectionId",
    class: "structural",
    merge: "source-only",
    drift: "low",
    reindex: "facet-affecting",
    snapshot: "on-book",
    query: "indexed-column",
    localized: false,
    visibility: ["staff"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "sync",
  },
])

/**
 * Field-keyed projection entries for one entry's provenance, ready to merge
 * into a projection map before {@link buildIndexerDocument} filters it through
 * the registry.
 */
export function provenanceProjectionEntries(
  provenance: CatalogDocumentProvenance,
): ReadonlyArray<readonly [string, unknown]> {
  const isSourced = provenance.sourceKind !== OWNED_SOURCE_KIND
  return [
    ["isSourced", isSourced],
    ["sourceKind", provenance.sourceKind],
    // Typesense has no null; an absent connection is the empty string so the
    // facet stays present and filterable on every document.
    ["sourceConnectionId", provenance.sourceConnectionId ?? ""],
  ]
}
