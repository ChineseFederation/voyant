import { defineLink } from "@voyant-travel/core"
import { inventoryProductLinkable } from "@voyant-travel/inventory/linkables"
import { mediaAssetLinkable } from "@voyant-travel/media/linkables"
import { departureLinkable } from "@voyant-travel/operations/linkables"

import { inquiryLinkable } from "./linkables.js"

/** Materialized target kinds currently backed by package-owned linkables. */
export const inquiryProductLink = defineLink(
  { linkable: inquiryLinkable, isList: true },
  {
    linkable: inventoryProductLinkable,
    isList: true,
  },
)

/** The dated departure a customer asked about; Availability owns the slot. */
export const inquiryDepartureLink = defineLink(
  { linkable: inquiryLinkable, isList: true },
  {
    linkable: departureLinkable,
    isList: true,
  },
)

/** Inquiry attachments remain Media-owned assets; this pivot only records association. */
export const inquiryMediaAssetLink = defineLink(
  { linkable: inquiryLinkable, isList: true },
  {
    linkable: mediaAssetLinkable,
    isList: true,
  },
)
