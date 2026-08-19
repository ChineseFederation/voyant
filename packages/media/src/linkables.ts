import type { LinkableDefinition } from "@voyant-travel/core"

/** Media-owned standard-link target for catalogued assets. */
export const mediaAssetLinkable: LinkableDefinition = {
  module: "media",
  entity: "asset",
  table: "media_asset",
  idPrefix: "mast",
}

export const mediaLinkable = { asset: mediaAssetLinkable }
