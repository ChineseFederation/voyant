import type { Module } from "@voyant-travel/core"
import type { ApiModule } from "@voyant-travel/hono/module"

import { productsBookingExtension } from "./booking-extension.js"
import { inventoryLinkable, productsCompatibilityLinkable } from "./linkables.js"
import { productRoutes } from "./routes.js"
import { publicProductRoutes } from "./routes-public.js"

export {
  inventoryLinkable,
  inventoryProductCompatibilityLinkable,
  inventoryProductLinkable,
  productsCompatibilityLinkable,
} from "./linkables.js"

export const inventoryModule: Module = {
  name: "inventory",
  linkable: inventoryLinkable,
}

/**
 * Compatibility API module for the Inventory-owned Product runtime.
 *
 * Routes intentionally keep the existing `products` mount name so deployed
 * `/v1/admin/products` and `/v1/public/products` clients do not break.
 */
export const inventoryApiModule: ApiModule = {
  module: {
    name: "products",
    linkable: productsCompatibilityLinkable,
  },
  adminRoutes: productRoutes,
  publicRoutes: publicProductRoutes,
}

export const inventoryProductRoutes = productRoutes
export const publicInventoryProductRoutes = publicProductRoutes
export const inventoryBookingExtension = productsBookingExtension

export type InventoryAuthoringSurface =
  | "product-structure"
  | "product-version"
  | "product-internal-component"
  | "owned-publication-lifecycle"
  | "operated-extras-configuration"

export interface InventoryInterfaceDescriptor {
  module: "inventory"
  operatedEntityModule: "products"
  authoringSurfaces: readonly InventoryAuthoringSurface[]
  catalogResponsibilities: readonly [
    "projection",
    "search",
    "overlay",
    "snapshot",
    "source-governance",
  ]
}

export const inventoryInterfaceDescriptor: InventoryInterfaceDescriptor = {
  module: "inventory",
  operatedEntityModule: "products",
  authoringSurfaces: [
    "product-structure",
    "product-version",
    "product-internal-component",
    "owned-publication-lifecycle",
    "operated-extras-configuration",
  ],
  catalogResponsibilities: ["projection", "search", "overlay", "snapshot", "source-governance"],
}
