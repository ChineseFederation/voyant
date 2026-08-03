import type { CatalogDistributionRuntimeExtension } from "@voyant-travel/catalog/runtime-contracts"
import type { PaymentPolicy } from "@voyant-travel/finance"
import { and, asc, eq, isNull } from "drizzle-orm"

import { publicationProductsRef } from "./publication-product-ref.js"
import {
  resolveEffectivePublication,
  resolveEffectiveSourcePublication,
} from "./publication-resolver.js"
import {
  channelProductPublications,
  channelSourcePublications,
  channelSupplierPublications,
  channels,
  suppliers,
} from "./schema.js"

export const catalogDistributionRuntimeExtension = {
  async loadActiveChannelIds(db) {
    const rows = await db
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.status, "active"))
      .orderBy(asc(channels.createdAt))
    return rows.map(({ id }) => id)
  },
  async hasEffectiveProductPublication(db, productId, channelId) {
    if (!channelId) return false
    const [channel, product, productRule] = await Promise.all([
      db
        .select({ id: channels.id, status: channels.status })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select({ id: publicationProductsRef.id, supplierId: publicationProductsRef.supplierId })
        .from(publicationProductsRef)
        .where(eq(publicationProductsRef.id, productId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select({
          id: channelProductPublications.id,
          decision: channelProductPublications.decision,
        })
        .from(channelProductPublications)
        .where(
          and(
            eq(channelProductPublications.channelId, channelId),
            eq(channelProductPublications.productId, productId),
          ),
        )
        .limit(1)
        .then((rows) => rows[0] ?? null),
    ])
    const supplierRule = product?.supplierId
      ? await db
          .select({
            id: channelSupplierPublications.id,
            decision: channelSupplierPublications.decision,
          })
          .from(channelSupplierPublications)
          .where(
            and(
              eq(channelSupplierPublications.channelId, channelId),
              eq(channelSupplierPublications.supplierId, product.supplierId),
            ),
          )
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : null

    return resolveEffectivePublication({
      channelId,
      productId,
      canonicalSupplierId: product?.supplierId ?? null,
      channelStatus: channel?.status ?? null,
      productRule,
      supplierRule,
    }).published
  },
  async hasEffectiveSourcePublication(db, source, channelId) {
    if (!channelId) return false
    const sourceConnectionId = source.sourceConnectionId ?? null
    const [channel, connectionRule, kindRule] = await Promise.all([
      db
        .select({ id: channels.id, status: channels.status })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      sourceConnectionId
        ? db
            .select({
              id: channelSourcePublications.id,
              decision: channelSourcePublications.decision,
            })
            .from(channelSourcePublications)
            .where(
              and(
                eq(channelSourcePublications.channelId, channelId),
                eq(channelSourcePublications.sourceKind, source.sourceKind),
                eq(channelSourcePublications.sourceConnectionId, sourceConnectionId),
              ),
            )
            .limit(1)
            .then((rows) => rows[0] ?? null)
        : Promise.resolve(null),
      db
        .select({ id: channelSourcePublications.id, decision: channelSourcePublications.decision })
        .from(channelSourcePublications)
        .where(
          and(
            eq(channelSourcePublications.channelId, channelId),
            eq(channelSourcePublications.sourceKind, source.sourceKind),
            isNull(channelSourcePublications.sourceConnectionId),
          ),
        )
        .limit(1)
        .then((rows) => rows[0] ?? null),
    ])

    return resolveEffectiveSourcePublication({
      channelId,
      sourceKind: source.sourceKind,
      sourceConnectionId,
      channelStatus: channel?.status ?? null,
      connectionRule,
      kindRule,
    }).published
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
