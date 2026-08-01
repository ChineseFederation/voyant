import type { CatalogDistributionRuntimeExtension } from "@voyant-travel/catalog/runtime-contracts"
import type { PaymentPolicy } from "@voyant-travel/finance"
import { and, asc, eq } from "drizzle-orm"

import { channelProductMappings, channels, suppliers } from "./schema.js"

export const catalogDistributionRuntimeExtension = {
  async loadActiveChannelIds(db) {
    const rows = await db
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.status, "active"))
      .orderBy(asc(channels.createdAt))
    return rows.map(({ id }) => id)
  },
  async hasActiveSalesChannelMapping(db, productId, channelId) {
    const conditions = [
      eq(channelProductMappings.productId, productId),
      eq(channelProductMappings.active, true),
      eq(channels.status, "active"),
    ]
    if (channelId) conditions.push(eq(channelProductMappings.channelId, channelId))
    const rows = await db
      .select({ id: channelProductMappings.id })
      .from(channelProductMappings)
      .innerJoin(channels, eq(channels.id, channelProductMappings.channelId))
      .where(and(...conditions))
      .limit(1)
    return rows.length > 0
  },
  async loadSupplierReservationTimeout(db, supplierId) {
    const [supplier] = await db
      .select({ reservationTimeoutMinutes: suppliers.reservationTimeoutMinutes })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId))
      .limit(1)
    return supplier ?? null
  },
  async loadSupplierPaymentPolicy(db, supplierId) {
    const [supplier] = await db
      .select({ policy: suppliers.customerPaymentPolicy })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId))
      .limit(1)
    return (supplier?.policy as PaymentPolicy | null | undefined) ?? null
  },
} satisfies CatalogDistributionRuntimeExtension
