"use client"

import { useCurrentUser, useOrganizationMembers } from "@voyant-travel/auth-react"
import type { InquiryOwnerOption } from "../components/inquiry-owner-field.js"

/**
 * Colleagues an Inquiry can be assigned to.
 *
 * The same candidate set the Proposal ownership card builds: the team members
 * endpoint when the deployment exposes one, plus the signed-in operator, who is
 * always assignable. Returns `undefined` while nothing is resolvable yet so the
 * caller can keep the id field rather than render an empty picker.
 */
export function useInquiryOwnerOptions(): InquiryOwnerOption[] | undefined {
  const membersQuery = useOrganizationMembers()
  const currentUserQuery = useCurrentUser()
  const currentUser = currentUserQuery.data

  const candidates = new Map<string, InquiryOwnerOption>()
  for (const member of membersQuery.data?.members ?? []) {
    candidates.set(member.userId, {
      id: member.userId,
      name: member.user.name ?? member.user.email ?? member.userId,
      email: member.user.email ?? null,
    })
  }
  if (currentUser) {
    const name =
      [currentUser.firstName, currentUser.lastName].filter(Boolean).join(" ").trim() ||
      currentUser.email ||
      currentUser.id
    candidates.set(currentUser.id, {
      id: currentUser.id,
      name,
      email: currentUser.email ?? null,
      isCurrentUser: true,
    })
  }

  return candidates.size > 0 ? [...candidates.values()] : undefined
}
