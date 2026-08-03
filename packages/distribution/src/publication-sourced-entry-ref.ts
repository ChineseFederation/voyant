import { pgTable, text } from "drizzle-orm/pg-core"

/**
 * Narrow local view of Catalog's `catalog_sourced_entries`, mirroring the
 * {@link publicationProductsRef} pattern: publication needs to count and
 * enumerate the entries a source rule affects, but Distribution must not
 * depend on `@voyant-travel/catalog` to do it.
 *
 * Only the provenance and identity columns are declared. The table is owned by
 * Catalog — never write to it from here.
 */
export const publicationSourcedEntriesRef = pgTable("catalog_sourced_entries", {
  // Property names mirror the owner's exactly — `verify:ref-mirrors` compares
  // them, and Catalog declares this table in snake_case.
  entity_module: text("entity_module").notNull(),
  entity_id: text("entity_id").notNull(),
  source_kind: text("source_kind").notNull(),
  source_connection_id: text("source_connection_id"),
  status: text("status").notNull(),
})
