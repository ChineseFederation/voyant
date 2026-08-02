import type { LinkableDefinition } from "@voyant-travel/core"

export { supplierLinkable, suppliersLinkable } from "./suppliers/linkables.js"

export const channelLinkable: LinkableDefinition = {
  module: "distribution",
  entity: "channel",
  table: "channels",
  idPrefix: "chan",
}

export const distributionLinkable = {
  channel: channelLinkable,
}
