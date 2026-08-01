import type { ReactNode } from "react"
import type { ActivityRecord, OrganizationRecord, PersonRecord } from "../index.js"

export type OrganizationDetailTab =
  | "overview"
  | "people"
  | "contactMethods"
  | "addresses"
  | "namedContacts"
  | "proposals"
  | "activities"
  | "bookings"
  | "invoices"
  | "payments"
  | "contracts"

export type OrganizationData = Pick<
  OrganizationRecord,
  | "createdAt"
  | "defaultCurrency"
  | "id"
  | "industry"
  | "legalName"
  | "name"
  | "notes"
  | "paymentTerms"
  | "preferredLanguage"
  | "relation"
  | "source"
  | "status"
  | "tags"
  | "taxId"
  | "updatedAt"
  | "website"
>

export type OrganizationPerson = Pick<
  PersonRecord,
  "email" | "firstName" | "id" | "jobTitle" | "lastName" | "status"
>

export type OrganizationActivity = Pick<
  ActivityRecord,
  "createdAt" | "description" | "dueAt" | "id" | "status" | "subject" | "type" | "updatedAt"
>

export interface OrganizationCommercialContextTabSlot {
  label?: string
  count?: number
  content: ReactNode
}

export interface OrganizationDetailPageSlots {
  afterTopBar?: ReactNode
  sidebarEnd?: ReactNode
  overviewContent?: ReactNode
  overviewEnd?: ReactNode
  peopleContent?: ReactNode
  peopleEnd?: ReactNode
  contactMethodsContent?: ReactNode
  contactMethodsEnd?: ReactNode
  addressesContent?: ReactNode
  addressesEnd?: ReactNode
  namedContactsContent?: ReactNode
  namedContactsEnd?: ReactNode
  proposalsContent?: ReactNode
  proposalsEnd?: ReactNode
  activitiesContent?: ReactNode
  activitiesEnd?: ReactNode
  bookingsTab?: OrganizationCommercialContextTabSlot
  invoicesTab?: OrganizationCommercialContextTabSlot
  paymentsTab?: OrganizationCommercialContextTabSlot
  contractsTab?: OrganizationCommercialContextTabSlot
}

export function formatTabLabel(
  defaultLabel: string,
  slot: OrganizationCommercialContextTabSlot,
): ReactNode {
  const label = slot.label ?? defaultLabel
  return typeof slot.count === "number" ? `${label} (${slot.count})` : label
}

export function initialsFrom(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  )
}
