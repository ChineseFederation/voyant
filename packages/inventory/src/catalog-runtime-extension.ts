import type { CatalogInventoryRuntimeExtension } from "@voyant-travel/catalog/runtime-contracts"
import { createProductQuoteShapeEnricher } from "@voyant-travel/catalog/runtime-support"
import type { PaymentPolicy } from "@voyant-travel/finance"
import { and, asc, eq, gt, isNotNull } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { registerProductBookingHandler } from "./booking-engine/product-runtime.js"
import { productCatalogPolicy } from "./catalog-policy.js"
import { productDeparturesCatalogPolicy } from "./catalog-policy-departures.js"
import { productDestinationsCatalogPolicy } from "./catalog-policy-destinations.js"
import { productPricingCatalogPolicy } from "./catalog-policy-pricing.js"
import { productPromotionsCatalogPolicy } from "./catalog-policy-promotions.js"
import { productTaxonomyCatalogPolicy } from "./catalog-policy-taxonomy.js"
import { extrasCatalogPolicy } from "./extras.js"
import { buildProductRequirements } from "./requirements.js"
import { productCategories, productCategoryProducts, products } from "./schema.js"
import { productsService } from "./service.js"
import {
  buildProductSnapshotInput,
  createProductClassificationProjectionExtension,
  createProductDocumentBuilder,
  createProductStorefrontCardProjectionExtension,
} from "./service-catalog-plane.js"
import { createProductDestinationsProjectionExtension } from "./service-catalog-plane-destinations.js"
import { createProductTaxonomyProjectionExtension } from "./service-catalog-plane-taxonomy.js"
import { getProductContent } from "./service-content.js"
import { listProductsReferencingAccommodationProperty } from "./service-presentation-references.js"

export const enrichProductQuoteShape = createProductQuoteShapeEnricher({
  resolveContent: ({
    db,
    entityId,
    locales,
    audience,
    market,
    currency,
    registry,
    adapterContext,
  }) =>
    getProductContent(
      db as Parameters<typeof getProductContent>[0],
      entityId,
      { preferredLocales: locales, audience, market, currency },
      { registry, buildAdapterContext: () => adapterContext },
    ),
  buildShape: (content, options) =>
    buildProductRequirements(content as Parameters<typeof buildProductRequirements>[0], options),
})

export const catalogInventoryRuntimeExtension = {
  productFieldPolicy: [
    ...productCatalogPolicy,
    ...productDestinationsCatalogPolicy,
    ...productTaxonomyCatalogPolicy,
    ...productDeparturesCatalogPolicy,
    ...productPricingCatalogPolicy,
    ...productPromotionsCatalogPolicy,
  ],
  extrasFieldPolicy: extrasCatalogPolicy,
  listCanonicalProductIds: (db, { afterId, limit }) =>
    db
      .select({ id: products.id })
      .from(products)
      .where(afterId ? gt(products.id, afterId) : undefined)
      .orderBy(asc(products.id))
      .limit(limit)
      .then((rows) => rows.map((row) => row.id)),
  createDocumentBuilder: ({
    db,
    sellerOperatorId,
    registry,
    extensions,
    isPublicAudienceListable,
  }) =>
    createProductDocumentBuilder(db, {
      sellerOperatorId,
      registry,
      extensions,
      isPublicAudienceListable,
    }),
  createStorefrontCardProjectionExtension: () => createProductStorefrontCardProjectionExtension(),
  createDestinationsProjectionExtension: () => createProductDestinationsProjectionExtension(),
  createTaxonomyProjectionExtension: () => createProductTaxonomyProjectionExtension(),
  createClassificationProjectionExtension: () => createProductClassificationProjectionExtension(),
  listProductsReferencingAccommodationProperty,
  registerOwnedBookingHandler: registerProductBookingHandler,
  getProductContent: (db, productId, scope, context) =>
    getProductContent(db, productId, scope, context),
  async getOwnedProductById(db, productId) {
    const product = await productsService.getProductById(db as PostgresJsDatabase, productId)
    return product ? { name: product.name, description: product.description } : null
  },
  async loadProductReservationPolicy(db, productId) {
    const [product] = await db
      .select({
        supplierId: products.supplierId,
        reservationTimeoutMinutes: products.reservationTimeoutMinutes,
      })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1)
    return product ?? null
  },
  async loadProductPaymentPolicyContext(db, productId) {
    const [[product], [category]] = await Promise.all([
      db
        .select({
          listingPolicy: products.customerPaymentPolicy,
          supplierId: products.supplierId,
          departureDate: products.startDate,
        })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1),
      db
        .select({ categoryPolicy: productCategories.customerPaymentPolicy })
        .from(productCategoryProducts)
        .innerJoin(productCategories, eq(productCategories.id, productCategoryProducts.categoryId))
        .where(
          and(
            eq(productCategoryProducts.productId, productId),
            isNotNull(productCategories.customerPaymentPolicy),
          ),
        )
        .orderBy(asc(productCategoryProducts.sortOrder), asc(productCategoryProducts.createdAt))
        .limit(1),
    ])
    if (!product) return null
    return {
      listingPolicy: (product.listingPolicy as PaymentPolicy | null | undefined) ?? null,
      categoryPolicy: (category?.categoryPolicy as PaymentPolicy | null | undefined) ?? null,
      supplierId: product.supplierId,
      departureDate: product.departureDate,
    }
  },
  enrichProductQuoteShape,
  buildSnapshotInput: (db, productId, options) => buildProductSnapshotInput(db, productId, options),
} satisfies CatalogInventoryRuntimeExtension
