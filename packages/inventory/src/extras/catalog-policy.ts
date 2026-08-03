/**
 * Catalog plane field policy for Product-owned Extras.
 *
 * An Extra is a lifecycle-dependent child of the Product that sells it —
 * **never independently sellable inventory**. Per architecture §3.3.1 it is a
 * partial-adoption vertical:
 *
 *   - **Adopt:** provenance shape (§5.1), booking snapshot graph (§5.3),
 *     catalog event taxonomy for the cancellation/fulfillment lifecycle.
 *   - **Skip:** search index projection (§5.4), editorial overlay store
 *     (§5.2), embeddings / RAG (Phase 2). Extras are discovered through
 *     the parent's surface, not via standalone catalog browse.
 *
 * Every field is therefore `reindex: "none"`. `extras` is absent from
 * `DEFAULT_CATALOG_VERTICALS`, so no extras slice or collection exists for a
 * document to be written into, and the catalog search route refuses the
 * vertical outright (`PRODUCT_OWNED_VERTICALS`). The policy exists purely so
 * the owning Product can freeze what it sold.
 *
 * Scope of this file:
 *   - The `product_extras` table (extra catalog definitions).
 *
 * Out of scope:
 *   - `option_extra_configs` — option-level overrides; promoted child.
 *   - `booking_extras` — runtime line items on a booking; not catalog data.
 */

import { defineFieldPolicy, type FieldPolicyInput } from "@voyant-travel/catalog/contract"

const EXTRAS_FIELD_POLICY: FieldPolicyInput[] = [
  // ── Source pointer / provenance ─────────────────────────────────────────
  {
    path: "source.kind",
    class: "managed",
    merge: "source-only",
    drift: "critical",
    reindex: "none",
    snapshot: "on-book",
    query: "indexed-column",
    localized: false,
    visibility: ["staff"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "sync",
  },
  {
    path: "source.ref",
    class: "managed",
    merge: "source-only",
    drift: "critical",
    reindex: "none",
    snapshot: "on-book",
    query: "indexed-column",
    localized: false,
    visibility: ["staff"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "sync",
  },
  {
    path: "seller.operator_id",
    class: "managed",
    merge: "source-only",
    drift: "critical",
    reindex: "none",
    snapshot: "on-book",
    query: "indexed-column",
    localized: false,
    visibility: ["staff"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "static",
  },

  // ── Identity / lifecycle ────────────────────────────────────────────────
  {
    path: "id",
    class: "managed",
    merge: "source-only",
    drift: "critical",
    reindex: "none",
    snapshot: "on-book",
    query: "first-class-table",
    localized: false,
    visibility: ["staff", "customer", "partner"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "static",
  },
  {
    path: "code",
    class: "managed",
    merge: "source-only",
    drift: "high",
    reindex: "none",
    snapshot: "on-book",
    query: "indexed-column",
    localized: false,
    visibility: ["staff"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "sync",
  },
  {
    path: "createdAt",
    class: "managed",
    merge: "source-only",
    drift: "none",
    reindex: "none",
    snapshot: "on-book",
    query: "indexed-column",
    localized: false,
    visibility: ["staff"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "static",
  },
  {
    path: "updatedAt",
    class: "managed",
    merge: "source-only",
    drift: "none",
    reindex: "none",
    snapshot: "never",
    query: "indexed-column",
    localized: false,
    visibility: ["staff"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "sync",
  },

  // ── Cross-module reference (the parent product the extra attaches to) ──
  {
    path: "productId",
    class: "managed",
    merge: "source-only",
    drift: "critical",
    reindex: "none",
    snapshot: "on-book",
    query: "indexed-column",
    localized: false,
    visibility: ["staff"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "sync",
  },
  {
    path: "supplierId",
    class: "structural",
    merge: "source-only",
    drift: "high",
    reindex: "none",
    snapshot: "on-book",
    query: "indexed-column",
    localized: false,
    visibility: ["staff"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "sync",
  },

  // ── Snapshot-relevant managed fields ────────────────────────────────────
  // Extras' name/description aren't merchandised standalone — they're
  // shown inside the parent product's add-on UI. Marked as managed for
  // simplicity; if a future case requires marketing overrides on extras'
  // names, this can be promoted to merchandisable.
  {
    path: "name",
    class: "managed",
    merge: "source-only",
    drift: "medium",
    reindex: "none",
    snapshot: "on-book",
    query: "indexed-column",
    localized: false,
    visibility: ["staff", "customer", "partner"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "sync",
  },
  {
    path: "description",
    class: "managed",
    merge: "source-only",
    drift: "low",
    reindex: "none",
    snapshot: "on-book",
    query: "blob-only",
    localized: false,
    visibility: ["staff", "customer", "partner"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "sync",
  },
  {
    path: "thumbnailUrl",
    class: "merchandisable",
    merge: "source-only",
    drift: "low",
    reindex: "none",
    snapshot: "on-book",
    query: "indexed-column",
    localized: false,
    visibility: ["staff", "customer", "partner"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "sync",
  },

  // ── Selection / pricing structure (snapshotted at book time) ───────────
  {
    path: "selectionType",
    class: "structural",
    merge: "source-only",
    drift: "high",
    reindex: "none",
    snapshot: "on-book",
    query: "indexed-column",
    localized: false,
    visibility: ["staff", "customer", "partner"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "sync",
  },
  {
    path: "pricingMode",
    class: "structural",
    merge: "source-only",
    drift: "high",
    reindex: "none",
    snapshot: "on-quote-and-book",
    query: "indexed-column",
    localized: false,
    visibility: ["staff", "customer", "partner"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "sync",
  },
  {
    path: "pricedPerPerson",
    class: "structural",
    merge: "source-only",
    drift: "high",
    reindex: "none",
    snapshot: "on-quote-and-book",
    query: "indexed-column",
    localized: false,
    visibility: ["staff", "customer", "partner"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "sync",
  },
  {
    path: "minQuantity",
    class: "structural",
    merge: "source-only",
    drift: "medium",
    reindex: "none",
    snapshot: "on-book",
    query: "indexed-column",
    localized: false,
    visibility: ["staff", "customer", "partner"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "sync",
  },
  {
    path: "maxQuantity",
    class: "structural",
    merge: "source-only",
    drift: "medium",
    reindex: "none",
    snapshot: "on-book",
    query: "indexed-column",
    localized: false,
    visibility: ["staff", "customer", "partner"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "sync",
  },
  {
    path: "defaultQuantity",
    class: "structural",
    merge: "source-only",
    drift: "low",
    reindex: "none",
    snapshot: "on-book",
    query: "indexed-column",
    localized: false,
    visibility: ["staff", "customer", "partner"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "sync",
  },
  {
    path: "active",
    class: "structural",
    merge: "source-only",
    drift: "high",
    reindex: "none",
    snapshot: "on-book",
    query: "indexed-column",
    localized: false,
    visibility: ["staff"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "sync",
  },
  {
    path: "sortOrder",
    class: "structural",
    merge: "source-only",
    drift: "none",
    reindex: "none",
    snapshot: "never",
    query: "indexed-column",
    localized: false,
    visibility: ["staff"],
    editRole: "ops",
    overrideFriction: "none",
    sourceFreshness: "sync",
  },
]

export const extrasCatalogPolicy = defineFieldPolicy(EXTRAS_FIELD_POLICY)

export { EXTRAS_FIELD_POLICY }
