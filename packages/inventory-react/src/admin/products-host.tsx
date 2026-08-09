"use client"

import { useAdminNavigate } from "@voyant-travel/admin"

import { ProductsPage } from "../components/products-page.js"

/**
 * Packaged admin host for `ProductsPage` (packaged-admin RFC Phase 3).
 *
 * No host route tree is imported — opening a product resolves the
 * `"product.detail"` semantic destination (RFC §4.7) through the resolvers
 * the workspace shell registered. The page keeps its search/paging state
 * locally (no URL search contract), so the host takes no props and route
 * contributions can mount it as a zero-prop page.
 */
export function ProductsHost() {
  const navigateTo = useAdminNavigate()

  return (
    <ProductsPage onProductOpenId={(productId) => navigateTo("product.detail", { productId })} />
  )
}
