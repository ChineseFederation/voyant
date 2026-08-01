import { roomBlockLinkable } from "@voyant-travel/accommodations/linkables"
import { bookingLinkable } from "@voyant-travel/bookings/linkables"
import { defineLink } from "@voyant-travel/core"
import { supplierLinkable } from "@voyant-travel/distribution/linkables"
import { functionSpaceLinkable, spaceBlockLinkable } from "@voyant-travel/operations/linkables"
import { proposalLinkable } from "@voyant-travel/proposals/linkables"
import { organizationLinkable, personLinkable } from "@voyant-travel/relationships/linkables"

import {
  bidLinkable,
  delegateLinkable,
  programLinkable,
  roomingAssignmentLinkable,
  sessionLinkable,
} from "./linkables.js"

export const bidSupplierLink = defineLink(supplierLinkable, {
  linkable: bidLinkable,
  isList: true,
})

export const delegateBookingLink = defineLink(bookingLinkable, {
  linkable: delegateLinkable,
})

export const delegatePersonLink = defineLink(personLinkable, {
  linkable: delegateLinkable,
  isList: true,
})

export const organizationProgramLink = defineLink(organizationLinkable, {
  linkable: programLinkable,
  isList: true,
})

export const programSpaceBlockLink = defineLink(programLinkable, {
  linkable: spaceBlockLinkable,
  isList: true,
})

export const proposalProgramLink = defineLink(proposalLinkable, {
  linkable: programLinkable,
})

export const roomingRoomBlockLink = defineLink(roomBlockLinkable, {
  linkable: roomingAssignmentLinkable,
  isList: true,
})

export const sessionFunctionSpaceLink = defineLink(functionSpaceLinkable, {
  linkable: sessionLinkable,
  isList: true,
})
