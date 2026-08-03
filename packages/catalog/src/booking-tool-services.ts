/** Bind the catalog booking Tool contract to the selected booking runtime. */

import type { Context } from "hono"
import {
  type CatalogBookingRouteModuleOptions,
  getOrderById,
  listOrders,
} from "./booking-engine/index.js"
import type { CatalogBookingToolServices } from "./booking-tools.js"

export function createCatalogBookingToolServices(
  options: CatalogBookingRouteModuleOptions,
  c: Context,
): CatalogBookingToolServices {
  const db = options.resolveDb(c)
  return {
    async listOrders(query) {
      const result = await listOrders(db, query)
      return { rows: result.rows.map(serializeOrder) }
    },
    async getOrder(id) {
      const row = await getOrderById(db, id)
      return row ? serializeOrder(row) : null
    },
  }
}

function serializeOrder(row: Awaited<ReturnType<typeof getOrderById>> & object) {
  return { ...row, captured_at: row.captured_at.toISOString() }
}
