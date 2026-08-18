import type { LinkableDefinition } from "@voyant-travel/core"

export const personLinkable: LinkableDefinition = {
  module: "relationships",
  entity: "person",
  table: "people",
  idPrefix: "pers",
}

export const organizationLinkable: LinkableDefinition = {
  module: "relationships",
  entity: "organization",
  table: "organizations",
  idPrefix: "org",
}

export const inquiryLinkable: LinkableDefinition = {
  module: "relationships",
  entity: "inquiry",
  table: "inquiries",
  idPrefix: "inq",
}

export const relationshipsLinkable = {
  inquiry: inquiryLinkable,
  person: personLinkable,
  organization: organizationLinkable,
}
