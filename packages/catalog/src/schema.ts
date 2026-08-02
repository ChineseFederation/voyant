/**
 * Aggregated drizzle table exports for the catalog plane.
 *
 * Templates point their `drizzle.config.ts` at this single module to pick
 * up every catalog-plane table in one go. Keeps the template config small
 * and avoids the template having to track which catalog-plane sub-paths
 * carry tables.
 *
 * Tables exported:
 *   - `catalogOverlayTable`           — editorial overrides (§5.2)
 *   - `bookingCatalogSnapshotTable`   — frozen booking snapshots (§5.3)
 *   - `catalogQuotesTable`            — booking-engine quote records
 *   - `catalogSourcedEntriesTable`    — durable sourced-entry store
 *                                       (sourced-content §2.5)
 *   - `catalogProductReindexStateTable` — durable reindex lease + cursor
 */

export {
  bookingDraftsTable,
  type InsertBookingDraft,
  type SelectBookingDraft,
} from "./booking-engine/drafts-schema.js"
export {
  catalogQuotesTable,
  type InsertCatalogQuote,
  type SelectCatalogQuote,
} from "./booking-engine/schema.js"
export {
  bookingSessionAuditEventsTable,
  bookingSessionCommitsTable,
  bookingSessionHoldsTable,
  bookingSessionOperationsTable,
  bookingSessionQuotesTable,
  bookingSessionsTable,
  type InsertBookingSession,
  type InsertBookingSessionAuditEvent,
  type InsertBookingSessionCommit,
  type InsertBookingSessionHold,
  type InsertBookingSessionOperation,
  type InsertBookingSessionQuote,
  type SelectBookingSession,
  type SelectBookingSessionAuditEvent,
  type SelectBookingSessionCommit,
  type SelectBookingSessionHold,
  type SelectBookingSessionOperation,
  type SelectBookingSessionQuote,
} from "./booking-engine/sessions-schema.js"
export {
  type InsertSupplierOperation,
  type SelectSupplierOperation,
  supplierOperationsTable,
} from "./booking-engine/supplier-operations-schema.js"
export {
  catalogOverlayHistoryTable,
  catalogOverlayTable,
  type InsertCatalogOverlay,
  type InsertCatalogOverlayHistory,
  OVERLAY_DEFAULT_SCOPE,
  OVERLAY_ROOT_NODE_KEY,
  OVERLAY_ROOT_NODE_KIND,
  type OverlayOrigin,
  type SelectCatalogOverlay,
  type SelectCatalogOverlayHistory,
} from "./overlay/schema.js"
export {
  catalogProductReindexStateTable,
  type InsertCatalogProductReindexState,
  type SelectCatalogProductReindexState,
} from "./reindex-state-schema.js"
export {
  catalogSourcedEntriesTable,
  type InsertCatalogSourcedEntry,
  type SelectCatalogSourcedEntry,
  type SourcedEntryStatus,
} from "./schema-sourced-entries.js"
export {
  bookingCatalogSnapshotTable,
  type InsertBookingCatalogSnapshot,
  type PricingBasis,
  readPricingBasis,
  type SelectBookingCatalogSnapshot,
} from "./snapshot/schema.js"
