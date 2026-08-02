import type { LinkableDefinition } from "@voyant-travel/core"

export const storefrontLinkable: LinkableDefinition = {
  module: "auth",
  entity: "storefront",
  table: "storefronts",
  idPrefix: "sf",
}

export const authLinkable = {
  storefront: storefrontLinkable,
}
