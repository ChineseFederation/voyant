import { defineLink } from "@voyant-travel/core"
import { channelLinkable } from "@voyant-travel/distribution/linkables"

import { storefrontLinkable } from "./linkables.js"

export const storefrontChannelLink = defineLink(
  { linkable: storefrontLinkable, isList: true },
  channelLinkable,
  {
    database: {
      tableName: "auth_storefront_distribution_channel",
      leftColumn: "storefront_id",
      rightColumn: "channel_id",
    },
  },
)
