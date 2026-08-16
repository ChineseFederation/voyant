import { boolean, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core"

type ProductExtraSelectionType = "optional" | "required" | "default_selected" | "unavailable"

type ProductExtraPricingMode =
  | "included"
  | "per_person"
  | "per_booking"
  | "quantity_based"
  | "on_request"
  | "free"

export const productExtrasRef = pgTable("product_extras", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  selectionType: text("selection_type")
    .$type<ProductExtraSelectionType>()
    .notNull()
    .default("optional"),
  pricingMode: text("pricing_mode")
    .$type<ProductExtraPricingMode>()
    .notNull()
    .default("per_booking"),
  pricedPerPerson: boolean("priced_per_person").notNull().default(false),
  defaultQuantity: integer("default_quantity"),
  minQuantity: integer("min_quantity"),
  maxQuantity: integer("max_quantity"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
})
