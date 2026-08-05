import type { LinkableDefinition } from "@voyant-travel/core"

export const inventoryProductLinkable: LinkableDefinition = {
  module: "inventory",
  entity: "product",
  table: "products",
  idPrefix: "prod",
}

export const inventoryProductCompatibilityLinkable: LinkableDefinition = {
  module: "products",
  entity: "product",
  table: "products",
  idPrefix: "prod",
}

export const inventoryLinkable = {
  product: inventoryProductLinkable,
}

export const productsCompatibilityLinkable = {
  product: inventoryProductCompatibilityLinkable,
}
