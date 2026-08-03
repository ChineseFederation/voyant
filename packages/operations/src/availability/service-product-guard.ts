/**
 * Guard shared by every static-availability author.
 *
 * A dynamically-supplied product (`open`, `stay`) resolves its availability at
 * quote time, so authoring fixed rules or slots against one is a category
 * error rather than a capacity problem. Lives here rather than in
 * `service-core.ts` so both the slot path and the rule path can reach it
 * without either owning the other.
 */

import { RequestValidationError } from "@voyant-travel/hono"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { productsRef } from "./products-ref.js"

const DYNAMIC_BOOKING_MODES = new Set(["open", "stay"])

async function getProductBookingMode(db: PostgresJsDatabase, productId: string) {
  const [product] = await db
    .select({ bookingMode: productsRef.bookingMode })
    .from(productsRef)
    .where(eq(productsRef.id, productId))
    .limit(1)

  return product?.bookingMode ?? null
}

export async function assertProductAllowsStaticAvailability(
  db: PostgresJsDatabase,
  productId: string,
  kind: "slot" | "rule",
) {
  const bookingMode = await getProductBookingMode(db, productId)
  if (bookingMode && DYNAMIC_BOOKING_MODES.has(bookingMode)) {
    throw new RequestValidationError(
      `Dynamic ${bookingMode} products cannot author static availability ${kind}s`,
      {
        code: "dynamic_product_static_availability",
        productId,
        bookingMode,
        kind,
      },
    )
  }
}
