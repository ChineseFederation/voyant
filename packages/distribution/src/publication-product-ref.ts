import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { pgTable, text } from "drizzle-orm/pg-core"

export const publicationProductsRef = pgTable("products", {
  id: typeId("products").primaryKey(),
  supplierId: typeIdRef("supplier_id"),
  status: text("status"),
  visibility: text("visibility"),
})
