import { desc, eq } from "drizzle-orm"
import { boolean, integer, pgTable, text } from "drizzle-orm/pg-core"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

/** Minimal reference to the products table for LEFT JOIN enrichment. */
export const productsRef = pgTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  bookingMode: text("booking_mode").notNull(),
})

/**
 * Minimal reference to product_versions, so a departure can be bound at
 * creation to the Product definition it operates from (#4032).
 *
 * Declared locally rather than imported: Inventory owns `product_versions` and
 * already depends on Operations, so importing it here would close a dependency
 * cycle. This is the same escape hatch `productsRef` and `productOptionsRef`
 * already use for cross-module reads.
 */
export const productVersionsRef = pgTable("product_versions", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  versionNumber: integer("version_number").notNull(),
})

/** Minimal reference to product_options for validating explicit slot option links. */
export const productOptionsRef = pgTable("product_options", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  isDefault: boolean("is_default").notNull(),
  sortOrder: integer("sort_order").notNull(),
})

/**
 * The Product Version a departure created now operates from: the product's
 * highest version number, which is the one publish most recently froze.
 *
 * Deterministic by construction — version numbers are assigned monotonically
 * per product, so "current" never depends on wall-clock time or row order.
 * Returns null when the product has never been published; that is recorded as
 * unknown rather than inferred (#4032).
 */
export async function resolveCurrentProductVersionId(
  db: PostgresJsDatabase,
  productId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: productVersionsRef.id })
    .from(productVersionsRef)
    .where(eq(productVersionsRef.productId, productId))
    .orderBy(desc(productVersionsRef.versionNumber))
    .limit(1)

  return row?.id ?? null
}
