"use client"

import {
  AdminWidgetSlotRenderer,
  resolveAdminWidgets,
  useAdminBreadcrumbs,
  useAdminExtensions,
  useAdminHref,
  useAdminNavigate,
  useOperatorAdminMessages,
} from "@voyant-travel/admin"

import { PersonDetailPage } from "../components/person-detail-page.js"
import { usePerson } from "../index.js"
import { type PersonDetailBookingsTabContext, personDetailBookingsTabSlot } from "./slots.js"

export interface PersonDetailHostProps {
  id: string
}

/**
 * Packaged admin host for the canonical `PersonDetailPage` (packaged-admin
 * RFC Phase 3). Owns everything package-clean:
 *
 *   - Cross-route links resolve through semantic destinations (RFC §4.7):
 *     `person.list` (back / after delete), `person.detail` (relationships),
 *     `organization.detail` — no host route tree import.
 *   - The Bookings tab mounts whenever a widget contribution targets
 *     {@link personDetailBookingsTabSlot} (the bookings-ui ↔ crm-ui cycle
 *     resolution: bookings-ui depends on this package, so the bookings list
 *     card travels the widget seam, not an import).
 */
export function PersonDetailHost({ id }: PersonDetailHostProps) {
  const messages = useOperatorAdminMessages().crm.personDetail
  const navigateTo = useAdminNavigate()
  const resolveHref = useAdminHref()
  const adminExtensions = useAdminExtensions()
  const hasBookingsTabWidgets =
    resolveAdminWidgets({ slot: personDetailBookingsTabSlot, extensions: adminExtensions }).length >
    0

  // Mirrors the organization host: the chrome owns the breadcrumb trail, so the
  // page renders none of its own. TanStack Query dedupes this against the
  // page's own fetch, so it costs no extra request.
  const person = usePerson(id).data
  const personLabel = person
    ? [person.firstName, person.lastName].filter(Boolean).join(" ").trim() || messages.unnamedPerson
    : null
  const peopleHref = resolveHref("person.list", {})
  useAdminBreadcrumbs(
    personLabel
      ? [{ label: messages.breadcrumbRoot, href: peopleHref }, { label: personLabel }]
      : [{ label: messages.breadcrumbRoot, href: peopleHref }],
  )

  return (
    <PersonDetailPage
      id={id}
      onBack={() => navigateTo("person.list", {})}
      onDeleted={() => navigateTo("person.list", {})}
      onOrganizationOpen={(organizationId) => navigateTo("organization.detail", { organizationId })}
      onPersonOpen={(personId) => navigateTo("person.detail", { personId })}
      slots={
        hasBookingsTabWidgets
          ? {
              bookingsTab: {
                content: (
                  <AdminWidgetSlotRenderer
                    slot={personDetailBookingsTabSlot}
                    props={{ personId: id } satisfies PersonDetailBookingsTabContext}
                  />
                ),
              },
            }
          : undefined
      }
    />
  )
}
