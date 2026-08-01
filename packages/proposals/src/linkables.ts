import type { LinkableDefinition } from "@voyant-travel/core"

export const proposalLinkable: LinkableDefinition = {
  module: "proposals",
  entity: "proposal",
  table: "proposals",
  idPrefix: "prps",
}

export const proposalVersionLinkable: LinkableDefinition = {
  module: "proposals",
  entity: "proposalVersion",
  table: "proposal_versions",
  idPrefix: "prvr",
}

export const proposalsLinkable = {
  proposal: proposalLinkable,
  proposalVersion: proposalVersionLinkable,
}
