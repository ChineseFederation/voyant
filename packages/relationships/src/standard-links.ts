import { defineLink } from "@voyant-travel/core"
import { inventoryProductLinkable } from "@voyant-travel/inventory/linkables"
import { departureLinkable } from "@voyant-travel/operations/linkables"

import { inquiryLinkable } from "./linkables.js"

/** Materialized target kinds currently backed by package-owned linkables. */
export const inquiryProductLink = defineLink(inquiryLinkable, {
  linkable: inventoryProductLinkable,
  isList: true,
})

export const inquiryOptionUnitLink = defineLink(inquiryLinkable, {
  linkable: departureLinkable,
  isList: true,
})
